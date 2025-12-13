import { Client } from 'discord.js';
import { Event } from '../events/event';
import { AlarmWindow } from '../types';
import { logEvent } from '../util/log';
import { sendToDiscordChannel } from '../util/discord';
import { logError } from '../util/log';

// ───────────────────────────────────
// 이벤트 등록/실행 핸들러
// ───────────────────────────────────
export async function registerEvents(client: Client, events: Event<any>[]): Promise<void> {
  for (const event of events) {
    const eventName = event.constructor.name;
    const interval = event.options.intervalMs;

    let lastWindowEndUtc: Date | null = null;

    const runOnce = async () => {
      const windowEndUtc = new Date();
      const windowStartUtc = lastWindowEndUtc ?? new Date(windowEndUtc.getTime() - interval);
      const ctx: AlarmWindow = { windowStartUtc, windowEndUtc };

      try {
        const payload = await event.alarm(ctx);
        if (payload.length === 0) {
          logEvent(eventName, 'payload 없음', { windowStartUtc, windowEndUtc });
          return;
        }

        for (const p of payload) {
          const msg = event.format(p);
          if (!msg) {
            logEvent(eventName, 'format 결과 없음', { id: (p as any)?.id });
            continue;
          }
          console.log(msg);

          await sendToDiscordChannel(client, event.options.discordChannelId, msg);
        }

        logEvent(eventName, '알람 전송 완료', { count: payload.length });
      } catch (err) {
        logError(`${eventName}:runOnce`, err);
        // 여기서 디스코드 에러 embed 보내고 싶으면 추가 가능
      }
    };

    // 처음 한 번 바로 실행
    void runOnce();

    // 이후 interval마다 실행
    setInterval(runOnce, interval);
  }
}
