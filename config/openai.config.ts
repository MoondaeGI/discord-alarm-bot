import 'dotenv/config';
import OpenAI from 'openai';

// ───────────────────────────────────
// OpenAI 클라이언트
// ───────────────────────────────────
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
