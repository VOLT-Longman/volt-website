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

console.log(`Cache version updated to ${version}`);
