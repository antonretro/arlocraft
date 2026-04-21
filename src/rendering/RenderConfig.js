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
  speedMax: 1.1,
};

export const RENDER_LAYERS = {
  OPAQUE: 0,
  TRANSPARENT: 20,
  WATER: 30,
};

export const FOG_SETTINGS = {
  dayDensity: 0.0055,
  nightDensity: 0.0085,
  underwaterMultiplier: 3.2,
  minDensity: 0.003,
  maxDensity: 0.024,
};

export const ATMOSPHERIC_COLORS = {
  DAY: {
    top: 0x0256cc,
    bottom: 0x86cefb,
    sun: 0xfffbe8,
  },
  NIGHT: {
    top: 0x080f1e, // Slightly bluer
    bottom: 0x141d35, // Brighter floor
    sun: 0x4a6ebc, // Luminous moonlight
  },
  DAWN: {
    top: 0x142852,
    bottom: 0xff7733, // More vibrant sunrise
    sun: 0xffddaa,
  },
  DUSK: {
    top: 0x100832,
    bottom: 0xff4411, // Moody sunset
    sun: 0xff6622,
  },
};

export function computeFogDensity(daylight, submerged = false) {
  const clampedDaylight = Math.max(0.05, Math.min(1, Number(daylight) || 1));
  let density =
    FOG_SETTINGS.nightDensity +
    (FOG_SETTINGS.dayDensity - FOG_SETTINGS.nightDensity) * clampedDaylight;
  if (submerged) density *= FOG_SETTINGS.underwaterMultiplier;
  return Math.max(
    FOG_SETTINGS.minDensity,
    Math.min(FOG_SETTINGS.maxDensity, density)
  );
}

export function materialIsTransparent(material) {
  const isCutout = (mat) =>
    Number(mat?.alphaTest) > 0.001 || Boolean(mat?.userData?.alphaCutout);
  if (Array.isArray(material)) {
    for (let i = 0; i < material.length; i++) {
      if (material?.[i]?.transparent || isCutout(material?.[i])) return true;
    }
    return false;
  }
  return Boolean(material?.transparent || isCutout(material));
}

export function materialUsesBlendTransparency(material) {
  const isBlended = (mat) =>
    Boolean(mat?.transparent) &&
    !(Number(mat?.alphaTest) > 0.001 || Boolean(mat?.userData?.alphaCutout));
  if (Array.isArray(material)) {
    for (let i = 0; i < material.length; i++) {
      if (isBlended(material?.[i])) return true;
    }
    return false;
  }
  return isBlended(material);
}
