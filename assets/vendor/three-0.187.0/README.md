# three.js 0.187.0

Self-hosted three.js 0.187.0 (MIT), copied from the pinned npm package by `scripts/vendor-three.mjs`.
Only the files the weapon viewer (`js/gear-viewer.js`) imports are here.

The only change to the upstream files: the bare module specifier `'three'` in the addon files is rewritten to a
relative path (`../../../build/three.module.js`), because the site CSP (`script-src 'self'`) rules out an import map.
Copyright and license: see `LICENSE` in this folder.

- Source: https://www.npmjs.com/package/three/v/0.187.0
- Refresh: `npm ci && npm run three:vendor` (then update the import paths at the top of `js/gear-viewer.js` if the version changed)
- Verify: `node scripts/vendor-three.mjs --verify` (included in `npm run check`)

| file | bytes | rewritten imports |
|---|---:|---:|
| build/three.module.js | 658900 | 0 |
| build/three.core.js | 1474799 | 0 |
| examples/jsm/loaders/GLTFLoader.js | 119886 | 1 |
| examples/jsm/utils/BufferGeometryUtils.js | 39178 | 1 |
| examples/jsm/utils/SkeletonUtils.js | 11560 | 1 |
| examples/jsm/controls/OrbitControls.js | 40943 | 1 |
| examples/jsm/environments/RoomEnvironment.js | 4985 | 1 |
