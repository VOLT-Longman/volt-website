/**
 * Quantum travel estimate — small pure module (no imports, no I/O) so browser code can mirror it 1:1.
 *
 * STATUS: UNVALIDATED ESTIMATE. Nothing here was timed against a real in-game jump.
 * Every input is a game-file value from data/trade/cargo.json `drives[id]`:
 *   speed  = SQuantumDriveParams.driveSpeed        (m/s, cruise speed)
 *   a1     = SQuantumDriveParams.stageOneAccelRate (m/s^2)
 *   a2     = SQuantumDriveParams.stageTwoAccelRate (m/s^2)
 *   spool  = SQuantumDriveParams.spoolUpTime       (s)
 *   cool   = SQuantumDriveParams.cooldownTime      (s)
 *   fuel   = SCItemQuantumDriveParams.quantumFuelRequirement (unit not stated in the files)
 *
 * Model (our own derivation, plain kinematics): the ship speeds up from rest at a constant rate,
 * cruises at `speed`, and slows down at the same rate (symmetric trapezoid; a triangle when the trip
 * is too short to reach cruise speed). The files give two rates but not when the game switches
 * between them, so we do not guess a switch point: we compute the trip once with the lower rate
 * (longest time) and once with the higher rate (shortest time). Any speed-up that only ever uses
 * rates between those two lands inside that range. `seconds` is the middle of the range.
 *
 * Not modelled (not in the files we read, or not measured): route bending around planets, the
 * calibration/alignment step, atmosphere climb before a jump, jump-point tunnels, drive wear.
 */

export const TRAVEL_MODEL_STATUS = 'unvalidated-estimate';

/** Flight seconds for a symmetric speed-up / cruise / slow-down profile. */
export function trapezoidSeconds(distanceM, speed, accel) {
    if (!(distanceM > 0) || !(speed > 0)) return 0;
    if (!(accel > 0)) return distanceM / speed; // no usable rate: cruise only
    const rampDistance = speed * speed / accel; // distance used by speeding up plus slowing down
    if (distanceM <= rampDistance) return 2 * Math.sqrt(distanceM / accel); // never reaches cruise speed
    return distanceM / speed + speed / accel;
}

/**
 * @param {number} distanceM straight-line distance in metres
 * @param {{speed:number,a1?:number,a2?:number,spool?:number,cool?:number,fuel?:number}} drive
 * @returns {null | {status:string, seconds:number, minSeconds:number, maxSeconds:number, cruiseOnlySeconds:number,
 *   spoolSeconds:number|undefined, cooldownSeconds:number|undefined, totalSeconds:number, fuelScu:number|undefined}}
 *   seconds / minSeconds / maxSeconds: flight only (jump start to jump end).
 *   totalSeconds: spool + seconds (cooldown is listed separately; it only matters before the next jump).
 *   fuelScu: distance in Gm x fuel requirement. The unit is an assumption (SCU of quantum fuel per Gm).
 */
export function quantumTravel(distanceM, drive) {
    if (!drive || !(drive.speed > 0) || !(distanceM >= 0)) return null;
    const rates = [drive.a1, drive.a2].filter((rate) => rate > 0);
    const times = rates.length ? rates.map((rate) => trapezoidSeconds(distanceM, drive.speed, rate)) : [distanceM / drive.speed];
    const minSeconds = Math.min(...times); const maxSeconds = Math.max(...times);
    const seconds = (minSeconds + maxSeconds) / 2;
    const spool = Number.isFinite(drive.spool) ? drive.spool : undefined;
    return {
        status: TRAVEL_MODEL_STATUS,
        seconds, minSeconds, maxSeconds,
        cruiseOnlySeconds: distanceM / drive.speed,
        spoolSeconds: spool,
        cooldownSeconds: Number.isFinite(drive.cool) ? drive.cool : undefined,
        totalSeconds: seconds + (spool || 0),
        fuelScu: Number.isFinite(drive.fuel) ? drive.fuel * distanceM / 1e9 : undefined,
    };
}

/** Straight-line metres between two [x,y,z] points given in kilometres (world.json positions). */
export function distanceMeters(a, b) {
    if (!a || !b) return null;
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000;
}
