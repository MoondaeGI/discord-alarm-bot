import { getCweMap } from '../config/cwe.config';
import type { CweInfo } from '../data/cwe/cwe'; // 너 타입 위치에 맞게
import { extractJsonObject, summarize as llmSummarize } from './llm';

export type CweKo = {
  id: string; // "CWE-36"
  nameEn: string; // "Absolute Path Traversal"
  nameKo: string; // "절대 경로 탐색"
  descriptionEn: string; // (짧은) 영문 설명
  descriptionKo: string; // 한글 설명
};

/**
 * CWE ID로 로컬 Map 조회 후, name/description을 LLM으로 한글 번역해서 반환
 * - 캐시 있음(같은 CWE는 LLM 1번만 호출)
 * - Map에 없으면 null 반환
 */
export async function getCweKoById(cweId: string): Promise<CweKo | null> {
  const map = getCweMap();
  const info: CweInfo | undefined = map.get(cweId);
  if (!info) return null;

  // LLM 입력 최소화 (토큰 절약 + 품질 안정)
  const prompt = `
너는 보안 약점(CWE) 용어를 한국어로 자연스럽고 정확하게 번역하는 도우미다.
반드시 JSON만 출력한다. (코드블록/설명 금지)

입력:
- id: ${cweId}
- name_en: ${info.name || ''}
- desc_en: ${info.description || ''}

출력 형식:
{
  "nameKo": "...",
  "descriptionKo": "..."
}

규칙:
- nameKo: 보안/개발 문서에서 쓰는 자연스러운 번역(너무 길게 X)
- descriptionKo: 1~2문장, 핵심만. 과장/추측 금지.
- 입력 desc_en이 비어있으면 descriptionKo는 ""로.
`;

  const out = await llmSummarize(prompt);
  const json = JSON.parse(out || '{}');

  return {
    id: cweId,
    nameEn: info.name || '',
    nameKo: json.nameKo || info.name || cweId,
    descriptionEn: info.description || '',
    descriptionKo: json.descriptionKo || '',
  };
}
