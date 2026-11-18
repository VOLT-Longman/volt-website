/**
 * ivo.mjs — dependency-free reader for Star Citizen "#ivo" (file version 0x900) geometry files.
 *
 *   *.cgf / *.cga / *.skin / *.chr   -> structure file: material reference, node table, mesh summary
 *   *.cgfm / *.cgam / *.skinm        -> mesh companion: sub-meshes + data streams (indices, positions+uv+colour,
 *                                       normals / tangent frames, bone map)
 *
 * Written from scratch for this project. The on-disk layout was learned from our own hex dumps of the
 * installed game files plus, as format documentation only, the open-source Cryengine-Converter project
 * (github.com/Markemp/Cryengine-Converter, GPL-2.0).
 * No code was copied. Everything is little-endian. Engine space: right-handed, X right, Y forward, Z up, metres.
 */

// ---------------------------------------------------------------- chunk and stream identifiers
export const CHUNK = {
    [0x70697fda]: 'NodeMeshCombo',        // node table of .cgf/.cga
    [0x8335674e]: 'MtlName',              // material reference (older id)
    [0x83353333]: 'MtlName',              // material reference (SC 3.24+ id)
    [0x83353533]: 'MtlNameVariant',
    [0x92914444]: 'MeshInfo',             // mesh summary inside the structure file
    [0x9293b9d8]: 'MeshInfo',             // older id
    [0xb875b2d9]: 'SkinMesh',             // the actual mesh (older id)
    [0xb8757777]: 'SkinMesh',             // the actual mesh (SC 3.24+ id)
    [0xc201973c]: 'CompiledBones',
    [0xc2011111]: 'CompiledBones',
    [0x90c687dc]: 'PhysicalBones',
    [0x90c66666]: 'PhysicalBones',
    [0x57a3befd]: 'BlendShapesGPU',
    [0x875ccb28]: 'BlendShapes',
    [0xbe5e493e]: 'AssetMetadata',
    [0x9351756f]: 'LodDistances',
    [0x58de1772]: 'LodMeshData',
    [0x2b7ecf9f]: 'BoundingData',
    [0xe0181074]: 'MeshTail',             // trailing chunk in .cgfm/.cgam (draw ranges + a matrix); not needed for rendering
};

export const STREAM = {
    [0xeecdc168]: 'indices',
    [0x91329ae9]: 'vertsUvs',       // position + colour + uv (seen with 20 bytes/vertex: float positions)
    [0xb3a70d5e]: 'vertsUvs',       // position + colour + uv (seen with 16 bytes/vertex: int16 quantised positions)
    [0x9cf3f615]: 'normals',
    [0x38a581fe]: 'normals',
    [0xb95e9a1b]: 'tangents',       // 8 bytes: int16 x4 quaternion tangent frame
    [0xee057252]: 'qtangents',      // 8 bytes: two packed unit vectors (tangent, bitangent)
    [0xd9eed421]: 'colors2',
    [0x677c7b23]: 'boneMap',        // 12 bytes: 4 x u16 bone index + 4 x u8 weight
    [0x6eca3708]: 'boneMap',        // 24 bytes: 8 + 8
    [0x9d51c5ee]: 'simpleBoneMap',  // 2 bytes: one bone / node index per vertex
};

const hex = (n) => `0x${(n >>> 0).toString(16).padStart(8, '0')}`;

// ---------------------------------------------------------------- container
/** Reads the 16-byte header and the chunk table. Chunk sizes are derived from the next chunk's offset. */
export function readIvo(buffer) {
    if (buffer.length < 16 || buffer.toString('latin1', 0, 4) !== '#ivo') throw new Error('not an #ivo file');
    const version = buffer.readUInt32LE(4);
    if (version !== 0x900) throw new Error(`unsupported #ivo version ${hex(version)}`);
    const count = buffer.readUInt32LE(8);
    const tableAt = buffer.readUInt32LE(12);
    if (tableAt + count * 16 > buffer.length) throw new Error('chunk table runs past end of file');
    const chunks = [];
    for (let i = 0; i < count; i += 1) {
        const o = tableAt + i * 16;
        const type = buffer.readUInt32LE(o);
        const offset = Number(buffer.readBigUInt64LE(o + 8));
        if (offset > buffer.length) throw new Error(`chunk ${hex(type)} offset past end of file`);
        chunks.push({ type, name: CHUNK[type] || `unknown_${hex(type)}`, version: buffer.readUInt32LE(o + 4), offset, size: 0 });
    }
    const sorted = [...chunks].sort((a, b) => a.offset - b.offset);
    sorted.forEach((chunk, i) => { chunk.size = (i + 1 < sorted.length ? sorted[i + 1].offset : buffer.length) - chunk.offset; });
    return { version, chunks };
}

const vec3 = (b, o) => [b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8)];
const box = (b, o) => ({ min: vec3(b, o), max: vec3(b, o + 12) });

// IEEE 754 half -> float (table built once)
const HALF = new Float32Array(65536);
for (let h = 0; h < 65536; h += 1) {
    const sign = h & 0x8000 ? -1 : 1; const exp = (h >> 10) & 0x1f; const frac = h & 0x3ff;
    HALF[h] = exp === 0 ? sign * 2 ** -14 * (frac / 1024) : exp === 31 ? (frac ? NaN : sign * Infinity) : sign * 2 ** (exp - 15) * (1 + frac / 1024);
}

/** Packed unit vector in a u32: bits 0-14 x, bits 15-29 y (both biased by 0x3fff, /16383), bit 30 = z is negative. */
function unpackUnit(value, out, at) {
    const x = ((value & 0x7fff) - 0x3fff) / 16383;
    const y = (((value >>> 15) & 0x7fff) - 0x3fff) / 16383;
    let z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    if ((value >>> 30) & 1) z = -z;
    const len = Math.hypot(x, y, z) || 1;
    out[at] = x / len; out[at + 1] = y / len; out[at + 2] = z / len;
}

// ---------------------------------------------------------------- mesh companion (*.cgfm / *.cgam / *.skinm)
/**
 * Parses the SkinMesh chunk.
 * Returns typed arrays in ENGINE space (Z up, metres):
 *   positions Float32Array(3n), uvs Float32Array(2n), colors Uint8Array(4n)|null, normals Float32Array(3n)|null,
 *   tangents Float32Array(4n)|null (xyz + handedness), indices Uint16Array|Uint32Array,
 *   boneIndices Uint16Array(k*n)|null, boneWeights Uint8Array(k*n)|null, influences k
 *   subsets [{ materialId, nodeIndex, firstIndex, indexCount, firstVertex, vertexCount, radius, center }]
 */
export function parseMesh(buffer) {
    const { chunks } = readIvo(buffer);
    const chunk = chunks.find((c) => c.name === 'SkinMesh');
    if (!chunk) throw new Error(`no SkinMesh chunk (chunks: ${chunks.map((c) => c.name).join(', ') || 'none'})`);
    const end = chunk.offset + chunk.size;
    let p = chunk.offset;
    const mesh = { chunkTypes: chunks.map((c) => c.name), warnings: [], streams: [] };
    mesh.flags = buffer.readUInt32LE(p); p += 4;
    mesh.flags2 = buffer.readUInt32LE(p);
    const vertexCount = buffer.readUInt32LE(p + 4);
    const indexCount = buffer.readUInt32LE(p + 8);
    const subsetCount = buffer.readUInt32LE(p + 12);
    mesh.unknownFloat = buffer.readFloatLE(p + 16);
    p += 20;
    mesh.vertexCount = vertexCount; mesh.indexCount = indexCount;
    mesh.bbox = box(buffer, p); p += 24;          // real bounding box
    mesh.scaleBox = box(buffer, p); p += 24;      // box the int16 positions are quantised against
    mesh.vertexFormat = buffer.readUInt32LE(p); p += 4;
    p += 92;                                      // always zero in every file we looked at
    if (p + subsetCount * 48 > end) throw new Error('sub-mesh table runs past end of chunk');
    if (vertexCount > 50_000_000 || indexCount > 150_000_000) throw new Error('implausible vertex/index count');

    mesh.subsets = [];
    for (let i = 0; i < subsetCount; i += 1, p += 48) {
        mesh.subsets.push({
            materialId: buffer.readUInt16LE(p),      // index into the .mtl SubMaterials list
            nodeIndex: buffer.readUInt16LE(p + 2),   // which node of the NodeMeshCombo table owns this sub-mesh
            firstIndex: buffer.readUInt32LE(p + 4),
            indexCount: buffer.readUInt32LE(p + 8),
            firstVertex: buffer.readUInt32LE(p + 12),
            unknown: buffer.readUInt32LE(p + 16),
            vertexCount: buffer.readUInt32LE(p + 20),
            radius: buffer.readFloatLE(p + 24),
            center: vec3(buffer, p + 28),
            // The two floats below were identified by measurement (geometry study): they equal, to ~3 digits,
            // uv area / surface area and the surface area in m2 that we compute from the decoded streams.
            uvDensity: buffer.readFloatLE(p + 40),
            surfaceArea: buffer.readFloatLE(p + 44),
            unknownFloats: [buffer.readFloatLE(p + 40), buffer.readFloatLE(p + 44)],
        });
    }

    // ---- data streams: u32 type, u32 bytesPerElement, data, then padding to an 8-byte file offset
    const n = vertexCount;
    let quantised = false;
    while (p + 8 <= end) {
        const type = buffer.readUInt32LE(p); const bpe = buffer.readUInt32LE(p + 4);
        const name = STREAM[type];
        if (!name) {
            if (type === 0 && bpe === 0) { p += 8; continue; }   // zero padding
            mesh.warnings.push(`unknown stream ${hex(type)} (bytesPerElement ${bpe}) at ${p}; stopped reading streams`);
            break;
        }
        const count = name === 'indices' ? indexCount : n;
        const at = p + 8; const size = count * bpe;
        if (at + size > end) throw new Error(`stream ${name} runs past end of chunk`);
        mesh.streams.push({ name, type: hex(type), bytesPerElement: bpe, count, offset: at });
        const view = new DataView(buffer.buffer, buffer.byteOffset + at, size);

        if (name === 'indices') {
            if (bpe === 2) { mesh.indices = new Uint16Array(count); for (let i = 0; i < count; i += 1) mesh.indices[i] = view.getUint16(i * 2, true); }
            else if (bpe === 4) { mesh.indices = new Uint32Array(count); for (let i = 0; i < count; i += 1) mesh.indices[i] = view.getUint32(i * 4, true); }
            else throw new Error(`index stream with ${bpe} bytes per element`);
        } else if (name === 'vertsUvs') {
            const positions = new Float32Array(n * 3); const uvs = new Float32Array(n * 2); const colors = new Uint8Array(n * 4);
            if (bpe === 20) {           // float32 x3 position, u8 x4 colour, half x2 uv
                for (let i = 0, o = 0; i < n; i += 1, o += 20) {
                    positions[i * 3] = view.getFloat32(o, true); positions[i * 3 + 1] = view.getFloat32(o + 4, true); positions[i * 3 + 2] = view.getFloat32(o + 8, true);
                    colors[i * 4] = view.getUint8(o + 12); colors[i * 4 + 1] = view.getUint8(o + 13); colors[i * 4 + 2] = view.getUint8(o + 14); colors[i * 4 + 3] = view.getUint8(o + 15);
                    uvs[i * 2] = HALF[view.getUint16(o + 16, true)]; uvs[i * 2 + 1] = HALF[view.getUint16(o + 18, true)];
                }
            } else if (bpe === 16) {    // int16 x3 position (+ int16 w, always 32767), u8 x4 colour, half x2 uv
                // position = int16/32767 * max(halfExtent, 1) + centre, per axis, using the scale box.
                // (verified: reproduces the stored bounding box exactly; objects under 2 m are stored at 1 m scale)
                quantised = true;
                const { min, max } = mesh.scaleBox;
                const centre = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
                const scale = [0, 1, 2].map((k) => Math.max(Math.abs(max[k] - min[k]) / 2, 1) / 32767);
                for (let i = 0, o = 0; i < n; i += 1, o += 16) {
                    positions[i * 3] = view.getInt16(o, true) * scale[0] + centre[0];
                    positions[i * 3 + 1] = view.getInt16(o + 2, true) * scale[1] + centre[1];
                    positions[i * 3 + 2] = view.getInt16(o + 4, true) * scale[2] + centre[2];
                    colors[i * 4] = view.getUint8(o + 8); colors[i * 4 + 1] = view.getUint8(o + 9); colors[i * 4 + 2] = view.getUint8(o + 10); colors[i * 4 + 3] = view.getUint8(o + 11);
                    uvs[i * 2] = HALF[view.getUint16(o + 12, true)]; uvs[i * 2 + 1] = HALF[view.getUint16(o + 14, true)];
                }
            } else throw new Error(`vertsUvs stream with ${bpe} bytes per element`);
            mesh.positions = positions; mesh.uvs = uvs; mesh.colors = colors;
        } else if (name === 'normals') {
            const normals = new Float32Array(n * 3);
            if (bpe === 4) for (let i = 0; i < n; i += 1) unpackUnit(view.getUint32(i * 4, true), normals, i * 3);
            else if (bpe === 12) for (let i = 0; i < n * 3; i += 1) normals[i] = view.getFloat32(i * 4, true);
            else { mesh.warnings.push(`normals stream with ${bpe} bytes per element skipped`); p = (at + size + 7) & ~7; continue; }
            mesh.normals = normals; mesh.normalSource = 'normals';
        } else if (name === 'qtangents') {
            if (bpe !== 8) { mesh.warnings.push(`qtangents stream with ${bpe} bytes per element skipped`); p = (at + size + 7) & ~7; continue; }
            // two packed unit vectors: tangent, bitangent. bit 31 of the first = handedness. normal = (t x b) * sign
            const tangents = new Float32Array(n * 4); const derived = new Float32Array(n * 3); const b = [0, 0, 0];
            for (let i = 0; i < n; i += 1) {
                const first = view.getUint32(i * 8, true);
                unpackUnit(first, tangents, i * 4);
                unpackUnit(view.getUint32(i * 8 + 4, true), b, 0);
                const sign = first >>> 31 ? -1 : 1;
                tangents[i * 4 + 3] = sign;
                const tx = tangents[i * 4]; const ty = tangents[i * 4 + 1]; const tz = tangents[i * 4 + 2];
                let nx = (ty * b[2] - tz * b[1]) * sign; let ny = (tz * b[0] - tx * b[2]) * sign; let nz = (tx * b[1] - ty * b[0]) * sign;
                const len = Math.hypot(nx, ny, nz);
                if (len > 1e-8) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 0; nz = 1; }
                derived[i * 3] = nx; derived[i * 3 + 1] = ny; derived[i * 3 + 2] = nz;
            }
            mesh.tangents = tangents;
            if (!mesh.normals) { mesh.normals = derived; mesh.normalSource = 'qtangents'; }
        } else if (name === 'tangents') {
            if (bpe === 8) {
                // int16 x4 / 32767 = quaternion of the tangent frame. tangent = rotated X axis, normal = rotated Z axis
                // (negated when w < 0, which also carries the handedness).
                const tangents = new Float32Array(n * 4); const derived = new Float32Array(n * 3);
                for (let i = 0; i < n; i += 1) {
                    const x = view.getInt16(i * 8, true) / 32767; const y = view.getInt16(i * 8 + 2, true) / 32767;
                    const z = view.getInt16(i * 8 + 4, true) / 32767; const w = view.getInt16(i * 8 + 6, true) / 32767;
                    const sign = w < 0 ? -1 : 1;
                    const tx = 1 - 2 * (y * y + z * z); const ty = 2 * (x * y + w * z); const tz = 2 * (x * z - w * y);
                    let len = Math.hypot(tx, ty, tz) || 1;
                    tangents[i * 4] = tx / len; tangents[i * 4 + 1] = ty / len; tangents[i * 4 + 2] = tz / len; tangents[i * 4 + 3] = sign;
                    let nx = 2 * (x * z + w * y) * sign; let ny = 2 * (y * z - w * x) * sign; let nz = (1 - 2 * (x * x + y * y)) * sign;
                    len = Math.hypot(nx, ny, nz);
                    if (len > 1e-8) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 0; nz = 1; }
                    derived[i * 3] = nx; derived[i * 3 + 1] = ny; derived[i * 3 + 2] = nz;
                }
                mesh.tangents = tangents; mesh.tangentNormals = derived;
                if (!mesh.normals) { mesh.normals = derived; mesh.normalSource = 'tangents'; }
            } else mesh.warnings.push(`tangents stream with ${bpe} bytes per element not decoded`);
        } else if (name === 'colors2') {
            if (bpe === 4) mesh.colors2 = new Uint8Array(buffer.subarray(at, at + size));
        } else if (name === 'boneMap') {
            const k = bpe === 24 ? 8 : 4;
            if (bpe === 12 || bpe === 24) {
                const bi = new Uint16Array(n * k); const bw = new Uint8Array(n * k);
                for (let i = 0; i < n; i += 1) for (let j = 0; j < k; j += 1) { bi[i * k + j] = view.getUint16(i * bpe + j * 2, true); bw[i * k + j] = view.getUint8(i * bpe + k * 2 + j); }
                mesh.boneIndices = bi; mesh.boneWeights = bw; mesh.influences = k;
            } else if (bpe === 8) {
                const bi = new Uint16Array(n * 4); const bw = new Uint8Array(n * 4);
                for (let i = 0; i < n; i += 1) for (let j = 0; j < 4; j += 1) { bi[i * 4 + j] = view.getUint8(i * 8 + j); bw[i * 4 + j] = view.getUint8(i * 8 + 4 + j); }
                mesh.boneIndices = bi; mesh.boneWeights = bw; mesh.influences = 4;
            } else mesh.warnings.push(`boneMap stream with ${bpe} bytes per element not decoded`);
        } else if (name === 'simpleBoneMap') {
            if (bpe === 2) { const bi = new Uint16Array(n); for (let i = 0; i < n; i += 1) bi[i] = view.getUint16(i * 2, true); mesh.boneIndices = bi; mesh.influences = 1; }
            else mesh.warnings.push(`simpleBoneMap stream with ${bpe} bytes per element not decoded`);
        }
        p = (at + size + 7) & ~7;
    }
    mesh.quantisedPositions = quantised;
    if (!mesh.indices) throw new Error('mesh has no index stream');
    if (!mesh.positions) throw new Error('mesh has no position stream');
    return mesh;
}

// ---------------------------------------------------------------- structure file (*.cgf / *.cga / *.skin / *.chr)
function cstr(buffer, start, max) {
    let endAt = start;
    while (endAt < start + max && endAt < buffer.length && buffer[endAt] !== 0) endAt += 1;
    return buffer.toString('utf8', start, endAt);
}

/** 3x4 row-major matrix, translation in the 4th column: world = R * local + t */
const mat34 = (b, o) => Array.from({ length: 12 }, (_, i) => b.readFloatLE(o + i * 4));

/**
 * Parses the structure file. Returns:
 *   material: { name, subMaterialIds[] } | null     (name is the .mtl path without extension, often relative to the model folder)
 *   nodes: [{ name, parent (-1 = root), geometryType (0 mesh, 2/3 helper), localToModel[12]?, boneToWorld[12], worldToBone[12], bbox, vertexCount, childCount }]
 *   meshInfo: { flags, vertexCount, indexCount, subsetCount, bbox } | null
 *   boneCount (from CompiledBones, count only — skeleton parsing is a different module)
 */
export function parseStructure(buffer) {
    const { chunks } = readIvo(buffer);
    const out = { chunkTypes: chunks.map((c) => c.name), chunks, material: null, nodes: [], nodeSubsetMaterialIds: [], meshInfo: null, boneCount: 0, warnings: [] };
    for (const chunk of chunks) {
        let p = chunk.offset; const end = chunk.offset + chunk.size;
        if (chunk.name === 'MtlName' || chunk.name === 'MtlNameVariant') {
            if (chunk.size < 164) { out.warnings.push('MtlName chunk too small'); continue; }
            const name = cstr(buffer, p, 128);
            const count = buffer.readUInt32LE(p + 128);
            const ids = [];
            if (count < 4096 && p + 164 + count * 2 <= end) for (let i = 0; i < count; i += 1) ids.push(buffer.readUInt16LE(p + 164 + i * 2));
            else out.warnings.push(`MtlName: implausible sub-material count ${count}`);
            if (!out.material) out.material = { name, subMaterialIds: ids };
            else { if (!out.extraMaterials) out.extraMaterials = []; out.extraMaterials.push({ name, subMaterialIds: ids }); }
        } else if (chunk.name === 'NodeMeshCombo') {
            const nodeCount = buffer.readInt32LE(p + 4);
            const meshCount = buffer.readInt32LE(p + 8);
            const unknownIndexCount = buffer.readInt32LE(p + 12);
            const subsetCount = buffer.readInt32LE(p + 16);
            const stringTableSize = buffer.readInt32LE(p + 20);
            p += 64;                                              // 8 x int32 header + 32 bytes padding
            if (nodeCount < 0 || nodeCount > 10000 || p + nodeCount * 208 > end) { out.warnings.push(`NodeMeshCombo: implausible node count ${nodeCount}`); continue; }
            out.nodeMeshCount = meshCount;
            for (let i = 0; i < nodeCount; i += 1, p += 208) {
                const parent = buffer.readUInt16LE(p + 116);
                out.nodes.push({
                    name: '',
                    worldToBone: mat34(buffer, p),
                    boneToWorld: mat34(buffer, p + 48),
                    scale: vec3(buffer, p + 96),
                    id: buffer.readUInt32LE(p + 108),
                    parent: parent === 0xffff ? -1 : parent,
                    geometryType: buffer.readUInt16LE(p + 118),
                    bbox: box(buffer, p + 120),
                    vertexCount: buffer.readUInt32LE(p + 160),
                    childCount: buffer.readUInt16LE(p + 164),
                    meshChunkId: buffer.readUInt16LE(p + 166),
                });
            }
            p += Math.max(0, unknownIndexCount) * 2;
            for (let i = 0; i < subsetCount && p + 2 <= end; i += 1, p += 2) out.nodeSubsetMaterialIds.push(buffer.readUInt16LE(p));
            const names = buffer.toString('utf8', p, Math.min(end, p + stringTableSize)).split('\0');
            out.nodes.forEach((node, i) => { node.name = names[i] ?? `node_${i}`; });
        } else if (chunk.name === 'MeshInfo') {
            if (chunk.size < 48) continue;
            out.meshInfo = {
                flags: buffer.readUInt32LE(p), vertexCount: buffer.readUInt32LE(p + 4), indexCount: buffer.readUInt32LE(p + 8),
                subsetCount: buffer.readUInt32LE(p + 12), bbox: box(buffer, p + 24),
            };
        } else if (chunk.name === 'CompiledBones') {
            out.boneCount = buffer.readUInt32LE(p);
        } else if (chunk.name === 'LodDistances') {
            const count = buffer.readUInt32LE(p);
            if (count < 16 && p + 4 + count * 4 <= end) out.lodValues = Array.from({ length: count }, (_, i) => buffer.readFloatLE(p + 4 + i * 4));
        }
    }
    return out;
}

// ---------------------------------------------------------------- helpers for consumers
/**
 * Which node of the structure file owns a sub-mesh: its index, or -1 when the vertices are already in model space.
 * -1 covers (a) files without a node table (.skin, .cgf with an empty table) and (b) the few files whose table lists
 * only helper nodes (geometryType != 0) although the mesh has sub-meshes — there the vertices are in model space and
 * the helper's transform must NOT be applied (seen on 7 files, e.g. the binocular lens whose only node is "ADS_align").
 */
export function ownerNode(structure, subset) {
    const node = structure?.nodes?.[subset.nodeIndex];
    return node && node.geometryType === 0 ? subset.nodeIndex : -1;
}

/** 3x4 (row-major) composition a*b and point transform. */
export function mulMat34(a, b) {
    const r = new Array(12);
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 4; col += 1) {
            r[row * 4 + col] = a[row * 4] * b[col] + a[row * 4 + 1] * b[4 + col] + a[row * 4 + 2] * b[8 + col] + (col === 3 ? a[row * 4 + 3] : 0);
        }
    }
    return r;
}
export const IDENTITY34 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/**
 * Independent test of the normal decoding and of the triangle winding: compares each triangle's geometric normal
 * (counter-clockwise = front) with the average of its three decoded vertex normals.
 */
export function normalAgreement(mesh, normals = mesh.normals) {
    const P = mesh.positions; const I = mesh.indices;
    let agree = 0; let disagree = 0; let degenerate = 0; let sumCos = 0; let weight = 0;
    for (let t = 0; t + 2 < I.length; t += 3) {
        const a = I[t] * 3; const b = I[t + 1] * 3; const c = I[t + 2] * 3;
        const e1x = P[b] - P[a]; const e1y = P[b + 1] - P[a + 1]; const e1z = P[b + 2] - P[a + 2];
        const e2x = P[c] - P[a]; const e2y = P[c + 1] - P[a + 1]; const e2z = P[c + 2] - P[a + 2];
        const fx = e1y * e2z - e1z * e2y; const fy = e1z * e2x - e1x * e2z; const fz = e1x * e2y - e1y * e2x;
        const area = Math.hypot(fx, fy, fz);
        const nx = normals[a] + normals[b] + normals[c]; const ny = normals[a + 1] + normals[b + 1] + normals[c + 1]; const nz = normals[a + 2] + normals[b + 2] + normals[c + 2];
        const len = Math.hypot(nx, ny, nz);
        if (!(area > 1e-12) || !(len > 1e-6)) { degenerate += 1; continue; }
        const cos = (fx * nx + fy * ny + fz * nz) / (area * len);
        if (cos > 0) agree += 1; else disagree += 1;
        sumCos += cos * area; weight += area;
    }
    return { triangles: Math.floor(I.length / 3), agree, disagree, degenerate, areaWeightedCos: weight ? sumCos / weight : 0 };
}

/** Surface area (m2) and uv-space area of one sub-mesh, from the decoded positions and uvs. */
export function subsetAreas(mesh, subset) {
    const P = mesh.positions; const T = mesh.uvs; const I = mesh.indices;
    let surface = 0; let uvArea = 0;
    for (let t = subset.firstIndex; t + 2 < subset.firstIndex + subset.indexCount; t += 3) {
        const a = I[t]; const b = I[t + 1]; const c = I[t + 2];
        const e1x = P[b * 3] - P[a * 3]; const e1y = P[b * 3 + 1] - P[a * 3 + 1]; const e1z = P[b * 3 + 2] - P[a * 3 + 2];
        const e2x = P[c * 3] - P[a * 3]; const e2y = P[c * 3 + 1] - P[a * 3 + 1]; const e2z = P[c * 3 + 2] - P[a * 3 + 2];
        surface += 0.5 * Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x);
        uvArea += 0.5 * Math.abs((T[b * 2] - T[a * 2]) * (T[c * 2 + 1] - T[a * 2 + 1]) - (T[c * 2] - T[a * 2]) * (T[b * 2 + 1] - T[a * 2 + 1]));
    }
    return { surface, uvArea };
}

/** Sanity checks used by the validation scripts. Returns { ok, problems[], stats }. */
export function checkMesh(mesh) {
    const problems = [];
    const n = mesh.vertexCount;
    let nan = 0;
    for (const key of ['positions', 'uvs', 'normals']) { const a = mesh[key]; if (a) for (let i = 0; i < a.length; i += 1) if (!Number.isFinite(a[i])) nan += 1; }
    if (nan) problems.push(`${nan} non-finite values`);
    let maxIndex = 0;
    for (let i = 0; i < mesh.indices.length; i += 1) if (mesh.indices[i] > maxIndex) maxIndex = mesh.indices[i];
    if (mesh.indices.length && maxIndex >= n) problems.push(`index ${maxIndex} >= vertex count ${n}`);
    if (mesh.indexCount % 3) problems.push('index count not a multiple of 3');
    let covered = 0;
    for (const s of mesh.subsets) {
        if (s.firstIndex + s.indexCount > mesh.indexCount) problems.push('sub-mesh index range out of bounds');
        if (s.firstVertex + s.vertexCount > n) problems.push('sub-mesh vertex range out of bounds');
        if (s.indexCount % 3) problems.push('sub-mesh index count not a multiple of 3');
        covered += s.indexCount;
    }
    if (covered !== mesh.indexCount) problems.push(`sub-meshes cover ${covered} of ${mesh.indexCount} indices`);
    const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i += 1) for (let k = 0; k < 3; k += 1) { const v = mesh.positions[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
    let boxError = 0;
    if (n) for (let k = 0; k < 3; k += 1) boxError = Math.max(boxError, Math.abs(min[k] - mesh.bbox.min[k]), Math.abs(max[k] - mesh.bbox.max[k]));
    return { ok: problems.length === 0, problems, stats: { vertices: n, triangles: mesh.indexCount / 3, min, max, size: max.map((v, k) => v - min[k]), boxError } };
}
