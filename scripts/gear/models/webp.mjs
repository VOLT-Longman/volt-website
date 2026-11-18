/**
 * webp.mjs — encodes opaque RGB images to WebP with the system Chrome's own encoder, through the Playwright that the
 * site's tests already use. Node has no WebP encoder and nothing is downloaded for this.
 * The page is about:blank; no network is used. Each result is decoded again in the same browser and compared with
 * the source, so the reported error is measured. (From the prototype's poc/lib/webp.mjs; one browser is kept open.)
 */
import { createRequire } from 'node:module';

/** looks for Playwright in the repository first, then in the folders given (e.g. another checkout's node_modules) */
function loadPlaywright(roots) {
    const errors = [];
    for (const root of roots) {
        for (const name of ['playwright', '@playwright/test']) {
            try { const mod = createRequire(`${root}/package.json`)(name); if (mod.chromium) return mod; } catch (error) { errors.push(`${root}: ${error.code || error.message}`); }
        }
    }
    throw new Error(`Playwright not found (${errors.join('; ')}). Install the repo's dev dependencies or pass --node-modules-from <checkout>.`);
}

export class WebpEncoder {
    constructor(roots) { this.roots = roots; this.browser = null; this.page = null; }

    async open() {
        if (this.page) return;
        const { chromium } = loadPlaywright(this.roots);
        this.browser = await chromium.launch({ channel: 'chrome' });
        this.page = await this.browser.newPage();
    }

    /** item: { rgba: Uint8Array (opaque), width, height } -> { bytes: Buffer, maxError, meanError } */
    async encode(item, quality = 0.85) {
        await this.open();
        const b64 = Buffer.from(item.rgba.buffer, item.rgba.byteOffset, item.rgba.byteLength).toString('base64');
        const result = await this.page.evaluate(async ({ data, width, height, q }) => {
            const bin = atob(data); const bytes = new Uint8ClampedArray(bin.length);
            for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
            const canvas = new OffscreenCanvas(width, height); const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.putImageData(new ImageData(bytes, width, height), 0, 0);
            const blob = await canvas.convertToBlob({ type: 'image/webp', quality: q });
            // decode again and measure the difference
            const bitmap = await createImageBitmap(blob);
            const check = new OffscreenCanvas(width, height); const cctx = check.getContext('2d', { willReadFrequently: true });
            cctx.drawImage(bitmap, 0, 0);
            const back = cctx.getImageData(0, 0, width, height).data;
            let max = 0; let sum = 0;
            for (let i = 0; i < back.length; i += 4) for (let c = 0; c < 3; c += 1) { const d = Math.abs(back[i + c] - bytes[i + c]); if (d > max) max = d; sum += d; }
            const buf = new Uint8Array(await blob.arrayBuffer()); let s = '';
            for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
            return { type: blob.type, data: btoa(s), maxError: max, meanError: sum / (width * height * 3) };
        }, { data: b64, width: item.width, height: item.height, q: quality });
        if (result.type !== 'image/webp') throw new Error(`browser returned ${result.type} instead of image/webp`);
        return { bytes: Buffer.from(result.data, 'base64'), maxError: result.maxError, meanError: result.meanError };
    }

    async close() { if (this.browser) await this.browser.close(); this.browser = null; this.page = null; }
}
