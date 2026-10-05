import test from 'node:test';
import assert from 'node:assert/strict';
import { runModel, MODEL, MODEL_DAILY_LIMIT } from '../../functions/_shared/ai-model.js';
import { createMockDb } from './helpers.mjs';

const input = { system: 'Explain the data.', user: '공개 함선 데이터', maxTokens: 9999 };
function envWith(run) { return { DB: createMockDb(() => []), AI: { run } }; }

test('Model budget reserves globally and atomically; failed calls are not refunded', async () => {
  let calls = 0;
  const env = envWith(async (model, payload) => {
    calls++;
    assert.equal(model, MODEL);
    assert.equal(payload.max_tokens, 256);
    throw new Error('Provider quota');
  });
  const results = await Promise.all(Array.from({ length: MODEL_DAILY_LIMIT + 10 }, () => runModel(env, input)));
  assert.equal(calls, MODEL_DAILY_LIMIT);
  assert.equal(results.filter((result) => result.reason === 'daily-limit').length, 10);
  assert.ok(results.every((result) => result.unavailable));
});

test('Oversize multilingual prompts skip inference without consuming quota', async () => {
  let calls = 0;
  const env = envWith(async () => { calls++; return { response: 'ok' }; });
  assert.equal((await runModel(env, { ...input, user: '한'.repeat(3000) })).reason, 'input-limit');
  assert.equal(calls, 0);
  assert.deepEqual(await runModel(env, input), { text: 'ok' });
});

test('Model timeout returns fallback even when inference never settles', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let called;
  const started = new Promise((resolve) => { called = resolve; });
  const result = runModel(envWith(() => { called(); return new Promise(() => {}); }), input);
  await started;
  t.mock.timers.tick(8000);
  assert.equal((await result).reason, 'timeout');
});

test('Missing binding and malformed model responses safely fall back', async () => {
  assert.equal((await runModel({}, input)).reason, 'no-binding');
  assert.equal((await runModel(envWith(async () => ({ response: {} })), input)).reason, 'empty');
});
