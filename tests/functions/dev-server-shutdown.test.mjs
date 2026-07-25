// F4: Playwright webServer가 종료 시그널을 보낸 뒤 로컬 dev 서버가 남지 않아야 한다.
// keep-alive 소켓이 열려 있어도 close가 대기하지 않고 프로세스가 끝나는지 통합으로 확인한다.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SERVER_PATH = fileURLToPath(new URL('../../scripts/dev-server.js', import.meta.url));
const PORT = 8799; // Playwright(8787)와 겹치지 않는 포트

function startServer() {
    const child = spawn(process.execPath, [SERVER_PATH], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('dev server did not report readiness')), 10000);
        child.stdout.on('data', (chunk) => {
            if (String(chunk).includes('VOLT dev server')) {
                clearTimeout(timer);
                resolve();
            }
        });
        child.once('error', reject);
    });
    return { child, ready };
}

test('dev server exits after a termination signal even with an open keep-alive socket', async () => {
    const { child, ready } = startServer();
    try {
        await ready;
        // keep-alive 연결을 열어둔 상태를 만든다(과거 종료 대기의 원인).
        const socket = createConnection({ port: PORT, host: '127.0.0.1' });
        // 서버가 내려가면 이 소켓은 리셋된다(정상). 종료 검증이 목적이므로 소켓 오류는 흡수한다.
        socket.on('error', () => {});
        await once(socket, 'connect');
        socket.write(`GET /index.html HTTP/1.1\r\nHost: localhost:${PORT}\r\nConnection: keep-alive\r\n\r\n`);
        await once(socket, 'data');

        child.kill('SIGTERM');
        const exited = Promise.race([
            once(child, 'exit'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('dev server did not exit after SIGTERM')), 8000))
        ]);
        await exited;
        socket.destroy();
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
});

test('dev server installs idempotent shutdown handling for both signals', async () => {
    const source = await readFile(SERVER_PATH, 'utf8');
    // 시그널 두 종류를 모두 처리하고, close는 한 번만 실행되어야 한다.
    assert.match(source, /SIGINT/);
    assert.match(source, /SIGTERM/);
    assert.match(source, /if \(closing\) return;/, 'close는 idempotent해야 함');
    assert.match(source, /server\.close\(/);
    // listen/close 오류를 명시 처리
    assert.match(source, /server\.on\('error'/);
    assert.match(source, /close failed/);
});
