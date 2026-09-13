import { DatabaseSync } from 'node:sqlite';
import type { RoomDatabase, RoomStatement } from '../lib/server/rooms.ts';

/** Same SQL contract as D1, used only by the self-hosted relay. */
export function createRoomDatabase(schema: string, filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys = ON');
  if (
    !sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'",
      )
      .get()
  )
    sqlite.exec(schema);
  // Upgrade a saved relay database without replacing rooms or credentials.
  const columns = sqlite.prepare('PRAGMA table_info(rooms)').all();
  if (!columns.some((column) => column.name === 'pause_revision'))
    sqlite.exec(
      'ALTER TABLE rooms ADD COLUMN pause_revision INTEGER NOT NULL DEFAULT 0; ALTER TABLE rooms ADD COLUMN pause_ack INTEGER NOT NULL DEFAULT 0;',
    );
  const prepare = (
    sql: string,
    values: (string | number | null)[] = [],
  ): RoomStatement => ({
    bind: (...next) => prepare(sql, next),
    first: async <T>(column?: string) => {
      const row = sqlite.prepare(sql).get(...values);
      return (row ? (column ? row[column] : row) : null) as T | null;
    },
    all: async <T>() => ({
      results: sqlite.prepare(sql).all(...values) as T[],
    }),
    run: async () => ({
      meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) },
    }),
  });
  const db: RoomDatabase = {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db, sqlite, close: () => sqlite.close() };
}
