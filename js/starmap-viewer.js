/**
 * VOLT 성계지도 — 3D 화면 (ES 모듈)
 *
 * js/starmap.js 가 함대원 확인을 통과한 뒤에만 import() 한다. 이 파일이 three.js(assets/vendor/three-0.187.0)를 끌어온다.
 * 자료 계약: docs/starmap-data.md · 그림 계약: docs/starmap-assets.md · 화면 설명: docs/starmap.md
 *
 * 그리는 규칙 (화면에도 "거리는 줄여서 그렸습니다"라고 적는다)
 *   1. 항성 둘레: 항성에서 행성·정거장·점프 포인트까지는 실제 비율 그대로다 (가장 먼 곳 = 1000 단위). 높이(z)도 그대로.
 *   2. 천체는 실제보다 크게 그린다 (반지름 = 0.9 × (실제 반지름 / 250 km)^0.45 단위).
 *   3. 천체 둘레(위성·궤도 정거장·표면 장소)는 방향은 그대로 두고 거리만 다시 잰다:
 *      그린 거리 = 그린 반지름 × (실제 거리 / 실제 반지름)^0.45. 표면 장소는 구 위에 놓인다.
 *      50만 km 밖은 그 지점부터 다시 실제 비율로 이어 붙인다.
 *   4. 아무것도 움직이지 않는다. 게임 파일에 궤도 운동이 없다. 궤도 원은 안내선일 뿐이다.
 *   5. 멀리서 보면 천체가 점보다 작아지므로 화면에서 최소 크기를 지킨다(그때 그 천체의 둘레 장소는 숨긴다).
 *
 * 손가락·마우스: 이름표는 누르기를 직접 받지 않는다(pointer-events: none). 모든 누르기·끌기·벌리기는 캔버스에서 시작해
 *   OrbitControls 로 가고, 짧게 누른 자리가 이름표 위면 그 장소를 고른다(pickAt). 이름표에서 시작한 끌기가 페이지를 움직이지 않게 하려는 것이다.
 *
 * 좌표: 게임 (x, y, z)  →  three.js (x, z, -y). 그림은 SphereGeometry 를 y 축으로 -90도 돌려 입힌다(게임 구 모형과 같은 이음매).
 *
 * 공개:
 *   isSupported()                      WebGL2 를 쓸 수 있는지
 *   createViewer(host, options)        → viewer
 *     options: { onPick(id), onTextureError(), onContextLost(), label(object) → { text, sub } }
 *   viewer.load({ system, reachM, starColor, textures })   항성계 하나를 올린다 (이전 것은 버린다)
 *   viewer.update(state)               선택·표시·경로·거르기 상태를 반영한다 (아래 update 참조)
 *   viewer.focus(id, { instant })      그곳으로 카메라를 옮긴다. id 가 없으면 전체 보기
 *   viewer.zoomBy(factor) · viewer.stats() · viewer.screenOf(id) · viewer.dispose()
 */
import * as THREE from '../assets/vendor/three-0.187.0/build/three.module.js';
import { OrbitControls } from '../assets/vendor/three-0.187.0/examples/jsm/controls/OrbitControls.js';

const UNITS = 1000;
const ZONE_M = 5e8;
const ZONE_POW = 0.45;
const FOV = 40;
const MAX_PIXEL_RATIO = 2;
const FLY_MS = 650;
const BODY_KINDS = ['star', 'planet', 'moon'];
const MIN_ZOOM_RADII = 2.5;   // 고른 천체에 가장 가까이 갈 수 있는 거리(그린 반지름의 배수). 이보다 가까우면 구가 화면을 넘친다.

// 표시 모양: 0 동그라미 · 1 마름모 · 2 네모 · 3 고리
const STYLE = {
    station: { shape: 1, color: 0x7fd3ff, size: 13, prio: 300 },
    city: { shape: 2, color: 0xffd166, size: 13, prio: 380 },
    outpost: { shape: 0, color: 0xd5dbe3, size: 8, prio: 150 },
    poi: { shape: 0, color: 0xb9a0ff, size: 8, prio: 180 },
    lagrange: { shape: 3, color: 0x93a0b5, size: 10, prio: 200 },
    jump: { shape: 3, color: 0xff8a5c, size: 19, prio: 400 },
    asteroid: { shape: 0, color: 0xa08a70, size: 6, prio: 100 },
    nav: { shape: 0, color: 0x93a0b5, size: 7, prio: 90 },
    anomaly: { shape: 3, color: 0xb9a0ff, size: 10, prio: 90 },
    other: { shape: 0, color: 0x93a0b5, size: 7, prio: 80 },
};
const MARK_COLOR = 0xffd23f;
const ROUTE_COLOR = 0xff6a4d;
const PLAIN_GLOBE = 0x5d6878;

const VERTEX = `
attribute float size; attribute vec3 tint; attribute float shape; attribute float alpha;
uniform float ratio;
varying vec3 vTint; varying float vShape; varying float vAlpha;
void main() {
    vTint = tint; vShape = shape; vAlpha = alpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * ratio;
}`;
const FRAGMENT = `
varying vec3 vTint; varying float vShape; varying float vAlpha;
void main() {
    if (vAlpha <= 0.0) discard;
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = length(p);
    if (vShape > 0.5 && vShape < 1.5) d = abs(p.x) + abs(p.y);
    else if (vShape > 1.5 && vShape < 2.5) d = max(abs(p.x), abs(p.y)) * 1.12;
    float edge = 1.0 - smoothstep(0.84, 1.0, d);
    if (edge <= 0.0) discard;
    float fill = 1.0 - smoothstep(0.56, 0.7, d);
    vec3 c = mix(vec3(0.02, 0.03, 0.05), vTint, fill);
    float a = edge * vAlpha;
    if (vShape > 2.5) { c = vTint; a *= smoothstep(0.42, 0.56, d); }
    gl_FragColor = vec4(c, a);
}`;

let supportCache = null;

/** WebGL2 를 쓸 수 있는지. 확인용 컨텍스트는 바로 놓아 준다. */
export function isSupported() {
    if (supportCache !== null) return supportCache;
    try {
        if (typeof WebGL2RenderingContext === 'undefined') { supportCache = false; return false; }
        const gl = document.createElement('canvas').getContext('webgl2');
        supportCache = !!gl;
        if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (_error) {
        supportCache = false;
    }
    return supportCache;
}

const toThree = (p, out) => (out || new THREE.Vector3()).set(p[0], p[2], -p[1]);
const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

function drawRadius(object, unitsPerMetre) {
    if (object.kind === 'star') return Math.min(12, Math.max(6, (object.r || 0) * unitsPerMetre));
    if (!(object.r > 0)) return object.kind === 'planet' ? 1.6 : 0.9;
    return 0.9 * (object.r / 250000) ** ZONE_POW;
}

// 천체 둘레에서 실제 거리(m) → 그린 거리(단위). 표면 = 그린 반지름.
function zoneDistance(metres, bodyRadiusM, bodyDrawRadius, unitsPerMetre) {
    const radius = bodyRadiusM > 0 ? bodyRadiusM : 1e6;
    if (metres <= ZONE_M) return bodyDrawRadius * Math.max(1.03, (Math.max(metres, radius) / radius) ** ZONE_POW);
    return bodyDrawRadius * (ZONE_M / radius) ** ZONE_POW + (metres - ZONE_M) * unitsPerMetre;
}

// 항성계 하나의 그릴 자리를 계산한다. three.js 장면과 무관한 순수 계산.
function buildLayout(system, reachM) {
    const unitsPerMetre = UNITS / reachM;
    const byId = new Map(system.objects.map((object) => [object.id, object]));
    const nodes = new Map();
    const up = new THREE.Vector3(0, 1, 0);

    function anchorOf(object) {
        if (object.body && nodes.has(object.body) && object.body !== object.id) return nodes.get(object.body);
        let parent = byId.get(object.parent);
        while (parent && !(parent.kind === 'planet' || parent.kind === 'moon')) parent = byId.get(parent.parent);
        return parent && parent.id !== object.id ? nodes.get(parent.id) || null : null;
    }
    function placeAt(pos, anchor, onSurface) {
        if (!anchor) return toThree(pos).multiplyScalar(unitsPerMetre);
        const offset = [pos[0] - anchor.o.pos[0], pos[1] - anchor.o.pos[1], pos[2] - anchor.o.pos[2]];
        const metres = Math.hypot(offset[0], offset[1], offset[2]);
        const direction = metres > 0 ? toThree(offset).multiplyScalar(1 / metres) : up.clone();
        const drawn = onSurface ? anchor.rd * 1.012 : zoneDistance(metres, anchor.o.r, anchor.rd, unitsPerMetre);
        return direction.multiplyScalar(drawn).add(anchor.p);
    }
    function add(object) {
        if (!object.pos || nodes.has(object.id)) return;
        const anchor = anchorOf(object);
        const node = { id: object.id, o: object, kind: object.kind, anchor, isBody: BODY_KINDS.includes(object.kind), rd: 0, p: null };
        if (node.isBody) node.rd = drawRadius(object, unitsPerMetre);
        node.p = placeAt(object.pos, anchor, object.surf === 1);
        nodes.set(object.id, node);
    }
    // 천체를 먼저(부모가 앞에 오는 자료 순서 그대로), 그다음 나머지.
    system.objects.filter((object) => BODY_KINDS.includes(object.kind)).forEach(add);
    system.objects.forEach(add);

    // 천체가 계 좌표에서 얼마나 돌아가 있는지(z 축 기준)를 표면 장소의 두 좌표(pos, rel)에서 구한다.
    for (const node of nodes.values()) {
        if (node.isBody || !node.o.rel || !node.anchor || node.anchor.id !== node.o.body) continue;
        const body = node.anchor;
        const rel = node.o.rel;
        const flat = Math.hypot(rel[0], rel[1]);
        if (flat <= (body.yawWeight || 0)) continue;
        body.yawWeight = flat;
        body.yaw = Math.atan2(node.o.pos[1] - body.o.pos[1], node.o.pos[0] - body.o.pos[0]) - Math.atan2(rel[1], rel[0]);
    }
    return { nodes, unitsPerMetre, placeAt, byId };
}

function makeGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function circlePoints(center, radius, axisU, axisV, segments = 128) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(center.clone().addScaledVector(axisU, Math.cos(angle) * radius).addScaledVector(axisV, Math.sin(angle) * radius));
    }
    return points;
}

export function createViewer(host, options = {}) {
    if (!host) throw new Error('createViewer needs a host element');
    const reducedMotion = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

    const canvas = document.createElement('canvas');
    canvas.className = 'starmap-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    lines.setAttribute('class', 'starmap-lines');
    lines.setAttribute('aria-hidden', 'true');
    const overlay = document.createElement('div');
    overlay.className = 'starmap-labels';
    overlay.setAttribute('aria-hidden', 'true');
    const ring = document.createElement('div');
    ring.className = 'starmap-ring';
    ring.hidden = true;
    overlay.append(ring);
    host.append(canvas, lines, overlay);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20000);
    camera.position.set(0, 1800, 2200);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.zoomSpeed = 1.1;
    controls.rotateSpeed = 0.7;
    controls.minDistance = 2;
    controls.maxDistance = 9000;
    // 낮·밤을 실제처럼 보이려는 것이 아니다(아무것도 돌지 않는다). 입체감만 주고 어두운 쪽 장소도 읽히게 둔다.
    scene.add(new THREE.AmbientLight(0xffffff, 3.3));
    const sun = new THREE.PointLight(0xffffff, 1.9, 0, 0);
    scene.add(sun);

    const unitSphere = new THREE.SphereGeometry(1, 48, 24);
    const glowTexture = makeGlowTexture();
    const markerMaterial = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { ratio: { value: 1 } }, transparent: true, depthWrite: false });
    const pinMaterial = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: markerMaterial.uniforms, transparent: true, depthWrite: false, depthTest: false });
    const guideMaterial = new THREE.LineBasicMaterial({ color: 0x8fa3bf, transparent: true, opacity: 0.3, depthWrite: false });
    const stemMaterial = new THREE.LineBasicMaterial({ color: 0x8fa3bf, transparent: true, opacity: 0.22, depthWrite: false });
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xc9b089, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
    const ringHotMaterial = new THREE.MeshBasicMaterial({ color: MARK_COLOR, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
    const bandMaterial = new THREE.LineDashedMaterial({ color: 0xc9b089, transparent: true, opacity: 0.6, dashSize: 6, gapSize: 5, depthWrite: false });
    const bandHotMaterial = new THREE.LineDashedMaterial({ color: MARK_COLOR, transparent: true, opacity: 0.95, dashSize: 6, gapSize: 5, depthWrite: false });
    const loader = new THREE.TextureLoader();
    // 받은 그림 파일은 이 지도가 열려 있는 동안 메모리에 둔다(압축된 채로, 512 는 전부 · 1k 는 최근 몇 장).
    // 서버는 그림을 브라우저에 저장하지 못하게 내려 주므로(로그아웃 뒤에 남지 않게), 이렇게 하지 않으면 항성계를 오갈 때마다 다시 받는다.
    const blobs = new Map();
    const BLOB_1K_LIMIT = 4;
    const canBitmap = typeof createImageBitmap === 'function' && typeof fetch === 'function';
    function fetchBlob(url, sizeKey) {
        if (blobs.has(url)) return blobs.get(url).promise;
        const entry = { sizeKey, promise: fetch(url, { credentials: 'same-origin' }).then((response) => { if (!response.ok) throw new Error(`texture ${response.status}`); return response.blob(); }) };
        entry.promise.catch(() => { if (blobs.get(url) === entry) blobs.delete(url); });
        blobs.set(url, entry);
        const big = [...blobs].filter(([, item]) => item.sizeKey === '1k');
        for (const [key] of big.slice(0, Math.max(0, big.length - BLOB_1K_LIMIT))) blobs.delete(key);
        return entry.promise;
    }
    function loadImageTexture(url, sizeKey) {
        if (!canBitmap) return loader.loadAsync(url);
        // ImageBitmap 은 올릴 때 뒤집을 수 없으므로 만들 때 뒤집는다 (TextureLoader 의 flipY 와 같은 결과).
        return fetchBlob(url, sizeKey).then((blob) => createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })).then((bitmap) => {
            const texture = new THREE.Texture(bitmap);
            texture.flipY = false;
            texture.needsUpdate = true;
            texture.addEventListener('dispose', () => bitmap.close?.());
            return texture;
        });
    }

    const size = { w: 1, h: 1 };
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    const measure = document.createElement('canvas').getContext('2d');
    const widths = new Map();
    let world = null;          // 지금 올라와 있는 항성계
    let state = { selected: null, marks: [], stops: [], paths: [], spots: [], rings: [], filter: {} };
    let generation = 0;
    let disposed = false;
    let dirty = false;
    let frameId = 0;
    let flight = null;
    let onScreen = true;
    let hoverId = null;
    let frames = 0;
    let textureErrorSent = false;
    const labelPool = new Map();
    const labelBoxes = [];     // 지금 화면에 놓인 장소 이름표의 자리 (누른 자리가 이름표 위인지 볼 때 쓴다)
    const stopPool = [];

    // ── 장면 만들기 ────────────────────────────────────────────────────────
    function clearWorld() {
        if (!world) return;
        scene.remove(world.root);
        world.root.traverse((node) => {
            if (node.geometry && node.geometry !== unitSphere) node.geometry.dispose();
            const material = node.material;
            if (material && ![markerMaterial, pinMaterial, guideMaterial, stemMaterial, ringMaterial, ringHotMaterial, bandMaterial, bandHotMaterial].includes(material)) {
                if (material.map && material.map !== glowTexture) material.map.dispose();
                material.dispose();
            }
        });
        for (const body of world.bodies) { body.tex512?.dispose(); body.tex1k?.dispose(); }
        world = null;
    }

    function pointsFor(items, material) {
        const geometry = new THREE.BufferGeometry();
        const count = items.length;
        const position = new Float32Array(count * 3);
        items.forEach((item, index) => { position[index * 3] = item.p.x; position[index * 3 + 1] = item.p.y; position[index * 3 + 2] = item.p.z; });
        geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
        geometry.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array(count), 1));
        geometry.setAttribute('shape', new THREE.BufferAttribute(new Float32Array(count), 1));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(count), 1));
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        return points;
    }

    function load(input) {
        generation++;
        clearWorld();
        flight = null;
        const layout = buildLayout(input.system, input.reachM);
        const root = new THREE.Group();
        const bodies = [];
        const groups = new Map();
        const guides = [];
        const regions = [];

        for (const node of layout.nodes.values()) {
            if (node.isBody) {
                const group = new THREE.Group();
                group.position.copy(node.p);
                let mesh;
                if (node.kind === 'star') {
                    const colour = new THREE.Color().setRGB(...(input.starColor || [1, 0.49, 0.17]), THREE.LinearSRGBColorSpace);
                    mesh = new THREE.Mesh(unitSphere, new THREE.MeshBasicMaterial({ color: colour }));
                    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: colour, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
                    glow.scale.setScalar(7);
                    group.add(glow);
                } else {
                    mesh = new THREE.Mesh(unitSphere, new THREE.MeshLambertMaterial({ color: PLAIN_GLOBE }));
                    mesh.rotation.y = -Math.PI / 2;      // 그림 이음매를 게임 구 모형과 같은 자리에 (docs/starmap-assets.md)
                    group.rotation.y = node.yaw || 0;    // 천체가 계 좌표에서 돌아가 있는 만큼
                }
                group.add(mesh);
                root.add(group);
                Object.assign(node, { group, mesh, scale: 1, px: 0, px0: 0, shown: true, zoneOn: false, tex512: null, tex1k: null, texState: '' });
                bodies.push(node);
                continue;
            }
            const key = `${node.anchor ? node.anchor.id : '*'}:${node.o.surf === 1 ? 's' : 'o'}`;
            if (!groups.has(key)) groups.set(key, { key, anchor: node.anchor, surface: node.o.surf === 1, items: [], points: null, visible: true });
            groups.get(key).items.push(node);
            node.group = groups.get(key);
        }
        for (const group of groups.values()) {
            group.points = pointsFor(group.items, markerMaterial);
            root.add(group.points);
        }

        // 궤도 안내선: 부모에서 그 천체까지의 (그린) 거리로 그은 원. 움직임을 뜻하지 않는다.
        const upAxis = new THREE.Vector3(0, 1, 0);
        for (const body of bodies) {
            if (body.kind === 'star' || body.o.orbit !== 1) continue;
            const parent = layout.nodes.get(body.o.parent);
            if (!parent) continue;
            const radial = body.p.clone().sub(parent.p);
            const radius = radial.length();
            if (!(radius > 0)) continue;
            const u = radial.multiplyScalar(1 / radius);
            const v = new THREE.Vector3().crossVectors(upAxis, u).normalize();
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints(parent.p, radius, u, v)), guideMaterial);
            line.frustumCulled = false;
            root.add(line);
            guides.push({ line, anchor: body.anchor });
        }
        // 궤도면에서 많이 떨어진 정거장·점프 포인트: 평면까지 내린 선으로 높이를 보여 준다.
        const stems = [];
        for (const node of layout.nodes.values()) {
            if (node.isBody || node.anchor || !['station', 'jump'].includes(node.kind) || Math.abs(node.p.y) < 6) continue;
            stems.push(node.p.clone(), new THREE.Vector3(node.p.x, 0, node.p.z));
        }
        if (stems.length) {
            const stemLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(stems), stemMaterial);
            stemLines.frustumCulled = false;
            root.add(stemLines);
        }

        // 소행성 고리: 게임 수치가 있는 것(rings)은 면으로, 우리가 잰 것(band, 추정)은 점선 원으로.
        const flatU = new THREE.Vector3(1, 0, 0);
        const flatV = new THREE.Vector3(0, 0, -1);
        function ringMesh(center, inner, outer) {
            const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, Math.max(outer, inner * 1.004), 160, 1), ringMaterial);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.copy(center);
            return mesh;
        }
        for (const region of input.system.regions || []) {
            const entry = { id: region.id, derived: false, object: null, anchor: null, labelAt: null };
            if (region.ring) {
                const of = layout.nodes.get(region.ring.of);
                if (!of) continue;
                const local = of.kind !== 'star';
                const inner = local ? zoneDistance(region.ring.inner, of.o.r, of.rd, layout.unitsPerMetre) : region.ring.inner * layout.unitsPerMetre;
                const outer = local ? zoneDistance(region.ring.outer, of.o.r, of.rd, layout.unitsPerMetre) : region.ring.outer * layout.unitsPerMetre;
                entry.object = ringMesh(of.p, inner, outer);
                entry.anchor = local ? of : null;
                entry.labelAt = of.p.clone().addScaledVector(flatU, (inner + outer) / 2 * 0.74).addScaledVector(flatV, (inner + outer) / 2 * 0.67);
            } else if (region.band) {
                const radius = (region.band.inner + region.band.outer) / 2 * layout.unitsPerMetre;
                const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints(new THREE.Vector3(), radius, flatU, flatV, 240)), bandMaterial);
                line.computeLineDistances();
                line.frustumCulled = false;
                entry.object = line;
                entry.derived = true;
                entry.labelAt = new THREE.Vector3(radius * 0.74, 0, -radius * 0.67);
            } else continue;
            entry.name = region.name;
            root.add(entry.object);
            regions.push(entry);
        }

        const pins = { points: null, items: [] };
        scene.add(root);
        world = { ...layout, root, bodies, groups, guides, regions, pins, system: input.system, textures: input.textures, activeBody: null, generation };
        const star = layout.nodes.get(input.system.star);
        if (star) sun.position.copy(star.p);
        update(state);
        home(true);
        queueTextures();
        invalidate();
    }

    // ── 그림 ──────────────────────────────────────────────────────────────
    function textureUrl(key, sizeKey) {
        const entry = world?.textures?.textures?.[key]?.files?.[sizeKey];
        if (!entry?.file) return null;
        return `/${entry.file}?v=${encodeURIComponent(world.textures.assetVersion || '')}`;
    }
    function loadTexture(body, sizeKey) {
        const url = body.o.tex ? textureUrl(body.o.tex, sizeKey) : null;
        if (!url) return Promise.resolve(null);
        const token = generation;
        return loadImageTexture(url, sizeKey).then((texture) => {
            if (disposed || token !== generation) { texture.dispose(); return null; }
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
            return texture;
        }).catch(() => {
            if (!textureErrorSent && !disposed && token === generation) { textureErrorSent = true; options.onTextureError?.(); }
            return null;
        });
    }
    function showTexture(body) {
        const texture = (world.activeBody === body && body.tex1k) || body.tex512 || body.tex1k;
        if (!texture) return;
        body.mesh.material.map = texture;
        body.mesh.material.color.set(0xffffff);
        body.mesh.material.needsUpdate = true;
        invalidate();
    }
    async function queueTextures() {
        const token = generation;
        const list = world.bodies.filter((body) => body.o.tex);
        let next = 0;
        const worker = async () => {
            while (next < list.length && token === generation && !disposed) {
                const body = list[next++];
                if (body.tex512) continue;
                body.texState = 'loading';
                const texture = await loadTexture(body, '512');
                if (token !== generation || disposed) { texture?.dispose(); return; }
                body.texState = texture ? '512' : 'failed';
                if (texture) { body.tex512 = texture; showTexture(body); }
            }
        };
        await Promise.all([worker(), worker()]);
    }
    // 고른 천체만 1k 그림을 쓴다. 다른 천체로 옮기면 1k 는 버리고 512 로 돌아간다.
    function setActiveBody(body) {
        if (!world || world.activeBody === body) return;
        const previous = world.activeBody;
        world.activeBody = body;
        if (previous?.tex1k) {
            const old = previous.tex1k;
            previous.tex1k = null;
            if (previous.tex512) showTexture(previous);
            else { previous.mesh.material.map = null; previous.mesh.material.color.set(PLAIN_GLOBE); previous.mesh.material.needsUpdate = true; }
            old.dispose();
        }
        if (!body || !body.o.tex || body.tex1k) return;
        const token = generation;
        loadTexture(body, '1k').then((texture) => {
            if (!texture) return;
            if (token !== generation || world.activeBody !== body) { texture.dispose(); return; }
            body.tex1k = texture;
            showTexture(body);
        });
    }

    // ── 상태 반영 ──────────────────────────────────────────────────────────
    function styleOf(node) { return STYLE[node.kind] || STYLE.other; }
    function isOn(node, pinned) {
        if (pinned.has(node.id)) return true;
        const filter = state.filter || {};
        if ((filter.off || []).includes(node.kind)) return false;
        if ((filter.need || []).length) return filter.need.some((flag) => node.o[flag] === 1);
        if (node.kind === 'jump') return true;
        return node.o.h !== 1 || filter.hidden === true;
    }
    function writeItem(points, index, colour, pixels, shape, alpha) {
        const geometry = points.geometry;
        const [r, g, b] = rgb(colour);
        geometry.attributes.tint.setXYZ(index, r, g, b);
        geometry.attributes.size.setX(index, pixels);
        geometry.attributes.shape.setX(index, shape);
        geometry.attributes.alpha.setX(index, alpha);
    }
    function touch(points) {
        for (const name of ['tint', 'size', 'shape', 'alpha']) points.geometry.attributes[name].needsUpdate = true;
    }

    /**
     * state = {
     *   selected: id | null,
     *   marks: [id],                         강조할 곳
     *   stops: [{ id, n }],                  경로의 들르는 곳 (번호)
     *   paths: [{ kind: 'route' | 'measure', dashed, ids: [id, id, …] }],
     *   spots: [{ pos: [x,y,z], at: id | null, text }],   자료에 기록이 따로 없는 점 (임무 현장)
     *   rings: [region id],                  강조할 채광 구역
     *   filter: { hidden: bool, off: [kind], need: [flag] },
     * }
     */
    function update(next) {
        state = { selected: null, marks: [], stops: [], paths: [], spots: [], rings: [], filter: {}, ...next };
        if (!world) return;
        const marks = new Set(state.marks);
        const stopIds = new Set(state.stops.map((stop) => stop.id));
        const pinned = new Set([...marks, ...stopIds]);
        if (state.selected) pinned.add(state.selected);
        const dim = marks.size > 0 || stopIds.size > 0;

        for (const group of world.groups.values()) {
            group.items.forEach((node, index) => {
                const style = styleOf(node);
                node.on = isOn(node, pinned);
                node.marked = marks.has(node.id);
                const unusableJump = node.kind === 'jump' && node.o.jump?.usable !== 1;
                const colour = node.marked ? MARK_COLOR : unusableJump ? 0x6b7686 : style.color;
                const alpha = !node.on ? 0 : (dim && !pinned.has(node.id) ? 0.3 : 1);
                writeItem(group.points, index, colour, style.size * (node.marked ? 1.5 : 1) * (coarse ? 1.15 : 1), style.shape, alpha);
            });
            touch(group.points);
        }

        // 표시·경로·선택한 곳은 멀리서도, 천체 뒤에서도 보이게 따로 한 번 더 그린다.
        if (world.pins.points) { world.root.remove(world.pins.points); world.pins.points.geometry.dispose(); world.pins.points = null; }
        const pinItems = [];
        for (const id of pinned) {
            const node = world.nodes.get(id);
            if (node && !node.isBody) pinItems.push({ p: node.p, node });
        }
        world.spots = state.spots.map((spot, index) => {
            const anchor = spot.at ? world.nodes.get(spot.at) : null;
            const body = anchor?.isBody && anchor.kind !== 'star' ? anchor : null;
            return { id: `spot:${index}`, p: world.placeAt(spot.pos, body, false), text: spot.text, anchor: body };
        });
        for (const spot of world.spots) pinItems.push({ p: spot.p, spot });
        if (pinItems.length) {
            const points = pointsFor(pinItems, pinMaterial);
            points.renderOrder = 5;
            pinItems.forEach((item, index) => {
                const node = item.node;
                if (!node) { writeItem(points, index, MARK_COLOR, 12, 0, 1); return; }
                const style = styleOf(node);
                const colour = stopIds.has(node.id) ? ROUTE_COLOR : marks.has(node.id) ? MARK_COLOR : style.color;
                writeItem(points, index, colour, Math.max(11, style.size * 1.35), style.shape, 0.95);
            });
            touch(points);
            world.root.add(points);
            world.pins.points = points;
        }
        world.pins.items = pinItems;

        const hot = new Set(state.rings);
        for (const region of world.regions) {
            const isHot = hot.has(region.id);
            region.hot = isHot;
            region.object.material = region.derived ? (isHot ? bandHotMaterial : bandMaterial) : (isHot ? ringHotMaterial : ringMaterial);
        }

        const selected = state.selected ? world.nodes.get(state.selected) : null;
        setActiveBody(selected ? (selected.isBody ? (selected.kind === 'star' ? null : selected) : selected.anchor) : null);
        buildLabels(marks, stopIds);
        invalidate();
    }

    // ── 이름표 ────────────────────────────────────────────────────────────
    function textWidth(text, bold) {
        const key = (bold ? 'b' : 'n') + text;
        if (!widths.has(key)) {
            measure.font = `${bold ? 700 : 500} 12px "Noto Sans KR", "Malgun Gothic", sans-serif`;
            widths.set(key, Math.ceil(measure.measureText(text).width));
        }
        return widths.get(key);
    }
    function buildLabels(marks, stopIds) {
        const defs = [];
        const count = new Map();
        for (const id of marks) {
            const node = world.nodes.get(id);
            // 표시한 곳이 천체에 딸려 있으면(표면 장소, 궤도 정거장, 위성) 그 천체 이름표에 개수를 붙인다: 멀리서는 한 점에 겹쳐 보이기 때문이다.
            const body = node ? node.anchor : null;
            if (body) count.set(body.id, (count.get(body.id) || 0) + 1);
        }
        for (const node of world.nodes.values()) {
            const label = options.label ? options.label(node.o) : { text: node.id };
            if (!label?.text) continue;
            const style = styleOf(node);
            let prio = node.isBody ? ({ star: 500, planet: 450, moon: 350 })[node.kind] : style.prio;
            if (node.kind === 'station' && node.o.gate) prio = 400;
            if (!node.isBody && (node.o.trade === 1 || node.o.refinery === 1)) prio += 40;
            if (node.o.h === 1 && node.kind !== 'jump') prio -= 60;
            if (node.kind === 'jump') prio = node.o.jump?.usable === 1 ? 250 : 120;
            // 게이트웨이 정거장이 있는 점프 포인트는 정거장 이름표 하나로 충분하다 (고르면 나온다).
            if (node.kind === 'jump' && node.o.jump?.station && state.selected !== node.id && !marks.has(node.id) && !stopIds.has(node.id)) continue;
            if (marks.has(node.id)) prio = 800;
            if (stopIds.has(node.id)) prio = 900;
            // 표시한 곳이 딸린 천체의 이름표(개수가 붙는다)는 표시 이름표보다 먼저 놓는다: 겹쳐서 빠지면 개수를 볼 수 없다.
            if (node.isBody && count.get(node.id)) prio = Math.max(prio, 810);
            if (state.selected === node.id) prio = 1000;
            // 표시·경로가 켜져 있으면 흐리게 그린 다른 곳의 이름표는 뺀다 (천체와 게이트웨이는 길잡이로 남긴다).
            const pinnedHere = marks.has(node.id) || stopIds.has(node.id) || state.selected === node.id;
            if ((marks.size || stopIds.size) && !pinnedHere && !node.isBody && !node.o.gate) continue;
            const extra = node.isBody && count.get(node.id) ? ` · ${count.get(node.id)}` : '';
            defs.push({ id: node.id, node, text: label.text + extra, sub: state.selected === node.id ? label.sub : '', prio, body: node.isBody, strong: prio >= 800, cls: node.kind });
        }
        for (const region of world.regions) {
            const label = options.label ? options.label({ name: region.name }) : { text: region.id };
            defs.push({ id: `region:${region.id}`, region, text: label.text + (region.derived ? ' *' : ''), sub: '', prio: region.hot ? 780 : 230, body: false, strong: region.hot, cls: 'region' });
        }
        for (const spot of world.spots || []) defs.push({ id: spot.id, spot, text: spot.text || '', sub: '', prio: 790, body: false, strong: true, cls: 'spot' });
        defs.sort((a, b) => b.prio - a.prio);
        world.labels = defs;
    }
    function labelElement(def) {
        let element = labelPool.get(def.id);
        if (!element) {
            element = document.createElement('div');
            element.dataset.id = def.id;
            element.append(document.createElement('span'), document.createElement('small'));
            overlay.append(element);
            labelPool.set(def.id, element);
        }
        const cls = `starmap-label is-${def.cls}${def.body ? ' is-body' : ''}${def.strong ? ' is-strong' : ''}${state.selected === def.id ? ' is-selected' : ''}`;
        if (element.className !== cls) element.className = cls;
        if (element.firstChild.textContent !== def.text) element.firstChild.textContent = def.text;
        if (element.lastChild.textContent !== (def.sub || '')) element.lastChild.textContent = def.sub || '';
        return element;
    }

    // ── 화면 계산 ──────────────────────────────────────────────────────────
    function project(point, out) {
        tmp.copy(point).project(camera);
        out.x = (tmp.x + 1) / 2 * size.w;
        out.y = (1 - tmp.y) / 2 * size.h;
        out.ok = tmp.z > -1 && tmp.z < 1 && out.x > -40 && out.x < size.w + 40 && out.y > -40 && out.y < size.h + 40;
        return out;
    }
    function hiddenBehind(point, body) {
        if (!body || !body.shown) return false;
        tmp.copy(point).sub(camera.position);
        const far = tmp.length();
        tmp.multiplyScalar(1 / far);
        tmp2.copy(body.p).sub(camera.position);
        const along = tmp2.dot(tmp);
        if (along <= 0 || along >= far - 1e-4) return false;
        const radius = body.rd * body.scale * 0.985;
        return tmp2.lengthSq() - along * along < radius * radius;
    }
    function layoutFrame() {
        const tan = Math.tan(FOV * Math.PI / 360);
        for (const body of world.bodies) {
            const distance = camera.position.distanceTo(body.p);
            body.px0 = body.rd / (distance * tan) * (size.h / 2);
            const min = body.kind === 'star' ? 10 : body.kind === 'planet' ? 7 : 4;
            body.scale = body.px0 < min ? min / body.px0 : 1;
            body.px = body.px0 * body.scale;
            body.shown = !body.anchor || body.kind === 'planet' || body.anchor.zoneOn;
            body.zoneOn = body.shown && body.px0 >= (body.kind === 'planet' ? 5 : 6);
            body.group.visible = body.shown;
            body.group.scale.setScalar(body.rd * body.scale);
            project(body.p, body);
        }
        for (const guide of world.guides) guide.line.visible = !guide.anchor || guide.anchor.zoneOn;
        for (const region of world.regions) region.object.visible = !region.anchor || region.anchor.zoneOn;
        for (const group of world.groups.values()) {
            const anchor = group.anchor;
            group.visible = !anchor || (anchor.zoneOn && (group.surface ? (anchor === world.activeBody || anchor.px0 >= 70) : anchor.px0 >= 12));
            group.points.visible = group.visible;
            for (const node of group.items) {
                node.shown = false;
                if (!group.visible || !node.on) continue;
                project(node.p, node);
                node.shown = node.ok && !hiddenBehind(node.p, anchor);
            }
        }
        for (const item of world.pins.items) {
            const target = item.node || item.spot;
            if (item.node && target.shown) continue;
            project(target.p, target);
            target.shown = target.ok;
        }
    }
    function placeLabels() {
        const limit = Math.min(70, Math.max(12, Math.round(size.w * size.h / 9000)));
        // 점처럼 보이는 천체의 자리는 미리 차지해 둔다: 이름표가 천체를 덮어 누르기를 가로채지 않게.
        // (구가 크게 보일 때는 그 위에 장소 이름표가 올라가야 하므로 작은 점일 때만.) 오른쪽 위는 단추 자리.
        const taken = world.bodies.filter((body) => body.shown && body.ok && body.px <= 30).map((body) => [body.x - body.px, body.y - body.px, body.x + body.px, body.y + body.px]);
        taken.push([size.w - 290, 0, size.w, 58]);
        // 아래 왼쪽은 "거리는 줄여서 그렸습니다" 안내 자리.
        taken.push([0, size.h - (size.w < 460 ? 50 : 32), Math.min(size.w, 380), size.h]);
        const used = new Set();
        const perBody = new Map();
        const bigBodies = world.bodies.filter((body) => body.shown && body.ok && body.px > 30);
        labelBoxes.length = 0;
        let placed = 0;
        let markLabels = 0;
        const holder = { x: 0, y: 0, ok: false };
        for (const def of world.labels) {
            let x; let y; let gap = 9;
            if (def.node) {
                const node = def.node;
                if (!(node.isBody ? node.shown && node.ok : node.shown)) continue;
                x = node.x; y = node.y;
                if (node.isBody) {
                    gap = node.px + 5;
                    // 크게 보이는 다른 천체 뒤에 가려진 천체의 이름표는 숨긴다 (앞 천체의 표면 장소처럼 읽히지 않게).
                    if (def.prio < 800 && bigBodies.some((body) => body !== node && hiddenBehind(node.p, body))) continue;
                } else if (def.prio < 800 && node.anchor && node.anchor.px > 30) {
                    // 구가 크게 보일 때 그 위의 이름표 수를 구 크기에 맞춘다: 가까이 갈수록 더 많이 나온다 (중요한 곳부터).
                    const seen = perBody.get(node.anchor.id) || 0;
                    if (seen >= Math.max(6, Math.round(node.anchor.px / 9))) continue;
                    perBody.set(node.anchor.id, seen + 1);
                }
            } else if (def.region) {
                if (!def.region.object.visible) continue;
                project(def.region.labelAt, holder);
                if (!holder.ok) continue;
                x = holder.x; y = holder.y; gap = 0;
            } else {
                if (!def.spot.shown) continue;
                x = def.spot.x; y = def.spot.y;
            }
            const must = def.prio >= 900 || def.id === hoverId;
            if (def.prio === 800 && ++markLabels > 18) continue;   // 표시가 아주 많으면 이름표는 앞의 몇 개만
            if (!must && placed >= limit) continue;
            const width = Math.min(size.w - 8, textWidth(def.text, def.strong) + 12 + (def.sub ? textWidth(def.sub, false) + 6 : 0));
            // 자리가 겹치면 다른 쪽(왼쪽·위·아래)에 놓아 본다.
            const spots = def.body
                ? [[x - width / 2, y + gap], [x - width / 2, y - gap - 18], [x + gap + 2, y - 9], [x - gap - 2 - width, y - 9]]
                : [[x + gap, y - 9], [x - gap - width, y - 9], [x - width / 2, y - gap - 18], [x - width / 2, y + gap]];
            let box = null;
            for (const [left, top] of spots) {
                const candidate = [left, top, left + width, top + 18];
                if (left < 2 || left + width > size.w - 2 || top < 2 || top + 18 > size.h - 2) continue;
                if (taken.some((other) => candidate[0] < other[2] && candidate[2] > other[0] && candidate[1] < other[3] && candidate[3] > other[1])) continue;
                box = candidate;
                break;
            }
            if (!box && must) {
                // 꼭 보여야 하는 이름표(경로의 들르는 곳, 고른 곳)가 겹치면 위아래로 비켜 놓는다.
                const left = Math.max(4, Math.min(size.w - width - 4, spots[0][0]));
                for (const shift of [20, -20, 40, -40, 60, -60, 0]) {
                    const top = Math.max(2, Math.min(size.h - 20, spots[0][1] + shift));
                    const candidate = [left, top, left + width, top + 18];
                    if (shift !== 0 && taken.some((other) => candidate[0] < other[2] && candidate[2] > other[0] && candidate[1] < other[3] && candidate[3] > other[1])) continue;
                    box = candidate;
                    break;
                }
            }
            if (!box) continue;
            taken.push(box);
            if (def.node) labelBoxes.push({ id: def.id, box });
            placed++;
            used.add(def.id);
            const element = labelElement(def);
            element.hidden = false;
            element.style.transform = `translate(${Math.round(box[0])}px, ${Math.round(box[1])}px)`;
        }
        for (const [id, element] of labelPool) if (!used.has(id)) element.hidden = true;

        // 선택한 곳 둘레의 고리
        const selected = state.selected ? world.nodes.get(state.selected) : null;
        if (selected && (selected.isBody ? selected.shown && selected.ok : selected.shown)) {
            const radius = selected.isBody ? selected.px + 6 : 13;
            ring.hidden = false;
            ring.style.width = ring.style.height = `${Math.round(radius * 2)}px`;
            ring.style.transform = `translate(${Math.round(selected.x - radius)}px, ${Math.round(selected.y - radius)}px)`;
        } else ring.hidden = true;

        // 경로 번호
        // 화면에서 거의 같은 자리에 오는 들르는 곳은 번호를 한 표지에 묶는다 ("1·2"): 한 번호가 다른 번호 뒤에 숨지 않게.
        const badges = [];
        for (const stop of state.stops) {
            const node = world.nodes.get(stop.id);
            if (!node || !(node.isBody ? node.shown && node.ok : node.shown)) continue;
            const x = node.x;
            const y = node.y - 30 - (node.isBody ? node.px : 0);
            const same = badges.find((badge) => Math.hypot(badge.x - x, badge.y - y) < 20);
            if (same) { if (!same.numbers.includes(stop.n)) same.numbers.push(stop.n); } else badges.push({ x, y, numbers: [stop.n] });
        }
        badges.forEach((item, index) => {
            let badge = stopPool[index];
            if (!badge) { badge = document.createElement('div'); badge.className = 'starmap-stop'; overlay.append(badge); stopPool[index] = badge; }
            badge.hidden = false;
            const text = item.numbers.join('·');
            if (badge.textContent !== text) badge.textContent = text;
            badge.style.transform = `translate(${Math.round(item.x - 11)}px, ${Math.round(item.y)}px)`;
        });
        for (let index = badges.length; index < stopPool.length; index++) stopPool[index].hidden = true;
    }
    // 경로·거리 재기 선은 SVG 로 그린다 (WebGL 선은 1픽셀이라 잘 안 보인다). 카메라 뒤로 넘어가는 부분은 잘라 낸다.
    function drawPaths() {
        const parts = [];
        const near = camera.near * 1.01;
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        for (const path of state.paths) {
            const nodes = path.ids.map((id) => world.nodes.get(id)).filter(Boolean);
            for (let index = 0; index + 1 < nodes.length; index++) {
                a.copy(nodes[index].p).applyMatrix4(camera.matrixWorldInverse);
                b.copy(nodes[index + 1].p).applyMatrix4(camera.matrixWorldInverse);
                if (a.z > -near && b.z > -near) continue;
                if (a.z > -near) a.lerp(b, (a.z + near) / (a.z - b.z));
                else if (b.z > -near) b.lerp(a, (b.z + near) / (b.z - a.z));
                a.applyMatrix4(camera.projectionMatrix);
                b.applyMatrix4(camera.projectionMatrix);
                parts.push({ kind: path.kind, dashed: path.dashed, x1: (a.x + 1) / 2 * size.w, y1: (1 - a.y) / 2 * size.h, x2: (b.x + 1) / 2 * size.w, y2: (1 - b.y) / 2 * size.h });
            }
        }
        while (lines.childNodes.length > parts.length) lines.lastChild.remove();
        parts.forEach((part, index) => {
            let line = lines.childNodes[index];
            if (!line) { line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); lines.append(line); }
            line.setAttribute('class', `is-${part.kind}${part.dashed ? ' is-dashed' : ''}`);
            for (const key of ['x1', 'y1', 'x2', 'y2']) line.setAttribute(key, Number.isFinite(part[key]) ? part[key].toFixed(1) : '0');
        });
    }

    // ── 그리기 (필요할 때만) ────────────────────────────────────────────────
    function canDraw() { return !disposed && world && onScreen && !document.hidden && size.w > 1 && size.h > 1; }
    function invalidate() {
        dirty = true;
        if (!frameId && canDraw()) frameId = requestAnimationFrame(tick);
    }
    function render() {
        const distance = camera.position.distanceTo(controls.target);
        camera.near = Math.max(0.02, distance * 0.02);
        camera.far = Math.max(12000, distance * 6);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        layoutFrame();
        renderer.render(scene, camera);
        placeLabels();
        drawPaths();
        frames++;
    }
    function tick(now) {
        frameId = 0;
        if (!canDraw()) return;
        if (flight) {
            const t = Math.min(1, (now - flight.start) / flight.ms);
            const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
            controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
            camera.position.lerpVectors(flight.fromPosition, flight.toPosition, eased);
            camera.lookAt(controls.target);
            if (t >= 1) { flight = null; controls.enabled = true; controls.update(); }
            dirty = true;
        }
        if (dirty) { dirty = false; render(); }
        if (flight) frameId = requestAnimationFrame(tick);
    }
    function resize() {
        const rect = host.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        if (width === size.w && height === size.h) return;
        size.w = width; size.h = height;
        const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
        renderer.setPixelRatio(ratio);
        markerMaterial.uniforms.ratio.value = ratio;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        lines.setAttribute('viewBox', `0 0 ${width} ${height}`);
        invalidate();
    }

    // ── 카메라 ────────────────────────────────────────────────────────────
    function flyTo(target, position, instant) {
        if (instant || reducedMotion?.matches) {
            flight = null;
            controls.enabled = true;
            controls.target.copy(target);
            camera.position.copy(position);
            camera.lookAt(target);
            controls.update();
            invalidate();
            return;
        }
        controls.enabled = false;
        flight = { start: performance.now(), ms: FLY_MS, fromTarget: controls.target.clone(), toTarget: target.clone(), fromPosition: camera.position.clone(), toPosition: position.clone() };
        invalidate();
    }
    function home(instant) {
        if (!world) return;
        const tan = Math.tan(FOV * Math.PI / 360);
        const direction = new THREE.Vector3(0, 0.78, 0.62).normalize();
        // 지금 그려지는 것(항성·행성과 켜져 있는 정거장·점프 포인트)이 화면에 꽉 차게 맞춘다. 이름표와 단추 자리만큼 가장자리를 남긴다.
        const forward = direction.clone().negate();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const upward = new THREE.Vector3().crossVectors(right, forward).normalize();
        const aspect = Math.max(0.35, size.w / size.h);
        const roomX = Math.max(0.5, 1 - 2 * Math.min(90, size.w * 0.14) / size.w);
        const roomY = Math.max(0.5, 1 - 2 * 58 / size.h);
        let fit = 60;
        for (const node of world.nodes.values()) {
            if (node.anchor || (!node.isBody && node.on === false)) continue;
            const depth = node.p.dot(forward);
            fit = Math.max(fit, Math.abs(node.p.dot(right)) / (tan * aspect * roomX) - depth, Math.abs(node.p.dot(upward)) / (tan * roomY) - depth);
        }
        fit = Math.min(fit, controls.maxDistance);
        controls.minDistance = 2;
        flyTo(new THREE.Vector3(), direction.multiplyScalar(fit), instant);
    }
    function focus(id, focusOptions = {}) {
        if (!world) return;
        const node = id ? world.nodes.get(id) : null;
        if (!node) { home(focusOptions.instant); return; }
        const current = camera.position.clone().sub(controls.target);
        const upAxis = new THREE.Vector3(0, 1, 0);
        let target; let direction; let distance; let minDistance = 2;
        if (node.isBody) {
            target = node.p.clone();
            distance = node.kind === 'star' ? node.rd * 9 : node.rd * 6.5;
            minDistance = node.rd * MIN_ZOOM_RADII;
            const sameCentre = controls.target.distanceTo(node.p) < 1e-3;
            if (sameCentre) direction = current.normalize();
            else if (node.kind === 'star') direction = new THREE.Vector3(0, 0.6, 0.8).normalize();
            else {
                // 항성 쪽(낮인 면)을 조금 위에서 내려다본다.
                const toStar = sun.position.clone().sub(node.p).normalize();
                const side = new THREE.Vector3().crossVectors(upAxis, toStar).normalize();
                direction = toStar.multiplyScalar(0.78).addScaledVector(upAxis, 0.42).addScaledVector(side, 0.46).normalize();
            }
        } else if (node.anchor) {
            // 천체에 붙은 곳: 그 천체를 가운데 두고, 그곳이 앞으로 오게 돌려 본다.
            target = node.anchor.p.clone();
            direction = node.p.clone().sub(node.anchor.p).normalize().addScaledVector(upAxis, 0.18).normalize();
            distance = Math.max(node.anchor.rd * 4.4, node.p.distanceTo(node.anchor.p) * 2.4);
            minDistance = node.anchor.rd * MIN_ZOOM_RADII;
        } else {
            // 천체에 딸리지 않은 곳(게이트웨이 정거장, 소행성 기지, 점프 포인트): 그 점만 크게 보면 어디에 있는지 알 수 없다.
            // 항성과 가장 가까운 행성이 함께 들어오게 잡는다 (경로 보기처럼 묶어서).
            const star = world.nodes.get(world.system.star);
            let near = null;
            let nearDistance = Infinity;
            for (const body of world.bodies) {
                if (body.anchor || body === star) continue;
                const away = body.p.distanceTo(node.p);
                if (away < nearDistance) { nearDistance = away; near = body; }
            }
            frame([node.id, ...(near ? [near.id] : []), ...(star ? [star.id] : [])], focusOptions);
            return;
        }
        // 가까이 가는 한계: 구가 화면을 다 덮어 그림이 뿌옇게 번지기 전까지만.
        controls.minDistance = minDistance;
        flyTo(target, target.clone().addScaledVector(direction, Math.max(distance, minDistance)), focusOptions.instant);
    }
    // 여러 곳이 한 화면에 들어오게 맞춘다 (경로·표시).
    function frame(ids, frameOptions = {}) {
        if (!world) return;
        const points = ids.map((id) => world.nodes.get(id)?.p).filter(Boolean);
        if (!points.length) { home(frameOptions.instant); return; }
        const centre = new THREE.Vector3();
        for (const point of points) centre.add(point);
        centre.multiplyScalar(1 / points.length);
        const radius = Math.max(12, ...points.map((point) => point.distanceTo(centre)));
        const tan = Math.tan(FOV * Math.PI / 360);
        const distance = Math.min(controls.maxDistance, radius * 1.5 / Math.min(tan, tan * Math.max(0.35, size.w / size.h)));
        const direction = camera.position.clone().sub(controls.target);
        if (direction.lengthSq() === 0 || direction.normalize().y < 0.3) direction.set(0, 0.78, 0.62).normalize();
        controls.minDistance = 2;
        flyTo(centre, centre.clone().addScaledVector(direction, distance), frameOptions.instant);
    }
    function zoomBy(factor) {
        if (!world || flight) return;
        const offset = camera.position.clone().sub(controls.target);
        const length = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * factor));
        camera.position.copy(controls.target).addScaledVector(offset.normalize(), length);
        controls.update();
        invalidate();
    }

    // ── 고르기 ────────────────────────────────────────────────────────────
    function pickAt(x, y) {
        if (!world) return null;
        const reach = coarse ? 24 : 13;
        // 이름표 바로 위를 누르면 그 장소다.
        for (const item of labelBoxes) if (x >= item.box[0] && x <= item.box[2] && y >= item.box[1] && y <= item.box[3]) return item.id;
        let best = null;
        let bestDistance = reach;
        const consider = (target, id) => {
            if (!target.shown) return;
            const distance = Math.hypot(target.x - x, target.y - y);
            if (distance < bestDistance) { bestDistance = distance; best = id; }
        };
        for (const group of world.groups.values()) if (group.visible) for (const node of group.items) consider(node, node.id);
        for (const item of world.pins.items) if (item.node) consider(item.node, item.node.id);
        // 천체: 멀리서 점처럼 보일 때는 옆의 정거장 표시보다 천체를 먼저 고른다(가운데에 가까울수록).
        // 크게 보일 때(구 위에 장소가 찍혀 있을 때)는 장소 표시가 먼저다.
        let nearest = Infinity;
        for (const body of world.bodies) {
            if (!body.shown || !body.ok) continue;
            const distance = Math.hypot(body.x - x, body.y - y);
            if (distance > Math.max(body.px, coarse ? 16 : 9) + 3) continue;
            if (best && (body.px > 30 || distance * 0.6 >= bestDistance)) continue;
            const depth = camera.position.distanceTo(body.p);
            if (depth < nearest || body.px <= 30) { nearest = depth; best = body.id; bestDistance = distance * 0.6; }
        }
        if (best) return best;
        // 표시도 천체도 아니면, 이름표 가까이(손가락은 위아래 13px 더: 누를 자리 44px)를 누른 것으로 본다. 가장 가까운 이름표 하나.
        const pad = coarse ? 13 : 3;
        let labelDistance = Infinity;
        for (const item of labelBoxes) {
            const dx = Math.max(item.box[0] - x, 0, x - item.box[2]);
            const dy = Math.max(item.box[1] - y, 0, y - item.box[3]);
            if (dx > pad || dy > pad) continue;
            const away = Math.hypot(dx, dy);
            if (away < labelDistance) { labelDistance = away; best = item.id; }
        }
        return best;
    }
    let press = null;
    function localPoint(event) {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function onPointerDown(event) { press = { ...localPoint(event), at: performance.now(), id: event.pointerId }; }
    function onPointerUp(event) {
        if (!press || press.id !== event.pointerId) return;
        const point = localPoint(event);
        const moved = Math.hypot(point.x - press.x, point.y - press.y);
        const quick = performance.now() - press.at < 700;
        press = null;
        if (moved > 6 || !quick) return;
        const id = pickAt(point.x, point.y);
        if (id) options.onPick?.(id);
    }
    function onPointerMove(event) {
        if (event.pointerType !== 'mouse' || press || !world) return;
        const point = localPoint(event);
        const id = pickAt(point.x, point.y);
        if (id === hoverId) return;
        hoverId = id;
        canvas.classList.toggle('is-pointing', Boolean(id));
        invalidate();
    }
    function onVisibility() { if (!document.hidden) invalidate(); }
    function onContextLost(event) { event.preventDefault(); options.onContextLost?.(); }

    controls.addEventListener('change', invalidate);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('webglcontextlost', onContextLost);
    document.addEventListener('visibilitychange', onVisibility);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(host);
    const intersectionObserver = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => { onScreen = entries[entries.length - 1].isIntersecting; if (onScreen) invalidate(); })
        : null;
    intersectionObserver?.observe(host);
    resize();

    function screenOf(id) {
        const node = world?.nodes.get(id);
        if (!node) return null;
        return { x: node.x, y: node.y, shown: node.isBody ? Boolean(node.shown && node.ok) : Boolean(node.shown), px: node.px || 0 };
    }
    // 시험·점검용: 지금 화면을 한 번 그리고 배경이 아닌 픽셀 수를 센다.
    function stats() {
        const result = { ready: Boolean(world), frames, bodies: world?.bodies.length || 0, markers: 0, shown: 0, labels: 0, textures: {}, active: world?.activeBody?.id || null, activeTexture: null, painted: 0, sampled: 0 };
        if (!world) return result;
        for (const group of world.groups.values()) { result.markers += group.items.length; result.shown += group.items.filter((node) => node.shown).length; }
        for (const body of world.bodies) if (body.texState) result.textures[body.texState] = (result.textures[body.texState] || 0) + 1;
        result.activeTexture = world.activeBody ? (world.activeBody.tex1k ? '1k' : world.activeBody.tex512 ? '512' : 'none') : null;
        for (const element of labelPool.values()) if (!element.hidden) result.labels++;
        if (size.w > 1 && size.h > 1) {
            render();
            const gl = renderer.getContext();
            const width = gl.drawingBufferWidth;
            const height = gl.drawingBufferHeight;
            const pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            for (let index = 3; index < pixels.length; index += 16) { result.sampled++; if (pixels[index] > 8) result.painted++; }
        }
        return result;
    }
    function dispose() {
        if (disposed) return;
        disposed = true;
        generation++;
        if (frameId) cancelAnimationFrame(frameId);
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        controls.dispose();
        blobs.clear();
        clearWorld();
        unitSphere.dispose();
        glowTexture.dispose();
        for (const material of [markerMaterial, pinMaterial, guideMaterial, stemMaterial, ringMaterial, ringHotMaterial, bandMaterial, bandHotMaterial]) material.dispose();
        renderer.renderLists.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        lines.remove();
        overlay.remove();
    }

    return { load, update, focus, frame, home, zoomBy, stats, screenOf, dispose, invalidate };
}
