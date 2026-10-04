import { getVerifiedAdminIdentity } from './auth.js';
import { requireDb } from './http.js';

// D1 batches are isolated transactions. Scope the actor to the write transaction,
// so concurrent requests and failed writes cannot misattribute trigger history.
export function adminDb(request, env) {
  const db = requireDb(env);
  const identity = getVerifiedAdminIdentity(request);
  if (!identity) throw new Error('Administrator identity is required');
  const actor = JSON.stringify({ method: identity.method, id: identity.id || null, name: identity.displayName });
  async function batch(statements) {
    const results = await db.batch([
      db.prepare('INSERT OR REPLACE INTO cms_write_context(id, actor) VALUES (1, ?)').bind(actor),
      ...statements,
      db.prepare('DELETE FROM cms_write_context WHERE id = 1')
    ]);
    return results.slice(1, -1);
  }
  return {
    prepare(sql) {
      let statement = db.prepare(sql);
      const wrapper = {
        bind(...values) { statement = statement.bind(...values); return wrapper; },
        first: (...args) => statement.first(...args),
        all: (...args) => statement.all(...args),
        async run() { return /^(?:INSERT|UPDATE|DELETE)\b/i.test(sql.trim()) ? (await batch([statement]))[0] : statement.run(); },
        rawStatement: () => statement
      };
      return wrapper;
    },
    batch: (statements) => batch(statements.map((statement) => statement.rawStatement()))
  };
}
