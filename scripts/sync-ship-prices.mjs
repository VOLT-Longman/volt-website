import { writeFile } from 'node:fs/promises';

const API_URL = 'https://api.star-citizen.wiki/api/vehicles?page[size]=500';
const OUTPUT_PATH = new URL('../data/ship-prices-usd.json', import.meta.url);

async function fetchPage(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Price source request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function main() {
    const firstPage = await fetchPage(API_URL);
    const remainingUrls = [];
    for (let page = 2; page <= firstPage.meta.last_page; page += 1) {
        remainingUrls.push(`${API_URL}&page[number]=${page}`);
    }
    const remainingPages = await Promise.all(remainingUrls.map(fetchPage));
    const vehicles = [firstPage, ...remainingPages].flatMap((page) => page.data);
    const prices = {};
    for (const vehicle of vehicles) {
        if (vehicle.msrp != null && prices[vehicle.name] == null) {
            prices[vehicle.name] = vehicle.msrp;
        }
    }
    const snapshot = {
        source: 'Star Citizen Wiki API',
        retrievedAt: new Date().toISOString().slice(0, 10),
        prices
    };
    await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    console.log(`Saved ${Object.keys(prices).length} USD prices.`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
