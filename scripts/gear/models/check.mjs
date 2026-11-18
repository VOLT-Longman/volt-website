/**
 * check.mjs — automatic "does every part sit where it belongs" check for one exported gun.
 *
 * Works on what was actually written: the body .glb and the part .glb files are read back, the port transform from the
 * manifest is applied by hand, and the placed vertices are compared with the body's vertices.
 * Engine space throughout: +X right, +Y forward (muzzle), +Z up, metres.
 *
 * Checks (a failure is reported, never corrected):
 *   port-finite     the port transform is finite
 *   port-near-body  the port lies inside the body's bounding box grown by 5 cm
 *   part-model      each offered part has a model with a finite, non-empty box
 *   seat            the placed part's box, grown by 1 cm, contains at least one body vertex (it touches the gun)
 *   seat-gap        the closest pair (part vertex, body vertex) is no further apart than 15 mm — a floating part fails this
 *                   even when its box overlaps the gun's (vertex spacing on flat rails is why the limit is not tighter)
 *   barrel-axis     a muzzle device's own long (forward) axis points along the gun's barrel axis, and its centre is on that axis
 *   optic-above     an optic's centre is above the bore line
 *   magazine-below  a magazine's centre is below the bore line
 *   under-below     an underbarrel part's centre is below the bore line
 * The bore line height is the barrel port's height; without a barrel port, a muzzle helper bone; without either the
 * three bore checks are skipped and that is reported as a note, not as a pass.
 */
import { qRotate } from './skeleton.mjs';

const SEAT_MARGIN = 0.01; const BODY_MARGIN = 0.05; const GAP_LIMIT = 0.015; const CELL = 0.015;
const mm = (v) => `${(v * 1000).toFixed(1)} mm`;

/** engine-space box of part vertices placed on a port */
export function placedBox(positions, port) {
    const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
        const v = qRotate(port.rotation, [positions[i], positions[i + 1], positions[i + 2]]);
        for (let c = 0; c < 3; c += 1) { const x = v[c] + port.position[c]; if (x < min[c]) min[c] = x; if (x > max[c]) max[c] = x; }
    }
    return { min, max };
}

/** distance from the nearest body vertex to a box (0 when a vertex is inside) */
function gapToBox(body, box) {
    let best = Infinity;
    for (let i = 0; i < body.length; i += 3) {
        let d2 = 0;
        for (let c = 0; c < 3; c += 1) { const v = body[i + c]; const d = v < box.min[c] ? box.min[c] - v : v > box.max[c] ? v - box.max[c] : 0; d2 += d * d; }
        if (d2 < best) { best = d2; if (best === 0) break; }
    }
    return Math.sqrt(best);
}

/** body vertices in a uniform grid, for nearest-vertex queries */
function gridOf(positions) {
    const cells = new Map();
    for (let i = 0; i < positions.length; i += 3) {
        const key = `${Math.floor(positions[i] / CELL)},${Math.floor(positions[i + 1] / CELL)},${Math.floor(positions[i + 2] / CELL)}`;
        let list = cells.get(key); if (!list) { list = []; cells.set(key, list); }
        list.push(i);
    }
    return cells;
}
/** smallest distance between a placed part vertex and a body vertex, searched up to 3 cells (45 mm); Infinity beyond */
function closestPair(positions, port, body, grid) {
    let best = Infinity;
    for (let i = 0; i < positions.length; i += 3) {
        const v = qRotate(port.rotation, [positions[i], positions[i + 1], positions[i + 2]]).map((x, c) => x + port.position[c]);
        const reach = Math.min(3, Math.ceil(Math.min(best, 3 * CELL) / CELL));
        const cx = Math.floor(v[0] / CELL); const cy = Math.floor(v[1] / CELL); const cz = Math.floor(v[2] / CELL);
        for (let x = cx - reach; x <= cx + reach; x += 1) for (let y = cy - reach; y <= cy + reach; y += 1) for (let z = cz - reach; z <= cz + reach; z += 1) {
            const list = grid.get(`${x},${y},${z}`); if (!list) continue;
            for (const j of list) { const d = Math.hypot(body[j] - v[0], body[j + 1] - v[1], body[j + 2] - v[2]); if (d < best) best = d; }
        }
    }
    return best;
}

/**
 * body: { positions (engine space), min, max }
 * ports: [{ name, kind, position, rotation, parts: [cls] }]   (engine space)
 * partData: Map(cls -> { ok, reason, positions, min, max })
 * helpers: { boneName: [x, y, z] }
 */
export function checkWeapon({ body, ports, partData, helpers }) {
    const failures = []; const notes = []; let checks = 0; let partsChecked = 0; let worstGap = 0;
    const grid = gridOf(body.positions);
    const fail = (port, part, check, detail) => failures.push(part ? { port, part, check, detail } : { port, check, detail });
    const size = body.max.map((v, i) => v - body.min[i]);
    checks += 1; if (!(size[1] >= size[0] && size[1] >= size[2])) notes.push(`the body's longest side is not front-to-back (${size.map(mm).join(' x ')}); the barrel axis is still taken as the model's forward axis`);

    const barrelPort = ports.find((p) => p.kind === 'barrel' && p.position);
    const muzzle = Object.entries(helpers || {}).find(([name]) => /muzzle/i.test(name)) || Object.entries(helpers || {}).find(([name]) => /barrel_term/i.test(name));
    const bore = barrelPort ? { z: barrelPort.position[2], from: `barrel port ${barrelPort.name}` } : muzzle ? { z: muzzle[1][2], from: `helper bone ${muzzle[0]}` } : null;
    if (!bore) notes.push('no barrel port and no muzzle helper: above / below the bore line was not checked');

    for (const port of ports) {
        checks += 1;
        if (!port.position || ![...port.position, ...port.rotation].every(Number.isFinite)) { fail(port.name, null, 'port-finite', 'port transform missing or not finite'); continue; }
        checks += 1;
        const outside = port.position.map((v, i) => Math.max(body.min[i] - BODY_MARGIN - v, v - body.max[i] - BODY_MARGIN, 0));
        if (outside.some((v) => v > 0)) fail(port.name, null, 'port-near-body', `port is ${mm(Math.hypot(...outside))} outside the body box (+5 cm)`);
        const forward = qRotate(port.rotation, [0, 1, 0]);
        for (const cls of port.parts) {
            const part = partData.get(cls); partsChecked += 1; checks += 1;
            if (!part || !part.ok) { fail(port.name, cls, 'part-model', part?.reason || 'no model'); continue; }
            if (![...part.min, ...part.max].every(Number.isFinite) || part.positions.length < 9) { fail(port.name, cls, 'part-model', 'empty or non-finite model'); continue; }
            const box = placedBox(part.positions, port);
            const centre = box.min.map((v, i) => (v + box.max[i]) / 2);
            checks += 1;
            const grown = { min: box.min.map((v) => v - SEAT_MARGIN), max: box.max.map((v) => v + SEAT_MARGIN) };
            const gap = gapToBox(body.positions, grown);
            if (gap > 0) fail(port.name, cls, 'seat', `nearest body vertex is ${mm(gap + SEAT_MARGIN)} away from the placed part's box`);
            else {
                checks += 1; const pair = closestPair(part.positions, port, body.positions, grid);
                if (pair > GAP_LIMIT) fail(port.name, cls, 'seat-gap', `closest part vertex and body vertex are ${Number.isFinite(pair) ? mm(pair) : 'more than 45 mm'} apart`);
                if (Number.isFinite(pair)) worstGap = Math.max(worstGap, pair); else worstGap = Infinity;
            }
            if (port.kind === 'barrel') {
                checks += 1;
                const partSize = part.max.map((v, i) => v - part.min[i]);
                const along = forward[1];   // device's own +Y against the gun's forward axis
                const off = Math.hypot(centre[0] - port.position[0], centre[2] - port.position[2]);
                const problems = [];
                if (along < 0.95) problems.push(`device axis is ${(Math.acos(Math.max(-1, Math.min(1, along))) * 180 / Math.PI).toFixed(1)} degrees off the barrel axis`);
                if (!(partSize[1] >= partSize[0] && partSize[1] >= partSize[2])) problems.push(`device model is not longest along its own forward axis (${partSize.map(mm).join(' x ')})`);
                if (off > 0.015) problems.push(`device centre is ${mm(off)} off the bore axis`);
                if (box.max[1] <= port.position[1]) problems.push('device does not extend forward of the port');
                if (problems.length) fail(port.name, cls, 'barrel-axis', problems.join('; '));
            } else if (bore && port.kind === 'optics') {
                checks += 1; if (!(centre[2] > bore.z)) fail(port.name, cls, 'optic-above', `optic centre is ${mm(bore.z - centre[2])} below the bore line (${bore.from})`);
            } else if (bore && port.kind === 'magazine') {
                checks += 1; if (!(centre[2] < bore.z)) fail(port.name, cls, 'magazine-below', `magazine centre is ${mm(centre[2] - bore.z)} above the bore line (${bore.from})`);
            } else if (bore && port.kind === 'underbarrel') {
                checks += 1; if (!(centre[2] < bore.z)) fail(port.name, cls, 'under-below', `part centre is ${mm(centre[2] - bore.z)} above the bore line (${bore.from})`);
            }
        }
    }
    return { ok: failures.length === 0, ports: ports.length, parts: partsChecked, checks, boreFrom: bore ? bore.from : null, worstSeatGapMm: Number.isFinite(worstGap) ? +(worstGap * 1000).toFixed(1) : null, notes, failures };
}
