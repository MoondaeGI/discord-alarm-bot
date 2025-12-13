import type { DiscordOutbound } from '../types/discord';
import type { EventOptions, EventPayload, AlarmWindow } from '../types/event';

/**
 * 모든 이벤트 소스가 따라야 할 인터페이스
 * TAlarmPayload: alarm() 결과 타입
 * TSearchPayload: search() 결과 타입 (사용 안 하면 unknown/never로 둬도 됨)
 */
export interface Event<T extends EventPayload> {
  readonly options: EventOptions;

  // 최신 이벤트 JSON 반환
  alarm(ctx: AlarmWindow): Promise<T[]>;

  // 검색 기능능
  search?(params: any): Promise<T[]>;

  // LLM 이벤트 요약
  summarize(payload: any): Promise<any>;

  // json -> payload 변환
  buildPayload(payload: any): Promise<T | null>;

  // 디스코드로 출력할 모양 변환
  format(payload: T): DiscordOutbound | null;
}
