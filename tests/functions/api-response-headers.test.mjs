import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as notices } from '../../functions/api/notices.js';
import { requireAdmin } from '../../functions/_shared/auth.js';

test('Public JSON and rejected admin responses forbid sniffing and preserve cache policy', async () => {
  const response = await notices({ env: { DB: { prepare: () => ({ all: async () => ({ results: [] }) }) } } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60');
  assert.deepEqual(await response.json(), { items: [] });
  const denied = await requireAdmin(new Request('https://volt.ceo/api/admin/notices'), { ADMIN_SESSION_SECRET: 'test-secret' });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(denied.headers.get('Cache-Control'), 'no-store');
});
