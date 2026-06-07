const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!/^20\d{6}-\d{2}$/.test(version || '')) {
  console.error('Usage: node scripts/update-cache-version.js YYYYMMDD-NN');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const htmlFiles = ['index.html', 'admin/index.html'];

for (const relativePath of htmlFiles) {
  const filePath = path.join(root, relativePath);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/\?v=[\w.-]+/g, `?v=${version}`);
  fs.writeFileSync(filePath, content, 'utf8');
}

const swPath = path.join(root, 'sw.js');
let serviceWorker = fs.readFileSync(swPath, 'utf8');
serviceWorker = serviceWorker.replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = '${version}';`);
fs.writeFileSync(swPath, serviceWorker, 'utf8');

const sitemapPath = path.join(root, 'sitemap.xml');
const lastmod = `${version.slice(0, 4)}-${version.slice(4, 6)}-${version.slice(6, 8)}`;
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
sitemap = sitemap.replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, `<lastmod>${lastmod}</lastmod>`);
fs.writeFileSync(sitemapPath, sitemap, 'utf8');

console.log(`Cache version updated to ${version}`);
