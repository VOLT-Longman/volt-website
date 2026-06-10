const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!/^20\d{6}-\d{2}$/.test(version || '')) {
  console.error('Usage: node scripts/update-cache-version.js YYYYMMDD-NN');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const htmlFiles = ['index.html', 'admin/index.html'];
const problems = [];

for (const relativePath of htmlFiles) {
  const filePath = path.join(root, relativePath);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/\?v=[\w.-]+/g, `?v=${version}`);
  fs.writeFileSync(filePath, content, 'utf8');

  // 신규 파일이 버전 쿼리 없이 추가되면 캐시 갱신에서 빠지므로 실패 처리한다.
  const references = content.matchAll(/(?:src|href)="((?:js|css|data)\/[^"?]+\.(?:js|css))(\?[^"]*)?"/g);
  for (const [, assetPath, query] of references) {
    if (!query || !query.startsWith('?v=')) {
      problems.push(`${relativePath}: ${assetPath} 참조에 ?v= 버전 쿼리가 없습니다.`);
    }
    if (!fs.existsSync(path.join(root, ...assetPath.split('/')))) {
      problems.push(`${relativePath}: ${assetPath} 파일이 존재하지 않습니다.`);
    }
  }
}

const swPath = path.join(root, 'sw.js');
let serviceWorker = fs.readFileSync(swPath, 'utf8');
serviceWorker = serviceWorker.replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = '${version}';`);
fs.writeFileSync(swPath, serviceWorker, 'utf8');

// 프리캐시 목록의 파일이 실제로 존재하는지 확인한다 (오타·삭제 누락 방지).
for (const [, assetPath] of serviceWorker.matchAll(/^\s*'(\/[^']+)',?\s*$/gm)) {
  if (assetPath === '/') continue;
  if (!fs.existsSync(path.join(root, ...assetPath.slice(1).split('/')))) {
    problems.push(`sw.js: 프리캐시 항목 ${assetPath} 파일이 존재하지 않습니다.`);
  }
}

const sitemapPath = path.join(root, 'sitemap.xml');
const lastmod = `${version.slice(0, 4)}-${version.slice(4, 6)}-${version.slice(6, 8)}`;
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
sitemap = sitemap.replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, `<lastmod>${lastmod}</lastmod>`);
fs.writeFileSync(sitemapPath, sitemap, 'utf8');

if (problems.length > 0) {
  console.error('버전은 갱신했지만 아래 문제를 확인해 주세요:');
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

console.log(`Cache version updated to ${version}`);
