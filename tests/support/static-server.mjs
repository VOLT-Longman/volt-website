import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT || 4173);
const ROOT = resolve(process.cwd());

const MIME_TYPES = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml'],
    ['.webp', 'image/webp'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg']
]);

function sendJson(response, payload, statusCode = 200) {
    response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
}

function getSafePath(pathname) {
    const requested = normalize(pathname === '/' ? '/index.html' : pathname);
    const filePath = resolve(join(ROOT, requested));
    return filePath.startsWith(ROOT) ? filePath : null;
}

function handleApi(request, response) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === '/auth/me') {
        sendJson(response, { authenticated: false, user: null, roles: [] });
        return true;
    }
    if (url.pathname.startsWith('/api/')) {
        sendJson(response, { items: [] }, 503);
        return true;
    }
    return false;
}

createServer((request, response) => {
    if (handleApi(request, response)) return;

    const url = new URL(request.url, `http://${request.headers.host}`);
    const filePath = getSafePath(url.pathname);
    if (!filePath) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
    }

    const contentType = MIME_TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
    const stream = createReadStream(filePath);
    stream.on('open', () => response.writeHead(200, { 'content-type': contentType }));
    stream.on('error', () => {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    });
    stream.pipe(response);
}).listen(PORT, '127.0.0.1');
