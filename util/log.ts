const time = () => new Date().toISOString();

export function logFetchSuccess(url: string, status: number, note?: string) {
  console.log(`[${time()}][FETCH][OK] ${status} ${url}${note ? ` - ${note}` : ''}`);
}

export function logError(context: string, error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[${time()}][ERROR][${context}] ${message}`);
}

export function logLlmResult(promptTag: string, summary: string) {
  console.log(`[${time()}][LLM][${promptTag}] ${summary}`);
}

export function logPayload(label: string, payload: unknown) {
  console.log(`[${time()}][PAYLOAD][${label}]`, payload);
}

/**
 * HTTP 요청 결과와 JSON 배열 길이를 함께 로깅
 */
export function logFetchList(url: string, status: number, listLength: number) {
  console.log(
    `[${time()}][FETCH][LIST] ${status} ${url} | items=${listLength}`,
  );
}
