/**
 * dds.mjs — Star Citizen "split DDS" reader, block decoder and PNG writer.
 * Node built-ins only (node:fs, node:zlib, node:path). No npm packages, no native tools.
 *
 * Split layout (verified against Data.p4k build 4.10.200):
 *   foo.dds        "DDS " magic + 124-byte DDS_HEADER (+ 20-byte DX10 header) + the SMALLEST mips
 *   foo.dds.1..N   one mip level per file; N = largest mip (level 0), 1 = smallest of the split-off mips
 *   foo.dds.a      attached alpha/gloss texture: DDS_HEADER WITHOUT the "DDS " magic (+DX10) + smallest mips
 *   foo.dds.1a..Na its split-off mips, same numbering
 * So mip level L lives in part (N - L) when L < N, otherwise inside the header file, in normal
 * DDS order (largest first) after the header.
 *
 * Formats implemented: BC1, BC2, BC3, BC4 (U/S), BC5 (U/S), BC7, and common uncompressed 8-bit layouts.
 * Not implemented: BC6H (HDR), cube maps / texture arrays / volume textures (throws a clear error).
 * (None of the 1052 textures under Objects/fps_weapons needs them: BC1 374, BC5_SNORM 281, BC4 259, BC3 97, BC7 17, raw 24.)
 *
 * Checked against a GPU (Chrome / ANGLE D3D11, NVIDIA): BC7 output is bit-exact (0 of 20,973,568 samples differ);
 * BC1/BC3/BC4/BC5 differ by at most 7/255 because the hardware approximates the interpolation, this code does not.
 *
 * BC7 mode table, partition tables, anchor tables and interpolation weights follow the public
 * BPTC specification (Khronos Data Format Specification, "BPTC Compressed Texture Image Formats";
 * Microsoft "BC7 Format" documentation). The code below is our own implementation.
 *
 * (The study's command-line front end and archive helpers were dropped here; archive access is archive.mjs.)
 * Original CLI notes:
 *   node dds.mjs <game path of .dds> [--size 1024 | --level 1] [--mode auto|rgba|rgb|normal|r|g|b|a|alpha]
 *                [--out file.png] [--info] [--p4k <Data.p4k>] [--dir <folder with loose extracted files>]
 *   --mode alpha  decodes the attached .dds.a texture (gloss/smoothness of a _ddna map) as grey
 *   --mode normal BC5 two-channel normal -> reconstructs Z, writes an ordinary RGB tangent-space normal map
 */
import zlib from 'node:zlib';

// ───────────────────────────── header ─────────────────────────────

const F = (name, kind, extra = {}) => ({ name, kind, ...extra });
const DXGI_FORMATS = {
    2: F('R32G32B32A32_FLOAT', 'raw', { bpp: 16, layout: 'rgbaF32' }),
    10: F('R16G16B16A16_FLOAT', 'raw', { bpp: 8, layout: 'rgbaF16' }),
    11: F('R16G16B16A16_UNORM', 'raw', { bpp: 8, layout: 'rgba16' }),
    28: F('R8G8B8A8_UNORM', 'raw', { bpp: 4, layout: 'rgba8' }),
    29: F('R8G8B8A8_UNORM_SRGB', 'raw', { bpp: 4, layout: 'rgba8', srgb: true }),
    49: F('R8G8_UNORM', 'raw', { bpp: 2, layout: 'rg8' }),
    56: F('R16_UNORM', 'raw', { bpp: 2, layout: 'r16' }),
    61: F('R8_UNORM', 'raw', { bpp: 1, layout: 'r8' }),
    65: F('A8_UNORM', 'raw', { bpp: 1, layout: 'a8' }),
    70: F('BC1_TYPELESS', 'bc1', { block: 8 }), 71: F('BC1_UNORM', 'bc1', { block: 8 }), 72: F('BC1_UNORM_SRGB', 'bc1', { block: 8, srgb: true }),
    73: F('BC2_TYPELESS', 'bc2', { block: 16 }), 74: F('BC2_UNORM', 'bc2', { block: 16 }), 75: F('BC2_UNORM_SRGB', 'bc2', { block: 16, srgb: true }),
    76: F('BC3_TYPELESS', 'bc3', { block: 16 }), 77: F('BC3_UNORM', 'bc3', { block: 16 }), 78: F('BC3_UNORM_SRGB', 'bc3', { block: 16, srgb: true }),
    79: F('BC4_TYPELESS', 'bc4', { block: 8 }), 80: F('BC4_UNORM', 'bc4', { block: 8 }), 81: F('BC4_SNORM', 'bc4', { block: 8, signed: true }),
    82: F('BC5_TYPELESS', 'bc5', { block: 16 }), 83: F('BC5_UNORM', 'bc5', { block: 16 }), 84: F('BC5_SNORM', 'bc5', { block: 16, signed: true }),
    87: F('B8G8R8A8_UNORM', 'raw', { bpp: 4, layout: 'bgra8' }), 88: F('B8G8R8X8_UNORM', 'raw', { bpp: 4, layout: 'bgrx8' }),
    91: F('B8G8R8A8_UNORM_SRGB', 'raw', { bpp: 4, layout: 'bgra8', srgb: true }), 93: F('B8G8R8X8_UNORM_SRGB', 'raw', { bpp: 4, layout: 'bgrx8', srgb: true }),
    94: F('BC6H_TYPELESS', 'bc6h', { block: 16 }), 95: F('BC6H_UF16', 'bc6h', { block: 16 }), 96: F('BC6H_SF16', 'bc6h', { block: 16, signed: true }),
    97: F('BC7_TYPELESS', 'bc7', { block: 16 }), 98: F('BC7_UNORM', 'bc7', { block: 16 }), 99: F('BC7_UNORM_SRGB', 'bc7', { block: 16, srgb: true }),
};
const FOURCC_FORMATS = {
    DXT1: F('DXT1 (BC1)', 'bc1', { block: 8 }), DXT2: F('DXT2 (BC2)', 'bc2', { block: 16 }), DXT3: F('DXT3 (BC2)', 'bc2', { block: 16 }),
    DXT4: F('DXT4 (BC3)', 'bc3', { block: 16 }), DXT5: F('DXT5 (BC3)', 'bc3', { block: 16 }),
    ATI1: F('ATI1 (BC4U)', 'bc4', { block: 8 }), BC4U: F('BC4U', 'bc4', { block: 8 }), BC4S: F('BC4S', 'bc4', { block: 8, signed: true }),
    ATI2: F('ATI2 (BC5U)', 'bc5', { block: 16 }), BC5U: F('BC5U', 'bc5', { block: 16 }), BC5S: F('BC5S', 'bc5', { block: 16, signed: true }),
};

/** Parses a DDS header. Accepts both the normal file ("DDS " magic) and SC's magic-less ".dds.a" header. */
export function parseDdsHeader(buf) {
    let o = 0; let hasMagic = false;
    if (buf.length >= 4 && buf.readUInt32LE(0) === 0x20534444) { hasMagic = true; o = 4; }
    if (buf.length < o + 124 || buf.readUInt32LE(o) !== 124) throw new Error('not a DDS header (dwSize != 124)');
    const height = buf.readUInt32LE(o + 8); const width = buf.readUInt32LE(o + 12);
    const depth = buf.readUInt32LE(o + 20); const mipCount = Math.max(1, buf.readUInt32LE(o + 24));
    const pf = o + 72;
    const pfFlags = buf.readUInt32LE(pf + 4);
    const fourCC = buf.toString('latin1', pf + 8, pf + 12);
    const bitCount = buf.readUInt32LE(pf + 12);
    const masks = [buf.readUInt32LE(pf + 16), buf.readUInt32LE(pf + 20), buf.readUInt32LE(pf + 24), buf.readUInt32LE(pf + 28)];
    const caps2 = buf.readUInt32LE(o + 108);
    let dataOffset = o + 124; let format; let dxgi = null; let dx10 = false; let arraySize = 1; let isCube = (caps2 & 0x200) !== 0;
    if ((pfFlags & 0x4) && fourCC === 'DX10') {
        dx10 = true;
        dxgi = buf.readUInt32LE(dataOffset);
        const misc = buf.readUInt32LE(dataOffset + 8);
        arraySize = buf.readUInt32LE(dataOffset + 12) || 1;
        if (misc & 0x4) isCube = true;
        dataOffset += 20;
        format = DXGI_FORMATS[dxgi] || F(`DXGI_${dxgi}`, 'unknown');
    } else if (pfFlags & 0x4) {
        format = FOURCC_FORMATS[fourCC] || F(`FOURCC_${fourCC.replace(/[^\x20-\x7e]/g, '?')}`, 'unknown');
    } else if ((pfFlags & 0x40) || (pfFlags & 0x20000) || (pfFlags & 0x2)) {
        format = F(`MASKED_${bitCount}bpp_${masks.map((m) => m.toString(16)).join('_')}`, 'raw', { bpp: bitCount / 8, layout: 'masks', masks });
    } else format = F('UNKNOWN', 'unknown');
    return { hasMagic, width, height, depth, mipCount, format, dxgi, dx10, fourCC: dx10 ? 'DX10' : fourCC, arraySize, isCube, isVolume: (caps2 & 0x200000) !== 0, dataOffset };
}

/** Byte size of every mip level (single face). */
export function mipChain(header) {
    const out = [];
    for (let level = 0; level < header.mipCount; level += 1) {
        const w = Math.max(1, header.width >> level); const h = Math.max(1, header.height >> level);
        const f = header.format;
        const bytes = f.block ? Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * f.block : Math.ceil(w * h * (f.bpp || 0));
        out.push({ level, width: w, height: h, bytes });
    }
    return out;
}

// ───────────────────────────── block decoders ─────────────────────────────

const TMP = new Uint8Array(64); // one 4x4 block, RGBA

function bc1Block(src, o, fourColorOnly) {
    const c0 = src[o] | (src[o + 1] << 8); const c1 = src[o + 2] | (src[o + 3] << 8);
    const r0 = (c0 >> 11) & 31; const g0 = (c0 >> 5) & 63; const b0 = c0 & 31;
    const r1 = (c1 >> 11) & 31; const g1 = (c1 >> 5) & 63; const b1 = c1 & 31;
    const p = [[(r0 << 3) | (r0 >> 2), (g0 << 2) | (g0 >> 4), (b0 << 3) | (b0 >> 2), 255], [(r1 << 3) | (r1 >> 2), (g1 << 2) | (g1 >> 4), (b1 << 3) | (b1 >> 2), 255], null, null];
    if (fourColorOnly || c0 > c1) {
        p[2] = [((2 * p[0][0] + p[1][0] + 1) / 3) | 0, ((2 * p[0][1] + p[1][1] + 1) / 3) | 0, ((2 * p[0][2] + p[1][2] + 1) / 3) | 0, 255];
        p[3] = [((p[0][0] + 2 * p[1][0] + 1) / 3) | 0, ((p[0][1] + 2 * p[1][1] + 1) / 3) | 0, ((p[0][2] + 2 * p[1][2] + 1) / 3) | 0, 255];
    } else {
        p[2] = [(p[0][0] + p[1][0] + 1) >> 1, (p[0][1] + p[1][1] + 1) >> 1, (p[0][2] + p[1][2] + 1) >> 1, 255];
        p[3] = [0, 0, 0, 0];
    }
    for (let i = 0; i < 16; i += 1) {
        const idx = (src[o + 4 + (i >> 2)] >> ((i & 3) * 2)) & 3;
        const c = p[idx];
        TMP[i * 4] = c[0]; TMP[i * 4 + 1] = c[1]; TMP[i * 4 + 2] = c[2]; TMP[i * 4 + 3] = c[3];
    }
}

/** BC4-style single channel block -> TMP channel `ch` (8-bit; signed data is remapped -1..1 -> 0..255). */
function bc4Block(src, o, ch, signed) {
    let a0 = src[o]; let a1 = src[o + 1];
    if (signed) { a0 = (a0 << 24) >> 24; a1 = (a1 << 24) >> 24; if (a0 < -127) a0 = -127; if (a1 < -127) a1 = -127; }
    const pal = [a0, a1, 0, 0, 0, 0, 0, 0];
    if (a0 > a1) { for (let i = 1; i <= 6; i += 1) pal[i + 1] = ((7 - i) * a0 + i * a1) / 7; } else {
        for (let i = 1; i <= 4; i += 1) pal[i + 1] = ((5 - i) * a0 + i * a1) / 5;
        pal[6] = signed ? -127 : 0; pal[7] = signed ? 127 : 255;
    }
    for (let i = 0; i < 16; i += 1) {
        const bit = 3 * i; const at = o + 2 + (bit >> 3);
        const v = pal[(((src[at] | ((src[at + 1] || 0) << 8)) >> (bit & 7)) & 7)];
        TMP[i * 4 + ch] = signed ? Math.round((v / 127 * 0.5 + 0.5) * 255) : Math.round(v);
    }
}

// BC7 tables (BPTC specification)
const BC7_MODES = [
    // subsets, partitionBits, rotationBits, indexSelBits, colorBits, alphaBits, endpointPBits, sharedPBits, indexBits, index2Bits
    [3, 4, 0, 0, 4, 0, 1, 0, 3, 0], [2, 6, 0, 0, 6, 0, 0, 1, 3, 0], [3, 6, 0, 0, 5, 0, 0, 0, 2, 0], [2, 6, 0, 0, 7, 0, 1, 0, 2, 0],
    [1, 0, 2, 1, 5, 6, 0, 0, 2, 3], [1, 0, 2, 0, 7, 8, 0, 0, 2, 2], [1, 0, 0, 0, 7, 7, 1, 0, 4, 0], [2, 6, 0, 0, 5, 5, 1, 0, 2, 0],
];
const P2 = [
    '0011001100110011', '0001000100010001', '0111011101110111', '0001001100110111', '0000000100010011', '0011011101111111', '0001001101111111', '0000000100110111',
    '0000000000010011', '0011011111111111', '0000000101111111', '0000000000010111', '0001011111111111', '0000000011111111', '0000111111111111', '0000000000001111',
    '0000100011101111', '0111000100000000', '0000000010001110', '0111001100010000', '0011000100000000', '0000100011001110', '0000000010001100', '0111001100110001',
    '0011000100010000', '0000100010001100', '0110011001100110', '0011011001101100', '0001011111101000', '0000111111110000', '0111000110001110', '0011100110011100',
    '0101010101010101', '0000111100001111', '0101101001011010', '0011001111001100', '0011110000111100', '0101010110101010', '0110100101101001', '0101101010100101',
    '0111001111001110', '0001001111001000', '0011001001001100', '0011101111011100', '0110100110010110', '0011110011000011', '0110011010011001', '0000011001100000',
    '0100111001000000', '0010011100100000', '0000001001110010', '0000010011100100', '0110110010010011', '0011011011001001', '0110001110011100', '0011100111000110',
    '0110110011001001', '0110001100111001', '0111111010000001', '0001100011100111', '0000111100110011', '0011001111110000', '0010001011101110', '0100010001110111',
].map((s) => Uint8Array.from(s, Number));
const P3 = [
    '0011001102212222', '0001001122112221', '0000200122112211', '0222002200110111', '0000000011221122', '0011001100220022', '0022002211111111', '0011001122112211',
    '0000000011112222', '0000111111112222', '0000111122222222', '0012001200120012', '0112011201120112', '0122012201220122', '0011011211221222', '0011200122002220',
    '0001001101121122', '0111001120012200', '0000112211221122', '0022002200221111', '0111011102220222', '0001000122212221', '0000001101220122', '0000110022102210',
    '0122012200110000', '0012001211222222', '0110122112210110', '0000011012211221', '0022110211020022', '0110011020022222', '0011012201220011', '0000200022112221',
    '0000000211221222', '0222002200120011', '0011001200220222', '0120012001200120', '0000111122220000', '0120120120120120', '0120201212010120', '0011220011220011',
    '0011112222000011', '0101010122222222', '0000000021212121', '0022112200221122', '0022001100220011', '0220122102201221', '0101222222220101', '0000212121212121',
    '0101010101012222', '0222011102220111', '0002111200021112', '0000211221122112', '0222011101110222', '0002111211120002', '0110011001102222', '0000000021122112',
    '0110011022222222', '0022001100110022', '0022112211220022', '0000000000002112', '0002000100020001', '0222122202221222', '0101222222222222', '0111201122012220',
].map((s) => Uint8Array.from(s, Number));
const A2 = [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2,
    15, 15, 6, 8, 2, 8, 15, 15, 2, 8, 2, 2, 2, 15, 15, 6, 6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15];
const A3A = [3, 3, 15, 15, 8, 3, 15, 15, 8, 8, 6, 6, 6, 5, 3, 3, 3, 3, 8, 15, 3, 3, 6, 10, 5, 8, 8, 6, 8, 5, 15, 15,
    8, 15, 3, 5, 6, 10, 8, 15, 15, 3, 15, 5, 15, 15, 15, 15, 3, 15, 5, 5, 5, 8, 5, 10, 5, 10, 8, 13, 15, 12, 3, 3];
const A3B = [15, 8, 8, 3, 15, 15, 3, 8, 15, 15, 15, 15, 15, 15, 15, 8, 15, 8, 15, 3, 15, 8, 15, 8, 3, 15, 6, 10, 15, 15, 10, 8,
    15, 3, 15, 10, 10, 8, 9, 10, 6, 15, 8, 15, 3, 6, 6, 8, 15, 3, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 3, 15, 15, 8];
const W2 = [0, 21, 43, 64]; const W3 = [0, 9, 18, 27, 37, 46, 55, 64]; const W4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
const WEIGHTS = [null, null, W2, W3, W4];
/** internal consistency of the BC7 tables: every anchor index must belong to its subset (used by the self-test). */
export function bc7TableSelfCheck() {
    const bad = [];
    for (let p = 0; p < 64; p += 1) {
        if (P2[p].length !== 16 || P3[p].length !== 16) bad.push(`len ${p}`);
        if (P2[p][0] !== 0 || P3[p][0] !== 0) bad.push(`first ${p}`);
        if (P2[p][A2[p]] !== 1) bad.push(`A2 ${p}`);
        if (P3[p][A3A[p]] !== 1) bad.push(`A3A ${p}`);
        if (P3[p][A3B[p]] !== 2) bad.push(`A3B ${p}`);
    }
    return bad;
}

function bc7Block(src, o) {
    let pos = 0;
    const read = (n) => { let v = 0; for (let i = 0; i < n; i += 1, pos += 1) v |= ((src[o + (pos >> 3)] >> (pos & 7)) & 1) << i; return v; };
    let mode = 0;
    while (mode < 8 && read(1) === 0) mode += 1;
    if (mode >= 8) { TMP.fill(0); return; }
    const [ns, pb, rb, isb, cb, ab, epb, spb, ib, ib2] = BC7_MODES[mode];
    const partition = read(pb); const rotation = read(rb); const indexSel = read(isb);
    const n = ns * 2;
    const ep = []; for (let e = 0; e < n; e += 1) ep.push([0, 0, 0, 255]);
    for (let c = 0; c < 3; c += 1) for (let e = 0; e < n; e += 1) ep[e][c] = read(cb);
    if (ab) for (let e = 0; e < n; e += 1) ep[e][3] = read(ab);
    let cPrec = cb; let aPrec = ab;
    if (epb) {
        for (let e = 0; e < n; e += 1) { const p = read(1); for (let c = 0; c < 3; c += 1) ep[e][c] = (ep[e][c] << 1) | p; if (ab) ep[e][3] = (ep[e][3] << 1) | p; }
        cPrec += 1; if (ab) aPrec += 1;
    } else if (spb) {
        for (let s = 0; s < ns; s += 1) { const p = read(1); for (let e = s * 2; e < s * 2 + 2; e += 1) { for (let c = 0; c < 3; c += 1) ep[e][c] = (ep[e][c] << 1) | p; if (ab) ep[e][3] = (ep[e][3] << 1) | p; } }
        cPrec += 1; if (ab) aPrec += 1;
    }
    for (let e = 0; e < n; e += 1) {
        for (let c = 0; c < 3; c += 1) { const v = ep[e][c] << (8 - cPrec); ep[e][c] = v | (v >> cPrec); }
        if (ab) { const v = ep[e][3] << (8 - aPrec); ep[e][3] = v | (v >> aPrec); }
    }
    const subsetOf = ns === 1 ? null : (ns === 2 ? P2[partition] : P3[partition]);
    const anchor1 = ns === 2 ? A2[partition] : (ns === 3 ? A3A[partition] : -1);
    const anchor2 = ns === 3 ? A3B[partition] : -1;
    const idx1 = new Array(16); const idx2 = new Array(16);
    for (let i = 0; i < 16; i += 1) idx1[i] = read((i === 0 || i === anchor1 || i === anchor2) ? ib - 1 : ib);
    if (ib2) for (let i = 0; i < 16; i += 1) idx2[i] = read(i === 0 ? ib2 - 1 : ib2);
    for (let i = 0; i < 16; i += 1) {
        const s = subsetOf ? subsetOf[i] : 0;
        const e0 = ep[s * 2]; const e1 = ep[s * 2 + 1];
        let cw; let aw;
        if (!ib2) { cw = WEIGHTS[ib][idx1[i]]; aw = cw; } else if (indexSel) { cw = WEIGHTS[ib2][idx2[i]]; aw = WEIGHTS[ib][idx1[i]]; } else { cw = WEIGHTS[ib][idx1[i]]; aw = WEIGHTS[ib2][idx2[i]]; }
        let r = ((64 - cw) * e0[0] + cw * e1[0] + 32) >> 6;
        let g = ((64 - cw) * e0[1] + cw * e1[1] + 32) >> 6;
        let b = ((64 - cw) * e0[2] + cw * e1[2] + 32) >> 6;
        let a = ab ? ((64 - aw) * e0[3] + aw * e1[3] + 32) >> 6 : 255;
        if (rotation === 1) { const t = a; a = r; r = t; } else if (rotation === 2) { const t = a; a = g; g = t; } else if (rotation === 3) { const t = a; a = b; b = t; }
        TMP[i * 4] = r; TMP[i * 4 + 1] = g; TMP[i * 4 + 2] = b; TMP[i * 4 + 3] = a;
    }
}

const halfToFloat = (h) => { const s = (h & 0x8000) ? -1 : 1; const e = (h >> 10) & 31; const m = h & 1023; if (e === 0) return s * m * 2 ** -24; if (e === 31) return m ? NaN : s * Infinity; return s * (1 + m / 1024) * 2 ** (e - 15); };
const clamp8 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));

/** Decodes one mip level to RGBA8. Returns Uint8Array(width*height*4). */
export function decodeToRgba(format, data, width, height) {
    const out = new Uint8Array(width * height * 4);
    const f = format;
    if (f.kind === 'raw') {
        const n = width * height; const d = data;
        for (let i = 0; i < n; i += 1) {
            const s = i * f.bpp; const t = i * 4;
            switch (f.layout) {
                case 'rgba8': out[t] = d[s]; out[t + 1] = d[s + 1]; out[t + 2] = d[s + 2]; out[t + 3] = d[s + 3]; break;
                case 'bgra8': out[t] = d[s + 2]; out[t + 1] = d[s + 1]; out[t + 2] = d[s]; out[t + 3] = d[s + 3]; break;
                case 'bgrx8': out[t] = d[s + 2]; out[t + 1] = d[s + 1]; out[t + 2] = d[s]; out[t + 3] = 255; break;
                case 'rg8': out[t] = d[s]; out[t + 1] = d[s + 1]; out[t + 3] = 255; break;
                case 'r8': out[t] = out[t + 1] = out[t + 2] = d[s]; out[t + 3] = 255; break;
                case 'a8': out[t] = out[t + 1] = out[t + 2] = 255; out[t + 3] = d[s]; break;
                case 'r16': out[t] = out[t + 1] = out[t + 2] = d[s + 1]; out[t + 3] = 255; break;
                case 'rgba16': out[t] = d[s + 1]; out[t + 1] = d[s + 3]; out[t + 2] = d[s + 5]; out[t + 3] = d[s + 7]; break;
                case 'rgbaF16': for (let c = 0; c < 4; c += 1) out[t + c] = clamp8(halfToFloat(d[s + c * 2] | (d[s + c * 2 + 1] << 8))); break;
                case 'rgbaF32': for (let c = 0; c < 4; c += 1) out[t + c] = clamp8(d.readFloatLE(s + c * 4)); break;
                case 'masks': {
                    let px = 0; for (let b = 0; b < f.bpp; b += 1) px += d[s + b] * 2 ** (8 * b);
                    for (let c = 0; c < 4; c += 1) {
                        const m = f.masks[c]; if (!m) { out[t + c] = c === 3 ? 255 : 0; continue; }
                        let shift = 0; while (!((m >>> shift) & 1)) shift += 1;
                        const max = (m >>> shift); out[t + c] = Math.round((((px >>> shift) & max) / max) * 255);
                    }
                    if (!f.masks[1] && !f.masks[2]) { out[t + 1] = out[t]; out[t + 2] = out[t]; }
                    break;
                }
                default: throw new Error(`raw layout ${f.layout} not implemented`);
            }
        }
        return out;
    }
    if (!['bc1', 'bc2', 'bc3', 'bc4', 'bc5', 'bc7'].includes(f.kind)) throw new Error(`format ${f.name} (${f.kind}) is not implemented`);
    const bw = Math.max(1, Math.ceil(width / 4)); const bh = Math.max(1, Math.ceil(height / 4));
    if (data.length < bw * bh * f.block) throw new Error(`mip data too short: ${data.length} < ${bw * bh * f.block}`);
    let o = 0;
    for (let by = 0; by < bh; by += 1) {
        for (let bx = 0; bx < bw; bx += 1, o += f.block) {
            switch (f.kind) {
                case 'bc1': bc1Block(data, o, false); break;
                case 'bc2': bc1Block(data, o + 8, true); for (let i = 0; i < 16; i += 1) TMP[i * 4 + 3] = ((data[o + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17; break;
                case 'bc3': bc1Block(data, o + 8, true); bc4Block(data, o, 3, false); break;
                case 'bc4': bc4Block(data, o, 0, f.signed); for (let i = 0; i < 16; i += 1) { TMP[i * 4 + 1] = TMP[i * 4]; TMP[i * 4 + 2] = TMP[i * 4]; TMP[i * 4 + 3] = 255; } break;
                case 'bc5': bc4Block(data, o, 0, f.signed); bc4Block(data, o + 8, 1, f.signed); for (let i = 0; i < 16; i += 1) { TMP[i * 4 + 2] = 0; TMP[i * 4 + 3] = 255; } break;
                default: bc7Block(data, o);
            }
            for (let py = 0; py < 4; py += 1) {
                const y = by * 4 + py; if (y >= height) break;
                for (let px = 0; px < 4; px += 1) {
                    const x = bx * 4 + px; if (x >= width) break;
                    const t = (y * width + x) * 4; const s = (py * 4 + px) * 4;
                    out[t] = TMP[s]; out[t + 1] = TMP[s + 1]; out[t + 2] = TMP[s + 2]; out[t + 3] = TMP[s + 3];
                }
            }
        }
    }
    return out;
}

/** Two-channel (BC5) normal -> RGB tangent-space normal map with reconstructed Z. In place. */
export function reconstructNormalZ(rgba) {
    for (let i = 0; i < rgba.length; i += 4) {
        const x = rgba[i] / 255 * 2 - 1; const y = rgba[i + 1] / 255 * 2 - 1;
        rgba[i + 2] = Math.round((Math.sqrt(Math.max(0, 1 - x * x - y * y)) * 0.5 + 0.5) * 255); rgba[i + 3] = 255;
    }
    return rgba;
}

// ───────────────────────────── PNG ─────────────────────────────

let CRC_TABLE;
function crc32(buf) {
    if (!CRC_TABLE) { CRC_TABLE = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); CRC_TABLE[n] = c >>> 0; } }
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
/** channels: 4 = RGBA, 3 = RGB, 1 = grey (takes the R channel). Uses per-row adaptive filtering. */
export function encodePng(rgba, width, height, channels = 4) {
    const bpp = channels; const stride = width * bpp;
    const rows = Buffer.alloc((stride + 1) * height);
    const cur = new Uint8Array(stride); const prev = new Uint8Array(stride); const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) { const s = (y * width + x) * 4; for (let c = 0; c < bpp; c += 1) cur[x * bpp + c] = rgba[s + c]; }
        let best = 0; let bestScore = Infinity;
        for (let f = 0; f < 5; f += 1) {
            let score = 0; const dst = cand[f];
            for (let i = 0; i < stride; i += 1) {
                const a = i >= bpp ? cur[i - bpp] : 0; const b = prev[i]; const c = i >= bpp ? prev[i - bpp] : 0;
                let pred = 0;
                if (f === 1) pred = a; else if (f === 2) pred = b; else if (f === 3) pred = (a + b) >> 1; else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
                const v = (cur[i] - pred) & 0xff; dst[i] = v; score += v < 128 ? v : 256 - v;
            }
            if (score < bestScore) { bestScore = score; best = f; }
        }
        rows[y * (stride + 1)] = best; rows.set(cand[best], y * (stride + 1) + 1);
        prev.set(cur);
    }
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, 'latin1'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : channels === 3 ? 2 : 0;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ───────────────────────────── split-texture assembly ────────────────────────

/**
 * Reassembles ONE mip level of a split texture.
 * opts: { level } or { size } (largest dimension wanted; picks the closest mip that is >= size, else the top mip), alpha: true for the .dds.a texture.
 * Returns { header, level, width, height, data, partCount, source: 'part N' | 'header file' }.
 */
export function readMip(parts, opts = {}) {
    const a = opts.alpha ? 'a' : '';
    const headerGet = parts.get(a);
    if (!headerGet) throw new Error(opts.alpha ? 'texture has no attached alpha (.dds.a)' : 'texture header (.dds) not found');
    const headerBuf = headerGet();
    const header = parseDdsHeader(headerBuf);
    if (header.isCube || header.arraySize > 1 || header.isVolume) throw new Error('cube / array / volume textures are not implemented');
    const chain = mipChain(header);
    let partCount = 0;
    while (parts.has(`${partCount + 1}${a}`)) partCount += 1;
    let level = opts.level;
    if (level == null) {
        level = 0;
        if (opts.size) while (level + 1 < chain.length && Math.max(chain[level + 1].width, chain[level + 1].height) >= opts.size) level += 1;
    }
    if (level < 0 || level >= chain.length) throw new Error(`mip level ${level} out of range (0..${chain.length - 1})`);
    const mip = chain[level];
    let data; let source;
    if (level < partCount) {
        const n = partCount - level;
        data = parts.get(`${n}${a}`)(); source = `part .dds.${n}${a}`;
        if (data.length !== mip.bytes) throw new Error(`part ${n}${a} has ${data.length} bytes, expected ${mip.bytes} for mip ${level}`);
    } else {
        let offset = header.dataOffset;
        for (let l = partCount; l < level; l += 1) offset += chain[l].bytes;
        data = headerBuf.subarray(offset, offset + mip.bytes); source = `header file @${offset}`;
        if (data.length !== mip.bytes) throw new Error(`header file too short for mip ${level}`);
    }
    return { header, level, width: mip.width, height: mip.height, data, partCount, source };
}

/** One call: game path -> { width, height, rgba, info }. mode as in the CLI. */
export function decodeTexture(parts, opts = {}) {
    let mode = opts.mode || 'auto';
    const mip = readMip(parts, { level: opts.level, size: opts.size, alpha: mode === 'alpha' });
    const rgba = decodeToRgba(mip.header.format, mip.data, mip.width, mip.height);
    const kind = mip.header.format.kind;
    if (mode === 'auto') mode = kind === 'bc5' ? 'normal' : kind === 'bc4' ? 'r' : 'rgba';
    let channels = 4;
    if (mode === 'normal') { reconstructNormalZ(rgba); channels = 3; } else if (mode === 'rgb') channels = 3; else if (mode === 'alpha' || mode === 'r') channels = 1;
    else if ('gba'.includes(mode) && mode.length === 1) { const c = ' gba'.indexOf(mode); for (let i = 0; i < rgba.length; i += 4) rgba[i] = rgba[i + c]; channels = 1; } else if (mode === 'rgba') {
        let opaque = true; for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { opaque = false; break; }
        if (opaque) channels = 3;
    }
    return { width: mip.width, height: mip.height, rgba, channels, info: { format: mip.header.format.name, dxgi: mip.header.dxgi, srgb: !!mip.header.format.srgb, fullSize: `${mip.header.width}x${mip.header.height}`, mipCount: mip.header.mipCount, level: mip.level, partCount: mip.partCount, source: mip.source, mode } };
}
