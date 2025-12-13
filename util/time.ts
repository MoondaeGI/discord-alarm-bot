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

import { DateTime } from 'luxon';
import type { Timezone } from '../types';

/**
 * time + timezone → UTC Date
 * - time이 Date면: 해당 timezone 기준의 로컬 시간으로 해석
 * - time이 string이면:
 *   1) ISO / RFC2822 (Z, +09:00 있으면 자동 처리)
 *   2) timezone 기준 로컬 문자열로 해석
 */
export function timezoneToUtc(
  time: string | Date,
  timezone: Timezone,
  format = 'yyyy-MM-dd HH:mm:ss',
): Date | null {
  // Date 객체
  if (time instanceof Date) {
    return DateTime.fromJSDate(time, { zone: timezone }).toUTC().toJSDate();
  }

  const raw = time.trim();

  // 1) ISO (2025-12-13T03:10:00Z, +09:00 등)
  let dt = DateTime.fromISO(raw, { setZone: true });
  if (dt.isValid) return dt.toUTC().toJSDate();

  // 2) RFC2822 (RSS pubDate)
  dt = DateTime.fromRFC2822(raw, { setZone: true });
  if (dt.isValid) return dt.toUTC().toJSDate();

  // 3) timezone 기준 로컬 시간 문자열
  dt = DateTime.fromFormat(raw, format, { zone: timezone });
  if (!dt.isValid) return null;

  return dt.toUTC().toJSDate();
}

/** UTC Date → timezone Date (표시용) */
export function utcToTimezone(utcDate: Date, timezone: Timezone): Date {
  return DateTime.fromJSDate(utcDate, { zone: 'utc' }).setZone(timezone).toJSDate();
}

/** timezone Date → KST Date */
export function timezoneToKst(date: Date, timezone: Timezone): Date {
  return DateTime.fromJSDate(date, { zone: timezone }).setZone('Asia/Seoul').toJSDate();
}

/** KST Date → timezone Date */
export function kstToTimezone(date: Date, timezone: Timezone): Date {
  return DateTime.fromJSDate(date, { zone: 'Asia/Seoul' }).setZone(timezone).toJSDate();
}
