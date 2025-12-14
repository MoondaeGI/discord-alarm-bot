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

/**
 * timezone 로 해석한 시각을 KST 시각으로 변환
 * - Date 인스턴스가 로컬 타임존으로 만들어진 경우에도,
 *   연/월/일/시/분 필드를 timezone 기준으로 다시 해석해 KST로 변환한다.
 */
export function timezoneToKst(date: Date, timezone: Timezone): Date {
  const base = date instanceof Date ? date : new Date(date); // 방어 로직 (호출부가 Date 보장하지 못할 때 대비)

  const dt = DateTime.fromObject(
    {
      year: base.getFullYear(),
      month: base.getMonth() + 1,
      day: base.getDate(),
      hour: base.getHours(),
      minute: base.getMinutes(),
      second: base.getSeconds(),
      millisecond: base.getMilliseconds(),
    },
    { zone: timezone },
  );

  return dt.isValid ? dt.setZone('Asia/Seoul').toJSDate() : base;
}

/** KST Date → timezone Date */
export function kstToTimezone(date: Date, timezone: Timezone): Date {
  return DateTime.fromJSDate(date, { zone: 'Asia/Seoul' }).setZone(timezone).toJSDate();
}

/**
 * KST 기준으로 날짜를 "yyyy년 MM월 dd일 HH:mm:ss" 포맷 문자열로 반환
 */
export function formatKst(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return DateTime.fromJSDate(d).toFormat('yyyy년 MM월 dd일 HH:mm:ss');
}
