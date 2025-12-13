const colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
};

const time = () => new Date().toISOString();
const tag = (text: string, color: keyof typeof colors = 'gray') =>
  `${colors[color]}${text}${colors.reset}`;

export function logFetchSuccess(url: string, status: number, note?: string) {
  console.log(
    `${tag(`[${time()}]`)}${tag('[FETCH][OK]', 'green')} ${status} ${url}${
      note ? ` - ${note}` : ''
    }`,
  );
}

export function logError(context: string, error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`${tag(`[${time()}]`)}${tag('[ERROR]', 'red')}[${context}] ${message}`);
}

export function logLlmResult(promptTag: string, summary: string) {
  console.log(`${tag(`[${time()}]`)}${tag('[LLM]', 'magenta')}[${promptTag}] ${summary}`);
}

export function logPayload(label: string, payload: unknown) {
  console.log(`${tag(`[${time()}]`)}${tag('[PAYLOAD]', 'cyan')}[${label}]`, payload);
}

/**
 * HTTP 요청 결과와 JSON 배열 길이를 함께 로깅
 */
export function logFetchList(url: string, status: number, listLength: number) {
  console.log(
    `${tag(`[${time()}]`)}${tag('[FETCH][LIST]', 'yellow')} ${status} ${url} | items=${listLength}`,
  );
}
