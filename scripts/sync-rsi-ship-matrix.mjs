import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RSI_SHIP_MATRIX_ENDPOINT = 'https://robertsspaceindustries.com/ship-matrix/index';
const OUTPUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../data/rsi-ship-matrix-index.json');

async function fetchShipMatrix() {
    const response = await fetch(RSI_SHIP_MATRIX_ENDPOINT, {
        headers: {
            'Accept-Language': 'en-US,en;q=0.9'
        }
    });

    if (!response.ok) {
        throw new Error(`RSI Ship Matrix request failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    if (!payload.success || !Array.isArray(payload.data)) {
        throw new Error('RSI Ship Matrix response shape is invalid.');
    }

    return payload;
}

async function main() {
    const payload = await fetchShipMatrix();
    await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`Saved ${payload.data.length} ships to ${OUTPUT_PATH}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
