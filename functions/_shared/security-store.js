import { requireDb } from './http.js';

// Additive bootstrap permits a code deployment before migration 0013 is applied.
const ready = new WeakMap();
export const SECURITY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS security_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS security_ai_usage (id INTEGER PRIMARY KEY CHECK (id = 1), day TEXT NOT NULL, month TEXT NOT NULL, day_count INTEGER NOT NULL, day_cost INTEGER NOT NULL, month_cost INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS security_sessions (id TEXT PRIMARY KEY, user_sub TEXT NOT NULL, token TEXT NOT NULL, role_ids TEXT NOT NULL, checked_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`
];
export async function securityDb(env) {
  const db = requireDb(env);
  if (!ready.has(db)) {
    ready.set(db, (async () => {
      for (const sql of SECURITY_SCHEMA) await db.prepare(sql).run();
      const now = Date.now();
      await db.prepare('DELETE FROM security_limits WHERE key IN (SELECT key FROM security_limits WHERE reset_at < ? LIMIT 1000)').bind(now).run();
      await db.prepare('DELETE FROM security_sessions WHERE id IN (SELECT id FROM security_sessions WHERE expires_at < ? LIMIT 1000)').bind(now).run();
    })().catch((err) => { ready.delete(db); throw err; }));
  }
  await ready.get(db);
  return db;
}
export async function reserveAiUsage(env, keys, config) {
  const db = await securityDb(env);
  // Preserve current-period estimates on the first upgrade from KV. INSERT OR IGNORE
  // makes concurrent initialization safe; after this, KV is never an admission source.
  const initialized = await db.prepare('SELECT id FROM security_ai_usage WHERE id = 1').first();
  if (!initialized) {
    const [day, month] = env.RATE_LIMIT_KV ? await Promise.all([
      env.RATE_LIMIT_KV.get(`ai_usage:d:${keys.day}`, { type: 'json' }),
      env.RATE_LIMIT_KV.get(`ai_usage:m:${keys.month}`, { type: 'json' })
    ]) : [null, null];
    const nonnegative = (value) => Math.max(0, Number(value) || 0);
    await db.prepare('INSERT OR IGNORE INTO security_ai_usage (id, day, month, day_count, day_cost, month_cost) VALUES (1, ?, ?, ?, ?, ?)')
      .bind(keys.day, keys.month, nonnegative(day?.count), nonnegative(day?.cost), nonnegative(month?.cost)).run();
  }
  // Both budgets are reserved in one conditional write before any external model call.
  return db.prepare(`INSERT INTO security_ai_usage (id, day, month, day_count, day_cost, month_cost)
    SELECT 1, ?, ?, 1, ?, ? WHERE ? <= ? AND ? <= ?
    ON CONFLICT(id) DO UPDATE SET
      day = excluded.day, month = excluded.month,
      day_count = CASE WHEN day = excluded.day THEN day_count + 1 ELSE 1 END,
      day_cost = CASE WHEN day = excluded.day THEN day_cost + excluded.day_cost ELSE excluded.day_cost END,
      month_cost = CASE WHEN month = excluded.month THEN month_cost + excluded.month_cost ELSE excluded.month_cost END
    WHERE excluded.day >= day AND excluded.month >= month
      AND (CASE WHEN day = excluded.day THEN day_count ELSE 0 END) < ?
      AND (CASE WHEN day = excluded.day THEN day_cost ELSE 0 END) + excluded.day_cost <= ?
      AND (CASE WHEN month = excluded.month THEN month_cost ELSE 0 END) + excluded.month_cost <= ?
    RETURNING day_count, day_cost, month_cost`)
    .bind(keys.day, keys.month, config.estCostPerReq, config.estCostPerReq,
      config.estCostPerReq, config.costCapDay, config.estCostPerReq, config.costCapMonth,
      config.dailyLimit, config.costCapDay, config.costCapMonth).first();
}
