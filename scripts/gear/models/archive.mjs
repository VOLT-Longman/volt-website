/**
 * archive.mjs — 설치된 게임 자료 묶음(Data.p4k)을 읽기 전용으로 여는 도우미.
 *
 * 100 GB 묶음의 파일 목록을 매번 훑지 않도록, 필요한 부분(개인 무기 모형·재질·텍스처)의 이름표를
 * --cache-dir 폴더에 gear-models-index.json 으로 한 번 저장해 둔다. 게임 빌드가 바뀌면(묶음 크기가 달라지면) 다시 만든다.
 * 외부 서비스에 접근하지 않는다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { P4k, parseCryXml } from '../../gamedata/p4k.mjs';

export class Archive {
    constructor(p4kPath, cacheDir) {
        this.p4k = new P4k(p4kPath);
        const file = cacheDir ? `${cacheDir}/gear-models-index.json` : null;
        let cached = null;
        if (file && existsSync(file)) { try { cached = JSON.parse(readFileSync(file, 'utf8')); } catch { cached = null; } }
        if (!cached || cached.size !== this.p4k.size || cached.total !== this.p4k.total) {
            const wanted = (name) => {
                const l = name.toLowerCase();
                return l.startsWith('data\\objects\\') ? /\.(chr|cdf|cgf|cga|skin|cgfm|cgam|skinm|mtl)$/.test(l) || l.includes('.dds') : l.endsWith('.mtl') || l.startsWith('data\\materials\\') || l.startsWith('data\\textures\\');
            };
            const found = this.p4k.find(wanted);
            cached = { size: this.p4k.size, total: this.p4k.total, entries: found.map((e) => [e.name.split('\\').join('/'), e.method, e.comp, e.uncomp, e.offset]) };
            if (file) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(file, JSON.stringify(cached)); }
        }
        this.entries = cached.entries.map(([n, m, c, u, o]) => ({ n, m, c, u, o }));
        this.byName = new Map(this.entries.map((e) => [e.n.toLowerCase(), e]));
    }

    /** 게임 경로로 찾기 (대소문자·슬래시 방향·맨 앞 "Data/" 유무 무관) */
    lookup(path) {
        let key = String(path || '').trim().split('\\').join('/').replace(/^\/+/, '').toLowerCase();
        if (!key) return null;
        if (!key.startsWith('data/')) key = `data/${key}`;
        return this.byName.get(key) || null;
    }

    extract(entry) { return this.p4k.extract({ name: entry.n, method: entry.m, comp: entry.c, uncomp: entry.u, offset: entry.o }); }

    read(path) { const e = this.lookup(path); if (!e) throw new Error(`not in archive: ${path}`); return this.extract(e); }

    readXml(path) {
        const buffer = this.read(path);
        if (buffer.toString('latin1', 0, 7) !== 'CryXmlB') throw new Error(`${path}: not CryXmlB`);
        return parseCryXml(buffer);
    }

    close() { this.p4k.close(); }
}
