import { NvdCveChangeDetail } from '../../types';

export type DetailReason =
  | 'CVSS_UPDATED'
  | 'CPE_CHANGED'
  | 'CONFIG_CHANGED'
  | 'CWE_CHANGED'
  | 'DESCRIPTION_UPDATED'
  | 'EXPLOIT_REFERENCE_ADDED'
  | 'OTHER';

export interface FilteredDetail {
  detail: NvdCveChangeDetail;
  reasons: DetailReason[];
}

const EXPLOIT_URL_HINT = [
  'exploit',
  'poc',
  'metasploit',
  'packetstorm',
  '0day',
  'weaponiz',
  'github.com', // PoC 많이 올라옴
  'gist.github.com',
];

function hasDiff(d: NvdCveChangeDetail) {
  // Updated인데 old/new가 없을 수도 있어 안전하게 처리
  if (d.action !== 'Updated') return false;
  const oldV = (d.oldValue ?? '').trim();
  const newV = (d.newValue ?? '').trim();
  return !!newV && oldV !== newV;
}

function looksLikeExploitRef(d: NvdCveChangeDetail) {
  if (d.type !== 'Reference' || d.action !== 'Added') return false;
  const v = (d.newValue ?? '').toLowerCase();
  return EXPLOIT_URL_HINT.some((k) => v.includes(k));
}

/**
 * "의미 있는" detail만 추려서 반환
 * - 기본 정책: Updated 위주
 * - 예외: Reference Added(Exploit/PoC 힌트 있을 때), CPE/Configuration Added도 중요로 볼 수 있음
 */
export function filterSignificantDetails(details: NvdCveChangeDetail[]): FilteredDetail[] {
  const out: FilteredDetail[] = [];

  for (const d of details ?? []) {
    const reasons: DetailReason[] = [];

    // 1) CVSS 변경(Updated + diff)
    if (d.type.startsWith('CVSS') && hasDiff(d)) {
      reasons.push('CVSS_UPDATED');
    }

    // 2) 영향범위(제품/버전) 변경
    if (
      (d.type === 'CPE' || d.type === 'Configuration') &&
      (d.action === 'Updated' || d.action === 'Added')
    ) {
      reasons.push(d.type === 'CPE' ? 'CPE_CHANGED' : 'CONFIG_CHANGED');
    }

    // 3) CWE 변경(Added/Updated) - 룰 매핑에 영향
    if (d.type === 'CWE' && (d.action === 'Added' || d.action === 'Updated')) {
      reasons.push('CWE_CHANGED');
    }

    // 4) 설명 변경(Updated만) - Added는 신규 등록 노이즈가 많아서 제외하는 게 보통 깔끔
    if (d.type === 'Description' && d.action === 'Updated') {
      reasons.push('DESCRIPTION_UPDATED');
    }

    // 5) Exploit/PoC 참고 링크 추가(Added)
    if (looksLikeExploitRef(d)) {
      reasons.push('EXPLOIT_REFERENCE_ADDED');
    }

    if (reasons.length) out.push({ detail: d, reasons });
  }

  return out;
}
