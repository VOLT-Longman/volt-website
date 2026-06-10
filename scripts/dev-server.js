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

server.listen(port, () => {
    console.log(`VOLT dev server: http://localhost:${port}`);
});
