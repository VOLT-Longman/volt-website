/**
 * glb.mjs — binary glTF 2.0 writer for the gear model export (from the modding-screen prototype's poc/lib/glb.mjs,
 * itself a re-write of the geometry study's to-glb.mjs): several models in one file, each under its own placement node; real materials
 * (constants + external textures); optional KHR_mesh_quantization (int16 positions, int8 normals, uint16 uvs).
 *
 * Conventions (unchanged from to-glb.mjs):
 *   engine space is right-handed Z-up (X right, Y forward = muzzle); output is Y-up via (x, y, z) -> (x, z, -y),
 *   a pure rotation, so winding is unchanged; units are metres; the muzzle points to -Z.
 *   One glTF node per engine node (helpers stay as empty nodes), one primitive per kept sub-mesh.
 */
import { ownerNode } from './ivo.mjs';

const FLOAT = 5126; const USHORT = 5123; const UINT = 5125; const SHORT = 5122; const BYTE = 5120;
const ARRAY_BUFFER = 34962; const ELEMENT_ARRAY_BUFFER = 34963;

/** engine 3x4 row-major [R|t] -> glTF column-major 4x4 in Y-up space */
function nodeMatrix(m) {
    const R = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]]; const t = [m[3], m[7], m[11]];
    const T = [[1, 0, 0], [0, 0, 1], [0, -1, 0]]; const Tt = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
    const mul = (A, B) => A.map((row) => [0, 1, 2].map((c) => row[0] * B[0][c] + row[1] * B[1][c] + row[2] * B[2][c]));
    const R2 = mul(mul(T, R), Tt); const t2 = [t[0], t[2], -t[1]];
    return [R2[0][0], R2[1][0], R2[2][0], 0, R2[0][1], R2[1][1], R2[2][1], 0, R2[0][2], R2[1][2], R2[2][2], 0, t2[0], t2[1], t2[2], 1];
}
const isIdentity = (m) => m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-7);
/** engine position / quaternion -> Y-up (same swap for the quaternion's vector part; the swap is a proper rotation) */
export const toYUp = (v) => [v[0], v[2], -v[1]];
export const quatToYUp = (q) => [q[0], q[2], -q[1], q[3]];

export class GlbBuilder {
    constructor(name, { quantize = false, texturePrefix = '' } = {}) {
        this.name = name; this.quantize = quantize; this.texturePrefix = texturePrefix;   // texturePrefix: path from the .glb's folder to the texture folder
        this.parts = []; this.length = 0; this.bufferViews = []; this.accessors = []; this.meshes = []; this.nodes = []; this.roots = [];
        this.materials = []; this.materialKeys = new Map(); this.images = []; this.textures = []; this.textureKeys = new Map(); this.samplers = [];
        this.stats = { triangles: 0, vertices: 0, primitives: 0, skipped: [], models: [] };
    }

    addView(typed, target, stride) {
        const pad = (4 - (this.length % 4)) % 4;
        if (pad) { this.parts.push(Buffer.alloc(pad)); this.length += pad; }
        const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
        const view = { buffer: 0, byteOffset: this.length, byteLength: bytes.length, target };
        if (stride) view.byteStride = stride;
        this.parts.push(bytes); this.length += bytes.length; this.bufferViews.push(view);
        return this.bufferViews.length - 1;
    }

    /** external image (same-origin file next to the .glb) -> texture index. repeat: tiling texture */
    texture(file, { repeat = false } = {}) {
        const uri = this.texturePrefix + file;
        const key = `${uri}|${repeat}`;
        if (this.textureKeys.has(key)) return this.textureKeys.get(key);
        let image = this.images.findIndex((i) => i.uri === uri);
        const webp = uri.toLowerCase().endsWith('.webp');
        if (image < 0) { this.images.push(webp ? { uri, mimeType: 'image/webp' } : { uri }); image = this.images.length - 1; }
        const wrap = repeat ? 10497 : 33071;
        let sampler = this.samplers.findIndex((s) => s.wrapS === wrap);
        if (sampler < 0) { this.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: wrap, wrapT: wrap }); sampler = this.samplers.length - 1; }
        // WebP is not a core glTF image type: it goes through the EXT_texture_webp extension (no PNG fallback is shipped)
        if (webp) { this.textures.push({ sampler, extensions: { EXT_texture_webp: { source: image } } }); this.usesWebp = true; } else this.textures.push({ source: image, sampler });
        this.textureKeys.set(key, this.textures.length - 1);
        return this.textures.length - 1;
    }

    material(key, json) {
        if (this.materialKeys.has(key)) return this.materialKeys.get(key);
        this.materials.push(json); this.materialKeys.set(key, this.materials.length - 1);
        return this.materials.length - 1;
    }

    /**
     * Adds one decoded model.
     *   mesh, structure : from ivo.mjs (parseMesh / parseStructure)
     *   materialOf(subset, index) -> material index, or -1 to leave the sub-mesh out
     *   placement : { position, rotation } in ENGINE space (attachment bone of the .cdf), or null
     */
    addModel({ name, mesh, structure = null, materialOf, placement = null, extras = null }) {
        const kept = [];
        mesh.subsets.forEach((subset, index) => {
            if (!subset.indexCount || !subset.vertexCount) return;
            const material = materialOf(subset, index);
            if (material < 0) { this.stats.skipped.push({ model: name, subset: index, materialId: subset.materialId, triangles: subset.indexCount / 3 }); return; }
            kept.push({ subset, index, material });
        });
        // ---- compact vertex data of the kept sub-meshes, in Y-up space
        const n = kept.reduce((a, k) => a + k.subset.vertexCount, 0);
        const pos = new Float32Array(n * 3); const nrm = mesh.normals ? new Float32Array(n * 3) : null; const uv = mesh.uvs ? new Float32Array(n * 2) : null;
        let cursor = 0; let wide = false; let indexTotal = 0;
        for (const k of kept) {
            const s = k.subset; k.vertexOffset = cursor;
            for (let i = 0; i < s.vertexCount; i += 1) {
                const src = s.firstVertex + i; const dst = cursor + i;
                pos[dst * 3] = mesh.positions[src * 3]; pos[dst * 3 + 1] = mesh.positions[src * 3 + 2]; pos[dst * 3 + 2] = -mesh.positions[src * 3 + 1];
                if (nrm) { nrm[dst * 3] = mesh.normals[src * 3]; nrm[dst * 3 + 1] = mesh.normals[src * 3 + 2]; nrm[dst * 3 + 2] = -mesh.normals[src * 3 + 1]; }
                if (uv) { uv[dst * 2] = mesh.uvs[src * 2]; uv[dst * 2 + 1] = mesh.uvs[src * 2 + 1]; }
            }
            cursor += s.vertexCount; indexTotal += s.indexCount; if (s.vertexCount > 65535) wide = true;
        }
        const indexData = wide ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal);
        cursor = 0;
        for (const k of kept) {
            const s = k.subset; k.indexOffset = cursor;
            for (let i = 0; i < s.indexCount; i += 1) {
                const local = mesh.indices[s.firstIndex + i] - s.firstVertex;
                if (local < 0 || local >= s.vertexCount) throw new Error(`${name} sub-mesh ${k.index}: index outside its vertex range`);
                indexData[cursor + i] = local;
            }
            cursor += s.indexCount;
        }
        const viewIndices = kept.length ? this.addView(indexData, ELEMENT_ARRAY_BUFFER) : -1;

        // ---- vertex buffers: plain float32, or quantised (KHR_mesh_quantization)
        let viewPos = -1; let viewNrm = -1; let viewUv = -1; let posStride = 12; let nrmStride = 12;
        let dequant = null; let qpos = null; let uvQuantised = false;
        if (kept.length && this.quantize) {
            const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
            for (let i = 0; i < n; i += 1) for (let c = 0; c < 3; c += 1) { const v = pos[i * 3 + c]; if (v < min[c]) min[c] = v; if (v > max[c]) max[c] = v; }
            const centre = min.map((v, c) => (v + max[c]) / 2); const half = Math.max(...max.map((v, c) => (v - min[c]) / 2), 1e-6);   // uniform scale keeps normals exact
            qpos = new Int16Array(n * 4);
            for (let i = 0; i < n; i += 1) for (let c = 0; c < 3; c += 1) qpos[i * 4 + c] = Math.max(-32767, Math.min(32767, Math.round(((pos[i * 3 + c] - centre[c]) / half) * 32767)));
            viewPos = this.addView(qpos, ARRAY_BUFFER, 8); posStride = 8; dequant = { centre, half };
            if (nrm) {
                const q = new Int8Array(n * 4);
                for (let i = 0; i < n; i += 1) for (let c = 0; c < 3; c += 1) q[i * 4 + c] = Math.max(-127, Math.min(127, Math.round(nrm[i * 3 + c] * 127)));
                viewNrm = this.addView(q, ARRAY_BUFFER, 4); nrmStride = 4;
            }
            if (uv) {
                let inRange = true; for (let i = 0; i < uv.length; i += 1) if (!(uv[i] >= 0 && uv[i] <= 1)) { inRange = false; break; }
                if (inRange) { const q = new Uint16Array(n * 2); for (let i = 0; i < uv.length; i += 1) q[i] = Math.round(uv[i] * 65535); viewUv = this.addView(q, ARRAY_BUFFER, 4); uvQuantised = true; } else viewUv = this.addView(uv, ARRAY_BUFFER, 8);
            }
        } else if (kept.length) {
            viewPos = this.addView(pos, ARRAY_BUFFER, 12);
            if (nrm) viewNrm = this.addView(nrm, ARRAY_BUFFER, 12);
            if (uv) viewUv = this.addView(uv, ARRAY_BUFFER, 8);
        }

        // ---- accessors + primitives grouped by owning node
        const primitivesByNode = new Map(); let triangles = 0;
        for (const k of kept) {
            const s = k.subset; const o = k.vertexOffset;
            const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
            for (let v = o; v < o + s.vertexCount; v += 1) for (let c = 0; c < 3; c += 1) { const x = qpos ? qpos[v * 4 + c] : pos[v * 3 + c]; if (x < min[c]) min[c] = x; if (x > max[c]) max[c] = x; }
            const attributes = {};
            this.accessors.push(qpos ? { bufferView: viewPos, byteOffset: o * posStride, componentType: SHORT, normalized: true, count: s.vertexCount, type: 'VEC3', min, max } : { bufferView: viewPos, byteOffset: o * posStride, componentType: FLOAT, count: s.vertexCount, type: 'VEC3', min, max });
            attributes.POSITION = this.accessors.length - 1;
            if (viewNrm >= 0) { this.accessors.push(nrmStride === 4 ? { bufferView: viewNrm, byteOffset: o * 4, componentType: BYTE, normalized: true, count: s.vertexCount, type: 'VEC3' } : { bufferView: viewNrm, byteOffset: o * 12, componentType: FLOAT, count: s.vertexCount, type: 'VEC3' }); attributes.NORMAL = this.accessors.length - 1; }
            if (viewUv >= 0) { this.accessors.push(uvQuantised ? { bufferView: viewUv, byteOffset: o * 4, componentType: USHORT, normalized: true, count: s.vertexCount, type: 'VEC2' } : { bufferView: viewUv, byteOffset: o * 8, componentType: FLOAT, count: s.vertexCount, type: 'VEC2' }); attributes.TEXCOORD_0 = this.accessors.length - 1; }
            this.accessors.push({ bufferView: viewIndices, byteOffset: k.indexOffset * (wide ? 4 : 2), componentType: wide ? UINT : USHORT, count: s.indexCount, type: 'SCALAR' });
            const primitive = { attributes, indices: this.accessors.length - 1, material: k.material, mode: 4 };
            const owner = ownerNode(structure, s);                         // -1 = already in model space
            if (!primitivesByNode.has(owner)) primitivesByNode.set(owner, []);
            primitivesByNode.get(owner).push(primitive);
            triangles += s.indexCount / 3;
        }

        // ---- nodes
        const first = this.nodes.length; const localRoots = [];
        const attachMesh = (node, owner, label) => {
            const primitives = primitivesByNode.get(owner); if (!primitives) return;
            this.meshes.push({ name: label, primitives });
            if (!dequant) { node.mesh = this.meshes.length - 1; return; }
            // quantised vertices live in a child node that carries the de-quantisation transform
            this.nodes.push({ name: `${label}_q`, mesh: this.meshes.length - 1, translation: dequant.centre, scale: [dequant.half, dequant.half, dequant.half] });
            if (!node.children) node.children = [];
            node.children.push(this.nodes.length - 1);
        };
        if (structure?.nodes?.length) {
            const map = structure.nodes.map((node, i) => {
                const out = { name: node.name || `node_${i}` };
                const matrix = nodeMatrix(node.boneToWorld);              // matrix at +48 = node -> parent
                if (!isIdentity(matrix)) out.matrix = matrix;
                if (node.geometryType !== 0) out.extras = { helper: true };
                this.nodes.push(out); return this.nodes.length - 1;
            });
            structure.nodes.forEach((node, i) => { attachMesh(this.nodes[map[i]], i, node.name || `node_${i}`); });
            structure.nodes.forEach((node, i) => {
                if (node.parent >= 0 && node.parent < structure.nodes.length && node.parent !== i) { const parent = this.nodes[map[node.parent]]; if (!parent.children) parent.children = []; parent.children.push(map[i]); } else localRoots.push(map[i]);
            });
        }
        if (primitivesByNode.has(-1) || this.nodes.length === first) {
            const out = { name: `${name}_mesh` };
            this.nodes.push(out); const at = this.nodes.length - 1;
            attachMesh(out, -1, out.name); localRoots.push(at);
        }
        // ---- placement node
        const holder = { name, children: localRoots };
        if (extras) holder.extras = extras;
        if (placement) {
            const t = toYUp(placement.position); const q = quatToYUp(placement.rotation);
            if (t.some((v) => Math.abs(v) > 1e-9)) holder.translation = t;
            if (Math.abs(q[3]) < 1 - 1e-9) holder.rotation = q;
        }
        this.nodes.push(holder); this.roots.push(this.nodes.length - 1);
        this.stats.triangles += triangles; this.stats.vertices += n; this.stats.primitives += kept.length;
        this.stats.models.push({ name, triangles, vertices: n, primitives: kept.length, sourceTriangles: mesh.indexCount / 3, quantised: !!dequant, uvQuantised });
        return { triangles, vertices: n };
    }

    finish(extras = {}) {
        const pad = (4 - (this.length % 4)) % 4;
        if (pad) { this.parts.push(Buffer.alloc(pad)); this.length += pad; }
        const bin = Buffer.concat(this.parts, this.length);
        const json = { asset: { version: '2.0', generator: 'VOLT scripts/gear/export-models.mjs' }, scene: 0, scenes: [{ name: this.name, nodes: this.roots }], nodes: this.nodes };
        const extensions = [...(this.quantize ? ['KHR_mesh_quantization'] : []), ...(this.usesWebp ? ['EXT_texture_webp'] : [])];
        if (extensions.length) { json.extensionsUsed = extensions; json.extensionsRequired = extensions; }
        if (this.meshes.length) json.meshes = this.meshes;
        if (this.materials.length) json.materials = this.materials;
        if (this.textures.length) { json.textures = this.textures; json.images = this.images; json.samplers = this.samplers; }
        if (this.accessors.length) { json.accessors = this.accessors; json.bufferViews = this.bufferViews; json.buffers = [{ byteLength: bin.length }]; }
        json.extras = { source: this.name, units: 'metres', upAxis: 'Y', engineAxes: 'engine (x,y,z) -> gltf (x,z,-y)', ...extras };
        let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
        const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
        if (jsonPad) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
        const hasBin = this.accessors.length > 0;
        const total = 12 + 8 + jsonBytes.length + (hasBin ? 8 + bin.length : 0);
        const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
        const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonBytes.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
        const chunks = [header, jsonHeader, jsonBytes];
        if (hasBin) { const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4); chunks.push(binHeader, bin); }
        return { glb: Buffer.concat(chunks, total), json, stats: { ...this.stats, bytes: total } };
    }
}

/**
 * Independent read-back of a .glb written above: walks the scene, applies node transforms and returns model-space
 * triangles in ENGINE space plus counts. Used to verify the writer (bounding box, quantisation error).
 */
export function readGlbBack(glb, { collect = false } = {}) {
    if (glb.toString('latin1', 0, 4) !== 'glTF') throw new Error('not a GLB');
    const jsonLength = glb.readUInt32LE(12); const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
    const bin = glb.subarray(20 + jsonLength + 8);
    const read = (i) => {
        const a = json.accessors[i]; const view = json.bufferViews[a.bufferView]; const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
        const size = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 }[a.componentType]; const stride = view.byteStride || comps * size; const base = (view.byteOffset || 0) + (a.byteOffset || 0);
        const out = new Float64Array(a.count * comps);
        for (let k = 0; k < a.count; k += 1) for (let c = 0; c < comps; c += 1) {
            const o = base + k * stride + c * size; let v;
            switch (a.componentType) { case 5126: v = bin.readFloatLE(o); break; case 5125: v = bin.readUInt32LE(o); break; case 5123: v = bin.readUInt16LE(o); if (a.normalized) v /= 65535; break; case 5122: v = bin.readInt16LE(o); if (a.normalized) v = Math.max(v / 32767, -1); break; case 5121: v = bin[o]; if (a.normalized) v /= 255; break; default: v = bin.readInt8(o); if (a.normalized) v = Math.max(v / 127, -1); }
            out[k * comps + c] = v;
        }
        return out;
    };
    const mul = (a, m) => { const r = new Array(16); for (let c = 0; c < 4; c += 1) for (let rr = 0; rr < 4; rr += 1) { let s = 0; for (let k = 0; k < 4; k += 1) s += a[k * 4 + rr] * m[c * 4 + k]; r[c * 4 + rr] = s; } return r; };
    const local = (node) => {
        if (node.matrix) return node.matrix;
        const t = node.translation || [0, 0, 0]; const [x, y, z, w] = node.rotation || [0, 0, 0, 1]; const s = node.scale || [1, 1, 1];
        return [(1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0], 0, (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1], 0, (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1];
    };
    const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity]; let triangles = 0; let vertices = 0; const helpers = {};
    const positions = []; const normals = [];      // only when collect: every vertex in traversal order, engine space
    const walk = (index, parent) => {
        const node = json.nodes[index]; const m = mul(parent, local(node));
        if (node.extras?.helper) helpers[node.name] = [m[12], -m[14], m[13]];
        if (node.mesh !== undefined) for (const prim of json.meshes[node.mesh].primitives) {
            const p = read(prim.attributes.POSITION); vertices += p.length / 3; triangles += json.accessors[prim.indices].count / 3;
            for (let i = 0; i < p.length; i += 3) {
                const gx = m[0] * p[i] + m[4] * p[i + 1] + m[8] * p[i + 2] + m[12]; const gy = m[1] * p[i] + m[5] * p[i + 1] + m[9] * p[i + 2] + m[13]; const gz = m[2] * p[i] + m[6] * p[i + 1] + m[10] * p[i + 2] + m[14];
                const e = [gx, -gz, gy];   // glTF (x, y-up, z) -> engine (x, -z, y)
                for (let c = 0; c < 3; c += 1) { if (e[c] < min[c]) min[c] = e[c]; if (e[c] > max[c]) max[c] = e[c]; }
                if (collect) positions.push(e[0], e[1], e[2]);
            }
            if (collect && prim.attributes.NORMAL !== undefined) {
                const q = read(prim.attributes.NORMAL);   // direction only; the writer uses uniform scale, so the 3x3 part is enough
                for (let i = 0; i < q.length; i += 3) {
                    const nx = m[0] * q[i] + m[4] * q[i + 1] + m[8] * q[i + 2]; const ny = m[1] * q[i] + m[5] * q[i + 1] + m[9] * q[i + 2]; const nz = m[2] * q[i] + m[6] * q[i + 1] + m[10] * q[i + 2];
                    const len = Math.hypot(nx, ny, nz) || 1; normals.push(nx / len, -nz / len, ny / len);
                }
            }
        }
        for (const child of node.children || []) walk(child, m);
    };
    for (const root of json.scenes[json.scene || 0].nodes) walk(root, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return { json, triangles, vertices, min, max, helpers, positions, normals };
}

/** largest position difference (metres) and largest normal angle (degrees) between two read-backs of the same model */
export function compareReadBacks(a, b) {
    if (a.positions.length !== b.positions.length) return { comparable: false };
    let maxPos = 0; let maxAngle = 0;
    for (let i = 0; i < a.positions.length; i += 3) maxPos = Math.max(maxPos, Math.hypot(a.positions[i] - b.positions[i], a.positions[i + 1] - b.positions[i + 1], a.positions[i + 2] - b.positions[i + 2]));
    for (let i = 0; i + 2 < Math.min(a.normals.length, b.normals.length); i += 3) { const dot = Math.max(-1, Math.min(1, a.normals[i] * b.normals[i] + a.normals[i + 1] * b.normals[i + 1] + a.normals[i + 2] * b.normals[i + 2])); maxAngle = Math.max(maxAngle, Math.acos(dot) * 180 / Math.PI); }
    return { comparable: true, vertices: a.positions.length / 3, maxPositionError: maxPos, maxNormalAngle: maxAngle };
}
