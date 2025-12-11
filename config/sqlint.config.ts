import 'dotenv/config';
import sqlite3 from 'sqlite3';

// ───────────────────────────────────
// sqlite 초기화
// ───────────────────────────────────
let db;

export async function initDb() {
  db = await open({
    filename: './cve_state.db',
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS last_cve (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cve_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export async function getLastCveId() {
  const row = await db.get('SELECT cve_id FROM last_cve WHERE id = 1');
  return row ? row.cve_id : null;
}

export async function setLastCveId(cveId) {
  const now = new Date().toISOString();
  await db.run(
    `
    INSERT INTO last_cve (id, cve_id, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      cve_id = excluded.cve_id,
      updated_at = excluded.updated_at;
    `,
    [cveId, now],
  );
}
