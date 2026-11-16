/**
 * 게임 정의 자료(DataForge, Game2.dcb) 해석기.
 *
 * Star Citizen의 Data.p4k 안에 있는 Game2.dcb는 부품·함선·탄약 등 모든 정의를 담은
 * 이진 파일이다. 이 모듈은 그 파일을 읽어 기록(record)을 일반 객체로 풀어 준다.
 * 형식은 커뮤니티에 공개적으로 알려진 DataForge 구조(파일 버전 6 이상)를 따른다.
 *
 *   머리글 → 구조체 정의 · 속성 정의 · 열거형 정의 · 자료 배치표 · 기록 목록
 *   → 값 배열(정수·실수·문자열·포인터 …) → 문자열 덩어리 2개 → 구조체 실체 자료
 *
 * 외부 서비스에 접근하지 않는다. 입력은 로컬 게임 파일에서 꺼낸 버퍼뿐이다.
 */

const TYPE = { Boolean: 0x0001, Int8: 0x0002, Int16: 0x0003, Int32: 0x0004, Int64: 0x0005, UInt8: 0x0006, UInt16: 0x0007, UInt32: 0x0008, UInt64: 0x0009,
    String: 0x000a, Single: 0x000b, Double: 0x000c, Locale: 0x000d, Guid: 0x000e, Enum: 0x000f, Class: 0x0010, StrongPointer: 0x0110, WeakPointer: 0x0210, Reference: 0x0310 };
const INLINE_SIZE = { [TYPE.Boolean]: 1, [TYPE.Int8]: 1, [TYPE.Int16]: 2, [TYPE.Int32]: 4, [TYPE.Int64]: 8, [TYPE.UInt8]: 1, [TYPE.UInt16]: 2, [TYPE.UInt32]: 4, [TYPE.UInt64]: 8,
    [TYPE.String]: 4, [TYPE.Single]: 4, [TYPE.Double]: 8, [TYPE.Locale]: 4, [TYPE.Guid]: 16, [TYPE.Enum]: 4, [TYPE.StrongPointer]: 8, [TYPE.WeakPointer]: 8, [TYPE.Reference]: 20 };
const NULL_INDEX = 0xffffffff;

function guidAt(buffer, offset) {
    // DataForge의 GUID는 필드별 바이트 순서가 섞여 있다(c,d,a,b - 8바이트 역순).
    const hex = (start, length) => buffer.subarray(offset + start, offset + start + length).toString('hex');
    const swap = (start, length) => Buffer.from(buffer.subarray(offset + start, offset + start + length)).reverse().toString('hex');
    return `${swap(6, 2)}${swap(4, 2)}-${swap(2, 2)}-${swap(0, 2)}-${swap(14, 2)}-${swap(8, 6)}`.toLowerCase() || hex(0, 16);
}

export class DataForge {
    constructor(buffer) {
        this.buffer = buffer;
        let p = 4;
        this.version = buffer.readInt32LE(p); p += 4;
        if (this.version < 6) throw new Error(`Unsupported DataForge version ${this.version}`);
        p += 8;
        const counts = {};
        for (const name of ['structs', 'properties', 'enums', 'mappings', 'records', 'boolean', 'int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'uint64',
            'single', 'double', 'guid', 'string', 'locale', 'enum', 'strong', 'weak', 'reference', 'enumOption']) { counts[name] = buffer.readInt32LE(p); p += 4; }
        const textLength = buffer.readUInt32LE(p); p += 4;
        const blobLength = buffer.readUInt32LE(p); p += 4;
        this.counts = counts;

        const table = (count, size) => { const at = p; p += count * size; return at; };
        this.at = {
            structs: table(counts.structs, 16), properties: table(counts.properties, 12), enums: table(counts.enums, 8), mappings: table(counts.mappings, 8),
            // 기록 항목은 36바이트: 이름 · 파일 경로 · 태그 · 구조체 번호 · GUID(16) · 실체 번호 · 예비
            records: table(counts.records, 36),
            int8: table(counts.int8, 1), int16: table(counts.int16, 2), int32: table(counts.int32, 4), int64: table(counts.int64, 8),
            uint8: table(counts.uint8, 1), uint16: table(counts.uint16, 2), uint32: table(counts.uint32, 4), uint64: table(counts.uint64, 8),
            boolean: table(counts.boolean, 1), single: table(counts.single, 4), double: table(counts.double, 8), guid: table(counts.guid, 16),
            string: table(counts.string, 4), locale: table(counts.locale, 4), enum: table(counts.enum, 4),
            strong: table(counts.strong, 8), weak: table(counts.weak, 8), reference: table(counts.reference, 20), enumOption: table(counts.enumOption, 4),
        };
        this.textAt = p; p += textLength;   // 값으로 쓰이는 문자열
        this.blobAt = p; p += blobLength;   // 구조체·속성·기록 이름
        this.dataAt = p;

        // 구조체 정의
        this.structs = [];
        for (let i = 0; i < counts.structs; i += 1) {
            const o = this.at.structs + i * 16;
            this.structs.push({ index: i, name: this.name(buffer.readUInt32LE(o)), parent: buffer.readUInt32LE(o + 4), attributeCount: buffer.readUInt16LE(o + 8), firstAttribute: buffer.readUInt16LE(o + 10), size: buffer.readUInt32LE(o + 12) });
        }
        this.properties = [];
        for (let i = 0; i < counts.properties; i += 1) {
            const o = this.at.properties + i * 12;
            this.properties.push({ name: this.name(buffer.readUInt32LE(o)), structIndex: buffer.readUInt16LE(o + 4), type: buffer.readUInt16LE(o + 6), conversion: buffer.readUInt16LE(o + 8) & 0xff });
        }
        // 상속을 펼친 속성 목록
        for (const struct of this.structs) {
            const chain = [];
            for (let s = struct; s; s = s.parent === NULL_INDEX ? null : this.structs[s.parent]) chain.unshift(s);
            struct.fields = chain.flatMap((s) => this.properties.slice(s.firstAttribute, s.firstAttribute + s.attributeCount));
        }
        this.structByName = new Map(this.structs.map((s) => [s.name, s]));

        // 구조체 실체 자료의 시작 위치
        this.instanceBase = new Array(counts.structs).fill(-1);
        this.instanceCount = new Array(counts.structs).fill(0);
        let cursor = this.dataAt;
        for (let i = 0; i < counts.mappings; i += 1) {
            const o = this.at.mappings + i * 8;
            const count = buffer.readUInt32LE(o); const structIndex = buffer.readUInt32LE(o + 4);
            this.instanceBase[structIndex] = cursor; this.instanceCount[structIndex] = count;
            cursor += count * this.structs[structIndex].size;
        }
        this.dataEnd = cursor;

        this.records = [];
        for (let i = 0; i < counts.records; i += 1) {
            const o = this.at.records + i * 36;
            this.records.push({ name: this.name(buffer.readUInt32LE(o)), file: this.text(buffer.readUInt32LE(o + 4)), structIndex: buffer.readUInt32LE(o + 12), id: guidAt(buffer, o + 16), instance: buffer.readUInt16LE(o + 32) });
        }
        this.recordById = new Map(this.records.map((record) => [record.id, record]));
    }

    cstring(base, offset) {
        const start = base + offset;
        if (start < 0 || start >= this.buffer.length) throw new Error(`DataForge string offset out of range: ${offset}`);
        let end = start;
        while (end < this.buffer.length && this.buffer[end] !== 0) end += 1;
        return this.buffer.toString('utf8', start, end);
    }
    text(offset) { return this.cstring(this.textAt, offset); }
    name(offset) { return this.cstring(this.blobAt, offset); }

    /** 형식 점검: 자료 구역의 끝이 파일 끝과 맞는지 */
    get consistent() { return this.dataEnd === this.buffer.length; }

    recordsOfType(structName) {
        const struct = this.structByName.get(structName);
        return struct ? this.records.filter((record) => record.structIndex === struct.index) : [];
    }

    /** 기록 하나를 일반 객체로 푼다. depth는 포인터를 따라 내려가는 최대 깊이. */
    readRecord(record, depth = 12) {
        return this.readInstance(record.structIndex, record.instance, depth, new Set());
    }

    readInstance(structIndex, instance, depth, seen) {
        const struct = this.structs[structIndex];
        if (!struct || this.instanceBase[structIndex] < 0 || instance >= this.instanceCount[structIndex]) return null;
        const key = structIndex * 4194304 + instance;
        if (seen.has(key) || depth < 0) return { __type: struct.name, __ref: true };
        seen.add(key);
        const result = this.readStructAt(struct, this.instanceBase[structIndex] + instance * struct.size, depth, seen);
        seen.delete(key);
        return result;
    }

    readStructAt(struct, offset, depth, seen) {
        const out = { __type: struct.name };
        let p = offset;
        for (const field of struct.fields) {
            if (field.conversion === 0) {
                if (field.type === TYPE.Class) {
                    const nested = this.structs[field.structIndex];
                    out[field.name] = this.readStructAt(nested, p, depth, seen);
                    p += nested.size;
                } else {
                    out[field.name] = this.readValueAt(field, p, depth, seen);
                    p += INLINE_SIZE[field.type];
                }
            } else {
                const count = this.buffer.readUInt32LE(p); const first = this.buffer.readUInt32LE(p + 4);
                p += 8;
                const list = [];
                for (let i = 0; i < count; i += 1) list.push(this.readArrayItem(field, first + i, depth, seen));
                out[field.name] = list;
            }
        }
        return out;
    }

    pointer(structIndex, instance, depth, seen) {
        if (structIndex === NULL_INDEX || instance === NULL_INDEX) return null;
        return this.readInstance(structIndex, instance, depth - 1, seen);
    }

    reference(offset) {
        const id = guidAt(this.buffer, offset + 4);
        if (id === '00000000-0000-0000-0000-000000000000') return null;
        const record = this.recordById.get(id);
        return { __record: id, name: record?.name, type: record ? this.structs[record.structIndex].name : undefined };
    }

    readValueAt(field, p, depth, seen) {
        const b = this.buffer;
        switch (field.type) {
            case TYPE.Boolean: return b[p] !== 0;
            case TYPE.Int8: return b.readInt8(p);
            case TYPE.Int16: return b.readInt16LE(p);
            case TYPE.Int32: return b.readInt32LE(p);
            case TYPE.Int64: return Number(b.readBigInt64LE(p));
            case TYPE.UInt8: return b[p];
            case TYPE.UInt16: return b.readUInt16LE(p);
            case TYPE.UInt32: return b.readUInt32LE(p);
            case TYPE.UInt64: return Number(b.readBigUInt64LE(p));
            case TYPE.Single: return Math.fround(b.readFloatLE(p));
            case TYPE.Double: return b.readDoubleLE(p);
            case TYPE.String: case TYPE.Locale: case TYPE.Enum: return this.text(b.readUInt32LE(p));
            case TYPE.Guid: return guidAt(b, p);
            case TYPE.StrongPointer: case TYPE.WeakPointer: return this.pointer(b.readUInt32LE(p), b.readUInt32LE(p + 4), depth, seen);
            case TYPE.Reference: return this.reference(p);
            default: throw new Error(`Unknown DataForge type 0x${field.type.toString(16)} (${field.name})`);
        }
    }

    readArrayItem(field, index, depth, seen) {
        const b = this.buffer; const at = this.at;
        switch (field.type) {
            case TYPE.Class: return this.readInstance(field.structIndex, index, depth - 1, seen);
            case TYPE.StrongPointer: { const o = at.strong + index * 8; return this.pointer(b.readUInt32LE(o), b.readUInt32LE(o + 4), depth, seen); }
            case TYPE.WeakPointer: { const o = at.weak + index * 8; return this.pointer(b.readUInt32LE(o), b.readUInt32LE(o + 4), depth, seen); }
            case TYPE.Reference: return this.reference(at.reference + index * 20);
            case TYPE.Boolean: return b[at.boolean + index] !== 0;
            case TYPE.Int8: return b.readInt8(at.int8 + index);
            case TYPE.Int16: return b.readInt16LE(at.int16 + index * 2);
            case TYPE.Int32: return b.readInt32LE(at.int32 + index * 4);
            case TYPE.Int64: return Number(b.readBigInt64LE(at.int64 + index * 8));
            case TYPE.UInt8: return b[at.uint8 + index];
            case TYPE.UInt16: return b.readUInt16LE(at.uint16 + index * 2);
            case TYPE.UInt32: return b.readUInt32LE(at.uint32 + index * 4);
            case TYPE.UInt64: return Number(b.readBigUInt64LE(at.uint64 + index * 8));
            case TYPE.Single: return Math.fround(b.readFloatLE(at.single + index * 4));
            case TYPE.Double: return b.readDoubleLE(at.double + index * 8);
            case TYPE.Guid: return guidAt(b, at.guid + index * 16);
            case TYPE.String: return this.text(b.readUInt32LE(at.string + index * 4));
            case TYPE.Locale: return this.text(b.readUInt32LE(at.locale + index * 4));
            case TYPE.Enum: return this.text(b.readUInt32LE(at.enum + index * 4));
            default: throw new Error(`Unknown DataForge array type 0x${field.type.toString(16)} (${field.name})`);
        }
    }
}
