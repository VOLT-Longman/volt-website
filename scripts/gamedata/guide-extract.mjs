// Keep references/quantities from the game records; do not infer missing values.
const short = (ref) => ref?.name?.split('.').slice(1).join('.');

export function miningTraits(elements) {
    const fields = { instability: 'elementInstability', resistance: 'elementResistance', window: 'elementOptimalWindowMidpoint', windowThinness: 'elementOptimalWindowThinness', explosion: 'elementExplosionMultiplier' };
    const result = {};
    for (const [key, field] of Object.entries(fields)) {
        const values = [...new Set(elements.map((element) => element?.[field]).filter(Number.isFinite))];
        if (values.length === 1 && elements.every((element) => Number.isFinite(element?.[field]))) result[key] = Number(values[0].toFixed(3));
        else if (values.length > 1) result.traitsVary = true;
    }
    return result;
}

export function haulingCargo(value, order = '', out = []) {
    if (Array.isArray(value)) { for (const child of value) haulingCargo(child, order, out); }
    else if (value && typeof value === 'object') {
        const source = value.missionVariableName || order;
        if (value.__type === 'HaulingOrderContent_Resource' && short(value.resource)) {
            out.push({ resource: short(value.resource), order: source || undefined,
                min: Number.isFinite(value.minSCU) ? value.minSCU : undefined,
                max: Number.isFinite(value.maxSCU) ? value.maxSCU : undefined,
                box: Number.isFinite(value.maxContainerSize) && value.maxContainerSize > 0 ? value.maxContainerSize : undefined });
        } else for (const child of Object.values(value)) haulingCargo(child, source, out);
    }
    return out;
}
