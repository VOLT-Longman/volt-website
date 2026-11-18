/**
 * rig.mjs — where things sit on a gun: body parts and attachment ports in the weapon's model space.
 *
 * Game2.dcb weapon record -> item ports -> helper NAME -> transform, read from the weapon's own files in Data.p4k:
 *   .cdf (CharacterDefinition, CryXmlB) names the skeleton (.chr, or a .cga that is skeleton + mesh) and the body parts
 *   (CA_SKIN skins in model space, CA_BONE rigid parts on a bone); a weapon whose geometry is a bare .cgf/.cga uses that
 *   file's node table instead. The port's helper name is a bone / node name (case-insensitive).
 * From the attach-point study (points/resolve-points.mjs), reduced to what the model export needs. Nothing is tuned by hand.
 *
 * Space: CryEngine, +X right, +Y forward (muzzle), +Z up, metres; quaternions [x, y, z, w].
 */
import { readBones, readNodes, readMeshInfo, compose, qNormalize, qRotate, applyMatrix } from './skeleton.mjs';

const IDENTITY = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };
const norm = (p) => String(p || '').trim().split('\\').join('/').replace(/^\/+/, '').replace(/^data\//i, '').toLowerCase();
const parseList = (text) => String(text).split(',').map(Number);

// ---------------------------------------------------------------- boxes
export const emptyBox = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
export const boxValid = (b) => !!b && b.min.every(Number.isFinite) && b.max.every(Number.isFinite);
export const boxAdd = (b, p) => { for (let i = 0; i < 3; i += 1) { if (p[i] < b.min[i]) b.min[i] = p[i]; if (p[i] > b.max[i]) b.max[i] = p[i]; } };
const corners = (min, max) => { const out = []; for (let i = 0; i < 8; i += 1) out.push([i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]); return out; };
const boxTransform = (box, t) => { const out = emptyBox(); for (const c of corners(box.min, box.max)) boxAdd(out, qRotate(t.rotation, c).map((v, i) => v + t.position[i])); return out; };
const boxUnion = (a, b) => { if (boxValid(b)) { boxAdd(a, b.min); boxAdd(a, b.max); } return a; };

function quatFromAng3Degrees(a) {
    // CryEngine Quat::CreateRotationXYZ (R = Rz * Ry * Rx); DataForge stores Ang3 in degrees. Assumed convention; it only
    // matters for the few ports with a non-zero helper offset rotation (none of the four attachment kinds on the site's guns).
    const h = Math.PI / 360; const sx = Math.sin(a.x * h); const cx = Math.cos(a.x * h); const sy = Math.sin(a.y * h); const cy = Math.cos(a.y * h); const sz = Math.sin(a.z * h); const cz = Math.cos(a.z * h);
    return [cz * cy * sx - sz * sy * cx, cz * sy * cx + sz * cy * sx, sz * cy * cx - cz * sy * sx, cx * cy * cz + sx * sy * sz];
}

export class Rig {
    /** archive: Archive (archive.mjs); df: DataForge of Game2.dcb */
    constructor(archive, df) {
        this.archive = archive; this.df = df; this.models = new Map();
        const records = df.recordsOfType('EntityClassDefinition');
        this.byClass = new Map(records.map((r) => [r.name.replace(/^EntityClassDefinition\./, '').toLowerCase(), r]));
        this.byId = new Map(records.map((r) => [r.id, r]));
        this.entityCache = new Map();
    }

    entity(record) { if (!this.entityCache.has(record.id)) this.entityCache.set(record.id, this.df.readRecord(record, 14)); return this.entityCache.get(record.id); }

    // ------------------------------------------------------------ model files
    /** { path, kind, exists, joints: Map(lowerName -> { name, world, source }), parts[], sockets[], bbox, errors[] } */
    loadModel(path) {
        const key = norm(path);
        if (!this.models.has(key)) this.models.set(key, this.buildModel(key));
        return this.models.get(key);
    }

    buildModel(key) {
        const ext = (key.match(/\.([a-z0-9]+)$/) || [])[1] || '';
        const entry = key ? this.archive.lookup(key) : null;
        const model = { path: key, kind: ext, exists: !!entry, joints: new Map(), parts: [], sockets: [], bbox: null, errors: [] };
        if (!key) { model.errors.push('no geometry path in the game database'); return model; }
        if (!entry) { model.errors.push(`file not in the game archive: ${key}`); return model; }
        try {
            const buffer = this.archive.extract(entry);
            if (ext === 'cdf') this.loadCdf(model, buffer); else this.loadIvo(model, buffer);
        } catch (error) { model.errors.push(`could not read ${key}: ${error.message}`); }
        return model;
    }

    loadIvo(model, buffer) {
        if (buffer.toString('latin1', 0, 4) !== '#ivo') { model.errors.push(`${model.path}: not an #ivo file`); return; }
        const bones = readBones(buffer); const nodes = readNodes(buffer); const info = readMeshInfo(buffer);
        model.vertices = info ? info.numVertices : 0;
        if (bones) for (const bone of bones.bones) {
            const lower = String(bone.name).toLowerCase();
            if (!model.joints.has(lower)) model.joints.set(lower, { name: bone.name, world: bone.world, source: 'bone' });
        }
        if (nodes) {
            const box = emptyBox(); let meshNodes = 0;
            for (const node of nodes.nodes) {
                const lower = String(node.name).toLowerCase();
                if (!model.joints.has(lower)) model.joints.set(lower, { name: node.name, world: node.world, source: 'node', mesh: node.numVertices > 0 });
                if (node.numVertices > 0) { meshNodes += 1; for (const c of corners(node.bboxMin, node.bboxMax)) boxAdd(box, applyMatrix(node.boneToWorld, c)); }
            }
            model.meshNodes = meshNodes;
            if (boxValid(box)) model.bbox = box;
        }
        if (!model.bbox && info && info.numVertices) model.bbox = { min: [...info.bboxMin], max: [...info.bboxMax] };
        if (!bones && !nodes) model.errors.push(`${model.path}: no bone or node table`);
    }

    loadCdf(model, buffer) {
        if (buffer.toString('latin1', 0, 7) !== 'CryXmlB') { model.errors.push(`${model.path}: not CryXmlB`); return; }
        const xml = this.archive.readXml(model.path);
        const modelNode = xml.children.find((c) => c.tag === 'Model');
        model.skeleton = norm(modelNode?.attrs?.File); model.material = modelNode?.attrs?.Material || null;
        const box = emptyBox();
        if (!model.skeleton) model.errors.push(`${model.path}: no <Model> (skeleton) entry`);
        else {
            const chr = this.loadModel(model.skeleton);
            if (chr.errors.length) model.errors.push(...chr.errors);
            for (const [lower, joint] of chr.joints) model.joints.set(lower, joint);
            // Newer weapons use a .cga as the <Model>: that file is skeleton AND mesh at once, so it is a body part itself.
            if (chr.exists && ((chr.meshNodes || 0) > 0 || (chr.vertices || 0) > 0)) {
                model.parts.push({ name: 'model', type: 'Model', bone: null, file: chr.path, material: model.material, position: [0, 0, 0], rotation: [0, 0, 0, 1], basis: 'identity' });
                boxUnion(box, chr.bbox);
            }
        }
        const list = xml.children.find((c) => c.tag === 'AttachmentList');
        for (const node of list?.children || []) {
            if (node.tag !== 'Attachment') continue;
            const a = node.attrs; const boneName = a.BoneName || '';
            const bone = boneName ? model.joints.get(boneName.toLowerCase()) : null;
            let world = IDENTITY; let basis = 'identity';
            if (a.Type !== 'CA_SKIN') {
                if (a.RelRotation !== undefined || a.RelPosition !== undefined) {
                    // RelRotation = "w,x,y,z", RelPosition = "x,y,z": relative to the named bone.
                    const [w, x, y, z] = parseList(a.RelRotation || '1,0,0,0'); const pos = parseList(a.RelPosition || '0,0,0');
                    world = compose(bone ? bone.world : IDENTITY, { position: pos, rotation: qNormalize([x, y, z, w]) }); basis = 'bone*relative';
                } else if (a.Rotation !== undefined || a.Position !== undefined) {
                    // Rotation / Position = absolute default pose in model space (the bone only matters once animated).
                    const [w, x, y, z] = parseList(a.Rotation || '1,0,0,0'); const pos = parseList(a.Position || '0,0,0');
                    world = { position: pos, rotation: qNormalize([x, y, z, w]) }; basis = 'absolute';
                } else if (bone) { world = bone.world; basis = 'bone'; }
            }
            const part = { name: a.AName, type: a.Type, bone: boneName || null, boneFound: !boneName || !!bone, file: a.Binding ? norm(a.Binding) : null, material: a.Material || null,
                position: world.position, rotation: qNormalize(world.rotation), basis, flags: a.Flags ?? null, visFlags: a.VisFlags ?? null };
            if (![...part.position, ...part.rotation].every(Number.isFinite)) { part.bad = 'non-finite transform'; }
            if (part.file) {
                const sub = this.loadModel(part.file);
                part.exists = sub.exists;
                if (boxValid(sub.bbox)) boxUnion(box, boxTransform(sub.bbox, world));
                model.parts.push(part);
            } else {
                // A named socket without geometry: usable as a helper name if no bone has that name.
                const lower = String(a.AName || '').toLowerCase();
                if (lower && !model.joints.has(lower)) model.joints.set(lower, { name: a.AName, world, source: 'cdf-socket' });
                model.sockets.push(part);
            }
        }
        if (boxValid(box)) model.bbox = box;
    }

    // ------------------------------------------------------------ database side
    component(entity, type) { return (entity.Components || []).find((c) => c && c.__type === type); }

    /**
     * The geometry node an entity is drawn with: { geometry, material, palette, materialAttachments, skinTag, skinVia }.
     * A recoloured item has the same record layout as its base: the main node plus tagged SubGeometry nodes (Store01, Iasi01,
     * Chromic01, ...). Which tag an entity wears is its component field "geometryTags" (weapons). Attachments have no such
     * field; for them a class-name ending that equals one of the entity's own SubGeometry tags (…_chromic01 -> "Chromic01")
     * is taken as the tag (skinVia says which rule applied). A tagged node replaces only what it sets: an empty material
     * or palette keeps the main node's.
     */
    geometryOf(entity, cls = '') {
        const root = this.component(entity, 'SGeometryResourceParams')?.Geometry;
        const main = root?.Geometry || {};
        const subs = (root?.SubGeometry || []).filter((s) => s?.Tags);
        const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
        const wanted = (entity.Components || []).map((c) => (c && typeof c.geometryTags === 'string' ? c.geometryTags.trim() : '')).find(Boolean) || '';
        let node = wanted ? subs.find((s) => same(s.Tags, wanted)) : null; let via = node ? 'geometryTags' : null;
        if (!node && !wanted && cls) {
            const ending = String(cls).toLowerCase().split('_').pop();
            node = subs.find((s) => !/^tabledisplay$/i.test(s.Tags) && same(s.Tags, ending)) || null; if (node) via = 'class-name ending';
        }
        const sub = node?.Geometry || {};
        const material = sub.Material?.path || main.Material?.path || null;
        return {
            geometry: sub.Geometry?.path || main.Geometry?.path || '', material,
            palette: sub.Palette?.RootRecord?.name || main.Palette?.RootRecord?.name || null,
            materialAttachments: String((sub.Material?.path ? sub.MaterialAttachments : main.MaterialAttachments) || '').split(',').map((n) => n.trim().toLowerCase()).filter(Boolean),
            skinTag: node ? node.Tags : null, skinVia: via,
        };
    }

    /**
     * Body parts with the entity's own material applied. A .cdf names a material per attachment; the entity record can
     * replace it (skins do) for the attachments listed in MaterialAttachments ("body,parts"). An empty list is read as the
     * usual body set (model, body, parts) — the ammunition dummies keep their own material either way.
     */
    withEntityMaterial(parts, dcb) {
        if (!dcb.material) return parts;
        const names = new Set(dcb.materialAttachments.length ? [...dcb.materialAttachments, 'model'] : ['model', 'body', 'parts']);
        return parts.map((p) => (names.has(String(p.name).toLowerCase()) ? { ...p, material: dcb.material, materialFrom: 'entity' } : p));
    }

    defaultLoadout(entity) {
        const out = new Map();
        for (const entry of this.component(entity, 'SEntityComponentDefaultLoadoutParams')?.loadout?.entries || []) {
            const cls = entry.entityClassName || (entry.entityClassReference?.name || '').replace(/^EntityClassDefinition\./, '');
            if (entry.itemPortName) out.set(entry.itemPortName.toLowerCase(), cls || '');
        }
        return out;
    }

    resolvePorts(entity, model) {
        const defaults = this.defaultLoadout(entity); const ports = {};
        for (const port of this.component(entity, 'SItemPortContainerComponentParams')?.Ports || []) {
            const impl = port.AttachmentImplementation; const helper = impl?.Helper?.Helper; const name = helper?.Name || '';
            const types = (port.Types || []).map((t) => [t.Type, ...(t.SubTypes || []).filter((s) => s && s !== 'UNDEFINED')].join('/'));
            const out = { types, minSize: port.MinSize, maxSize: port.MaxSize, helper: name || null };
            const portDefault = (port.defaultItem?.entityClass?.name || '').replace(/^EntityClassDefinition\./, '');
            out.defaultItem = defaults.get(String(port.Name).toLowerCase()) || portDefault || null;
            const joint = name ? model.joints.get(name.toLowerCase()) : null;
            if (!impl) out.status = 'the port has no attachment implementation in the game database';
            else if (!name) out.status = 'the port names no helper';
            else if (!joint) out.status = `helper "${name}" is not a bone or node of the weapon model`;
            else {
                let world = joint.world; const p = helper.Offset?.Position || {}; const a = helper.Offset?.Rotation || {};
                if ([p.x, p.y, p.z, a.x, a.y, a.z].some((v) => Math.abs(v || 0) > 1e-7)) {
                    world = compose(world, { position: [p.x || 0, p.y || 0, p.z || 0], rotation: quatFromAng3Degrees({ x: a.x || 0, y: a.y || 0, z: a.z || 0 }) });
                    out.helperOffset = { position: [p.x || 0, p.y || 0, p.z || 0], anglesDeg: [a.x || 0, a.y || 0, a.z || 0] };
                }
                const rotation = qNormalize(world.rotation);
                if ([...world.position, ...rotation].every(Number.isFinite)) { out.status = 'ok'; out.via = joint.source; out.bone = joint.name; out.position = [...world.position]; out.rotation = rotation[3] < 0 ? rotation.map((v) => -v) : rotation; } else out.status = `helper "${name}" has a non-finite transform`;
            }
            ports[port.Name] = out;
        }
        return ports;
    }

    /** weapon record -> { cls, geometry, geometryKind, material, palette, body[], ports{}, helpers{}, errors[] } */
    describeWeapon(record) {
        const entity = this.entity(record); const cls = record.name.replace(/^EntityClassDefinition\./, ''); const dcb = this.geometryOf(entity, cls); const model = this.loadModel(dcb.geometry);
        const out = { cls, skinTag: dcb.skinTag, skinVia: dcb.skinVia, geometry: model.path || null, geometryKind: model.kind || null, geometryExists: model.exists, skeleton: model.skeleton || null, material: dcb.material, palette: dcb.palette, errors: [...model.errors] };
        out.body = model.kind === 'cdf' ? this.withEntityMaterial(model.parts.map((p) => ({ ...p })), dcb)
            : (model.exists ? [{ name: 'model', type: 'Model', bone: null, file: model.path, material: dcb.material, position: [0, 0, 0], rotation: [0, 0, 0, 1], basis: 'identity', exists: true }] : []);
        out.bbox = model.bbox;
        out.ports = this.resolvePorts(entity, model);
        out.helpers = Object.fromEntries([...model.joints.values()].filter((j) => /muzzle|ads_align|barrel_term/i.test(j.name)).map((j) => [j.name, [...j.world.position]]));
        return out;
    }

    /** attachment class -> { cls, geometry, material, palette } or null when the class is not in the database */
    describeAttachment(cls) {
        const record = this.byClass.get(String(cls).toLowerCase()); if (!record) return null;
        const entity = this.entity(record); const def = this.component(entity, 'SAttachableComponentParams')?.AttachDef || {};
        const name = record.name.replace(/^EntityClassDefinition\./, ''); const dcb = this.geometryOf(entity, name);
        return { cls: name, ...dcb, dcb, type: def.Type, subType: def.SubType, size: def.Size };
    }
}
