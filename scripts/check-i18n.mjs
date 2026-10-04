import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
const context = { window: {}, document: { readyState: 'loading', addEventListener() {} } };
runInNewContext(source.replace('const STRINGS = {', 'const STRINGS = window.translationDictionary = {'), context);
const { ko, en } = context.window.translationDictionary;
const problems = [];
for (const key of new Set([...Object.keys(ko), ...Object.keys(en)])) {
    if (!ko[key] || !en[key]) problems.push(`Missing KO/EN text: ${key}`);
}
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const match of html.matchAll(/data-i18n(?:-html|-aria-label|-placeholder|-title|-alt)?="([^"]+)"/g)) {
    if (!ko[match[1]] || !en[match[1]]) problems.push(`Unknown static translation key: ${match[1]}`);
}
let headings = 0;
for (const section of html.matchAll(/<div class="section-header">([\s\S]*?)<\/div>/g)) {
    const heading = section[1].match(/<h2([^>]*)>([\s\S]*?)<\/h2>/);
    if (!heading) continue;
    headings++;
    const decoded = heading[2].replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)));
    if (/[가-힣]/.test(decoded) && !/data-i18n(?:-html)?=/.test(heading[1])) problems.push(`Untranslated section heading: ${decoded}`);
}
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
else console.log(`OK: KO/EN ${Object.keys(ko).length} dictionary keys, static references and ${headings} section headings verified (CMS content is checked separately)`);
