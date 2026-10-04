import { DatabaseSync } from 'node:sqlite';
import { SECURITY_SCHEMA } from '../../functions/_shared/security-store.js';

// Execute production SQL against SQLite, including conditional writes and RETURNING.
export function createSqliteDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const sql of SECURITY_SCHEMA) sqlite.exec(sql);
  const db = {
    sqlite,
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { const result = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes) } }; }
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (caught) {
        sqlite.exec('ROLLBACK');
        throw caught;
      }
    }
  };
  return db;
}
