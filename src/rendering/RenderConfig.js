export const CLOUD_SETTINGS = {
    count: 52,
    widthMin: 12,
    widthMax: 34,
    depthMin: 7,
    depthMax: 18,
    yMin: 78,
    yMax: 105,
    spread: 1300,
    speedMin: 0.45,
    speedMax: 1.1
};

export const RENDER_LAYERS = {
    OPAQUE: 0,
    TRANSPARENT: 20,
    WATER: 30
};

export const FOG_SETTINGS = {
    dayDensity: 0.010,
    nightDensity: 0.018,
    underwaterMultiplier: 2.2,
    minDensity: 0.008,
    maxDensity: 0.045
};

export function computeFogDensity(daylight, submerged = false) {
    const clampedDaylight = Math.max(0.05, Math.min(1, Number(daylight) || 1));
    let density = FOG_SETTINGS.nightDensity + ((FOG_SETTINGS.dayDensity - FOG_SETTINGS.nightDensity) * clampedDaylight);
    if (submerged) density *= FOG_SETTINGS.underwaterMultiplier;
    return Math.max(FOG_SETTINGS.minDensity, Math.min(FOG_SETTINGS.maxDensity, density));
}

export function materialIsTransparent(material) {
    if (Array.isArray(material)) {
        for (let i = 0; i < material.length; i++) {
            if (material?.[i]?.transparent) return true;
        }
        return false;
    }
    return Boolean(material?.transparent);
}
