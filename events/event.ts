import type { DiscordOutbound } from '../types/discord';
import type { EventOptions, EventPayload } from '../types/event';

/**
 * 모든 이벤트 소스가 따라야 할 인터페이스
 * TAlarmPayload: alarm() 결과 타입
 * TSearchPayload: search() 결과 타입 (사용 안 하면 unknown/never로 둬도 됨)
 */
export interface Event<T extends EventPayload> {
  readonly options: EventOptions;

  /**
   * 주기적으로 호출되는 알람 함수
   * - 새 이벤트가 있으면 payload 반환
   * - 없으면 "보낼 게 없는 상태"를 표현(널/빈배열 등)하도록 구현체에서 정의
   */
  alarm(lastRunAt?: Date): Promise<T | null>;

  /**
   * 필요할 때만 쓰는 검색 기능 (slash command 등)
   * 구현 안 해도 됨
   */
  search?(params: any): Promise<T[]>;

  summarize(payload: any): Promise<any>;

  buildPayload(payload: any): Promise<T | null>;

  /**
   * alarm 결과를 Discord로 보낼 수 있는 형태로 변환
   * - null을 반환하면 "전송할 메시지 없음"으로 취급
   */
  formatAlarm(payload: T): DiscordOutbound | null;
}
