/** Mobile lab measurement; not a field Core Web Vitals or Lighthouse score. */
import { chromium } from '@playwright/test';
const target = process.argv[2] || 'https://www.volt.ceo/';
const browser = await chromium.launch();
const runs = [];
try {
    for (let run = 0; run < 3; run++) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
        const page = await context.newPage();
        const client = await context.newCDPSession(page);
        await client.send('Network.enable');
        await client.send('Network.setCacheDisabled', { cacheDisabled: true });
        await client.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
        await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.addInitScript(() => {
            window.lab = { lcp: 0, cls: 0, longTasks: 0 };
            new PerformanceObserver(list => { for (const e of list.getEntries()) window.lab.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
            new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.lab.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
            new PerformanceObserver(list => { for (const e of list.getEntries()) window.lab.longTasks += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
        });
        await page.goto(target, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(5000);
        runs.push(await page.evaluate(() => ({
            ...window.lab,
            fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
            domLoaded: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
            resources: performance.getEntriesByType('resource').map(e => ({ name: e.name.replace(location.origin, ''), bytes: e.encodedBodySize, transfer: e.transferSize })).sort((a,b) => b.bytes-a.bytes).slice(0,8),
        })));
        await context.close();
    }
    const median = key => runs.map(r => r[key]).sort((a,b) => a-b)[1];
    console.log(JSON.stringify({ target, measuredAt: new Date().toISOString(), conditions: '390x844, CPU 4x, 1.6Mbps download, 150ms latency, cold cache, service worker blocked, 3 runs', median: { lcp: median('lcp'), fcp: median('fcp'), cls: median('cls'), longTasks: median('longTasks') }, runs }, null, 2));
} finally { await browser.close(); }
