import 'dotenv/config';
import { Client, Intents } from 'discord.js';

// ───────────────────────────────────
// 환경변수 체크
// ───────────────────────────────────
const { DISCORD_TOKEN, DISCORD_CHANNEL_ID, OPENAI_API_KEY } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CHANNEL_ID || !OPENAI_API_KEY) {
  console.error('DISCORD_TOKEN / DISCORD_CHANNEL_ID / OPENAI_API_KEY 필요');
  process.exit(1);
}

// ───────────────────────────────────
// Discord 클라이언트
// ───────────────────────────────────
export const discord = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});
