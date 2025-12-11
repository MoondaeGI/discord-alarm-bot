import { db } from '../config/sqlint.config';

export async function getLastId(table: string) {
  const row = await db?.get(`SELECT id FROM ${table} LIMIT 1`);
  return row ? row.id : null;
}

export async function setLastId(table: string, id: any) {
  const now = new Date().toISOString();
  await db?.run(
    `
    INSERT INTO ${table} (id, updated_at)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET
      id = excluded.id,
      updated_at = excluded.updated_at;
    `,
    [id, now],
  );
}
