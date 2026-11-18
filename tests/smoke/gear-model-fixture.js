// Public CI must never download the private game models. These plain boxes are
// original test geometry; they exercise WebGL, mounting and disposal only.
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');
const attachments = require('../../data/gear/attachments.json');

function boxGlb(part) {
    const geometry = new THREE.BoxGeometry(...(part ? [0.16, 0.14, 0.28] : [0.12, 0.18, 0.8]));
    const arrays = [geometry.attributes.position.array, geometry.attributes.normal.array, geometry.index.array];
    const chunks = arrays.map((array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    const offsets = [0, chunks[0].length, chunks[0].length + chunks[1].length];
    const binary = Buffer.concat(chunks);
    geometry.computeBoundingBox();
    const gltf = { asset: { version: '2.0', generator: 'VOLT synthetic test boxes' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
        materials: [{ pbrMetallicRoughness: { baseColorFactor: part ? [0.9, 0.15, 0.04, 1] : [0.28, 0.4, 0.55, 1], metallicFactor: 0.2, roughnessFactor: 0.6 } }],
        buffers: [{ byteLength: binary.length }], bufferViews: chunks.map((chunk, i) => ({ buffer: 0, byteOffset: offsets[i], byteLength: chunk.length })),
        accessors: [{ bufferView: 0, componentType: 5126, count: geometry.attributes.position.count, type: 'VEC3', min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() },
            { bufferView: 1, componentType: 5126, count: geometry.attributes.normal.count, type: 'VEC3' }, { bufferView: 2, componentType: 5123, count: geometry.index.count, type: 'SCALAR' }] };
    let json = Buffer.from(JSON.stringify(gltf)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
    const bin = Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)]);
    const result = Buffer.alloc(12 + 8 + json.length + 8 + bin.length);
    result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
    result.writeUInt32LE(json.length, 12); result.writeUInt32LE(0x4e4f534a, 16); json.copy(result, 20);
    result.writeUInt32LE(bin.length, 20 + json.length); result.writeUInt32LE(0x004e4942, 24 + json.length); bin.copy(result, 28 + json.length);
    geometry.dispose(); return result;
}

async function mockPrivateModelsWhenAbsent(page) {
    if (!process.env.VOLT_TEST_SYNTHETIC_MODELS && fs.existsSync(path.resolve(__dirname, '../../assets/models/gear/weapons/behr_rifle_ballistic_01/manifest.json'))) return;
    await page.route('**/assets/models/gear/**', (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.endsWith('.glb')) return route.fulfill({ contentType: 'model/gltf-binary', body: boxGlb(pathname.includes('/parts/')) });
        if (pathname.endsWith('/manifest.json')) {
            const id = pathname.split('/').at(-2);
            const ports = (attachments.weapons[id]?.ports || []).map((port) => ({ name: port.name, kind: port.kind, gameDefault: port.default,
                position: port.kind === 'optics' ? [0, 0.2, 0] : port.kind === 'barrel' ? [0, 0, -0.5] : [0, -0.2, 0], rotation: [0, 0, 0, 1] }));
            return route.fulfill({ json: { weapon: { body: [{ file: `assets/models/gear/weapons/${id}/body_lod0.glb`, lod: 0 }], defaultLod: 0 }, ports } });
        }
        return route.fulfill({ status: 404, body: 'Synthetic fixture has no textures' });
    });
}
module.exports = { mockPrivateModelsWhenAbsent };
