import { loadCweMapFromXml } from '../data/cwe/cwe';
import type { CweMap } from '../data/cwe/cwe';
import { logInfo } from '../util/log';

export let CWE_MAP: CweMap | null = null;

export async function initCwe(xmlPath: string) {
  CWE_MAP = await loadCweMapFromXml(xmlPath);
  logInfo(`[CWE] loaded: ${CWE_MAP.size} items`);
}

export function getCweMap(): CweMap {
  if (!CWE_MAP) throw new Error('CWE map not initialized. Call initCwe() first.');
  return CWE_MAP;
}
