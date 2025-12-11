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
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cve_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export { db };
