// src/bot.ts
import 'dotenv/config';
import { Client, GatewayIntentBits as Intents } from 'discord.js';

import { CveEvent, HackerNewsEvent, MandiantEvent } from './events';
import type { Event } from './events/event';
import { logError, logInfo } from './util/log';
import { registerEvents } from './handler';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { pingCommand } from './commands';

const port = process.env.PORT || 3000;
const publicDir = path.resolve(process.cwd(), 'public');

// render health check 응답용 서버
http
  .createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // 1) health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('OK');
    }

    // 2) public static files
    if (url.pathname.startsWith('/public/')) {
      const filePath = path.join(publicDir, url.pathname.replace('/public/', ''));

      // 디렉토리 탈출 방지
      if (!filePath.startsWith(publicDir)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        return res.end('Not Found');
      }

      const stream = fs.createReadStream(filePath);
      res.writeHead(200, {
        'Content-Type': getMimeType(filePath),
        'Cache-Control': 'public, max-age=86400', // 1일 캐시
      });
      stream.pipe(res);
      return;
    }

    // 3) default
    res.writeHead(404);
    res.end('Not Found');
  })
  .listen(port, () => {
    console.log(`Health/static server listening on ${port}`);
  });

function getMimeType(filePath: string) {
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

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

    if (interaction.commandName === 'cve-search') {
      await interaction.deferReply();
      return;
    } else if (interaction.commandName === 'ping') {
      await pingCommand.execute(interaction);
    }
  });

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('Fatal error in bot:', err);
  // process.exit(1);
});
