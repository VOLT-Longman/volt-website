import { error } from './http.js';
import { securityDb } from './security-store.js';

// Reserve capacity atomically before side effects; KV cannot provide this guarantee.
export async function checkRateLimit(env, key, { limit, windowSeconds }) {
  const db = await securityDb(env);
  const now = Date.now();
  const row = await db.prepare(`INSERT INTO security_limits (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
    WHERE reset_at <= ? OR count < ? RETURNING reset_at`)
    .bind(key, now + windowSeconds * 1000, now, now, now, limit).first();
  let released = false;
  return {
    limited: !row,
    commit: async () => {}, // Compatibility: reservation is already committed.
    async release() {
      if (!row || released) return;
      released = true;
      await db.prepare('UPDATE security_limits SET count = max(0, count - 1) WHERE key = ? AND reset_at = ?')
        .bind(key, row.reset_at).run();
    }
  };
}
export async function enforceRateLimit(env, key, options) {
  const gate = await checkRateLimit(env, key, options);
  return gate.limited ? error('Too many requests', 429) : null;
}
