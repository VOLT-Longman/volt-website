// 의존성 없는 정적 서버 — Playwright 스모크 테스트 및 로컬 미리보기용.
// API(functions/)는 제공하지 않으므로 테스트에서 page.route로 모킹한다.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 8787;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
    let filePath = path.normalize(path.join(root, urlPath));
    if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    if (urlPath === '/' || (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())) {
        filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
        }
        const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(content);
    });
});

server.on('error', (error) => {
    console.error(`VOLT dev server error: ${error.message}`);
    process.exitCode = 1;
});

// Playwright webServer는 종료 시 시그널을 보낸다. keep-alive 소켓이 남으면 close()가 대기하면서
// Windows 로컬 실행이 끝나지 않는다. 소켓을 함께 닫고, 이벤트 루프가 비면 자연 종료한다.
// 유예 타이머는 unref이므로 정상 드레인을 지연시키지 않고, 남은 핸들이 있을 때만 강제 종료한다.
let closing = false;
function shutdown() {
    if (closing) return;
    closing = true;
    server.close((error) => {
        if (error) {
            console.error(`VOLT dev server close failed: ${error.message}`);
            process.exitCode = 1;
        }
    });
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);

server.listen(port, () => {
    console.log(`VOLT dev server: http://localhost:${port}`);
});
