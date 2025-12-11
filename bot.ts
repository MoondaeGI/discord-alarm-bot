// src/bot.ts
import 'dotenv/config';
import { Client, Intents } from 'discord.js';
import { Database } from 'sqlite';

import { CveEvent } from './events/cve.event';
import type { Event } from './events/event';
import { getLastId, setLastId } from './util/database';
import { initDb, db } from './config/sqlint.config';
import { sendToDiscordChannel } from './util/discord';
import { logError, logPayload } from './util/log';

// ───────────────────────────────────
// 이벤트 등록/실행 핸들러
// ───────────────────────────────────
async function registerEvents(client: Client, db: Database, events: Event<any>[]): Promise<void> {
  for (const event of events) {
    const eventName = event.constructor.name;
    const interval = event.options.intervalMs;

    // DB에서 lastRunAt 복원
    const lastIdFromDb = await getLastId(event.options.table);
    let lastId: any = lastIdFromDb ? lastIdFromDb : undefined;

    const runOnce = async () => {
      try {
        const payload = await event.alarm(lastId);
        if (!payload) {
          console.log(`[${eventName}] 전송할 payload 없음`);
          return;
        }

        const msg = event.formatAlarm(payload);
        if (!msg) {
          console.log(`[${eventName}] formatAlarm 결과 없음`);
          return;
        }

        await sendToDiscordChannel(client, event.options.discordChannelId, msg);

        const newId = (payload as any).cveId ?? (payload as any).id ?? lastId;
        if (newId) {
          lastId = newId;
          await setLastId(event.options.table, newId);
        }

        logPayload(`${eventName}:sent`, { lastId });
        console.log(`[${eventName}] 알람 전송 완료`);
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

// ───────────────────────────────────
// 메인 엔트리 포인트
// ───────────────────────────────────
async function main() {
  await initDb();
  const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
  });

  client.once('ready', async () => {
    console.log(`로그인 완료: ${client.user?.tag}`);

    // 이벤트 인스턴스 생성
    const events: Event<any>[] = [
      new CveEvent(), // 필요하면 여기 다른 Event도 추가
    ];

    console.log('이벤트 등록 및 스케줄링 완료');
    void registerEvents(client, db as Database, events);
  });

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('Fatal error in bot:', err);
  process.exit(1);
});
