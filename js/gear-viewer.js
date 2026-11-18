// 개인 장비 › 무기 개조 화면의 3D 보기. 이 파일만 ES 모듈이다 (사이트의 다른 스크립트는 클래식 스크립트).
// 개조 화면을 열 때만 import('/js/gear-viewer.js') 로 불러온다 — index.html 과 서비스 워커 프리캐시에 넣지 않는다.
//
// 지키는 것 (사이트 CSP: script-src 'self', style-src 'self', img-src 'self' data: https:, connect-src 'self'):
// - three.js 는 같은 출처의 assets/vendor/three-<버전>/ 에서 상대 경로로 불러온다 (import map 없음, wasm 디코더 없음).
// - 모형(.glb)과 그림(.webp/.png)은 모두 같은 출처의 별도 파일이다. .glb 안에 그림을 넣지 않는다 (blob: 주소는 CSP 가 막는다).
// - 받은 canvas 말고는 DOM 을 만들지 않는다. 캔버스 크기는 CSS 가 정한다 (setSize 에 updateStyle=false).
// - 부품 위치는 manifest 의 port.position / port.rotation 그대로다. 여기서 보정하는 숫자는 없다.
//
// 공개 API (계약):
//   isSupported(): boolean
//   createGunViewer(canvas, { manifestUrl, partsIndex, ...선택 }) -> Promise<viewer>
//   viewer.setPart(portName, classOrNull) -> Promise<class|null>
//   viewer.setView('side'|'iso'|'top'|'back'), viewer.setLod(n) -> Promise<lod>, viewer.highlightPort(portNameOrNull)
//   viewer.stats() -> { triangles, ... }, viewer.dispose()
// 실패는 모두 code 가 붙은 Error 로 reject 된다 (동기 메서드는 false 를 돌려주고 던지지 않는다).

import * as THREE from '../assets/vendor/three-0.187.0/build/three.module.js';
import { OrbitControls } from '../assets/vendor/three-0.187.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../assets/vendor/three-0.187.0/examples/jsm/loaders/GLTFLoader.js';

const TEXTURE_DIR = 'assets/models/gear/tex/';
const MAX_PIXEL_RATIO = 2;
// 게임 자료의 새 물건은 마모 0 이다 (SGeometryDataParams.Wear = 0). 0.35 에서는 마모층(밝은 맨금속)이 넓게 드러나
// 검은 총에 흰 얼룩처럼 보였다. 모서리 닳음만 조금 남긴다.
const DEFAULT_WEAR = 0.12;
const TEXTURE_SLOTS = ['map', 'aoMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap', 'envMap'];

// glTF 공간: +Y 위, 총구는 -Z, 총의 오른쪽이 +X.
const VIEWS = {
    side: { dir: [-1, 0, 0], up: [0, 1, 0] },           // 총의 왼쪽 면. 총구가 화면 왼쪽
    right: { dir: [1, 0, 0], up: [0, 1, 0] },           // 반대쪽 면 (계약 밖 추가)
    iso: { dir: [-0.62, 0.36, -0.7], up: [0, 1, 0] },   // 앞 왼쪽 위에서 비스듬히
    top: { dir: [0, 1, 0], up: [1, 0, 0] },             // 위에서
    back: { dir: [0.55, 0.34, 0.76], up: [0, 1, 0] },   // 뒤 오른쪽 위에서 비스듬히 (개머리판 쪽)
};

let supportCache = null;

/** WebGL2 를 쓸 수 있는지. 결과는 한 번만 확인해 기억한다. 확인용 컨텍스트는 바로 놓아 준다. */
export function isSupported() {
    if (supportCache !== null) return supportCache;
    try {
        if (typeof WebGL2RenderingContext === 'undefined' || typeof document === 'undefined') { supportCache = false; return false; }
        const gl = document.createElement('canvas').getContext('webgl2');
        supportCache = !!gl;
        if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (_error) {
        supportCache = false;
    }
    return supportCache;
}

function viewerError(code, message, cause) {
    const error = new Error(message);
    error.name = 'GunViewerError';
    error.code = code;
    if (cause) error.cause = cause;
    return error;
}

function reasonOf(error) {
    if (!error) return 'unknown error';
    if (typeof error.message === 'string' && error.message) return error.message;
    if (error.type) return `${error.type} event`;
    return String(error);
}

function finiteArray(value, length) {
    return Array.isArray(value) && value.length === length && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/**
 * 게임의 겹층 총기 셰이더를 그림 두 장으로 줄인 것.
 * 면 하나는 바탕층 1~4개로 이루어지고, 층마다 마모층이 하나씩 짝지어 있다 (모두 상수: 색·거칠기·금속성).
 *   - glTF 재질 상수 = 1번 층. material.extras.wear = 1번 층의 마모층. (층이 하나뿐인 보통 총)
 *   - material.extras.blend = [층1..층4] (없는 층은 null). 섞는 비율은 섞임 그림에서 읽는다:
 *     R = 1번 층, G = 2번, B = 3번의 몫이고 남는 몫(검정)이 4번 층이다. 4번 층이 총의 바탕 금속(색상표 색)이고
 *     1~3번은 그 위의 칠·닳음·녹이다. 게임 셰이더 원본은 게임 파일에 없어서 이 읽기는 게임 사진과 맞춰 본 우리 해석이다.
 *     섞임 그림은 glTF 의 emissive 텍스처 자리에 실려 온다 (emissive 색은 0).
 *   - 묶음 마스크(occlusion 텍스처): R = 가림(three.js 가 그대로 씀), G = 광택, B = 마모 마스크(1 = 바탕층, 0 = 마모층).
 * 게임이 마모 마스크를 "얼마나 닳았나"로 바꾸는 식은 게임 파일에 없어서, 마모 정도 L 을 둔다:
 *   L = 1 이면 마스크 그대로, L = 0 이면 새 총.
 */
function applyLayerShader(material, data, wearLevel) {
    const hasMask = !!(data.mask && material.aoMap);
    const hasBlend = Array.isArray(data.blend) && !!material.emissiveMap;
    const first = { color: material.color.toArray(), metalness: material.metalness, roughness: material.roughness, wear: hasMask ? data.wear || null : null };
    const layers = [];
    for (let i = 0; i < 4; i += 1) {
        const layer = i === 0 ? (hasBlend && data.blend[0]) || first : hasBlend ? data.blend[i] : null;
        layers.push(layer && finiteArray(layer.color, 3) ? layer : null);
    }
    const number = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
    const baseColor = []; const baseParams = []; const wearColor = []; const wearParams = [];
    for (const layer of layers) {
        const base = layer || layers[0] || first;
        const wear = hasMask && layer?.wear && finiteArray(layer.wear.color, 3) ? layer.wear : null;
        baseColor.push(new THREE.Color().fromArray(base.color));
        baseParams.push(new THREE.Vector2(number(base.roughness, 0.6), number(base.metalness, 0)));
        wearColor.push(new THREE.Color().fromArray(wear ? wear.color : base.color));
        wearParams.push(new THREE.Vector3(number(wear?.roughness, 0.6), number(wear?.metalness, 0), wear ? 1 : 0));
    }
    // 섞임 그림에서 그 층이 없으면 비율을 0 으로 둔다 (없는 층의 색이 섞여 들어가지 않게).
    const present = new THREE.Vector3(layers[0] ? 1 : 0, layers[1] ? 1 : 0, layers[2] ? 1 : 0);
    if (hasBlend) material.emissiveMap.colorSpace = THREE.NoColorSpace;      // 색이 아니라 비율이다
    const uniforms = {
        gmBaseColor: { value: baseColor }, gmBaseParams: { value: baseParams }, gmWearColor: { value: wearColor }, gmWearParams: { value: wearParams },
        gmPresent: { value: present },
        gmUseGloss: { value: hasMask && data.mask.gloss ? 1 : 0 },
        gmWearLevel: wearLevel,                 // 뷰어 하나가 공유하는 객체: 값 하나로 모든 재질이 바뀐다
    };
    material.defines = { ...(material.defines || {}), ...(hasMask ? { GM_MASK: '' } : {}), ...(hasBlend ? { GM_BLEND: '' } : {}) };
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 gmBaseColor[4];\nuniform vec2 gmBaseParams[4];\nuniform vec3 gmWearColor[4];\nuniform vec3 gmWearParams[4];\nuniform vec3 gmPresent;\nuniform float gmUseGloss;\nuniform float gmWearLevel;')
            .replace('#include <map_fragment>', [
                '#include <map_fragment>',
                '\tvec3 gmMask = vec3( 1.0 );',
                '\t#ifdef GM_MASK',
                '\t\tgmMask = texture2D( aoMap, vAoMapUv ).rgb;',
                '\t#endif',
                '\tvec4 gmShare = vec4( 1.0, 0.0, 0.0, 0.0 );',
                '\t#ifdef GM_BLEND',
                '\t\tvec3 gmBlend = texture2D( emissiveMap, vEmissiveMapUv ).rgb * gmPresent;',
                '\t\tgmBlend /= max( 1.0, gmBlend.r + gmBlend.g + gmBlend.b );',
                '\t\tgmShare = vec4( gmBlend, 1.0 - gmBlend.r - gmBlend.g - gmBlend.b );',
                '\t#endif',
                '\tfloat gmWorn = clamp( ( gmWearLevel - gmMask.b ) / max( gmWearLevel, 0.001 ), 0.0, 1.0 );',
                '\tvec3 gmColor = vec3( 0.0 );',
                '\tvec2 gmParams = vec2( 0.0 );',
                '\tfor ( int i = 0; i < 4; i ++ ) {',
                '\t\tfloat gmT = gmWorn * gmWearParams[ i ].z;',
                '\t\tgmColor += gmShare[ i ] * mix( gmBaseColor[ i ], gmWearColor[ i ], gmT );',
                '\t\tgmParams += gmShare[ i ] * mix( gmBaseParams[ i ], gmWearParams[ i ].xy, gmT );',
                '\t}',
                '\tdiffuseColor.rgb = gmColor;',
            ].join('\n'))
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = clamp( 1.0 - ( 1.0 - gmParams.x ) * mix( 1.0, gmMask.g, gmUseGloss ), 0.04, 1.0 );')
            .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = gmParams.y;');
    };
    material.customProgramCacheKey = () => `gm-layer-v3${hasMask ? '-mask' : ''}${hasBlend ? '-blend' : ''}`;
    material.needsUpdate = true;
}

/**
 * 밝기 곡선. 검은 총(반사율 4%)이 보이게 조명을 밝게 두면 맨 알루미늄(반사율 91%)은 그 스무 배가 넘게 밝아져
 * 전부 흰색으로 날아가 금속이 아니라 흰 칠처럼 보였다. 어두운 쪽(TONE_KNEE 아래)은 그대로 두고 밝은 쪽만 부드럽게
 * 눌러서, 밝은 금속에도 밝고 어두운 차이가 남게 한다. three.js 의 사용자 정의 곡선 자리(CustomToneMapping)에 넣는다.
 */
const TONE_KNEE = 0.2;       // 이 밝기까지는 손대지 않는다
const TONE_SHOULDER = 2;     // 클수록 밝은 쪽을 더 길게 눌러 편다
function useToneCurve() {
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
    if (chunk.includes('gmKnee')) return;
    THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace('vec3 CustomToneMapping( vec3 color ) { return color; }', [
        'vec3 CustomToneMapping( vec3 color ) {',
        `\tconst float gmKnee = ${TONE_KNEE.toFixed(3)};`,
        `\tconst float gmShoulder = ${TONE_SHOULDER.toFixed(3)};`,
        '\tcolor *= toneMappingExposure;',
        '\tvec3 gmOver = max( color - gmKnee, 0.0 );',
        '\treturn min( color, vec3( gmKnee ) ) + ( 1.0 - gmKnee ) * gmOver / ( gmOver + gmShoulder );',
        '}',
    ].join('\n'));
}

/**
 * 반사용 배경: 어두운 방에 밝은 조명판 몇 장 (사진관 조명).
 * 온통 밝은 방을 비추면 광택 금속이 흰 플라스틱처럼 보인다. 금속은 "어두운 곳과 밝은 줄무늬"를 비춰야 금속으로 읽힌다.
 */
function buildStudio() {
    const scene = new THREE.Scene();
    const add = (geometry, color, position, rotation) => {
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
        mesh.position.set(...position);
        if (rotation) mesh.rotation.set(...rotation);
        scene.add(mesh);
    };
    const grey = (v) => new THREE.Color(v, v, v);
    add(new THREE.BoxGeometry(12, 8, 12), grey(0.16), [0, 1, 0]);                                   // 방 (안쪽 면이 보인다)
    add(new THREE.PlaneGeometry(12, 12), grey(0.07), [0, -2.9, 0], [-Math.PI / 2, 0, 0]);           // 어두운 바닥
    add(new THREE.PlaneGeometry(5, 3), grey(7), [-1, 4.8, -0.5], [Math.PI / 2, 0, 0]);              // 위 큰 조명판
    add(new THREE.PlaneGeometry(1.6, 4), grey(5), [-5.6, 1.4, -1.5], [0, Math.PI / 2, 0]);          // 왼쪽 세로 판
    add(new THREE.PlaneGeometry(1.2, 4), grey(2.6), [5.6, 1.2, 2], [0, -Math.PI / 2, 0]);           // 오른쪽 보조 판
    add(new THREE.PlaneGeometry(4, 1.2), grey(3.2), [0.5, 2.2, -5.8]);                              // 앞쪽 가로 판
    add(new THREE.PlaneGeometry(3, 1.2), grey(1.8), [-1, 1.6, 5.8], [0, Math.PI, 0]);               // 뒤쪽 가로 판
    return scene;
}

function disposeMaterial(material) {
    if (!material) return;
    for (const slot of TEXTURE_SLOTS) {
        const texture = material[slot];
        if (texture?.isTexture) {
            const image = texture.source?.data;
            texture.dispose();
            if (image && typeof image.close === 'function') { try { image.close(); } catch (_error) { /* 이미 닫힘 */ } }
        }
    }
    material.dispose();
}

function disposeObject(object) {
    object.traverse((node) => {
        if (!node.isMesh) return;
        node.geometry?.dispose();
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) disposeMaterial(material);
    });
}

function countTriangles(object) {
    let triangles = 0;
    object.traverse((node) => {
        if (!node.isMesh || !node.visible || !node.geometry) return;
        const geometry = node.geometry;
        triangles += (geometry.index ? geometry.index.count : geometry.attributes.position?.count || 0) / 3;
    });
    return Math.round(triangles);
}

/**
 * 총 한 자루의 3D 보기를 만든다.
 * @param {HTMLCanvasElement} canvas  크기는 CSS 로 정해져 있어야 한다 (예: width:100%; height:100%; display:block).
 * @param {object} options
 * @param {string} options.manifestUrl  무기 manifest.json 주소 (사이트 루트 기준 상대 경로 또는 절대 경로).
 * @param {object} [options.partsIndex]  data/gear/models.json 의 parts 맵 (또는 models.json 전체).
 * @param {object} [options.parts]  처음에 달 부품 { 포트이름: 클래스|null }. 없으면 manifest 의 게임 기본 상태.
 * @param {number} [options.lod]  처음 몸체 정밀도. 없으면 manifest.weapon.defaultLod.
 * @param {string} [options.view='iso']
 * @param {boolean} [options.autoRotate=false]  천천히 돌리기. "동작 줄이기" 설정이면 무시된다.
 * @param {number} [options.wear=0.12]  마모 정도 0..1.
 * @param {number} [options.markerColor=0xf2b233]  부착 위치 표시 색.
 * @param {string} [options.baseUrl]  사이트 루트 (기본: 현재 출처의 '/').
 * @param {string} [options.textureRoot]  공용 그림 폴더 (기본: <baseUrl>assets/models/gear/tex/).
 * @param {(info: {type: string}) => void} [options.onContext]  'lost' | 'restored' 알림.
 * @param {string} [options.version]  모형 묶음의 판 이름. 모형·그림 주소 뒤에 ?v=<판> 으로 붙는다. 모형 파일은 오래 캐시되므로,
 *   다시 내보낸 뒤에는 이 값이 달라야 옛 파일과 섞이지 않는다 (data/gear/models.json 의 assetVersion).
 */
export async function createGunViewer(canvas, options) {
    try {
        return await build(canvas, options || {});
    } catch (error) {
        throw error?.name === 'GunViewerError' ? error : viewerError('viewer', `3D viewer failed to start (${reasonOf(error)})`, error);
    }
}

async function build(canvas, options) {
    if (!canvas || typeof canvas.getContext !== 'function') throw viewerError('bad-canvas', 'createGunViewer needs a <canvas> element');
    if (!options.manifestUrl) throw viewerError('bad-options', 'createGunViewer needs options.manifestUrl');
    if (!isSupported()) throw viewerError('unsupported', 'WebGL2 is not available in this browser');

    // ------------------------------------------------------------ 주소
    const origin = window.location.origin;
    const siteRoot = new URL(options.baseUrl || '/', window.location.href);
    const manifestUrl = new URL(options.manifestUrl, siteRoot);
    const textureRoot = new URL(options.textureRoot || TEXTURE_DIR, siteRoot).href.replace(/\/?$/, '/');
    /** 계약상 파일 경로는 사이트 루트 기준이다. 시험판처럼 파일 이름만 있으면 manifest 옆에서 찾는다. */
    function resolveFile(file) {
        if (typeof file !== 'string' || !file) throw viewerError('bad-manifest', 'model entry has no file path');
        const fromRoot = /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(file) || file.startsWith('assets/');
        const url = new URL(file, fromRoot ? siteRoot : manifestUrl);
        if (url.origin !== origin) throw viewerError('bad-url', `model file must be same-origin: ${file}`);
        return url.href;
    }
    if (manifestUrl.origin !== origin) throw viewerError('bad-url', 'manifestUrl must be same-origin');
    const version = typeof options.version === 'string' && /^[\w.-]{1,40}$/.test(options.version) ? options.version : '';
    const stamped = (href) => (version && !href.includes('?') ? `${href}?v=${version}` : href);

    // ------------------------------------------------------------ manifest
    let manifest;
    try {
        const response = await fetch(stamped(manifestUrl.href), { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        manifest = await response.json();
    } catch (error) {
        throw viewerError('manifest', `Could not load weapon manifest ${manifestUrl.pathname} (${reasonOf(error)})`, error);
    }
    const bodies = Array.isArray(manifest?.weapon?.body) ? manifest.weapon.body.filter((entry) => entry && typeof entry.file === 'string') : [];
    if (bodies.length === 0) throw viewerError('bad-manifest', `Weapon manifest ${manifestUrl.pathname} lists no body model`);
    const portDefs = Array.isArray(manifest.ports) ? manifest.ports.filter((def) => def && typeof def.name === 'string') : [];
    const rawIndex = options.partsIndex || {};
    const partsIndex = rawIndex.parts && typeof rawIndex.parts === 'object' && typeof rawIndex.parts.file !== 'string' ? rawIndex.parts : rawIndex;

    // ------------------------------------------------------------ renderer, scene, camera
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (error) {
        throw viewerError('unsupported', `WebGL could not start (${reasonOf(error)})`, error);
    }
    renderer.setClearColor(0x000000, 0);
    useToneCurve();
    renderer.toneMapping = THREE.CustomToneMapping;
    renderer.toneMappingExposure = 1.05;
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    let environment = null;
    function buildEnvironment() {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = buildStudio();
        const target = pmrem.fromScene(room, 0.03);
        room.traverse((node) => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
        pmrem.dispose();
        if (environment) environment.dispose();
        environment = target;
        scene.environment = target.texture;
    }
    try { buildEnvironment(); } catch (_error) { /* 환경 조명 없이도 그린다 */ }
    scene.environmentIntensity = 1;
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2); keyLight.position.set(-1.2, 2.4, -0.6); scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xbfd4ff, 0.8); fillLight.position.set(1.5, 0.6, 1.2); scene.add(fillLight);
    const underLight = new THREE.DirectionalLight(0xffffff, 0.35); underLight.position.set(0, -1.5, -0.5); scene.add(underLight);

    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 40);
    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = true;
    controls.minDistance = 0.15;
    controls.maxDistance = 4;

    const gun = new THREE.Group(); gun.name = 'gun'; scene.add(gun);
    const markers = new THREE.Group(); markers.name = 'port-markers'; scene.add(markers);

    // ------------------------------------------------------------ 상태
    const wearLevel = { value: Number.isFinite(options.wear) ? Math.min(1, Math.max(0, options.wear)) : DEFAULT_WEAR };
    const ports = new Map();        // 이름 -> { def, group, marker, current, token, placeable }
    const modelCache = new Map();   // 주소 -> Promise<THREE.Object3D>
    const loadedObjects = new Set();
    const failed = [];              // 처음 장착에서 실패한 부품 [{ port, cls, code, message }]
    let disposed = false;
    let rafId = 0;
    let dirty = true;
    let onScreen = true;
    let pageVisible = document.visibilityState !== 'hidden';
    let userMoved = false;
    let currentView = VIEWS[options.view] ? options.view : 'iso';
    let bodyLod = null;
    let bodyObject = null;
    let bodyToken = 0;
    let highlighted = null;
    let lastWidth = 0;
    let lastHeight = 0;
    let contextLost = false;

    const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let wantSpin = options.autoRotate === true;
    const spinning = () => wantSpin && !userMoved && !(motionQuery?.matches);
    controls.autoRotateSpeed = 0.8;

    // ------------------------------------------------------------ 그리기: 바뀐 것이 있을 때만, 보일 때만
    function frame() {
        rafId = 0;
        if (disposed) return;
        if (spinning()) { controls.autoRotate = true; controls.update(); } else controls.autoRotate = false;
        if (dirty && !contextLost) { renderer.render(scene, camera); dirty = false; }
        schedule();
    }
    function schedule() {
        if (rafId || disposed || !onScreen || !pageVisible) return;
        if (dirty || spinning()) rafId = requestAnimationFrame(frame);
    }
    function requestRender() { dirty = true; schedule(); }
    function renderNow() {
        if (disposed || contextLost) return;
        renderer.render(scene, camera);
        dirty = false;
    }

    /** 총(몸체 + 달린 부품)의 꼭짓점을 조금씩 골라 세계 좌표로 돌려준다. 구도를 실제 윤곽에 맞추는 데 쓴다. */
    function samplePoints() {
        const points = [];
        gun.updateWorldMatrix(true, true);
        gun.traverse((node) => {
            const position = node.isMesh ? node.geometry?.attributes?.position : null;
            if (!position) return;
            const step = Math.max(1, Math.floor(position.count / 300));
            for (let i = 0; i < position.count; i += step) points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld));
        });
        return points;
    }
    function fitView(name) {
        const view = VIEWS[name];
        const box = new THREE.Box3().setFromObject(gun);
        if (!view || box.isEmpty()) return false;
        const centre = box.getCenter(new THREE.Vector3());
        const dir = new THREE.Vector3(...view.dir).normalize();
        const up = new THREE.Vector3(...view.up);
        const right = new THREE.Vector3().crossVectors(up, dir).normalize();
        const realUp = new THREE.Vector3().crossVectors(dir, right).normalize();
        // 모든 점이 화면에 들어오는 가장 가까운 거리와, 그때 그림이 가운데 오도록 옮길 양을 함께 구한다.
        // 가로: 점마다 |x - 옮김| <= (거리 - 깊이) * tanX. 양쪽 끝이 똑같이 닿는 옮김이 가장 가깝다. 세로도 같다.
        const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const tanX = tanY * camera.aspect;
        const points = samplePoints();
        if (points.length === 0) for (let i = 0; i < 8; i += 1) points.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
        const far = { xPlus: -Infinity, xMinus: -Infinity, yPlus: -Infinity, yMinus: -Infinity };
        const offset = new THREE.Vector3();
        for (const point of points) {
            offset.copy(point).sub(centre);
            const depth = offset.dot(dir); const x = offset.dot(right) / tanX; const y = offset.dot(realUp) / tanY;
            far.xPlus = Math.max(far.xPlus, depth + x); far.xMinus = Math.max(far.xMinus, depth - x);
            far.yPlus = Math.max(far.yPlus, depth + y); far.yMinus = Math.max(far.yMinus, depth - y);
        }
        const distance = Math.max((far.xPlus + far.xMinus) / 2, (far.yPlus + far.yMinus) / 2) * 1.1;
        const target = centre.clone().addScaledVector(right, tanX * (far.xPlus - far.xMinus) / 2).addScaledVector(realUp, tanY * (far.yPlus - far.yMinus) / 2);
        const size = box.getSize(new THREE.Vector3()).length();
        controls.minDistance = Math.max(0.05, size * 0.12);
        controls.maxDistance = Math.max(4, distance * 2.5);
        camera.up.copy(up);
        camera.position.copy(target).addScaledVector(dir, distance);
        controls.target.copy(target);
        camera.lookAt(target);
        controls.update();
        requestRender();
        return true;
    }
    function refitIfUntouched() { if (!userMoved) fitView(currentView); }

    function resize() {
        if (disposed) return;
        const width = Math.round(canvas.clientWidth);
        const height = Math.round(canvas.clientHeight);
        if (width < 1 || height < 1) return;                       // 숨겨져 있음: 다시 보일 때 ResizeObserver 가 부른다
        const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        if (width === lastWidth && height === lastHeight && ratio === renderer.getPixelRatio()) return;
        lastWidth = width; lastHeight = height;
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);                    // false: canvas.style 을 건드리지 않는다
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        refitIfUntouched();
        renderNow();                                               // 크기를 바꾸면 캔버스가 지워지므로 같은 프레임에 다시 그린다
    }

    // ------------------------------------------------------------ 모형 읽기
    /** 내보내기에서 material.extras 에 표시해 둔 특수 면마다 필요한 처리를 한다 (시험판과 동일). */
    function tune(object) {
        object.traverse((node) => {
            if (!node.isMesh || !node.material || Array.isArray(node.material)) return;
            const material = node.material;
            const data = material.userData || {};
            for (const slot of ['map', 'roughnessMap', 'metalnessMap', 'aoMap']) if (material[slot]) material[slot].anisotropy = Math.min(8, maxAnisotropy);
            if (data.kind === 'surface' && ((data.mask && material.aoMap) || (data.blend && material.emissiveMap)) && !data.layered) { data.layered = true; applyLayerShader(material, data, wearLevel); }
            if (data.overlay === 'multiply') {
                node.material = new THREE.MeshBasicMaterial({ name: material.name, map: material.map, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
                node.material.userData = data;
                node.renderOrder = 1;
                material.dispose();                                // 그림은 새 재질이 계속 쓴다
            } else if (data.overlay === 'alpha') {
                material.depthWrite = false; material.polygonOffset = true; material.polygonOffsetFactor = -4; material.polygonOffsetUnits = -4;
                node.renderOrder = 2;
            } else if (data.kind === 'glow') material.emissiveIntensity = 1.6;
        });
        return object;
    }
    function loadModel(url) {
        if (modelCache.has(url)) return modelCache.get(url);
        const folder = url.slice(0, url.lastIndexOf('/') + 1);
        const manager = new THREE.LoadingManager();
        // 그림은 공용 폴더 하나에 있다. .glb 가 그림을 "tex/이름" 으로 적어 두었으면(시험판 방식) 공용 폴더에서 찾는다.
        manager.setURLModifier((resource) => {
            if (/^(?:data|blob):/.test(resource)) return resource;
            return stamped(resource.startsWith(`${folder}tex/`) && !resource.startsWith(textureRoot) ? textureRoot + resource.slice(folder.length + 4) : resource);
        });
        const promise = new GLTFLoader(manager).loadAsync(url).then((gltf) => {
            const object = tune(gltf.scene);
            if (disposed) { disposeObject(object); throw viewerError('disposed', 'viewer was disposed while loading'); }
            loadedObjects.add(object);
            return object;
        }, (error) => {
            throw viewerError('model', `Could not load model file ${new URL(url).pathname} (${reasonOf(error)})`, error);
        });
        promise.catch(() => { modelCache.delete(url); });           // 실패는 기억하지 않는다: 다시 고르면 다시 받는다
        modelCache.set(url, promise);
        return promise;
    }

    function partUrl(cls) {
        const indexed = partsIndex[cls];
        if (indexed && indexed.ok === false) throw viewerError('no-model', `No 3D model for ${cls}${indexed.reason ? ` (${indexed.reason})` : ''}`);
        const file = indexed?.file || manifest.parts?.[cls]?.file;
        if (!file) throw viewerError('no-model', `No 3D model listed for ${cls}`);
        return resolveFile(file);
    }

    // ------------------------------------------------------------ 포트와 부품
    const markerGeometry = new THREE.SphereGeometry(1, 20, 14);
    const markerColor = Number.isFinite(options.markerColor) ? options.markerColor : 0xf2b233;
    const markerCore = new THREE.MeshBasicMaterial({ color: markerColor, depthTest: false, depthWrite: false, toneMapped: false });
    const markerHalo = new THREE.MeshBasicMaterial({ color: markerColor, depthTest: false, depthWrite: false, toneMapped: false, transparent: true, opacity: 0.28 });
    for (const def of portDefs) {
        const placeable = finiteArray(def.position, 3) && finiteArray(def.rotation, 4);
        const group = new THREE.Group(); group.name = `port:${def.name}`;
        const marker = new THREE.Group(); marker.visible = false;
        if (placeable) {
            group.position.fromArray(def.position);
            group.quaternion.fromArray(def.rotation).normalize();
            const core = new THREE.Mesh(markerGeometry, markerCore); core.renderOrder = 11;
            const halo = new THREE.Mesh(markerGeometry, markerHalo); halo.scale.setScalar(2.4); halo.renderOrder = 10;
            marker.add(halo, core);
            marker.position.fromArray(def.position);
        }
        gun.add(group); markers.add(marker);
        ports.set(def.name, { def, group, marker, current: null, token: 0, placeable });
    }
    function sizeMarkers() {
        const box = new THREE.Box3().setFromObject(gun);
        if (box.isEmpty()) return;
        const radius = Math.min(0.012, Math.max(0.003, box.getSize(new THREE.Vector3()).length() * 0.008));
        for (const port of ports.values()) port.marker.scale.setScalar(radius);
    }

    async function setPart(portName, cls) {
        if (disposed) return null;
        const port = ports.get(portName);
        if (!port) throw viewerError('unknown-port', `This weapon has no port named ${portName}`);
        port.token += 1;
        const token = port.token;
        const clear = () => { port.group.clear(); port.current = null; requestRender(); };
        if (!cls) { clear(); refitIfUntouched(); return null; }
        // 위치 자료가 없는 포트에는 붙이지 않는다 (지어낸 위치로 그리지 않는다).
        if (!port.placeable) { clear(); throw viewerError('no-port-position', `Port ${portName} has no attach position in the model data`); }
        let object;
        try {
            object = await loadModel(partUrl(cls));
        } catch (error) {
            // 모형이 없는 부품을 골랐을 때 이전 부품을 그대로 두면 화면이 거짓말을 한다 → 포트를 비운다.
            if (disposed) return null;
            if (token === port.token) clear();
            throw error;
        }
        if (disposed || token !== port.token) return port.current;   // 받는 동안 더 새로운 선택이 있었다
        if (object.parent && object.parent !== port.group) object = object.clone();   // 같은 부품이 다른 포트에 이미 달려 있다
        port.group.clear();
        port.group.add(object);
        port.current = cls;
        refitIfUntouched();
        requestRender();
        return cls;
    }

    async function setLod(lod) {
        if (disposed) return bodyLod;
        const wanted = Number(lod);
        const entry = bodies.find((body) => body.lod === wanted)
            || [...bodies].sort((a, b) => Math.abs((a.lod ?? 0) - wanted) - Math.abs((b.lod ?? 0) - wanted))[0];
        bodyToken += 1;
        const token = bodyToken;
        let object;
        try {
            object = await loadModel(resolveFile(entry.file));
        } catch (error) {
            if (disposed) return bodyLod;
            throw error;
        }
        if (disposed || token !== bodyToken) return bodyLod;
        if (bodyObject) gun.remove(bodyObject);
        object.name = 'body';
        gun.add(object);
        bodyObject = object;
        bodyLod = entry.lod ?? 0;
        sizeMarkers();
        refitIfUntouched();
        requestRender();
        return bodyLod;
    }

    // ------------------------------------------------------------ 이벤트
    // 휠: 그림을 누른 뒤(포커스가 있을 때)나 Ctrl 을 누른 채로만 확대한다. 그 밖에는 페이지가 평소처럼 내려간다.
    controls.enableZoom = false;
    const onWheelGate = (event) => { controls.enableZoom = document.activeElement === canvas || event.ctrlKey; };
    canvas.addEventListener('wheel', onWheelGate, { capture: true, passive: true });
    const onControlsChange = () => requestRender();
    const onControlsStart = () => { userMoved = true; };
    controls.addEventListener('change', onControlsChange);
    controls.addEventListener('start', onControlsStart);

    const onVisibility = () => { pageVisible = document.visibilityState !== 'hidden'; schedule(); };
    document.addEventListener('visibilitychange', onVisibility);
    const onMotionChange = () => schedule();
    motionQuery?.addEventListener?.('change', onMotionChange);

    const onContextLost = (event) => {
        event.preventDefault();
        contextLost = true;
        try { options.onContext?.({ type: 'lost' }); } catch (_error) { /* 알림 콜백의 오류는 뷰어 문제가 아니다 */ }
    };
    const onContextRestored = () => {
        if (disposed) return;
        contextLost = false;
        try { buildEnvironment(); } catch (_error) { /* 환경 조명 없이도 그린다 */ }
        requestRender();
        try { options.onContext?.({ type: 'restored' }); } catch (_error) { /* 위와 같음 */ }
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // 키보드: 캔버스에 tabindex 가 있을 때만 동작한다. 화살표 = 돌리기, +/- = 확대·축소, Home = 처음 구도.
    const onKeyDown = (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        const step = Math.PI / 12;
        if (event.key === 'ArrowLeft') spherical.theta -= step;
        else if (event.key === 'ArrowRight') spherical.theta += step;
        else if (event.key === 'ArrowUp') spherical.phi = Math.max(0.05, spherical.phi - step);
        else if (event.key === 'ArrowDown') spherical.phi = Math.min(Math.PI - 0.05, spherical.phi + step);
        else if (event.key === '+' || event.key === '=') spherical.radius = Math.max(controls.minDistance, spherical.radius * 0.85);
        else if (event.key === '-' || event.key === '_') spherical.radius = Math.min(controls.maxDistance, spherical.radius / 0.85);
        else if (event.key === 'Home') { event.preventDefault(); userMoved = false; fitView(currentView); return; }
        else return;
        event.preventDefault();
        userMoved = true;
        if (camera.up.y < 0.5) { camera.up.set(0, 1, 0); }           // '위에서' 구도에서 돌리기 시작하면 보통 궤도로 돌아간다
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
        camera.lookAt(controls.target);
        controls.update();
        requestRender();
    };
    canvas.addEventListener('keydown', onKeyDown);

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
    resizeObserver?.observe(canvas);
    const intersectionObserver = typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => { onScreen = entries[entries.length - 1].isIntersecting; schedule(); })
        : null;
    intersectionObserver?.observe(canvas);

    // ------------------------------------------------------------ 정리
    function dispose(disposeOptions) {
        if (disposed) return;
        disposed = true;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        motionQuery?.removeEventListener?.('change', onMotionChange);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
        canvas.removeEventListener('keydown', onKeyDown);
        canvas.removeEventListener('wheel', onWheelGate, { capture: true });
        controls.removeEventListener('change', onControlsChange);
        controls.removeEventListener('start', onControlsStart);
        controls.dispose();
        // OrbitControls 가 canvas.style 에 남긴 값(touch-action, cursor)을 치운다.
        canvas.style.removeProperty('touch-action');
        canvas.style.removeProperty('cursor');
        if (canvas.getAttribute('style') === '') canvas.removeAttribute('style');
        for (const object of loadedObjects) disposeObject(object);
        loadedObjects.clear();
        modelCache.clear();
        for (const port of ports.values()) port.group.clear();
        ports.clear();
        gun.clear(); markers.clear(); scene.clear();
        markerGeometry.dispose(); markerCore.dispose(); markerHalo.dispose();
        scene.environment = null;
        environment?.dispose();
        environment = null;
        renderer.renderLists.dispose();
        renderer.dispose();
        // 컨텍스트를 바로 놓아 준다 (브라우저는 탭당 WebGL 컨텍스트 수를 제한한다).
        // 그러면 이 canvas 는 다시 쓸 수 없다 → 새 뷰어에는 새 canvas 를 준다. 같은 canvas 를 다시 쓰려면 { keepContext: true }.
        if (!disposeOptions?.keepContext) renderer.forceContextLoss();
    }

    // ------------------------------------------------------------ 시작: 몸체 → 기본 부품 → 첫 화면
    try {
        resize();
        const startLod = Number.isFinite(options.lod) ? options.lod : Number.isFinite(manifest.weapon.defaultLod) ? manifest.weapon.defaultLod : bodies[0].lod ?? 0;
        await setLod(startLod);
        const initial = options.parts && typeof options.parts === 'object' ? options.parts : null;
        await Promise.all([...ports.values()].map(async (port) => {
            const cls = initial ? initial[port.def.name] : port.def.gameDefault ?? port.def.default;
            if (!cls) return;
            try {
                await setPart(port.def.name, cls);
            } catch (error) {
                failed.push({ port: port.def.name, cls, code: error.code || 'viewer', message: reasonOf(error) });   // 부품 하나가 없어도 총은 보여 준다
            }
        }));
        if (disposed) throw viewerError('disposed', 'viewer was disposed while loading');
        sizeMarkers();
        fitView(currentView);
        renderNow();
        schedule();
    } catch (error) {
        dispose();
        throw error;
    }

    const safe = (fn, fallback) => (...args) => {
        if (disposed) return fallback;
        try { return fn(...args); } catch (_error) { return fallback; }
    };
    const guarded = (fn) => async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            throw error?.name === 'GunViewerError' ? error : viewerError('viewer', reasonOf(error), error);
        }
    };

    return {
        /** 포트에 부품을 단다 (null 이면 뗀다). 실제로 달린 클래스를 돌려준다. 모형이 없으면 포트를 비우고 reject(code 'no-model'). */
        setPart: guarded(setPart),
        /** 'side' | 'iso' | 'top' | 'back' (+ 'right'). 구도를 맞추고 true, 모르는 이름이면 false. */
        setView: safe((name) => {
            if (!VIEWS[name]) return false;
            currentView = name; userMoved = false;
            return fitView(name);
        }, false),
        /** 몸체 정밀도. 없는 단계면 가장 가까운 단계를 쓰고, 실제 단계를 돌려준다. 부품 모형은 한 단계뿐이다. */
        setLod: guarded(setLod),
        /** 그 포트의 부착 위치에 점을 표시한다. null 이면 끈다. */
        highlightPort: safe((portName) => {
            highlighted = portName && ports.has(portName) ? portName : null;
            for (const [name, port] of ports) port.marker.visible = name === highlighted && port.placeable;
            requestRender();
            return highlighted !== null;
        }, false),
        /** 마모 정도 0(새 총)..1. 계약 밖 추가. */
        setWear: safe((level) => {
            if (!Number.isFinite(level)) return false;
            wearLevel.value = Math.min(1, Math.max(0, level));
            requestRender();
            return true;
        }, false),
        /** 천천히 돌리기 켜고 끄기. "동작 줄이기" 설정이면 켜도 돌지 않는다. 계약 밖 추가. */
        setAutoRotate: safe((on) => { wantSpin = !!on; if (wantSpin) userMoved = false; schedule(); return spinning(); }, false),
        /** 지금 바로 한 장 그린다 (스크린샷·테스트용). */
        render: safe(() => { renderNow(); return true; }, false),
        stats: safe(() => {
            const parts = {};
            for (const [name, port] of ports) parts[name] = port.current;
            return { triangles: countTriangles(gun), drawCalls: renderer.info.render.calls, lod: bodyLod, view: currentView, parts, highlighted, contextLost, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
        }, { triangles: 0 }),
        /** 처음 장착에서 모형을 못 구한 부품 목록 (총 자체는 정상 표시). */
        failed,
        ports: portDefs.map((def) => def.name),
        /** 모든 자원을 놓는다. 기본은 WebGL 컨텍스트까지 버리므로 같은 canvas 로 다시 만들 수 없다 (새 canvas 를 쓰거나 { keepContext: true }). */
        dispose: (disposeOptions) => { try { dispose(disposeOptions); } catch (_error) { /* 정리 중 오류는 삼킨다 */ } },
    };
}
