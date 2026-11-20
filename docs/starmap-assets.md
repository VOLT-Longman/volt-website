# 성계지도 그림 자료 (행성·위성 표면 그림)

2026-11-20 운영 정책: 비공개 R2의 행성 그림을 사이트 경로로 임시 공개한다. 아래 함대원 검사는 `FLEET_TOOLS_REQUIRE_MEMBERSHIP=true`일 때 적용된다.

성계지도(`#starmap`)가 쓰는 행성·위성 그림을 게임 파일에서 꺼내는 방법, 이름 규칙, 구에 입히는 방법, 비공개로 내려주는 방법을 적는다.
기준 게임 빌드: `4.10.200.58746`. 아래 숫자는 전부 2026-11-19에 이 저장소의 스크립트를 실제로 돌려 얻은 값이다.

## 한눈에

| 항목 | 값 |
|---|---|
| 그림 수 | 30장 (스탠턴 16, 파이로 11, 닉스 3). 읽지 못한 그림 0장 |
| 512 크기 합계 | 1,476,372바이트 (약 1.4 MB) |
| 1k 크기 합계 | 6,007,582바이트 (약 5.7 MB) |
| 합계(60개 파일) | 7,483,954바이트 |
| 버전(`assetVersion`) | `4.10.200.58746-9f6cc57a82` |
| 형식 | WebP, 품질 0.85, 전부 불투명 |
| 2k·4k | 내보내지 않는다 (휴대폰 그래픽 메모리 때문) |

항성 3개(스탠턴·파이로·닉스)는 게임에도 그림이 없다. 단색(주황)뿐이므로 화면에서 직접 그린다.

## 만드는 법

```powershell
node scripts/starmap/export-textures.mjs --cache-dir <build.json 이 있는 폴더>
```

- 읽는 곳(읽기 전용): `Data.p4k` 안 `Data/UI/starmap/textures/<항성계>/ui_sm_*.dds` 와 그 조각 파일(`.dds.1` …), 그리고 재질 `Data/Materials/UI/Starmap/PlanetsMoons/<항성계>/*.mtl`.
- 디코더는 총기 모형 내보내기의 것을 그대로 쓴다: `scripts/gear/models/dds.mjs`(BC7·BC3 풀기), `scripts/gear/models/webp.mjs`(PC의 Chrome으로 WebP 만들기, 네트워크 사용 없음).
- 게임 파일에 들어 있는 축소본(밉맵)을 그대로 쓴다. 우리가 줄이거나 자르거나 뒤집지 않는다.
- 알파는 전부 255(불투명)로 바꾼다. 실제로 불투명이 아니던 픽셀이 있던 그림은 2장: 크루세이더(1k 기준 4,092픽셀), 닉스 III(4,868픽셀).
- `--cache-dir` 를 주지 않으면 빌드 번호를 모르므로 버전이 `build-…` 로 시작한다. 배포용은 반드시 `--cache-dir` 를 준다.
- 같은 그림이면 버전도 같다(버전 뒷부분은 파일 내용의 SHA-256에서 만든다). 두 번 돌려 같은 버전이 나오는 것을 확인했다.

나오는 파일:

| 파일 | Git | 설명 |
|---|---|---|
| `assets/models/starmap/tex/<key>_512.webp`, `<key>_1k.webp` | **넣지 않음** (`.gitignore`) | 게임 그림. 비공개 R2 에만 올린다 |
| `data/starmap/textures.json` | 넣음 | 목록. 그림 자체는 없고 이름·크기·해시뿐 |
| `functions/_shared/starmap-texture-version.js` | 넣음 | 서버가 쓰는 버전 한 줄(자동 생성) |

`data/starmap/textures.json` 의 모양:

```json
{
  "assetVersion": "4.10.200.58746-9f6cc57a82",
  "base": "assets/models/starmap/tex",
  "sizes": ["512", "1k"],
  "projection": { "type": "equirectangular", "three": { "flipY": true, "colorSpace": "srgb", "meshRotationYDegrees": -90 } },
  "textures": {
    "ui_sm_stanton_2_crusader": {
      "source": "Data/UI/starmap/textures/stanton/ui_sm_stanton_2_crusader.dds",
      "system": "stanton", "format": "DXT5 (BC3)", "native": [4096, 4096], "alphaForced": 4092,
      "files": {
        "512": { "file": "assets/models/starmap/tex/ui_sm_stanton_2_crusader_512.webp", "width": 512, "height": 512, "bytes": 97298, "sha256": "…" },
        "1k":  { "file": "assets/models/starmap/tex/ui_sm_stanton_2_crusader_1k.webp", "width": 1024, "height": 1024, "bytes": 339700, "sha256": "…" }
      }
    }
  },
  "materials": { "materials/ui/starmap/planetsmoons/stanton/ui_sm_stanton_2_crusader.mtl": "ui_sm_stanton_2_crusader" },
  "materialsWithoutTexture": [],
  "failed": []
}
```

화면이 그림을 부르는 주소: `/<files[크기].file>?v=<assetVersion>` (예: `/assets/models/starmap/tex/ui_sm_stanton_2_crusader_512.webp?v=4.10.200.58746-9f6cc57a82`).

## key 규칙 (자료 빌드와 화면이 똑같이 써야 한다)

> 천체 기록(StarMapObject)의 `starMapMaterialPath` → 그 재질 파일(.mtl) 안에서 `Map="TexSlot4"` 인 `Texture` 의 `File` → 경로의 마지막 이름 → 확장자 제거 → 전부 소문자.

예: `Materials/UI/Starmap/PlanetsMoons/Nyx/ui_sm_nyx_2.mtl` → `ui/starmap/textures/Nyx/ui_sm_nyx_2.tif` → **`ui_sm_nyx_2`**

- 코드: `scripts/starmap/export-textures.mjs` 의 `textureKey(file)` 와 `colourMapOf(material)` 를 가져다 쓰면 된다.
- 재질 파일을 다시 열고 싶지 않으면 `textures.json` 의 `materials` 표를 쓴다: `starMapMaterialPath` 를 소문자로 바꾸고 `\` 를 `/` 로 바꾼 값이 열쇠다(맨 앞 `Data/` 없음). 30개 재질 전부 들어 있다.
- key 가 `textures` 에 없으면 그 천체는 **게임 자료에 그림이 없는 것**이다. 다른 천체 그림을 빌려 쓰지 않는다. 화면은 단색 구로 그린다.

주의할 천체(조사 자료 `C:/VOLT/starmap-research/verify-visuals/chain.json` 기준, 이번에 다시 확인하지는 않았다):

| 천체 | 상황 | 권장 |
|---|---|---|
| 파이로 V (가스 행성) | 게임 기록이 위성 이그니스의 재질 `ui_sm_pyro_5a.mtl` 을 가리킨다. 규칙대로면 key 는 `ui_sm_pyro_5a` 가 된다 | 게임 자료가 그렇게 되어 있다는 것일 뿐, 파이로 V 고유 그림은 **게임 자료에 없음**. 그대로 쓰면 가스 행성에 위성 그림이 입혀지므로, 쓸지 말지는 자료 담당·화면 담당이 정한다 |
| Ellis3 | 마이크로텍 재질을 가리킨다 | 지도에 나오지 않는 항성계. 해당 없음 |
| 델라마 | 재질에 `TexSlot4` 가 없다(128px 옛 그림이 `TexSlot1` 에 있음) | key 없음 → 그림 없음. 위치도 게임 자료에 없다 |
| 항성 3개 | 재질에 그림이 없다 | key 없음 → 화면에서 단색으로 그린다 |

## 구에 입히는 방법 (확인 끝)

**결론: 뒤집힘도 좌우 반전도 없다. three.js 기본 설정에 구를 -90도만 돌리면 게임과 같다.**

```js
const texture = await new THREE.TextureLoader().loadAsync(url);
texture.colorSpace = THREE.SRGBColorSpace;   // 게임 그림이 sRGB 로 저장되어 있다
// texture.flipY 는 기본값(true) 그대로 둔다
texture.wrapS = THREE.RepeatWrapping;        // 이음매에서 가로로 이어지도록
texture.wrapT = THREE.ClampToEdgeWrapping;   // 극에서 반대쪽 극 색이 번지지 않도록
const globe = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), material);
globe.rotation.y = -Math.PI / 2;             // 그림의 좌우 끝(이음매)을 게임 구와 같은 자리에 둔다
```

| 질문 | 답 | 근거 |
|---|---|---|
| 어떤 지도인가 | 가로 = 경도 360도, 세로 = 위도 180도인 펼친 지도(등장방형) | 게임 구 모형의 UV: `v = 0.5 - 위도/180` 과의 차이가 최대 0.001 |
| 정사각형인데? | 2:1 그림을 정사각형으로 눌러 저장한 것. UV 0..1 로 그대로 입히면 된다. 닉스 I·II 만 원래 2:1(1k 는 1024x512, 512 는 512x256) | 구에 입힌 화면에서 극지방이 깔끔하게 모인다 |
| 위아래 | 그림 맨 윗줄 = 북극(게임 +Z, three.js +Y). 뒤집히지 않았다 | 게임 구 모형에서 v 와 z 의 상관 -0.993 |
| 좌우 반전 | 없다. 그림의 오른쪽 = 동쪽 | 게임 구 모형에서 `u = 경도/360 - 0.25`, 어긋난 꼭짓점 0 / 5,917. 글자를 쓴 시험 그림을 게임 구에 입혀 밖에서 보면 글자가 바로 읽힌다 |
| 이음매 | 그림의 좌우 끝이 만나는 곳. 게임 구에서는 게임 +Y 방향(three.js 로 옮기면 -Z) | 같은 식. 30장 모두 좌우 끝의 색 차이가 이웃 픽셀 차이와 비슷하다(이어진다) |
| 아크코프가 뒤집혀 보인 이유 | 그림 자체가 적도를 기준으로 위아래가 거의 대칭으로 그려져 있다. 방향 문제가 아니다 | 위아래 대칭 차이 3.77 (무관한 픽셀끼리 10.02). 다른 29장은 대칭이 아니다 |

좌표 옮기기: 게임은 Z 가 위, three.js 는 Y 가 위다. 이 문서의 확인은 게임 `(x, y, z)` → three.js `(x, z, -y)` 로 옮긴 것이다. 자료 쪽이 다른 축 규칙을 쓰면 회전값도 그에 맞춰야 한다.
`rotation.y` 대신 `texture.offset.x = 0.25` 를 써도 같은 결과다(이때 `wrapS = RepeatWrapping` 이 꼭 필요하다). 둘 중 하나만 쓴다.

확인한 방법 (전부 실제로 돌린 것):

1. 게임이 성계지도에서 쓰는 구 모형 `Objects/UI/holo/holovolume/ui_hologlobe/ui_hs_planetary_sphere_large.cgf` 를 기존 모형 읽기 코드(`scripts/gear/models/ivo.mjs`)로 열어 꼭짓점 6,143개의 위치와 UV 를 비교했다. 삼각형 12,096개 전부 바깥을 향한다.
2. 임시 three.js 화면에서 **게임 구 모형 + 게임 UV** 와 **three.js `SphereGeometry` + 위 설정** 을 나란히 그려 Playwright 로 찍고 눈으로 비교했다: 글자 시험 그림, 크루세이더, 허스턴, 마이크로텍, 아크코프, 파이로 III(블룸). 네 방향(앞·옆·뒤·북극 위) 모두 두 줄이 같았다. 닉스 I·닉스 III·파이로 Va 도 찍었으나 눈으로 보지는 않았다.
3. 30장 전부에 대해 512 그림으로 이음매·극·대칭을 숫자로 검사했다.

확인 도구와 화면(게임 그림이 들어 있어 저장소 밖에 둔다): `C:/VOLT/starmap-research/build/assets/` — `globe-uv.mjs`, `globe-uv2.mjs`, `flatcheck.mjs`, `wrap/`(화면·찍는 스크립트·`shot-*.png`).

### 확인하지 못한 것

- **실행 중인 게임 화면과 비교하지 않았다.** 위 결론은 게임 파일(구 모형 UV)이 근거다.
- **그림 위의 지형과 실제 장소 위치가 맞는지는 모른다.** 게임 성계지도 재질은 이 그림을 가로로 계속 흘려보내게 되어 있다(`TexSlot4` 에 `TexMod_UOscillatorType=2`, 속도 0.022). 즉 게임 지도에서도 그림의 경도는 고정되어 있지 않다. 그러므로 도시·전초기지 표시를 그림 속 지형 위에 정확히 얹었다고 화면에서 말하면 안 된다. 얹는다면 "추정" 이라고 적는다.
- 가스 행성 그림(크루세이더, 닉스 III)은 극의 맨 윗줄 색이 한 가지가 아니어서, 극 바로 위에서 보면 한 점으로 모이는 무늬가 보인다. 그림 자체의 특성이다.
- 게임은 이 그림 위에 색조·빛·점무늬를 더한다(홀로그램 재질). 우리가 내보낸 것은 원본 그림뿐이라 게임 지도와 색이 똑같지는 않다.
- 실제 휴대폰에서의 표시·메모리 사용은 재지 않았다.

## 비공개로 내려주기

게임 그림은 함대원에게만 준다. 총기 모형(`docs/gun-modding-fleet-access.md`)과 같은 방식이다.

- **새 Cloudflare 설정이 필요 없다.** 이미 있는 비공개 버킷 `volt-fleet-gear`(Pages 바인딩 `FLEET_GEAR_MODELS`)를 같이 쓰고, 열쇠 앞머리만 따로 둔다.
  - 총기 모형: `<gear 버전>/weapons/…`, `<gear 버전>/parts/…`, `<gear 버전>/tex/…`
  - 성계지도: `starmap/<assetVersion>/tex/<key>_512.webp`, `starmap/<assetVersion>/tex/<key>_1k.webp`, `starmap/<assetVersion>/_release.json`
  - 총기 모형 버전은 빌드 번호로 시작하므로(`4.10.…`) `starmap/` 과 겹치지 않는다.
- 보호 대상(`functions/_shared/fleet-access.js`): `/assets/models/starmap/**` 와 `/data/starmap/**`. 루트 미들웨어(`functions/_middleware.js`)가 파일·R2 보다 먼저 함대원 확인을 한다. 비로그인 401, 함대원 역할 없음 403, 인증·설정 오류 503. GET·HEAD 모두 같다.
- 그림은 `functions/_shared/starmap-textures.js` 가 R2 에서만 꺼낸다. 허용하는 이름은 `tex/<소문자·숫자·밑줄>_(512|1k).webp` 뿐이고, 주소의 `?v=` 가 현재 버전과 다르면 404, R2 객체의 `assetversion` 메타데이터가 현재 버전과 다르면 404, 버킷이 연결되지 않았거나 오류면 503 이다. **어떤 경우에도 정적 파일로 넘어가지 않는다**(실수로 그림이 배포에 섞여도 공개되지 않는다).
- 모든 보호 응답: `Cache-Control: private, no-store`, `CDN-Cache-Control: no-store`, `Cloudflare-CDN-Cache-Control: no-store`, `Vary: Cookie`, `X-Content-Type-Options: nosniff`.
- 서비스 워커(`sw.js`)는 `/assets/models/**` 와 `/data/starmap/**` 를 저장하지도 읽지도 않는다. CSP 는 바꾸지 않았다.
- 로컬 미리보기: `scripts/dev-server.js` 는 로컬 폴더 `assets/models/starmap/` 을 같은 주소로 그대로 내려준다(로그인 확인 없음, 개발 PC 전용).
- 화면 쪽 약속: 함대원이 아닌 사용자에게는 `/data/starmap/**` 와 그림을 **요청하지 않는다**(도우미 화면과 같은 확인·안내).

올리기(운영자 허락 뒤에만. 이번 작업에서는 올리지 않았다):

```powershell
node scripts/starmap/check-private-textures.mjs   # Git 에 그림이 없는지
node scripts/starmap/upload-textures.mjs          # 로컬 검사만 (기본)
node scripts/starmap/upload-textures.mjs --upload # 올리고, 파일마다 다시 받아 SHA-256 비교
node scripts/starmap/upload-textures.mjs --verify # 올리지 않고 원격 전체 비교
```

- 환경 변수는 총기 모형과 같다: `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (버킷 이름이 다르면 `FLEET_GEAR_BUCKET`). 키를 Git·대화·명령 인수에 넣지 않는다.
- 객체마다 `customMetadata` 에 `assetversion` 과 `sha256` 을 적는다. 같은 버전에 다른 내용은 덮어쓰지 않는다(새로 내보내면 새 버전 폴더가 된다).
- 올리기 전에 로컬 폴더가 `textures.json` 과 이름·크기·해시까지 같은지, 서버 버전 파일과 같은지 검사한다.
- 순서: 그림 올리기 → `--verify` → 코드 배포. 게임 패치 뒤에는 다시 내보내고(새 버전) 같은 순서로 한다.

## 자동 검사

- `npm run check` 에 두 가지가 들어 있다: `scripts/starmap/check-private-textures.mjs`(그림이 Git 추적·이력·작업 목록에 없는지, `.gitignore` 규칙이 살아 있는지) 와 `scripts/starmap/sync-texture-version.mjs --verify`(서버 버전 = `textures.json` 버전).
- `tests/functions/starmap-textures.test.mjs`: 비로그인 401, 비함대원·관리자 403, 함대원 200, HEAD, 잘못된 주소·다른 버전 404, 다른 메서드 405, 저장소 없음·오류 503, 인코딩된 주소, 캐시 머리글, R2 열쇠 모양, `textures.json` 과 key 규칙.
- `tests/functions/service-worker-cache.test.mjs`: 성계지도 주소가 서비스 워커 저장을 거치지 않는지.

실제 Cloudflare(R2·Pages)에서의 동작은 확인하지 않았다. 서버 시험은 가짜 버킷으로 한 것이다.
