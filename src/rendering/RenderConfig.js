export const CLOUD_SETTINGS = {
    count: 52,
    widthMin: 12,
    widthMax: 34,
    depthMin: 7,
    depthMax: 18,
    yMin: 200,
    yMax: 240,
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
        top:    0x0256cc,  // More vivid, saturated zenith
        bottom: 0x86cefb,  // Lighter, more airy horizon
        sun:    0xfffbe8   // Bright warm sun
    },
    NIGHT: {
        top:    0x01050c,  // Deep, near-black space
        bottom: 0x071124,  // Moody dark navy
        sun:    0x3a4d7c   // More luminous moonlight
    },
    DAWN: {
        top:    0x142852,  // Saturated twilight zenith
        bottom: 0xff6622,  // Harder orange transition
        sun:    0xffcc88   // Warm peach light
    },
    DUSK: {
        top:    0x100832,  // Royal violet-purple upper
        bottom: 0xff3a00,  // Deep fiery red horizon
        sun:    0xff5511   // Intense red-orange light
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
