import fs from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';

export type CweInfo = {
  id: string; // "CWE-36"
  name: string; // "Absolute Path Traversal"
  description?: string; // 짧은 설명(있으면)
  status?: string; // Stable/Draft 등(있으면)
};

export type CweMap = Map<string, CweInfo>;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * MITRE CWE XML (cwec_v4.xx.xml 같은) 파일을 읽어서 Map으로 변환
 * key: "CWE-36"
 */
export async function loadCweMapFromXml(xmlPath: string): Promise<CweMap> {
  const xml = await fs.readFile(xmlPath, 'utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // huge xml 대비
    allowBooleanAttributes: true,
  });

  const root = parser.parse(xml);

  // CWE XML 구조는 버전에 따라 약간 다를 수 있어서 안전 접근
  const catalog = root?.CWE_Catalog ?? root?.['cwe:CWE_Catalog'] ?? root;
  const weaknessesNode = catalog?.Weaknesses ?? catalog?.['cwe:Weaknesses'];
  const weaknessList = asArray<any>(weaknessesNode?.Weakness ?? weaknessesNode?.['cwe:Weakness']);

  const map: CweMap = new Map();

  for (const w of weaknessList) {
    const idNum = w?.['@_ID'];
    if (!idNum) continue;

    const id = `CWE-${idNum}`;
    const name = w?.['@_Name'] ?? '';
    const status = w?.['@_Status'];

    // Description / Extended_Description는 버전에 따라 존재/구조가 다름
    const desc =
      (typeof w?.Description === 'string' ? w.Description : w?.Description?.['#text']) ||
      (typeof w?.Summary === 'string' ? w.Summary : w?.Summary?.['#text']) ||
      undefined;

    const info: CweInfo = { id, name, description: desc, status };
    map.set(id, info);
  }

  return map;
}
