// 배포 동기화 점검: 라이브(volt.ceo)가 저장소 HEAD의 캐시 버전을 서빙하는지 확인한다.
//
// 왜 별도 스크립트인가: Cloudflare 봇 챌린지 때문에 CI/샌드박스에서는 라이브를 못 긁는다.
// 라이브에 정상 접근 가능한 환경(운영자 PC 등)에서 한 줄로 실행해 동기화를 확인하는 용도다.
//
// 사용법:
//   node scripts/check-deploy-sync.mjs                 # https://www.volt.ceo 기준
//   node scripts/check-deploy-sync.mjs https://staging.example.com
//
// 종료 코드: 동기화 일치 0 / 불일치 1 / 확인 불가(네트워크·챌린지) 2.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetBase = (process.argv[2] || 'https://www.volt.ceo').replace(/\/+$/, '');

// 저장소 기준 버전: sw.js의 CACHE_VERSION이 단일 진실원본(update-cache-version.js가 일괄 갱신).
function readRepoVersion() {
  const sw = readFileSync(path.join(root, 'sw.js'), 'utf8');
  const match = sw.match(/const CACHE_VERSION = '([^']+)';/);
  if (!match) throw new Error('sw.js에서 CACHE_VERSION을 찾지 못했습니다.');
  return match[1];
}

// 라이브 index.html에서 에셋 ?v= 쿼리를 모아 고유 버전 집합을 만든다.
function extractLiveVersions(html) {
  const set = new Set();
  for (const [, ver] of html.matchAll(/(?:src|href)="[^"]+\?v=([\w.-]+)"/g)) set.add(ver);
  return set;
}

function looksLikeBotChallenge(status, html) {
  return status === 403 || status === 503 || /Just a moment|cf-mitigated|challenges\.cloudflare\.com/i.test(html);
}

async function main() {
  const repoVersion = readRepoVersion();
  console.log(`저장소 기준(sw.js CACHE_VERSION): ${repoVersion}`);
  console.log(`라이브 대상: ${targetBase}/`);

  let res;
  let html;
  try {
    res = await fetch(`${targetBase}/`, {
      headers: { Accept: 'text/html', 'User-Agent': 'volt-deploy-sync-check' },
      redirect: 'follow',
    });
    html = await res.text();
  } catch (error) {
    console.error(`\n⚠️  라이브에 접근하지 못했습니다(네트워크 오류): ${error.message}`);
    console.error('   라이브에 접근 가능한 네트워크에서 다시 실행하세요.');
    process.exit(2);
  }

  if (looksLikeBotChallenge(res.status, html)) {
    console.error(`\n⚠️  확인 불가: 라이브가 Cloudflare 봇 챌린지를 반환했습니다(status ${res.status}).`);
    console.error('   실제 브라우저가 있는 운영자 PC에서 실행하거나, 페이지 소스에서 ?v= 를 직접 확인하세요.');
    process.exit(2);
  }

  const liveVersions = extractLiveVersions(html);
  if (liveVersions.size === 0) {
    console.error('\n⚠️  확인 불가: 라이브 HTML에서 ?v= 버전 쿼리를 찾지 못했습니다.');
    process.exit(2);
  }

  const liveList = [...liveVersions].sort();
  console.log(`라이브 에셋 버전: ${liveList.join(', ')}`);

  const allMatch = liveVersions.size === 1 && liveVersions.has(repoVersion);
  if (allMatch) {
    console.log(`\n✅ 동기화 일치: 라이브가 ${repoVersion} 을 서빙 중입니다.`);
    process.exit(0);
  }

  console.error('\n❌ 동기화 불일치.');
  if (!liveVersions.has(repoVersion)) {
    console.error(`   라이브에 저장소 버전(${repoVersion})이 없습니다 — 배포 미반영 또는 캐시 지연 가능.`);
  }
  if (liveVersions.size > 1) {
    console.error('   라이브 에셋 버전이 섞여 있습니다 — 부분 캐시 무효화/배포 진행 중일 수 있습니다.');
  }
  process.exit(1);
}

main();
