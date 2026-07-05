import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

// ShipDB 2.0 A-9 — Erkul 영어 설명의 한국어 번역본을 data/ship-live-stats.js의
// descriptions.ko에 채운다. volt-data.js의 기존 한국어 설명은 건드리지 않는다(legacy fallback).
//
// 번역 원천: data/external/erkul/ship-descriptions-ko.json
//   { version, koSource, translations: { "<voltId>": { ko, sourceEnHash } } }
// sourceEnHash = 번역 당시 descriptions.en의 sha256 앞 16자.
// 현재 en과 hash가 다르면(=Erkul 설명이 그 후 바뀜) 해당 번역은 stale로 분류하고 적용하지 않는다.
//
// 사용: npm run shipdb:erkul:translate-descriptions

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LIVE_STATS_PATH = resolve(ROOT, 'data/ship-live-stats.js');
const TRANSLATIONS_PATH = resolve(ROOT, 'data/external/erkul/ship-descriptions-ko.json');
const REPORT_PATH = resolve(ROOT, 'data/external/erkul/description-translation-report.json');

const enHash = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);

async function main() {
    const layerText = await readFile(LIVE_STATS_PATH, 'utf8');
    const marker = 'window.VOLT_SHIP_LIVE_STATS = ';
    const headerEnd = layerText.indexOf(marker);
    if (headerEnd === -1) throw new Error('ship-live-stats.js 형식이 예상과 다름');
    const header = layerText.slice(0, headerEnd + marker.length);
    const stats = JSON.parse(layerText.slice(headerEnd + marker.length).replace(/;\s*$/, ''));

    const table = JSON.parse(await readFile(TRANSLATIONS_PATH, 'utf8'));
    const translations = table.translations ?? {};
    const translatedAt = new Date().toISOString();

    const report = {
        generatedAt: translatedAt,
        koSource: table.koSource ?? 'translated-from-erkul-en',
        totalEntries: 0,
        withEnglishDescription: 0,
        translatedKo: 0,
        missingEnglishDescription: [],
        missingKoTranslation: [],
        staleTranslation: [],
        unchangedLegacyFallback: []
    };

    for (const [voltId, entry] of Object.entries(stats)) {
        report.totalEntries += 1;
        const en = entry.descriptions?.en ?? null;
        if (!en) {
            // Erkul 영어 설명이 없는 함선 — 임의 생성/기존 VOLT KO 이식 금지, 리포트만.
            report.missingEnglishDescription.push(voltId);
            report.unchangedLegacyFallback.push(voltId);
            entry.descriptions = { ...entry.descriptions, ko: null, koSource: null };
            continue;
        }
        report.withEnglishDescription += 1;
        const translation = translations[voltId];
        if (!translation?.ko) {
            report.missingKoTranslation.push(voltId);
            report.unchangedLegacyFallback.push(voltId);
            continue;
        }
        if (translation.sourceEnHash && translation.sourceEnHash !== enHash(en)) {
            // 번역 이후 Erkul 원문이 바뀐 경우 — 오역 방지를 위해 적용하지 않는다.
            report.staleTranslation.push(voltId);
            report.unchangedLegacyFallback.push(voltId);
            continue;
        }
        // 이미 같은 ko가 들어있으면 translatedAt만 유지 (불필요한 diff 방지)
        if (entry.descriptions.ko === translation.ko && entry.descriptions.koSource) {
            report.translatedKo += 1;
            continue;
        }
        entry.descriptions = {
            ...entry.descriptions,
            ko: translation.ko,
            koSource: table.koSource ?? 'translated-from-erkul-en',
            translatedAt
        };
        report.translatedKo += 1;
    }

    const keyCount = Object.keys(stats).length;
    await writeFile(LIVE_STATS_PATH, `${header}${JSON.stringify(stats)};\n`, 'utf8');
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(`entries: ${keyCount} | EN 보유: ${report.withEnglishDescription} | KO 적용: ${report.translatedKo}`);
    console.log(`EN 없음: ${report.missingEnglishDescription.length} | 번역 누락: ${report.missingKoTranslation.length} | stale: ${report.staleTranslation.length}`);
    console.log(`리포트: ${REPORT_PATH}`);
    if (report.missingKoTranslation.length || report.staleTranslation.length) {
        console.log('누락/stale 함선은 KO 모드에서 기존 VOLT 설명으로 폴백된다.');
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
