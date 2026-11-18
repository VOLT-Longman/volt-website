/**
 * Star Citizen "#ivo" skeleton / node reader (bones and helper nodes only; no mesh data).
 *
 * Input: the Buffer of a .chr / .skin / .cgf / .cga file taken from Data.p4k.
 *   - .chr (and .skin) carry a CompiledBones chunk  -> readBones()
 *   - .cgf / .cga carry a NodeMeshCombo chunk        -> readNodes()
 *
 * Format notes were cross-checked against real files (hex dumps) and against the open-source
 * reader Markemp/Cryengine-Converter (GPL-2.0), files
 *   CgfConverter/CryEngineCore/Chunks/ChunkCompiledBones_900.cs, ChunkCompiledBones_901.cs,
 *   CgfConverter/Models/CompiledBone.cs, CgfConverter/CryEngineCore/Chunks/ChunkNodeMeshCombo_900.cs,
 *   CgfConverter/Enums/Enums.cs
 * That project was read as format documentation only; this file is an independent implementation.
 *
 * Conventions: CryEngine space, +X right, +Y forward (muzzle direction), +Z up, metres.
 * Quaternions are returned as [x, y, z, w]. "world" = model space of the file (bone-to-model).
 */

export const CHUNK = {
    CompiledBonesIvo: 0xc201973c,
    CompiledBonesIvo2: 0xc2011111,
    NodeMeshCombo: 0x70697fda,
    MtlNameIvo: 0x8335674e,
    MtlNameIvo320: 0x83353333,
    PhysicalBonesIvo: 0x90c687dc,
    PhysicalBonesIvo320: 0x90c66666,
    PhysicalBonesIvo2222: 0x90c62222,
    AssetMetadata: 0xbe5e493e,
    MeshInfo: 0x92914444,
};

/** #ivo container: magic, version, chunk table (type, version, offset[, size derived]). */
export function parseIvo(buffer) {
    if (buffer.length < 16 || buffer.toString('latin1', 0, 4) !== '#ivo') throw new Error('not an #ivo file');
    const version = buffer.readUInt32LE(4);
    const count = buffer.readUInt32LE(8);
    const table = buffer.readUInt32LE(12);
    const chunks = [];
    for (let i = 0; i < count; i += 1) {
        const o = table + i * 16;
        chunks.push({ type: buffer.readUInt32LE(o), version: buffer.readUInt32LE(o + 4), offset: Number(buffer.readBigUInt64LE(o + 8)) });
    }
    const order = [...chunks].sort((a, b) => a.offset - b.offset);
    order.forEach((chunk, i) => { chunk.size = (order[i + 1]?.offset ?? buffer.length) - chunk.offset; });
    return { version, chunks };
}

const quatAt = (b, o) => [b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8), b.readFloatLE(o + 12)];
const vecAt = (b, o) => [b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8)];

function cstrings(b, start, count, limit) {
    const out = []; let p = start;
    while (out.length < count && p < limit) {
        let e = p; while (e < limit && b[e] !== 0) e += 1;
        out.push(b.toString('utf8', p, e)); p = e + 1;
    }
    return { names: out, end: p };
}

// ---- quaternion helpers (x, y, z, w) -------------------------------------------------------
export const qMul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qRotate = (q, v) => {
    const [x, y, z, w] = q;
    const ix = w * v[0] + y * v[2] - z * v[1]; const iy = w * v[1] + z * v[0] - x * v[2]; const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
};
export const qNormalize = (q) => { const n = Math.hypot(...q) || 1; return q.map((v) => v / n); };
/** child-in-world = parent ∘ local  (rotation then translation). */
export const compose = (parent, local) => ({
    position: qRotate(parent.rotation, local.position).map((v, i) => v + parent.position[i]),
    rotation: qNormalize(qMul(parent.rotation, local.rotation)),
});
/** rotation matrix rows (3x3) -> quaternion [x,y,z,w]; matrix is column-vector convention. */
export function quatFromMatrix(m) {
    const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
    const tr = m00 + m11 + m22; let x; let y; let z; let w;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
    return qNormalize([x, y, z, w]);
}

/**
 * CompiledBones chunk (types 0xC201973C / 0xC2011111).
 *  v0x900: u32 numBones; numBones x 68 bytes { u32 controllerId; u32 limbId; i32 parentIndex;
 *          quat relative(xyzw); vec3 relativePos; quat world(xyzw); vec3 worldPos }; then names (NUL separated).
 *  v0x901: u32 numBones; u32 stringTableSize; u32 flags1; u32 flags2; 32 bytes pad;
 *          numBones x 16 bytes { u32 controllerId; u16 limbId; u16 numChildren; i16 parentIndex; i16; i16; i16 objectNodeIndex };
 *          names; numBones x 28 bytes relative (quat+vec3); numBones x 28 bytes world (quat+vec3).
 * Returns null when the file has no bone chunk.
 */
export function readBones(buffer) {
    const ivo = parseIvo(buffer);
    const chunk = ivo.chunks.find((c) => c.type === CHUNK.CompiledBonesIvo || c.type === CHUNK.CompiledBonesIvo2);
    if (!chunk) return null;
    const b = buffer; let p = chunk.offset; const limit = chunk.offset + chunk.size;
    const bones = [];
    if (chunk.version === 0x900) {
        const n = b.readUInt32LE(p); p += 4;
        if (n > 4096 || p + n * 68 > limit) throw new Error(`CompiledBones 0x900: implausible bone count ${n}`);
        for (let i = 0; i < n; i += 1, p += 68) {
            bones.push({ index: i, controllerId: b.readUInt32LE(p), limbId: b.readUInt32LE(p + 4), parent: b.readInt32LE(p + 8),
                local: { rotation: quatAt(b, p + 12), position: vecAt(b, p + 28) },
                world: { rotation: quatAt(b, p + 40), position: vecAt(b, p + 56) } });
        }
        const { names } = cstrings(b, p, n, limit);
        bones.forEach((bone, i) => { bone.name = names[i]; });
    } else if (chunk.version === 0x901) {
        const n = b.readUInt32LE(p); const stringSize = b.readUInt32LE(p + 4); p += 16 + 32;
        if (n > 4096 || p + n * 16 + stringSize + n * 56 > limit + 8) throw new Error(`CompiledBones 0x901: implausible bone count ${n}`);
        for (let i = 0; i < n; i += 1, p += 16) {
            bones.push({ index: i, controllerId: b.readUInt32LE(p), limbId: b.readUInt16LE(p + 4), parent: b.readInt16LE(p + 8), objectNodeIndex: b.readInt16LE(p + 14) });
        }
        const { names } = cstrings(b, p, n, p + stringSize); p += stringSize;
        bones.forEach((bone, i) => { bone.name = names[i]; });
        for (let i = 0; i < n; i += 1, p += 28) bones[i].local = { rotation: quatAt(b, p), position: vecAt(b, p + 16) };
        for (let i = 0; i < n; i += 1, p += 28) bones[i].world = { rotation: quatAt(b, p), position: vecAt(b, p + 16) };
    } else {
        throw new Error(`CompiledBones: unsupported chunk version 0x${chunk.version.toString(16)}`);
    }
    return { kind: 'bones', chunkType: chunk.type, chunkVersion: chunk.version, bones };
}

/**
 * NodeMeshCombo chunk (type 0x70697FDA, v0x900) of .cgf / .cga: one entry per node (mesh nodes and helper nodes).
 *  header: i32 zero; i32 numNodes; i32 numMeshes; i32 unknown2; i32 numMeshSubsets; i32 stringTableSize; i32; i32; 32 bytes pad
 *  node (208 bytes): float[12] matrix A (3x4 rows); float[12] matrix B (3x4 rows; identical to A in build 4.10 and
 *          equal to the node-to-PARENT transform, not the worldToBone/boneToWorld pair older notes describe);
 *          vec3 (helper display size, not a scale); u32 id; u32;
 *          u16 parentIndex (0xFFFF = root); u16 geometryType; vec3 bboxMin; vec3 bboxMax; u32[4]; u32 numVertices;
 *          u16 numChildren; u16 meshChunkId; 40 bytes unknown
 *  then u16[unknown2], u16[numMeshSubsets], names.
 * Returns null when the file has no such chunk.
 */
export function readNodes(buffer) {
    const ivo = parseIvo(buffer);
    const chunk = ivo.chunks.find((c) => c.type === CHUNK.NodeMeshCombo);
    if (!chunk) return null;
    if (chunk.version !== 0x900) throw new Error(`NodeMeshCombo: unsupported chunk version 0x${chunk.version.toString(16)}`);
    const b = buffer; let p = chunk.offset; const limit = chunk.offset + chunk.size;
    const numNodes = b.readInt32LE(p + 4); const numMeshes = b.readInt32LE(p + 8); const unknown2 = b.readInt32LE(p + 12);
    const numSubsets = b.readInt32LE(p + 16); const stringSize = b.readInt32LE(p + 20);
    p += 32 + 32;
    if (numNodes < 0 || numNodes > 8192 || p + numNodes * 208 > limit) throw new Error(`NodeMeshCombo: implausible node count ${numNodes}`);
    const nodes = [];
    for (let i = 0; i < numNodes; i += 1, p += 208) {
        // Two 3x4 matrices are stored. In this game build (4.10) both hold the same values: the node's transform
        // RELATIVE TO ITS PARENT NODE (verified: accumulating them reproduces the bone world positions of .cga files
        // that carry both a NodeMeshCombo and a CompiledBones chunk). bboxMin/bboxMax are in the node's own space.
        const first = []; for (let k = 0; k < 12; k += 1) first.push(b.readFloatLE(p + k * 4));
        const local = []; for (let k = 0; k < 12; k += 1) local.push(b.readFloatLE(p + 48 + k * 4));
        const parent = b.readUInt16LE(p + 116);
        nodes.push({ index: i, parent: parent === 0xffff ? -1 : parent, geometryType: b.readUInt16LE(p + 118),
            helperSize: vecAt(b, p + 96), id: b.readUInt32LE(p + 108),
            bboxMin: vecAt(b, p + 120), bboxMax: vecAt(b, p + 132), numVertices: b.readUInt32LE(p + 160), numChildren: b.readUInt16LE(p + 164), meshChunkId: b.readUInt16LE(p + 166),
            localMatrix: local, firstMatrix: first });
    }
    p += unknown2 * 2 + numSubsets * 2;
    const { names } = cstrings(b, p, numNodes, Math.min(limit, p + stringSize));
    nodes.forEach((node, i) => { node.name = names[i]; });
    // Accumulate parent chains: boneToWorld (node -> model space of the file).
    const resolve = (node, guard = 0) => {
        if (node.boneToWorld) return node.boneToWorld;
        const parent = node.parent >= 0 && node.parent < nodes.length && guard < 64 ? nodes[node.parent] : null;
        node.boneToWorld = parent ? mulAffine(resolve(parent, guard + 1), node.localMatrix) : node.localMatrix;
        return node.boneToWorld;
    };
    for (const node of nodes) {
        const m = resolve(node);
        node.world = { rotation: quatFromMatrix([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]), position: [m[3], m[7], m[11]] };
        const l = node.localMatrix;
        node.local = { rotation: quatFromMatrix([l[0], l[1], l[2], l[4], l[5], l[6], l[8], l[9], l[10]]), position: [l[3], l[7], l[11]] };
    }
    return { kind: 'nodes', chunkVersion: chunk.version, numMeshes, nodes };
}

/** 3x4 row-major affine product a*b (apply b first, then a). */
export function mulAffine(a, b) {
    const r = new Array(12);
    for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 4; j += 1) {
            let s = j === 3 ? a[i * 4 + 3] : 0;
            for (let k = 0; k < 3; k += 1) s += a[i * 4 + k] * b[k * 4 + j];
            r[i * 4 + j] = s;
        }
    }
    return r;
}

/**
 * MeshInfo chunk (type 0x92914444) present in .skin and .cgf/.cga structure files.
 * Only the fields this slice needs (layout observed in hex dumps, cross-checked against NodeMeshCombo bboxes):
 *   +4 u32 numVertices; +8 u32 numIndices; +12 u32 numSubsets; +24 vec3 bboxMin; +36 vec3 bboxMax
 * Returns null when the chunk is absent.
 */
export function readMeshInfo(buffer) {
    const ivo = parseIvo(buffer);
    const chunk = ivo.chunks.find((c) => c.type === CHUNK.MeshInfo);
    if (!chunk || chunk.size < 48) return null;
    const p = chunk.offset;
    return { numVertices: buffer.readUInt32LE(p + 4), numIndices: buffer.readUInt32LE(p + 8), numSubsets: buffer.readUInt32LE(p + 12), bboxMin: vecAt(buffer, p + 24), bboxMax: vecAt(buffer, p + 36) };
}

/** Apply a 3x4 row-major affine matrix (as stored in NodeMeshCombo) to a point. */
export const applyMatrix = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3], m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7], m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11]];

/** Material name stored in the file (chunk 0x8335674E / 0x83353333), if any. */
export function readMaterialName(buffer) {
    const ivo = parseIvo(buffer);
    const chunk = ivo.chunks.find((c) => c.type === CHUNK.MtlNameIvo || c.type === CHUNK.MtlNameIvo320);
    if (!chunk) return null;
    let p = chunk.offset; if (chunk.type === CHUNK.MtlNameIvo320) p += 4;
    let e = p; while (e < buffer.length && buffer[e] !== 0) e += 1;
    return buffer.toString('utf8', p, e);
}

/** One uniform list of named transforms for either file kind: [{name, parent, world:{position,rotation}}]. */
export function readJoints(buffer) {
    const bones = readBones(buffer);
    if (bones) return { kind: 'bones', joints: bones.bones.map((b) => ({ name: b.name, parent: b.parent, world: b.world, local: b.local })) };
    const nodes = readNodes(buffer);
    if (nodes) return { kind: 'nodes', joints: nodes.nodes.map((n) => ({ name: n.name, parent: n.parent, world: n.world, geometryType: n.geometryType, numVertices: n.numVertices, bboxMin: n.bboxMin, bboxMax: n.bboxMax })) };
    return null;
}

// ---- CRC32 (zlib polynomial) — controllerId is CRC32 of the bone name -------------------------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i += 1) { let c = i; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
export function crc32(text) { let c = 0xffffffff; for (const byte of Buffer.from(text, 'utf8')) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
