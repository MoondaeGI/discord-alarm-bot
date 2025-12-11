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
