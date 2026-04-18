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
    dayDensity: 0.008,
    nightDensity: 0.012,
    underwaterMultiplier: 2.0,
    minDensity: 0.005,
    maxDensity: 0.035
};

export const ATMOSPHERIC_COLORS = {
    DAY: {
        top:    0x0d5fd6,  // Deep rich sky blue at zenith
        bottom: 0x7ec8f0,  // Lighter blue at horizon
        sun:    0xfffae8   // Warm pale yellow sunlight
    },
    NIGHT: {
        top:    0x020812,  // Near-black deep space
        bottom: 0x08132a,  // Dark navy at horizon
        sun:    0x2a3d66   // Cold blue moonlight
    },
    DAWN: {
        top:    0x1a3060,  // Cool dark blue upper sky
        bottom: 0xff7733,  // Vivid amber-orange horizon
        sun:    0xffddaa   // Warm golden dawn light
    },
    DUSK: {
        top:    0x12103a,  // Deep purple upper sky
        bottom: 0xe84f1a,  // Fiery red-orange horizon
        sun:    0xff6622   // Orange sunset light
    }
};

export function computeFogDensity(daylight, submerged = false) {
    const clampedDaylight = Math.max(0.05, Math.min(1, Number(daylight) || 1));
    let density = FOG_SETTINGS.nightDensity + ((FOG_SETTINGS.dayDensity - FOG_SETTINGS.nightDensity) * clampedDaylight);
    if (submerged) density *= FOG_SETTINGS.underwaterMultiplier;
    return Math.max(FOG_SETTINGS.minDensity, Math.min(FOG_SETTINGS.maxDensity, density));
}

export function materialIsTransparent(material) {
    const isCutout = (mat) => Number(mat?.alphaTest) > 0.001 || Boolean(mat?.userData?.alphaCutout);
    if (Array.isArray(material)) {
        for (let i = 0; i < material.length; i++) {
            if (material?.[i]?.transparent || isCutout(material?.[i])) return true;
        }
        return false;
    }
    return Boolean(material?.transparent || isCutout(material));
}

export function materialUsesBlendTransparency(material) {
    const isBlended = (mat) => Boolean(mat?.transparent) && !(Number(mat?.alphaTest) > 0.001 || Boolean(mat?.userData?.alphaCutout));
    if (Array.isArray(material)) {
        for (let i = 0; i < material.length; i++) {
            if (isBlended(material?.[i])) return true;
        }
        return false;
    }
    return isBlended(material);
}
