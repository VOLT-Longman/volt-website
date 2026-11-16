/**
 * 게임 자료 묶음(Data.p4k) 읽기.
 *
 * p4k는 ZIP64 형식이다. 끝의 목록(central directory)을 읽어 필요한 파일만 꺼낸다.
 * 일부 파일은 AES로 싸여 있고(커뮤니티에 알려진 공개 키), 대부분 zstd로 압축돼 있다.
 * 파일은 읽기 전용으로만 연다. 외부 서비스에 접근하지 않는다.
 */
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
import zlib from 'node:zlib';

const KEY = Buffer.from('5E7A2002302EEB1A3BB617C30FDE1E47', 'hex');
const ZSTD_MAGIC = 0xfd2fb528;

export class P4k {
    constructor(path) {
        this.fd = openSync(path, 'r');
        this.size = fstatSync(this.fd).size;
        const tail = this.read(this.size - 70000, 70000);
        const locator = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
        if (locator < 0) throw new Error('p4k: ZIP64 locator not found');
        const eocd = this.read(Number(tail.readBigUInt64LE(locator + 8)), 56);
        if (eocd.readUInt32LE(0) !== 0x06064b50) throw new Error('p4k: ZIP64 end record signature mismatch');
        this.total = Number(eocd.readBigUInt64LE(32));
        this.directorySize = Number(eocd.readBigUInt64LE(40));
        this.directoryOffset = Number(eocd.readBigUInt64LE(48));
    }

    read(position, length) {
        const buffer = Buffer.allocUnsafe(length);
        let done = 0;
        while (done < length) {
            const n = readSync(this.fd, buffer, done, length - done, position + done);
            if (!n) break;
            done += n;
        }
        return buffer.subarray(0, done);
    }

    /** 목록에서 조건에 맞는 항목만 모은다. filter(name)이 참인 것만 남긴다. */
    find(filter) {
        const cd = this.read(this.directoryOffset, this.directorySize);
        const entries = [];
        let p = 0;
        while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
            const nameLen = cd.readUInt16LE(p + 28); const extraLen = cd.readUInt16LE(p + 30); const commentLen = cd.readUInt16LE(p + 32);
            const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
            if (filter(name)) {
                let comp = cd.readUInt32LE(p + 20); let uncomp = cd.readUInt32LE(p + 24); let offset = cd.readUInt32LE(p + 42);
                const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
                for (let q = 0; q + 4 <= extra.length; q += 4 + extra.readUInt16LE(q + 2)) {
                    if (extra.readUInt16LE(q) !== 0x0001) continue;
                    let r = q + 4;
                    if (uncomp === 0xffffffff) { uncomp = Number(extra.readBigUInt64LE(r)); r += 8; }
                    if (comp === 0xffffffff) { comp = Number(extra.readBigUInt64LE(r)); r += 8; }
                    if (offset === 0xffffffff) { offset = Number(extra.readBigUInt64LE(r)); r += 8; }
                }
                entries.push({ name, method: cd.readUInt16LE(p + 10), comp, uncomp, offset });
            }
            p += 46 + nameLen + extraLen + commentLen;
        }
        return entries;
    }

    extract(entry) {
        const local = this.read(entry.offset, 30);
        let data = this.read(entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), entry.comp);
        if (entry.method === 100 && !(data.length > 4 && data.readUInt32LE(0) === ZSTD_MAGIC)) {
            const decipher = createDecipheriv('aes-128-cbc', KEY, Buffer.alloc(16));
            decipher.setAutoPadding(false);
            data = Buffer.concat([decipher.update(data), decipher.final()]);
        }
        if (entry.method === 0) return data;
        if (entry.method === 8) return zlib.inflateRawSync(data);
        if (entry.method === 100) return zlib.zstdDecompressSync(data, { maxOutputLength: entry.uncomp + 1024 });
        throw new Error(`p4k: unknown compression method ${entry.method} (${entry.name})`);
    }

    close() { closeSync(this.fd); }
}

/**
 * CryXmlB(게임의 이진 XML) → { tag, attrs, children } 트리.
 * 머리글: "CryXmlB\0" · 파일 길이 · 노드표 · 속성표 · 자식표 · 문자열 구역의 위치와 개수.
 */
export function parseCryXml(buffer) {
    if (buffer.toString('latin1', 0, 7) !== 'CryXmlB') {
        throw new Error('Not a CryXmlB file');
    }
    const u32 = (o) => buffer.readUInt32LE(o);
    const nodeAt = u32(12); const nodeCount = u32(16);
    const attrAt = u32(20); const childAt = u32(28); const stringAt = u32(36);
    const str = (offset) => {
        const start = stringAt + offset;
        let end = start;
        while (end < buffer.length && buffer[end] !== 0) end += 1;
        return buffer.toString('utf8', start, end);
    };
    const nodes = [];
    for (let i = 0; i < nodeCount; i += 1) {
        const o = nodeAt + i * 28;
        const node = { tag: str(u32(o)), attrs: {}, children: [] };
        const attrCount = buffer.readUInt16LE(o + 8); const childCount = buffer.readUInt16LE(o + 10);
        const firstAttr = u32(o + 16); const firstChild = u32(o + 20);
        for (let a = 0; a < attrCount; a += 1) {
            const ao = attrAt + (firstAttr + a) * 8;
            node.attrs[str(u32(ao))] = str(u32(ao + 4));
        }
        node.childIndexes = [];
        for (let c = 0; c < childCount; c += 1) node.childIndexes.push(u32(childAt + (firstChild + c) * 4));
        nodes.push(node);
    }
    for (const node of nodes) { node.children = node.childIndexes.map((index) => nodes[index]); delete node.childIndexes; }
    return nodes[0];
}
