// src/bot.ts
import 'dotenv/config';
import { Client, GatewayIntentBits as Intents } from 'discord.js';

import { CveEvent, HackerNewsEvent, MandiantEvent } from './events';
import type { Event } from './events/event';
import { logError, logInfo } from './util/log';
import { registerEvents } from './handler';
import http from 'http';

const port = process.env.PORT || 3000;

// render health check 응답용 서버
http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end('OK');
  })
  .listen(port, () => {
    console.log(`Health server listening on ${port}`);
  });

// ───────────────────────────────────
// 메인 엔트리 포인트
// ───────────────────────────────────
async function main() {
  const client = new Client({
    intents: [Intents.Guilds, Intents.GuildMessages],
  });

  client.once('ready', async () => {
    logInfo(`로그인 완료: ${client.user?.tag}`);

    const cveEvent = new CveEvent();
    const hackerNewsEvent = new HackerNewsEvent();
    const mandiantEvent = new MandiantEvent();

    const events: Event<any>[] = [
      cveEvent, // 필요하면 여기 다른 Event도 추가
      hackerNewsEvent,
      mandiantEvent,
    ];

    logInfo('이벤트 등록 및 스케줄링 시작');
    void registerEvents(client, events);

    logInfo('이벤트 등록 및 스케줄링 완료');
  });

  // ───────────────────────────────────
  // 슬래시 커맨드 핸들러 (/cve-search)
  // ───────────────────────────────────
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

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

      // 너무 많을 수 있으니 상위 5개까지만 보여주기
      const top = results.slice(0, 5);
      const embeds = top.map((p) => cveEventForSearch.format(p)).filter((e): e is any => !!e);

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
