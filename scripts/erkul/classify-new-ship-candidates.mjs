import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// 신규 함선 추가 트랙 1단계 — 후보 분류표 생성 (리포트 전용, DB 반영 없음).
//
// 분류 기준 (2026-07 리뷰어 승인 기준):
// - 추가 후보: 정식 독립 선체(기본형) + Erkul stats 존재. 인게임 구매처 유무는 참고 정보로 병기.
// - 보류: Pirate/Executive/BIS/스킨류 에디션 — 기본형과 별도 가치가 있을 때만 추가하므로 운영자 판단 대기.
// - 제외: 함선이 아닌 항목(모듈 등).
// - 수동매핑 후보: market-only 선체(stats 없음) — 자동 추가 금지, 기존 VOLT id와의 수동 매핑만 검토.
// - 유지: VOLT-only unreleased — 현행 유지(폴백 대상), 조치 없음.
//
// 사용: npm run shipdb:erkul:classify-candidates

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MATCH_REPORT_PATH = resolve(ROOT, 'data/external/erkul/ship-match-report.json');
const SHIPS_NORMALIZED_PATH = resolve(ROOT, 'data/external/erkul/ships-normalized.json');
const MARKET_PATH = resolve(ROOT, 'data/external/erkul/ship-market-normalized.json');
const MANUAL_MAP_PATH = resolve(ROOT, 'data/external/erkul/manual-ship-map.json');
const REPORT_JSON_PATH = resolve(ROOT, 'data/external/erkul/new-ship-candidates-report.json');
const REPORT_MD_PATH = resolve(ROOT, 'docs/shipdb-new-ship-candidates.md');

// Erkul-only 9척의 명시적 분류. 자동 패턴 매칭 대신 함선별 근거를 기록한다 (추정 분류 금지).
const ERKUL_ONLY_CLASSIFICATION = {
    aegs_tiburon: {
        verdict: '추가 후보',
        reason: '신규 정식 독립 선체(Aegis 헤비 건쉽, 기본형). Erkul stats 완비. 인게임 판매는 아직 없음(pledge 획득).'
    },
    gama_tyilui: {
        verdict: '추가 후보',
        reason: '신규 정식 독립 선체(Gatac 캐리어, 기본형). Erkul stats 완비. 인게임 판매는 아직 없음.'
    },
    misc_starlite: {
        verdict: '추가 후보',
        reason: '신규 정식 독립 선체(MISC 경급유선, 기본형). Erkul stats 완비. 인게임 판매는 아직 없음.'
    },
    anvl_lightning_f8: {
        verdict: '보류',
        reason: 'F8A(군용 사양)는 일반 획득 경로가 없고, 민수형 F8C Lightning은 이미 VOLT DB에 존재(f8c-lightning). 별도 등재 가치 판단 필요.'
    },
    drak_caterpillar_pirate: {
        verdict: '보류',
        reason: 'Caterpillar의 Pirate 에디션 — 기본형(caterpillar)이 이미 DB에 존재. 에디션류는 별도 가치가 있을 때만 추가.'
    },
    drak_dragonfly_pink: {
        verdict: '보류',
        reason: 'Dragonfly의 Star Kitten 스킨 변형 — 기본형이 이미 DB에 존재. 스킨류는 별도 가치가 있을 때만 추가.'
    },
    anvl_hornet_f7cm_mk2_heartseeker: {
        verdict: '보류',
        reason: 'F7C-M Mk II의 Heartseeker 에디션 — 기본형 계열이 이미 DB에 존재. 에디션류는 별도 가치가 있을 때만 추가.'
    },
    orig_600i_executive_edition: {
        verdict: '보류',
        reason: '600i의 Executive 에디션 — 기본형(600i)이 이미 DB에 존재. 에디션류는 별도 가치가 있을 때만 추가.'
    },
    drak_command_module: {
        verdict: '제외',
        reason: '함선이 아님 — Caterpillar 커맨드 모듈(선체 부속). VOLT 함선DB 등재 대상 아님.'
    }
};

async function main() {
    const matchReport = JSON.parse(await readFile(MATCH_REPORT_PATH, 'utf8'));
    const norm = JSON.parse(await readFile(SHIPS_NORMALIZED_PATH, 'utf8'));
    const market = JSON.parse(await readFile(MARKET_PATH, 'utf8'));
    const manualMap = JSON.parse(await readFile(MANUAL_MAP_PATH, 'utf8'));
    const byLocal = new Map(norm.ships.map((s) => [s.localName, s]));

    const rows = [];
    const unclassified = [];

    for (const u of matchReport.unmatchedErkul) {
        const rule = ERKUL_ONLY_CLASSIFICATION[u.localName];
        if (!rule) {
            // 새 동기화에서 처음 보는 Erkul-only 함선 — 분류표 갱신 전까지 보류로 기록
            unclassified.push(u.localName);
        }
        const ship = byLocal.get(u.localName);
        const st = ship?.externalStats ?? {};
        const m = market.ships?.[u.localName];
        rows.push({
            localName: u.localName,
            name: u.name,
            manufacturer: u.manufacturer,
            group: 'erkul-only',
            verdict: rule?.verdict ?? '보류(미분류)',
            reason: rule?.reason ?? '분류표에 없는 신규 항목 — 운영자 분류 필요',
            hasStats: st.hp !== null && st.hp !== undefined,
            role: st.role ?? null,
            hp: st.hp ?? null,
            purchaseCount: m?.purchase?.length ?? 0,
            rentalCount: m?.rentals?.length ?? 0
        });
    }

    for (const u of matchReport.marketOnlyUnmatched) {
        const candidate = (manualMap.candidates ?? []).find((c) => c.erkulLocalName === u.erkulLocalName);
        rows.push({
            localName: u.erkulLocalName,
            name: null,
            manufacturer: null,
            group: 'market-only',
            verdict: '수동매핑 후보',
            reason: `Erkul ships 목록에 없어 stats 없음 — 자동 추가 금지. ${candidate?.hintVoltId ? `기존 VOLT id "${candidate.hintVoltId}"와의 수동 매핑만 검토 (확정은 운영자).` : '수동 매핑 대상 검토 필요.'}`,
            hasStats: false,
            role: null,
            hp: null,
            purchaseCount: null,
            rentalCount: null,
            hintVoltId: candidate?.hintVoltId ?? null,
            marketRows: u.rows
        });
    }

    const summary = {};
    for (const row of rows) summary[row.verdict] = (summary[row.verdict] ?? 0) + 1;

    const report = {
        generatedAt: norm.syncedAt,
        policy: {
            add: '정식 독립 선체(기본형) + Erkul stats 존재만 추가 후보',
            hold: 'Pirate/Executive/스킨류 에디션은 기본형과 별도 가치가 있을 때만 (운영자 판단)',
            exclude: '함선이 아닌 항목',
            manualMap: 'market-only(stats 없음)는 자동 추가 금지 — 수동 매핑 후보로만',
            keep: 'VOLT-only unreleased 30척은 유지/폴백 (조치 없음)'
        },
        summary,
        voltOnlyUnreleased: {
            verdict: '유지',
            count: matchReport.unmatchedVolt.length,
            voltIds: matchReport.unmatchedVolt.map((s) => s.voltId)
        },
        candidates: rows,
        unclassified
    };

    await writeFile(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(REPORT_MD_PATH, renderMarkdown(report), 'utf8');

    console.log(`후보 ${rows.length}종 분류: ${Object.entries(summary).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
    console.log(`VOLT-only unreleased ${report.voltOnlyUnreleased.count}척: 유지(조치 없음)`);
    if (unclassified.length) console.log(`⚠ 미분류 신규 항목 ${unclassified.length}건 — 분류표 갱신 필요: ${unclassified.join(', ')}`);
    console.log(`리포트: ${REPORT_JSON_PATH} / ${REPORT_MD_PATH}`);
}

function renderMarkdown(report) {
    const groups = ['추가 후보', '보류', '제외', '수동매핑 후보'];
    const lines = [
        '# ShipDB 신규 함선 후보 분류표',
        '',
        '신규 함선 추가 트랙 1단계 — **분류만 하고 DB에는 반영하지 않는다.**',
        '재현: `npm run shipdb:erkul:classify-candidates` (입력: A-4 match report + A-2/A-3 normalized)',
        '',
        `- 데이터 기준: Erkul live ${report.generatedAt}`,
        `- 요약: ${Object.entries(report.summary).map(([k, v]) => `**${k} ${v}**`).join(' · ')} · 유지(VOLT-only unreleased) ${report.voltOnlyUnreleased.count}`,
        '',
        '## 분류 정책',
        '',
        `- 추가 후보: ${report.policy.add}`,
        `- 보류: ${report.policy.hold}`,
        `- 제외: ${report.policy.exclude}`,
        `- 수동매핑 후보: ${report.policy.manualMap}`,
        `- 유지: ${report.policy.keep}`,
        ''
    ];
    for (const group of groups) {
        const rows = report.candidates.filter((r) => r.verdict === group || (group === '보류' && r.verdict.startsWith('보류')));
        if (!rows.length) continue;
        lines.push(`## ${group} (${rows.length})`, '');
        lines.push('| localName | 이름 | stats | 인게임 구매처 | 근거 |', '|---|---|---|---|---|');
        for (const r of rows) {
            const stats = r.hasStats ? `✅ (hp ${r.hp?.toLocaleString('en-US')})` : '❌ 없음';
            const marketInfo = r.purchaseCount === null ? `shop ${r.marketRows}행` : (r.purchaseCount > 0 ? `${r.purchaseCount}곳` : '없음');
            const name = r.name ?? (r.hintVoltId ? `→ VOLT \`${r.hintVoltId}\` 후보` : '?');
            lines.push(`| \`${r.localName}\` | ${name} | ${stats} | ${marketInfo} | ${r.reason} |`);
        }
        lines.push('');
    }
    lines.push(
        '## 유지 — VOLT-only unreleased (' + report.voltOnlyUnreleased.count + '척)',
        '',
        '컨셉/미출시 함선. live 레이어 없이 기존 volt-data 표시로 폴백되는 현행 동작을 유지한다.',
        '',
        report.voltOnlyUnreleased.voltIds.map((id) => `\`${id}\``).join(', '),
        '',
        '## 다음 단계 (승인 후)',
        '',
        '1. **추가 후보** 승인분 → volt-data.js 등재 파이프라인 설계 (한국어 역할명/태그/번역 포함, 별도 작업지시서)',
        '2. **수동매핑 후보** 승인분 → `manual-ship-map.json`의 `mappings`로 승격 → A-4 재실행으로 매칭 반영',
        '3. **보류** 항목은 이 문서에 결정 기록을 남기고 재분류',
        '4. 새 Erkul 동기화에서 미분류 신규 함선이 나오면 스크립트가 경고하며, 분류표를 갱신한 뒤 재실행한다',
        ''
    );
    return lines.join('\n');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
