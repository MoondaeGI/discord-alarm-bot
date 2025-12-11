import 'dotenv/config';
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';

// ───────────────────────────────────
// sqlite 초기화
// ───────────────────────────────────
let db: Database | undefined;

export async function initDb() {
  db = await open({
    filename: './state.db',
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS cve (
      id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hacker_news (
      id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL
    );
  `);
}

export { db };
