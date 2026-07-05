import { requireAdmin } from '../../../../_shared/auth.js';
import { json, error, methodNotAllowed } from '../../../../_shared/http.js';
import {
  ERKUL_SHIPS_ENDPOINT,
  ERKUL_SHOP_ENDPOINT,
  ErkulFetchError,
  fetchErkulJson,
  parseDataLayerJs,
  buildSyncPreview,
  buildNextLayers,
  computePreviewHash
} from '../../../../_shared/erkul-sync.js';

// Erkul live 동기화 미리보기 (읽기 전용).
// 현재 배포된 data/ship-live-stats.js·ship-market.js를 기준으로 Erkul 최신 데이터와의 diff를 반환한다.
// 어떤 경우에도 파일/DB를 쓰지 않는다. 실제 반영(apply)은 A-8에서 별도 구현한다.

export async function onRequest({ request, env }) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  if (request.method !== 'GET') return methodNotAllowed();

  if (!env.ASSETS?.fetch) {
    return error('정적 에셋 바인딩(ASSETS)을 사용할 수 없습니다.', 500);
  }

  const origin = new URL(request.url).origin;
  const fetchAsset = async (path, { optional = false } = {}) => {
    const response = await env.ASSETS.fetch(new Request(`${origin}${path}`));
    if (!response.ok) {
      if (optional) return null;
      throw new Error(`정적 에셋을 읽지 못함: ${path} (${response.status})`);
    }
    return response.text();
  };

  let currentStats;
  let currentMarket;
  let matchBaseline = null;
  try {
    currentStats = parseDataLayerJs(await fetchAsset('/data/ship-live-stats.js'), 'VOLT_SHIP_LIVE_STATS');
    currentMarket = parseDataLayerJs(await fetchAsset('/data/ship-market.js'), 'VOLT_SHIP_MARKET');
    // A-4 매칭 리포트(미매칭 VOLT 목록)는 참고용 — 없어도 preview는 동작한다.
    const matchReportText = await fetchAsset('/data/external/erkul/ship-match-report.json', { optional: true });
    if (matchReportText) {
      const matchReport = JSON.parse(matchReportText);
      matchBaseline = { unmatchedVolt: matchReport.unmatchedVolt ?? [] };
    }
  } catch (cause) {
    return error(`현재 데이터 레이어를 읽지 못했습니다: ${cause.message}`, 500);
  }

  let erkulShipsRaw;
  let erkulShopsRaw;
  try {
    erkulShipsRaw = await fetchErkulJson(ERKUL_SHIPS_ENDPOINT);
    erkulShopsRaw = await fetchErkulJson(ERKUL_SHOP_ENDPOINT);
  } catch (cause) {
    if (cause instanceof ErkulFetchError) {
      const status = cause.kind === 'timeout' || cause.kind === 'network' ? 503 : 502;
      return error(`Erkul 데이터를 가져오지 못했습니다: ${cause.message}`, status);
    }
    throw cause;
  }

  if (!Array.isArray(erkulShipsRaw) || erkulShipsRaw.length < 100) {
    return error(`Erkul ships 응답이 비정상입니다 (records: ${Array.isArray(erkulShipsRaw) ? erkulShipsRaw.length : typeof erkulShipsRaw})`, 502);
  }
  if (!Array.isArray(erkulShopsRaw) || erkulShopsRaw.length < 20) {
    return error(`Erkul shop 응답이 비정상입니다 (records: ${Array.isArray(erkulShopsRaw) ? erkulShopsRaw.length : typeof erkulShopsRaw})`, 502);
  }

  const preview = buildSyncPreview({ currentStats, currentMarket, erkulShipsRaw, erkulShopsRaw, matchBaseline });
  // Safe Apply(A-8)용 hash: 로컬 스크립트가 같은 조건으로 재계산해 일치할 때만 파일을 쓴다.
  const nextLayers = buildNextLayers({ currentStats, currentMarket, erkulShipsRaw, erkulShopsRaw });
  preview.previewHash = await computePreviewHash(nextLayers);
  preview.apply = {
    method: 'local-script',
    command: `npm run shipdb:erkul:apply -- --confirm-preview-hash ${preview.previewHash}`,
    note: '정적 파일 레이어는 운영 API에서 쓰지 않는다. 로컬에서 위 명령으로 적용 후 git 커밋/배포한다.'
  };
  return json(preview);
}
