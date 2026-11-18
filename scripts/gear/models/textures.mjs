/**
 * textures.mjs — offline texture work for the gear model export (Node built-ins + dds.mjs; from the prototype's
 * poc/lib/textures.mjs).
 *
 * Item mask: the game shades a gun with a layered shader that has NO base-colour texture. Each sub-material is a
 * "base layer" and a "wear layer" (constants), mixed by the item's wear mask; shininess is scaled by the gloss map
 * (attached alpha of the _ddna texture) and cavities are darkened by the G channel of the _hal texture.
 * We pack those three grey maps of an item into ONE ordinary image:
 *      <item>_mask.webp   R = occlusion (HAL G)   G = gloss map   B = wear mask (255 = base layer, 0 = wear layer)
 * The page mixes the constants with it in a few lines of shader code.
 *
 * Decal sheets, shared by every item of a maker:
 *      decal    printed markings, colour + alpha  -> ordinary alpha overlay, PNG (lossless: a browser WebP encoder
 *               would premultiply and lose the colour of see-through texels, which shows as dark fringes)
 *      pom      parallax detail sheet (screws, vents): white with dark shading + coverage alpha -> written as an opaque
 *               "multiply" image (white where nothing is drawn), WebP; the parallax depth itself is lost
 *      stencil  maker logo from the tint palette (R/G/B channels coloured by decalColorR/G/B) -> colour + alpha, PNG
 *
 * File names depend only on the source textures (and colours), never on export order, so a partial re-export
 * (--only) writes the same names as a full one.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { encodePng } from './dds.mjs';
import { decodeGameTexture, linearToSrgb8 } from './materials.mjs';

const mix = (a, b, t) => a + (b - a) * t;
const short = (dds) => dds.split('/').pop().replace(/\.dds$/, '');
const hash6 = (text) => createHash('sha1').update(text).digest('hex').slice(0, 6);

export class TextureBaker {
    /** encoder: WebpEncoder (webp.mjs) or null -> everything is written as PNG */
    constructor({ outDir, size = 1024, decalSize = 1024, enabled = true, encoder = null, webpQuality = 0.85 }) {
        this.outDir = outDir; this.size = size; this.decalSize = decalSize; this.enabled = enabled; this.encoder = encoder; this.webpQuality = webpQuality; this.pending = [];
        this.files = new Map(); this.notes = []; this.decoded = new Map(); this.masks = new Map(); this.decals = new Map(); this.blends = new Map();
    }

    decode(dds, opts) {
        const key = `${dds}|${opts.size}|${opts.alpha ? 'a' : ''}`;
        if (!this.decoded.has(key)) { try { this.decoded.set(key, decodeGameTexture(dds, opts)); } catch (error) { this.notes.push(`texture ${dds}${opts.alpha ? ' (attached alpha)' : ''} not usable: ${error.message}`); this.decoded.set(key, null); } }
        return this.decoded.get(key);
    }

    writePng(name, rgba, width, height, channels, what) {
        if (this.files.has(name)) return this.files.get(name);
        const png = encodePng(rgba, width, height, channels);
        writeFileSync(`${this.outDir}/${name}`, png);
        const file = { file: name, width, height, bytes: png.length, what };
        this.files.set(name, file);
        return file;
    }

    /** opaque RGB image: queued for the WebP encoder (bytes are filled in by flush()), or PNG when there is no encoder */
    writeOpaque(stem, rgba, width, height, what) {
        if (!this.encoder) return this.writePng(`${stem}.png`, rgba, width, height, 3, what);
        const name = `${stem}.webp`;
        if (this.files.has(name)) return this.files.get(name);
        const file = { file: name, width, height, bytes: 0, what };
        this.files.set(name, file); this.pending.push({ name, rgba, width, height, file });
        return file;
    }

    /** helpers for one item; both return a written file description or null */
    prepare(key) {
        if (!this.enabled) return { mask: () => null, decal: () => null, blend: () => null };
        return { mask: (info) => this.maskImage(key, info), decal: (info) => this.decalImage(key, info), blend: (info) => this.blendImage(key, info) };
    }

    /** the layer blend map of a multi-layer surface (R, G, B = share of base layers 1, 2, 3; the rest = layer 4), as is */
    blendImage(key, info) {
        const dds = info.blend?.map; if (!dds) return null;
        if (this.blends.has(dds)) return this.blends.get(dds);
        const probe = this.decode(dds, { size: 64 });
        const native = probe ? Math.max(probe.fullWidth, probe.fullHeight) : 0;
        const t = native ? this.decode(dds, { size: Math.min(this.size, native) }) : null;
        let result = null;
        if (!t) this.notes.push(`${key} sub-material ${info.id} ${info.name}: layer blend map not usable -> first layer only`);
        else result = this.writeOpaque(short(dds), t.rgba, t.width, t.height, `layer blend map (R, G, B = base layers 1, 2, 3; rest = layer 4); native ${native}px`);
        this.blends.set(dds, result);
        return result;
    }

    /** packed occlusion / gloss / wear image for the maps one surface sub-material names */
    maskImage(key, info) {
        const maps = info.maps || {};
        if (!maps.hal && !maps.ddna && !maps.wear) return null;
        const id = `${maps.hal}|${maps.ddna}|${maps.wear}`;
        if (this.masks.has(id)) return this.masks.get(id);
        const probe = [maps.hal, maps.ddna, maps.wear].filter(Boolean).map((dds) => this.decode(dds, { size: 64 })).filter(Boolean);
        const native = Math.max(0, ...probe.map((t) => Math.max(t.fullWidth, t.fullHeight)));
        if (!native) { this.masks.set(id, null); return null; }
        const W = Math.min(this.size, native); const H = W;
        const hal = maps.hal ? this.decode(maps.hal, { size: W }) : null;
        const gloss = maps.ddna ? this.decode(maps.ddna, { size: W, alpha: true }) : null;
        const wear = maps.wear ? this.decode(maps.wear, { size: W }) : null;
        if (!hal && !gloss && !wear) { this.notes.push(`${key} sub-material ${info.id} ${info.name}: none of its occlusion / gloss / wear maps is usable -> constants only`); this.masks.set(id, null); return null; }
        const at = (tex, x, y) => (Math.min(tex.height - 1, Math.floor(((y + 0.5) / H) * tex.height)) * tex.width + Math.min(tex.width - 1, Math.floor(((x + 0.5) / W) * tex.width))) * 4;
        const out = new Uint8Array(W * H * 4);
        for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
            const o = (y * W + x) * 4;
            out[o] = hal ? hal.rgba[at(hal, x, y) + 1] : 255;
            out[o + 1] = gloss ? gloss.rgba[at(gloss, x, y)] : 255;
            out[o + 2] = wear ? wear.rgba[at(wear, x, y)] : 255;
            out[o + 3] = 255;
        }
        const stems = [maps.hal && short(maps.hal).replace(/_hal$/, ''), maps.ddna && short(maps.ddna).replace(/_ddna$/, ''), maps.wear && short(maps.wear).replace(/_wear$/, '')].filter(Boolean);
        const stem = stems.every((s) => s === stems[0]) ? `${stems[0]}_mask` : `${stems[0]}_mask_${hash6(id)}`;
        const file = this.writeOpaque(stem, out, W, H, `occlusion (R, from ${maps.hal ? short(maps.hal) : 'none'}) + gloss (G, from ${maps.ddna ? `${short(maps.ddna)} alpha` : 'none'}) + wear (B, from ${maps.wear ? short(maps.wear) : 'none'}); native ${native}px`);
        const result = { ...file, has: { occlusion: !!hal, gloss: !!gloss, wear: !!wear } };
        this.masks.set(id, result);
        return result;
    }

    decalImage(key, info) {
        const id = info.kind === 'stencil' ? `stencil|${info.stencilTexture}|${JSON.stringify(info.stencilColors)}` : `${info.map}|${info.parallax}`;
        if (!this.decals.has(id)) this.decals.set(id, this.makeDecal(key, info, id));
        return this.decals.get(id);
    }

    makeDecal(key, info, id) {
        if (info.kind === 'stencil') {
            if (!info.stencilTexture || !info.stencilColors) { this.notes.push(`${key} sub-material ${info.id} ${info.name}: stencil has no palette logo texture -> not drawn`); return null; }
            const t = this.decode(info.stencilTexture, { size: 512 }); if (!t) return null;
            const out = new Uint8Array(t.width * t.height * 4);
            for (let i = 0; i < out.length; i += 4) {
                const r = t.rgba[i] / 255; const g = t.rgba[i + 1] / 255; const b = t.rgba[i + 2] / 255; const sum = r + g + b; const a = Math.max(r, g, b);
                for (let c = 0; c < 3; c += 1) out[i + c] = sum > 0 ? linearToSrgb8((r * info.stencilColors[0][c] + g * info.stencilColors[1][c] + b * info.stencilColors[2][c]) / sum) : 0;
                out[i + 3] = Math.round(a * 255);
            }
            return { ...this.writePng(`${short(info.stencilTexture)}_${hash6(id)}.png`, out, t.width, t.height, 4, 'maker logo stencil coloured by the tint palette decal colours (channel -> colour mapping assumed)'), mode: 'alpha' };
        }
        if (!info.map) { this.notes.push(`${key} sub-material ${info.id} ${info.name}: decal without a diffuse texture -> not drawn`); return null; }
        const t = this.decode(info.map, { size: this.decalSize }); if (!t) return null;
        let minA = 255; for (let i = 3; i < t.rgba.length; i += 4) if (t.rgba[i] < minA) minA = t.rgba[i];
        if (minA === 255) { this.notes.push(`${key} sub-material ${info.id} ${info.name}: decal texture ${short(info.map)} has no alpha -> not drawn (it would cover the surface)`); return null; }
        if (info.parallax) {
            const out = new Uint8Array(t.rgba.length);
            for (let i = 0; i < out.length; i += 4) { const a = t.rgba[i + 3] / 255; for (let c = 0; c < 3; c += 1) out[i + c] = Math.round(mix(255, t.rgba[i + c], a)); out[i + 3] = 255; }
            return { ...this.writeOpaque(`${short(info.map)}_multiply`, out, t.width, t.height, 'parallax detail sheet as a multiply overlay (white = untouched); depth effect lost'), mode: 'multiply' };
        }
        return { ...this.writePng(`${short(info.map)}.png`, t.rgba, t.width, t.height, 4, `decal sheet (colour + alpha, ${t.srgb ? 'sRGB' : 'stored linear'})`), mode: 'alpha' };
    }

    /** encodes and writes everything queued so far; also drops the decoded-texture cache (memory) */
    async flush() {
        for (const item of this.pending) {
            const result = await this.encoder.encode(item, this.webpQuality);
            writeFileSync(`${this.outDir}/${item.name}`, result.bytes);
            Object.assign(item.file, { bytes: result.bytes.length, webpMaxError: result.maxError, webpMeanError: +result.meanError.toFixed(3) });
        }
        this.pending = []; this.decoded.clear();
    }
}
