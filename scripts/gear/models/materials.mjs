/**
 * materials.mjs — game material (.mtl, CryXmlB) -> simplified web PBR description.
 *
 * Reading of the .mtl / layer libraries / tint palettes follows the materials investigator's scripts
 * (mat/mtl.mjs, mat/13-loadout.mjs), re-written for the prototype and moved here unchanged in behaviour.
 *
 * IMPORTANT: everything called "pbr" below is OUR conversion of a spec/gloss layered shader to metal/rough constants.
 * It is a heuristic, not a game value. One rule differs from the materials investigator's first version:
 *   a palette-tinted layer takes its SPECULAR colour from the palette entry too (entry.specColor), not only its tint
 *   and gloss. Evidence: behr_weapon_default entry A = tint (0,0,0) + spec (143,143,143) — black diffuse with a
 *   strong specular is a bare-metal look, and the in-game picture of the P4-AR shows those parts as bright metal.
 */
import { readMip, decodeToRgba, parseDdsHeader } from './dds.mjs';

// the opened game archive (archive.mjs); set once by the exporter before anything else here is called
let archive = null;
export function useArchive(opened) { archive = opened; }
const index = () => archive.entries;
const lookup = (path) => archive.lookup(path);
const extract = (entry) => archive.extract(entry);
const readXml = (path) => archive.readXml(path);

const vec = (s) => (s == null || s === '' ? null : s.split(',').map(Number));
const num = (s) => (s == null || s === '' ? null : Number(s));
export const srgbToLinear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const linearToSrgb8 = (c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * Math.max(0, c) : 1.055 * Math.min(1, c) ** (1 / 2.4) - 0.055));
export const hex = (rgb) => `#${rgb.map((c) => linearToSrgb8(Math.min(1, c)).toString(16).padStart(2, '0')).join('')}`;
const round = (v, d = 4) => +(+v).toFixed(d);

// ---------------------------------------------------------------- textures in the archive (split DDS)
let texIndex = null;
function textures() {
    if (texIndex) return texIndex;
    texIndex = new Map();
    for (const e of index()) {
        const m = /^(.*\.dds)(?:\.(\d+)?(a)?)?$/i.exec(e.n);
        if (!m) continue;
        const key = m[1].toLowerCase();
        let parts = texIndex.get(key);
        if (!parts) { parts = new Map(); texIndex.set(key, parts); }
        const suffix = e.n.slice(m[1].length).replace(/^\./, '');
        parts.set(suffix, () => extract(e));
    }
    return texIndex;
}
/** mtl texture reference (.tif etc.) -> archive path of the .dds header file, or null when absent */
export function resolveTexture(file) {
    if (!file || file.startsWith('$')) return null;
    let p = file.split('\\').join('/').toLowerCase().replace(/\.(tif|tiff|png|tga|jpg|dds)$/i, '.dds');
    if (!/\.dds$/.test(p)) p += '.dds';
    if (!p.startsWith('data/')) p = `data/${p}`;
    return textures().has(p) && textures().get(p).has('') ? p : null;
}
/** decode one mip of a game texture: { width, height, rgba, format, srgb }. opts: { size, alpha } */
export function decodeGameTexture(ddsPath, opts = {}) {
    const parts = textures().get(ddsPath.toLowerCase());
    if (!parts) throw new Error(`texture not in archive: ${ddsPath}`);
    const mip = readMip(parts, { size: opts.size, alpha: !!opts.alpha });
    return { width: mip.width, height: mip.height, rgba: decodeToRgba(mip.header.format, mip.data, mip.width, mip.height), format: mip.header.format.name, srgb: !!mip.header.format.srgb, kind: mip.header.format.kind, fullWidth: mip.header.width, fullHeight: mip.header.height };
}
export function textureHasAlphaFile(ddsPath) { const parts = textures().get(ddsPath.toLowerCase()); return !!parts && parts.has('a'); }
export function textureHeader(ddsPath) { const parts = textures().get(ddsPath.toLowerCase()); return parts ? parseDdsHeader(parts.get('')()) : null; }

// ---------------------------------------------------------------- .mtl
function parseMaterialNode(node, i) {
    const a = node.attrs; const tex = []; const layers = []; let publicParams = null;
    for (const child of node.children) {
        if (child.tag === 'Textures') for (const t of child.children) tex.push({ slot: t.attrs.Map, file: t.attrs.File, dds: resolveTexture(t.attrs.File), engineSlot: /^\$/.test(t.attrs.File || '') });
        else if (child.tag === 'MatLayers') for (const l of child.children) layers.push({ name: l.attrs.Name, path: l.attrs.Path, tintColor: vec(l.attrs.TintColor), glossMult: num(l.attrs.GlossMult), uvTiling: num(l.attrs.UVTiling), paletteTint: num(l.attrs.PaletteTint) || 0 });
        else if (child.tag === 'PublicParams') publicParams = child.attrs;
    }
    return { index: i, name: a.Name || '', shader: a.Shader || '', genMask: a.StringGenMask || '', diffuse: vec(a.Diffuse), specular: vec(a.Specular), emissive: vec(a.Emissive), opacity: num(a.Opacity), shininess: num(a.Shininess), glow: num(a.Glow), alphaTest: num(a.AlphaTest), textures: tex, layers, publicParams };
}
const mtlCache = new Map();
/** { path, exists, subMaterials[] } ; a single-material file yields one entry (index 0) */
export function readMaterial(path) {
    let p = path.split('\\').join('/'); if (!/\.mtl$/i.test(p)) p += '.mtl';
    const key = p.toLowerCase(); if (mtlCache.has(key)) return mtlCache.get(key);
    const e = lookup(p); let out;
    if (!e) out = { path: p, exists: false, subMaterials: [] };
    else {
        const root = readXml(p); const subs = root.children.find((c) => c.tag === 'SubMaterials');
        out = { path: e.n, exists: true, subMaterials: subs ? subs.children.map((n, i) => parseMaterialNode(n, i)) : [parseMaterialNode(root, 0)] };
    }
    mtlCache.set(key, out); return out;
}
const layerCache = new Map();
function layerLibrary(path) {
    const key = path.toLowerCase(); if (layerCache.has(key)) return layerCache.get(key);
    const m = readMaterial(path); let info = null;
    if (m.exists && m.subMaterials[0]) { const s = m.subMaterials[0]; info = { file: m.path, diffuse: s.diffuse || [1, 1, 1], specular: s.specular || [0.04, 0.04, 0.04], glossiness: (s.shininess ?? 128) / 255, tintMode: s.publicParams ? Number(s.publicParams.TintMode) : 0, diffuseTexture: s.textures.find((t) => t.slot === 'TexSlot1' && t.dds)?.dds || null }; }
    layerCache.set(key, info); return info;
}

/** mean colour (linear) of a layer library's own tiling diffuse texture, from a small mip; null when it cannot be read */
const averageCache = new Map();
function textureAverage(dds) {
    if (!averageCache.has(dds)) {
        let out = null;
        try {
            const t = decodeGameTexture(dds, { size: 16 }); const sum = [0, 0, 0]; const n = t.rgba.length / 4;
            for (let i = 0; i < t.rgba.length; i += 4) for (let c = 0; c < 3; c += 1) sum[c] += srgbToLinear(t.rgba[i + c]);
            out = sum.map((v) => v / n);
        } catch { out = null; }
        averageCache.set(dds, out);
    }
    return averageCache.get(dds);
}

// ---------------------------------------------------------------- tint palette (Game2.dcb TintPaletteTree record, already read)
/** tree = df.readRecord(TintPaletteTree record) -> { name, A, B, C, decalTexture, decalColors } with linear colours */
export function paletteFromRecord(name, tree) {
    if (!tree?.root) return null;
    const lin = (c) => [srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)];
    const entry = (x) => ({ tint: lin(x.tintColor), spec: lin(x.specColor), gloss: x.glossiness / 255, tintSrgb8: [x.tintColor.r, x.tintColor.g, x.tintColor.b], specSrgb8: [x.specColor.r, x.specColor.g, x.specColor.b] });
    const r = tree.root;
    return { name, entries: [null, entry(r.entryA), entry(r.entryB), entry(r.entryC)], glass: lin(r.glassColor), decalTexture: r.decalTexture || null, decalColors: [lin(r.decalColorR), lin(r.decalColorG), lin(r.decalColorB)] };
}

// ---------------------------------------------------------------- spec/gloss layer -> metal/rough constants (heuristic)
const METAL_F0 = 0.2;
function layerToPbr(use, palette) {
    const lib = layerLibrary(use.path); if (!lib) return null;
    const tint = use.tintColor || [1, 1, 1];
    const pal = use.paletteTint && palette ? palette.entries[use.paletteTint] : null;
    const palTint = pal ? pal.tint : [1, 1, 1];
    const f0 = pal ? pal.spec : (lib.tintMode === 2 ? lib.specular.map((v, i) => v * tint[i]) : lib.specular);
    const metal = Math.max(...(pal ? pal.spec : lib.specular)) >= METAL_F0;
    let color = metal ? f0 : lib.diffuse.map((v, i) => v * tint[i] * palTint[i]);
    // A non-metal layer's colour is (library colour x tint x palette tint) x the layer's own tiling texture. We ship no
    // tiling textures, so the texture's mean colour stands in for it. Leaving the texture out made every layer whose
    // library colour is white and whose texture is dark come out far too light: black rubber (weapon_rubber_01, texture
    // mean about 4 %) as white pads on the Gemini stocks, parkerized / rusted steel as white paint on the makeshift guns,
    // dark wood as bright orange on the Lightning Bolt guns.
    let fromTexture = false;
    if (!metal && lib.diffuseTexture) {
        const mean = textureAverage(lib.diffuseTexture);
        if (mean) { color = color.map((v, i) => v * mean[i]); fromTexture = true; }
    }
    const gloss = Math.max(0, Math.min(1, (pal ? pal.gloss : lib.glossiness) * (use.glossMult ?? 1)));
    return { color: color.map((v) => round(Math.min(1, v))), hex: hex(color), metalness: metal ? 1 : 0, roughness: round(Math.max(0.04, 1 - gloss), 3), layer: lib.file.split('/').slice(-2).join('/'), paletteEntry: pal ? ' ABC'[use.paletteTint] : null, colourFromLayerTexture: fromTexture };
}

/**
 * One sub-material -> { kind, ... }.
 * kind: skip | surface | decal | stencil | glow | lens | glass | screen
 */
export function subMaterialToPbr(s, palette) {
    const tex = (slot) => s.textures.find((t) => t.slot === slot && t.dds)?.dds || null;
    const base = { id: s.index, name: s.name, shader: s.shader };
    if (s.shader === 'NoDraw') return { ...base, kind: 'skip', why: 'NoDraw (physics proxy)' };
    if (s.shader === 'LayerBlend_V2') {
        const bases = s.layers.filter((l) => /^BaseLayer/.test(l.name)); const wears = s.layers.filter((l) => /^WearLayer/.test(l.name));
        const b = bases[0] ? layerToPbr(bases[0], palette) : null; const w = wears[0] ? layerToPbr(wears[0], palette) : null;
        const fallback = { color: [0.3, 0.3, 0.3], hex: '#959595', metalness: 0, roughness: 0.6, layer: null, paletteEntry: null };
        // %BLEND_MAP: up to four base layers (each with its own wear layer) mixed per texel by the blend map (TexSlot12).
        // Reading of the map (ours; the shader source is not in the game files): R, G, B = share of layers 1, 2, 3 and the
        // rest (black) = layer 4. Layer 4 is the palette-tinted body metal, layers 1-3 are paint / wear / rust on top. With
        // this reading the Tripledown, Boomtube and Deadrig come out dark like their in-game pictures; reading black as
        // layer 1 turned them cream / white / yellow. (A sub-material called blue_plastic has its
        // blue in layers 2-4 and red paint in layer 1, and its texels are blue-channel or black in the map):
        //   blue in layers 2-4 and red paint in layer 1; its texels are blue-channel or black in the map.)
        let blend = null;
        if (/BLEND_MAP/.test(s.genMask) && tex('TexSlot12') && bases.length > 1) {
            const numbered = (list) => { const out = []; for (const l of list) { const n = Number(/(\d+)$/.exec(l.name)?.[1] || 1); if (n >= 1 && n <= 4 && !out[n - 1]) out[n - 1] = l; } return out; };
            const baseOf = numbered(bases); const wearOf = numbered(wears); const layers = [];
            for (let i = 0; i < 4; i += 1) {
                const one = baseOf[i] ? layerToPbr(baseOf[i], palette) : null;
                layers.push(one ? { ...one, wear: wearOf[i] ? layerToPbr(wearOf[i], palette) : null } : null);
            }
            if (layers[0] && layers.some((l, i) => i > 0 && l)) blend = { map: tex('TexSlot12'), layers };
        }
        return { ...base, kind: 'surface', ...(b || fallback), layerMissing: !b, wear: w, blend, blendLayers: bases.length, maps: { ddna: tex('TexSlot3'), wear: tex('TexSlot11'), hal: tex('TexSlot13'), blend: tex('TexSlot12') } };
    }
    if (s.shader === 'MeshDecal') {
        if (/STENCIL_MAP/.test(s.genMask)) return { ...base, kind: 'stencil', stencilTexture: palette?.decalTexture ? resolveTexture(palette.decalTexture) : null, stencilColors: palette?.decalColors || null };
        return { ...base, kind: 'decal', map: tex('TexSlot1'), normalMap: tex('TexSlot3'), color: s.diffuse || [1, 1, 1], parallax: /PARALLAX/.test(s.genMask) };
    }
    if (s.shader === 'Illum') {
        if (/DECAL/.test(s.genMask)) return { ...base, kind: 'decal', map: tex('TexSlot1'), normalMap: tex('TexSlot2') || tex('TexSlot3'), color: s.diffuse || [1, 1, 1], parallax: /PARALLAX/.test(s.genMask) };
        const f0max = Math.max(...(s.specular || [0]));
        if (s.glow) return { ...base, kind: 'glow', color: s.diffuse || [1, 1, 1], hex: hex(s.diffuse || [1, 1, 1]), glow: s.glow, metalness: 0, roughness: round(1 - (s.shininess ?? 128) / 255, 3) };
        return { ...base, kind: 'surface', color: (f0max >= METAL_F0 ? s.specular : s.diffuse || [1, 1, 1]).map((v) => round(Math.min(1, v))), hex: hex(f0max >= METAL_F0 ? s.specular : s.diffuse || [1, 1, 1]), metalness: f0max >= METAL_F0 ? 1 : 0, roughness: round(Math.max(0.04, 1 - (s.shininess ?? 128) / 255), 3), opacity: s.opacity ?? 1, map: tex('TexSlot1'), wear: null, maps: {} };
    }
    if (s.shader === 'ScopePBR' || s.shader === 'Scopes') return { ...base, kind: 'lens' };
    if (s.shader === 'GlassPBR') return { ...base, kind: 'glass', color: palette?.glass || [1, 1, 1] };
    return { ...base, kind: 'screen', why: `shader ${s.shader} (screen / UI / hologram) has no web equivalent here` };
}

/** whole .mtl -> list indexed by sub-material id */
export function materialToPbr(mtlPath, palette) {
    const m = readMaterial(mtlPath);
    return { file: m.path, exists: m.exists, subMaterials: m.subMaterials.map((s) => subMaterialToPbr(s, palette)) };
}
