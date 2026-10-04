import { DatabaseSync } from 'node:sqlite';
import { SECURITY_SCHEMA } from '../../functions/_shared/security-store.js';

// Execute production SQL against SQLite, including conditional writes and RETURNING.
export function createSqliteDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const sql of SECURITY_SCHEMA) sqlite.exec(sql);
  sqlite.exec('CREATE TABLE IF NOT EXISTS cms_write_context (id INTEGER PRIMARY KEY CHECK(id=1), actor TEXT NOT NULL)');
  let pending = Promise.resolve();
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
    batch(statements) {
      const operation = pending.then(async () => {
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
      });
      pending = operation.catch(() => {});
      return operation;
    }
  };
  return db;
}
