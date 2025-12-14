import { timezoneToKst } from './time';
import v8 from 'v8';

const colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
};

const time = () => timezoneToKst(new Date(), 'UTC').toISOString();
const tag = (text: string, color?: keyof typeof colors) =>
  color ? `${colors[color]}${text}${colors.reset}` : text;

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

export function logInfo(message: string) {
  console.log(`${tag(`[${time()}]`)}${tag('[INFO]', 'blue')} ${message}`);
}

export function logEvent(eventName: string, message: string, data?: unknown) {
  const prefix = `${tag(`[${time()}]`)}${tag('[EVENT]', 'yellow')}[${eventName}] ${message}`;
  if (data === undefined) {
    console.log(prefix);
  } else {
    let serialized = '';
    if (typeof data === 'string') {
      serialized = data;
    } else {
      try {
        serialized = JSON.stringify(data);
      } catch {
        serialized = '[unserializable data]';
      }
    }
    console.log(`${prefix} ${serialized}`);
  }
}

export function logCommand(commandName: string, message: string, data?: unknown) {
  const prefix = `${tag(`[${time()}]`)}${tag('[COMMAND]', 'magenta')}[${commandName}] ${message}`;
  if (data === undefined) {
    console.log(prefix);
  } else {
    let serialized = '';
    if (typeof data === 'string') {
      serialized = data;
    } else {
      try {
        serialized = JSON.stringify(data);
      } catch {
        serialized = '[unserializable data]';
      }
    }
    console.log(`${prefix} ${serialized}`);
  }
}

/**
 * HTTP 요청 결과와 JSON 배열 길이를 함께 로깅
 */
export function logFetchList(url: string, status: number, listLength: number) {
  console.log(
    `${tag(`[${time()}]`)}${tag('[FETCH][LIST]', 'yellow')} ${status} ${url} | items=${listLength}`,
  );
}

export function logMem(tag: string) {
  const mu = process.memoryUsage();
  const hs = v8.getHeapStatistics();
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

  logInfo(
    `[MEM ${tag}] rss=${mb(mu.rss)}MB heapUsed=${mb(mu.heapUsed)}MB heapTotal=${mb(mu.heapTotal)}MB ` +
      `ext=${mb(mu.external)}MB arrBuf=${mb(mu.arrayBuffers)}MB ` +
      `heapLimit=${mb(hs.heap_size_limit)}MB`,
  );
}
