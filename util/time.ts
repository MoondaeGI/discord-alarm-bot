/**
 * 미국(또는 로컬) 시간을 한국 시간(KST, UTC+9)으로 변환합니다.
 * @param value Date | number | string - Date 인스턴스나 타임스탬프/ISO 문자열
 * @returns 변환된 KST Date 객체
 */
export function toKst(value: Date | number | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  // 현재 입력의 로컬시간을 UTC 기준으로 맞춘 뒤 KST(+9)로 이동
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000;
  return new Date(utcMs + 9 * 60 * 60 * 1000);
}

export function toUtcIsoDate(dateStr: string, endOfDay = false) {
  const kstDate = new Date(dateStr + (endOfDay ? 'T23:59:59.999+09:00' : 'T00:00:00.000+09:00'));
  return kstDate.toISOString(); // → 자동 UTC 변환
}
