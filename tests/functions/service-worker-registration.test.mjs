import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('서비스 워커는 캐시를 우회해 매 페이지 로드마다 업데이트를 확인한다', async () => {
  const source = await readFile(join(ROOT, 'js/main.js'), 'utf8');
  assert.match(source, /register\('\/sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(source, /\.then\(\(registration\) => registration\.update\(\)\)/);
});
