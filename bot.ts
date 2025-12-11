// src/bot.ts
import 'dotenv/config';
import { Client, Intents } from 'discord.js';
import { Database } from 'sqlite';

import { CveEvent, HackerNewsEvent } from './events';
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

    // DB에서 lastId 복원
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

    // CveEvent 인스턴스 하나 생성해서
    // 1) 알람용 이벤트 배열에 넣고
    // 2) 검색(/cve-search)에서도 재사용
    const cveEvent = new CveEvent();
    const hackerNewsEvent = new HackerNewsEvent();

    const events: Event<any>[] = [
      cveEvent, // 필요하면 여기 다른 Event도 추가
      hackerNewsEvent,
    ];

    console.log('이벤트 등록 및 스케줄링 시작');
    void registerEvents(client, db as Database, events);

    console.log('이벤트 등록 및 스케줄링 완료');
  });

  // ───────────────────────────────────
  // 슬래시 커맨드 핸들러 (/cve-search)
  // ───────────────────────────────────
  client.on('interactionCreate', async (interaction) => {
    // v13 기준: isCommand()
    // v14라면 isChatInputCommand()로 바꿔야 함
    if (!interaction.isCommand()) return;
    if (interaction.commandName !== 'cve-search') return;

    const question = interaction.options.getString('question', true);

    await interaction.deferReply();

    try {
      const cveEventForSearch = new CveEvent();
      const results = await cveEventForSearch.search(question);

      if (!results.length) {
        await interaction.editReply('검색 결과가 없습니다.');
        return;
      }

      // 너무 많을 수 있으니 상위 3개까지만 보여주기
      const top = results.slice(0, 3);
      const embeds = top.map((p) => cveEventForSearch.formatAlarm(p)).filter((e): e is any => !!e);

      await interaction.editReply({ embeds });
    } catch (err) {
      logError('CveEvent:search', err);
      await interaction.editReply('검색 처리 중 오류가 발생했습니다.');
    }
  });

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('Fatal error in bot:', err);
  // process.exit(1);
});
