import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ERKUL_SHIPS_ENDPOINT = 'https://server.erkul.games/live/ships';
const ERKUL_SHOP_ENDPOINT = 'https://server.erkul.games/shop';
const OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/external/erkul');
const FETCH_TIMEOUT_MS = 60000;

const MIN_SHIP_COUNT = 200;
const MIN_SHOP_COUNT = 50;

const REQUEST_HEADERS = {
    Origin: 'https://www.erkul.games',
    Referer: 'https://www.erkul.games/live/calculator',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    Accept: 'application/json, text/plain, */*'
};

async function fetchErkulJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(url, { headers: REQUEST_HEADERS, signal: controller.signal });
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`Erkul request timed out after ${FETCH_TIMEOUT_MS}ms: ${url}`);
        }
        throw new Error(`Erkul network request failed: ${url} — ${error.message}`);
    } finally {
        clearTimeout(timer);
    }

    if (response.status === 403 || response.status === 418) {
        throw new Error(`Erkul blocked the request (${response.status} ${response.statusText}): ${url} — 헤더/Origin 정책이 바뀌었을 수 있음`);
    }
    if (!response.ok) {
        throw new Error(`Erkul request failed: ${response.status} ${response.statusText} — ${url}`);
    }

    const rawText = await response.text();
    let payload;
    try {
        payload = JSON.parse(rawText);
    } catch {
        throw new Error(`Erkul JSON parse failed: ${url} — 응답 시작부: ${rawText.slice(0, 200)}`);
    }
    return { payload, byteLength: Buffer.byteLength(rawText, 'utf8') };
}

function toRecordArray(payload, label) {
    if (Array.isArray(payload)) {
        return payload;
    }
    if (payload && typeof payload === 'object') {
        for (const key of ['ships', 'shops', 'data', 'items']) {
            if (Array.isArray(payload[key])) {
                return payload[key];
            }
        }
    }
    throw new Error(`Erkul ${label} 응답에서 레코드 배열을 찾지 못함 (top-level keys: ${payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 10).join(', ') : typeof payload})`);
}

function hasShopInventory(shops) {
    return shops.some((shop) => {
        if (!shop || typeof shop !== 'object') return false;
        const inventory = shop.data?.inventory ?? shop.inventory;
        return Array.isArray(inventory) && inventory.length > 0;
    });
}

async function main() {
    await mkdir(OUTPUT_DIR, { recursive: true });

    const { payload: shipsPayload, byteLength: shipsBytes } = await fetchErkulJson(ERKUL_SHIPS_ENDPOINT);
    const ships = toRecordArray(shipsPayload, 'live/ships');
    if (ships.length < MIN_SHIP_COUNT) {
        throw new Error(`Erkul ships 레코드 수 부족: ${ships.length} < ${MIN_SHIP_COUNT}`);
    }

    const { payload: shopPayload, byteLength: shopBytes } = await fetchErkulJson(ERKUL_SHOP_ENDPOINT);
    const shops = toRecordArray(shopPayload, 'shop');
    if (shops.length < MIN_SHOP_COUNT) {
        throw new Error(`Erkul shop 레코드 수 부족: ${shops.length} < ${MIN_SHOP_COUNT}`);
    }
    if (!hasShopInventory(shops)) {
        throw new Error('Erkul shop 응답에 inventory가 있는 상점이 하나도 없음');
    }

    const shipsPath = resolve(OUTPUT_DIR, 'ships.raw.json');
    const shopPath = resolve(OUTPUT_DIR, 'shop.raw.json');
    await writeFile(shipsPath, `${JSON.stringify(shipsPayload, null, 2)}\n`, 'utf8');
    await writeFile(shopPath, `${JSON.stringify(shopPayload, null, 2)}\n`, 'utf8');

    const meta = {
        source: 'erkul-live',
        endpoints: {
            ships: ERKUL_SHIPS_ENDPOINT,
            shop: ERKUL_SHOP_ENDPOINT
        },
        fetchedAt: new Date().toISOString(),
        shipCount: ships.length,
        shopCount: shops.length,
        shipsBytes,
        shopBytes,
        note: 'ships.raw.json / shop.raw.json은 용량 문제로 git에 커밋하지 않는다 (.gitignore 참조). 커밋 대상은 asgard.raw.json / asgard-field-sample.json / fetch-meta.json.'
    };
    await writeFile(resolve(OUTPUT_DIR, 'fetch-meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

    console.log(`ships: ${ships.length} records (${(shipsBytes / 1024 / 1024).toFixed(1)}MB) → ${shipsPath}`);
    console.log(`shops: ${shops.length} records (${(shopBytes / 1024 / 1024).toFixed(1)}MB) → ${shopPath}`);
    console.log('fetch-meta.json 갱신 완료');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
