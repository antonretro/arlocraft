// Software isometric block-icon renderer.
//
// Draws Minecraft-style inventory cubes (top + front + right face) onto a
// plain 2D canvas — no WebGL context is created. Every output pixel is mapped
// back through the inverse of the isometric (affine) projection onto the face
// it lands on, then the nearest texel is sampled. This gives perfectly crisp
// pixel-art faces with no seams between them, and supports arbitrary boxes so
// slabs, stairs and short blocks fall out of the same code.
//
// Projection (unit cube, x = east, y = up, z = south/towards viewer):
//   sx = 32 + (x - z) * 32
//   sy = (x + z) * 16 + (1 - y) * 32
// i.e. 2:1 pixel isometric, 2 screen px per texel for 16px textures, and the
// full cube spans exactly 64x64. The view axis is (1, 1, 1), so x + y + z is
// "closeness" to the viewer.

export const BLOCK_ICON_SIZE = 64;

const HALF_W = 32; // screen px per unit along x / z (horizontal)
const HALF_H = 16; // screen px per unit along x / z (vertical)
const UNIT_Y = 32; // screen px per unit along y
const EPS = 1e-6;

export const FACE_SHADE = { top: 1.0, front: 0.8, right: 0.6 };

/** Box presets in unit-cube coordinates: [x0, y0, z0, x1, y1, z1]. */
export const BLOCK_ICON_SHAPES = {
  cube: [[0, 0, 0, 1, 1, 1]],
  slab: [[0, 0, 0, 1, 0.5, 1]],
  // Lower half plus an upper step at the back, like the vanilla stair item.
  stairs: [
    [0, 0, 0, 1, 0.5, 1],
    [0, 0.5, 0, 1, 1, 0.5],
  ],
  short: [[0, 0, 0, 1, 15 / 16, 1]],
  trapdoor: [[0, 0, 0, 1, 3 / 16, 1]],
  cactus: [[1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16]],
};

const within = (value, lo, hi) => value >= lo - EPS && value <= hi + EPS;

/**
 * Returns the texture-space hit of a pixel centre on one visible face of a
 * box, or null. u/v follow vanilla's default per-face UVs (derived from the
 * block-space position), so a slab samples the lower half of its side texture.
 */
function hitFace(face, box, sx, sy) {
  const [x0, y0, z0, x1, y1, z1] = box;
  const d = (sx - HALF_W) / HALF_W; // x - z
  if (face === 'top') {
    const s = (sy - (1 - y1) * UNIT_Y) / HALF_H; // x + z
    const x = (s + d) / 2;
    const z = (s - d) / 2;
    if (!within(x, x0, x1) || !within(z, z0, z1)) return null;
    return { u: x, v: z, depth: x + y1 + z };
  }
  if (face === 'front') {
    const z = z1;
    const x = d + z;
    if (!within(x, x0, x1)) return null;
    const y = 1 - (sy - (x + z) * HALF_H) / UNIT_Y;
    if (!within(y, y0, y1)) return null;
    return { u: x, v: 1 - y, depth: x + y + z };
  }
  // right (+x)
  const x = x1;
  const z = x - d;
  if (!within(z, z0, z1)) return null;
  const y = 1 - (sy - (x + z) * HALF_H) / UNIT_Y;
  if (!within(y, y0, y1)) return null;
  return { u: 1 - z, v: 1 - y, depth: x + y + z };
}

function sampleFace(tex, u, v, shade) {
  const tx = Math.min(tex.width - 1, Math.max(0, Math.floor(u * tex.width)));
  const ty = Math.min(tex.height - 1, Math.max(0, Math.floor(v * tex.height)));
  const i = (ty * tex.width + tx) * 4;
  const d = tex.data;
  const tint = tex.tint;
  return [
    d[i] * shade * (tint ? tint[0] : 1),
    d[i + 1] * shade * (tint ? tint[1] : 1),
    d[i + 2] * shade * (tint ? tint[2] : 1),
    d[i + 3] / 255,
  ];
}

/**
 * Converts a loaded image / canvas / bitmap into raw RGBA pixels of its first
 * animation frame (vertical or horizontal strips are cropped to a square).
 */
export function readTexturePixels(image) {
  const width = Number(image?.naturalWidth || image?.width) || 0;
  const height = Number(image?.naturalHeight || image?.height) || 0;
  if (!width || !height) return null;
  let fw = width;
  let fh = height;
  if (height > width && height % width === 0) fh = width;
  else if (width > height && width % height === 0) fw = height;

  const canvas = document.createElement('canvas');
  canvas.width = fw;
  canvas.height = fh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, fw, fh, 0, 0, fw, fh);
  try {
    const { data } = ctx.getImageData(0, 0, fw, fh);
    return { data, width: fw, height: fh };
  } catch {
    return null; // tainted canvas
  }
}

/** Hex colour (0xRRGGBB) -> multiplier triple. */
export function tintToMultiplier(hex) {
  if (hex == null) return null;
  return [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  ];
}

/**
 * Renders an isometric block icon and returns a PNG data URL.
 * @param {{top, front, right}} faces - each `{ data, width, height, tint? }`
 * @param {number[][]} boxes - see BLOCK_ICON_SHAPES
 */
export function renderBlockIcon(faces, boxes = BLOCK_ICON_SHAPES.cube) {
  const size = BLOCK_ICON_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  // CPU-backed canvas: we only put pixels and encode, so avoid GPU readback.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  const out = ctx.createImageData(size, size);
  const px = out.data;
  const faceNames = ['top', 'front', 'right'];
  const hits = [];

  for (let py = 0; py < size; py++) {
    for (let pxX = 0; pxX < size; pxX++) {
      const sx = pxX + 0.5;
      const sy = py + 0.5;
      hits.length = 0;
      for (const box of boxes) {
        for (const face of faceNames) {
          const tex = faces[face];
          if (!tex) continue;
          const hit = hitFace(face, box, sx, sy);
          if (hit) {
            hit.tex = tex;
            hit.shade = FACE_SHADE[face];
            hits.push(hit);
          }
        }
      }
      if (hits.length === 0) continue;
      if (hits.length > 1) hits.sort((a, b) => a.depth - b.depth);

      // Composite far-to-near (src-over) so cutout/translucent texels show
      // whatever visible face lies behind them.
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const hit of hits) {
        const [sr, sg, sb, sa] = sampleFace(hit.tex, hit.u, hit.v, hit.shade);
        if (sa <= 0) continue;
        const na = sa + a * (1 - sa);
        r = (sr * sa + r * a * (1 - sa)) / na;
        g = (sg * sa + g * a * (1 - sa)) / na;
        b = (sb * sa + b * a * (1 - sa)) / na;
        a = na;
      }
      if (a <= 0) continue;
      const o = (py * size + pxX) * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = a * 255;
    }
  }

  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}
