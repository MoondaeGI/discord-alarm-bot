// CVE 검색 스펙 타입 (LLM이 만들어 줄 JSON 모양)
export interface CveSearchSpec {
  keywords?: string[];
  severity?: string[]; // ["LOW","MEDIUM","HIGH","CRITICAL"]
  dateRange?: {
    start: string | null;
    end: string | null;
  } | null;
  page?: {
    pageNumber?: number;
    pageSize?: number;
    maxPages?: number;
  } | null;
  sort?: {
    field?: 'published' | 'lastModified' | 'cvssScore';
    direction?: 'asc' | 'desc';
  } | null;
}

/**
 * LLM이 만든 JSON 스펙을 받아서:
 * - NVD API를 최대 5페이지까지 호출하고
 * - 정렬 적용 후
 * - CvePayload[]로 변환해서 반환하는 헬퍼
 */
export async function searchCveWithSpec(
  spec: CveSearchSpec,
  summarize: {
    title: string;
    desc: string;
    summary: string;
  },
): Promise<CvePayload[]> {
  const pageSize = Math.max(1, Math.min(spec.page?.pageSize ?? 20, 200));
  const maxPages = Math.min(spec.page?.maxPages ?? 1, 5);
  const startPage = Math.max(1, spec.page?.pageNumber ?? 1);

  const allVulns: any[] = [];

  for (let i = 0; i < maxPages; i++) {
    const pageIndex = startPage - 1 + i;
    const startIndex = pageIndex * pageSize;

    const url = buildNvdQueryUrl(spec, { startIndex, resultsPerPage: pageSize });
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`NVD 검색 요청 실패: ${res.status} ${res.statusText}`);
      break;
    }

    const data = await res.json();
    const vulns = data.vulnerabilities ?? [];
    if (!vulns.length) break;

    allVulns.push(...vulns);

    if (vulns.length < pageSize) break; // 마지막 페이지
  }

  const sorted = sortVulnerabilities(allVulns, spec.sort ?? undefined);

  const payloads: CvePayload[] = [];
  for (const v of sorted) {
    const p = await buildPayloadFromNvdVuln(v, summarizeFn);
    if (p) payloads.push(p);
  }

  return payloads;
}

/**
 * JSON 스펙 + 페이징으로 NVD 쿼리 URL 생성
 */
function buildNvdQueryUrl(
  spec: CveSearchSpec,
  paging: { startIndex: number; resultsPerPage: number },
): string {
  const base = new URL('https://services.nvd.nist.gov/rest/json/cves/2.0');

  // keywords → keywordSearch (공백 join)
  if (Array.isArray(spec.keywords) && spec.keywords.length > 0) {
    base.searchParams.set('keywordSearch', spec.keywords.join(' '));
  }

  // severity → cvssV3Severity (콤마 구분)
  if (Array.isArray(spec.severity) && spec.severity.length > 0) {
    base.searchParams.set('cvssV3Severity', spec.severity.join(','));
  }

  // dateRange → pubStartDate / pubEndDate
  const start = spec.dateRange?.start;
  const end = spec.dateRange?.end;
  if (start) base.searchParams.set('pubStartDate', `${start}T00:00:00:000 UTC-00:00`);
  if (end) base.searchParams.set('pubEndDate', `${end}T23:59:59:000 UTC-00:00`);

  // 페이징
  base.searchParams.set('startIndex', String(paging.startIndex));
  base.searchParams.set('resultsPerPage', String(paging.resultsPerPage));

  return base.toString();
}

/**
 * sort 스펙에 따라 NVD vulnerabilities 배열 정렬
 */
function sortVulnerabilities(vulns: any[], sort?: CveSearchSpec['sort']): any[] {
  if (!sort?.field) return vulns;
  const dir = sort.direction === 'asc' ? 1 : -1;

  return [...vulns].sort((a, b) => {
    const cveA = a.cve;
    const cveB = b.cve;

    if (sort.field === 'published') {
      const da = new Date(cveA?.published ?? 0).getTime();
      const db = new Date(cveB?.published ?? 0).getTime();
      return (da - db) * dir;
    }

    if (sort.field === 'lastModified') {
      const da = new Date(cveA?.lastModified ?? 0).getTime();
      const db = new Date(cveB?.lastModified ?? 0).getTime();
      return (da - db) * dir;
    }

    if (sort.field === 'cvssScore') {
      const scoreA =
        cveA?.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ??
        cveA?.metrics?.cvssMetricV30?.[0]?.cvssData?.baseScore ??
        cveA?.metrics?.cvssMetricV2?.[0]?.baseScore ??
        0;

      const scoreB =
        cveB?.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ??
        cveB?.metrics?.cvssMetricV30?.[0]?.cvssData?.baseScore ??
        cveB?.metrics?.cvssMetricV2?.[0]?.baseScore ??
        0;

      return (scoreA - scoreB) * dir;
    }

    return 0;
  });
}

/**
 * NVD vulnerabilities[i] 하나를 CvePayload로 변환하는 헬퍼
 * (요약용 summarizeFn 은 CveEvent.summarize를 주입받음)
 */
async function buildPayloadFromNvdVuln(
  vuln: any,
  summarizeFn: SummarizeFn,
): Promise<CvePayload | null> {
  const cve = vuln?.cve;
  if (!cve) return null;

  const cveId: string = cve.id;
  const published: string = cve.published ?? cve.publishedDate ?? '';
  const link = `https://nvd.nist.gov/vuln/detail/${cveId}`;

  const descEn =
    cve.descriptions?.find((d: any) => d.lang === 'en')?.value ||
    cve.descriptions?.[0]?.value ||
    '';

  const titleBase =
    cve.titles?.find((t: any) => t.lang === 'en')?.title || cve.titles?.[0]?.title || cveId;

  const cveItem: CveItem = {
    id: cveId,
    title: `${cveId} ${titleBase}`.trim(),
    link,
    pubDate: published,
    description: descEn,
  };

  const metrics = cve.metrics;
  const v31 = metrics?.cvssMetricV31?.[0];
  const v30 = metrics?.cvssMetricV30?.[0];
  const v2 = metrics?.cvssMetricV2?.[0];
  const source = v31 || v30 || v2;
  const cvssData = source?.cvssData || source;

  const severity = (cvssData?.baseSeverity || source?.baseSeverity || 'UNKNOWN').toUpperCase();
  const scoreStr = String(cvssData?.baseScore ?? '정보 없음');
  const vectorStr = cvssData?.vectorString ?? '벡터 없음';

  const summary = await summarizeFn(cveItem);

  return {
    title: summary.title,
    cveId,
    severity,
    scoreStr,
    vectorStr,
    summary: summary.summary,
    link,
    publishedAt: new Date(published || Date.now()),
    description: summary.desc,
  };
}
