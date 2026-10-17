/**
 * Chunk mesher (runs in the chunk worker).
 *
 * Input is a padded (CHUNK_SIZE + 2)³ block array so faces and ambient
 * occlusion at chunk borders can see the neighbouring chunks. Only faces
 * between a block and a non-occluding neighbour are emitted. Output is one
 * set of vertex arrays per render group:
 *   solid  - opaque and alpha-cutout cubes (leaves, glass)
 *   cross  - X-shaped plants, double sided
 *   liquid - water and other translucent cubes, drawn after the rest
 */
import { CHUNK_SIZE } from '../VoxelStore.js';

export const PAD = CHUNK_SIZE + 2;

// Render kinds stored in the block table.
export const KIND_AIR = 0;
export const KIND_OPAQUE = 1;
export const KIND_CUTOUT = 2;
export const KIND_TRANSLUCENT = 3;
export const KIND_LIQUID = 4;
export const KIND_CROSS = 5;
export const KIND_SPECIAL = 6; // drawn by the instanced renderer instead

// Block table layout: TABLE_STRIDE int32 per numeric block id.
//  [0] kind  [1..6] texture layer per face (+x -x +y -y +z -z)
//  [7] flags (bits 0-5 tint per face, bit 6 draw faces against same block,
//      bit 7 casts ambient occlusion)  [8] emission 0..255
//  [9] base colour 0xRRGGBB multiplied into every face
export const TABLE_STRIDE = 10;
export const FLAG_SAME_FACES = 1 << 6;
export const FLAG_OCCLUDES = 1 << 7;

const LIQUID_TOP = 0.875;
const AO_CURVE = [0.45, 0.65, 0.82, 1.0];

// Face definitions: normal, the four corner offsets (counter-clockwise when
// viewed from outside) and the two in-plane axes used for AO sampling.
const FACES = [
  {
    n: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    n: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    n: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
];
const FACE_UVS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

class GroupBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.layer = [];
    this.col = [];
    this.emit = [];
    this.idx = [];
    this.count = 0;
  }

  vertex(x, y, z, nx, ny, nz, u, v, layer, r, g, b, e) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.layer.push(layer);
    this.col.push(r, g, b);
    this.emit.push(e);
    return this.count++;
  }

  quad(i0, i1, i2, i3, flip) {
    if (flip) this.idx.push(i1, i2, i3, i1, i3, i0);
    else this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  finish() {
    if (this.count === 0) return null;
    const IndexArray = this.count > 65535 ? Uint32Array : Uint16Array;
    return {
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.nrm),
      uv: new Float32Array(this.uv),
      layer: new Float32Array(this.layer),
      color: new Float32Array(this.col),
      emit: new Float32Array(this.emit),
      index: new IndexArray(this.idx),
    };
  }
}

function padIndex(x, y, z) {
  return ((y + 1) * PAD + (z + 1)) * PAD + (x + 1);
}

/**
 * @param {Uint16Array} padded  PAD³ numeric block ids
 * @param {Int32Array} table    TABLE_STRIDE ints per numeric id
 * @param {Uint32Array} tints   CHUNK_SIZE² 0xRRGGBB biome tint per column (x + z*16)
 */
export function meshChunk(padded, table, tints) {
  const solid = new GroupBuilder();
  const cross = new GroupBuilder();
  const liquid = new GroupBuilder();
  const tableLen = table.length / TABLE_STRIDE;

  const kindAt = (num) =>
    num < tableLen ? table[num * TABLE_STRIDE] : KIND_OPAQUE;
  const occludesAt = (x, y, z) => {
    const num = padded[padIndex(x, y, z)];
    if (num === 0 || num >= tableLen) return 0;
    return table[num * TABLE_STRIDE + 7] & FLAG_OCCLUDES ? 1 : 0;
  };

  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const num = padded[padIndex(x, y, z)];
        if (num === 0 || num >= tableLen) continue;
        const base = num * TABLE_STRIDE;
        const kind = table[base];
        if (kind === KIND_AIR || kind === KIND_SPECIAL) continue;

        const flags = table[base + 7];
        const emit = table[base + 8] / 255;
        const tint = tints[x + z * CHUNK_SIZE];
        const tr = ((tint >> 16) & 255) / 255;
        const tg = ((tint >> 8) & 255) / 255;
        const tb = (tint & 255) / 255;
        const base9 = table[base + 9];
        const br = ((base9 >> 16) & 255) / 255;
        const bg = ((base9 >> 8) & 255) / 255;
        const bb = (base9 & 255) / 255;

        if (kind === KIND_CROSS) {
          emitCross(
            cross,
            x,
            y,
            z,
            table[base + 1],
            flags & 1,
            tr,
            tg,
            tb,
            emit
          );
          continue;
        }

        const isLiquid = kind === KIND_LIQUID;
        let topH = 1;
        if (isLiquid && padded[padIndex(x, y + 1, z)] !== num)
          topH = LIQUID_TOP;
        const group = kind === KIND_TRANSLUCENT || isLiquid ? liquid : solid;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const [nx, ny, nz] = face.n;
          const nNum = padded[padIndex(x + nx, y + ny, z + nz)];
          if (!faceVisible(kind, num, flags, nNum, kindAt(nNum))) continue;
          const layer = table[base + 1 + f];
          const tinted = (flags >> f) & 1;
          const r0 = (tinted ? tr : 1) * br;
          const g0 = (tinted ? tg : 1) * bg;
          const b0 = (tinted ? tb : 1) * bb;

          const ids = [0, 0, 0, 0];
          const ao = [3, 3, 3, 3];
          for (let c = 0; c < 4; c++) {
            const [cxo, cyo, czo] = face.corners[c];
            if (!isLiquid) {
              // Neighbours of this corner on the outer side of the face.
              const ox = x + nx;
              const oy = y + ny;
              const oz = z + nz;
              const sx = nx === 0 ? (cxo === 1 ? 1 : -1) : 0;
              const sy = ny === 0 ? (cyo === 1 ? 1 : -1) : 0;
              const sz = nz === 0 ? (czo === 1 ? 1 : -1) : 0;
              let s1;
              let s2;
              if (nx !== 0) {
                s1 = occludesAt(ox, oy + sy, oz);
                s2 = occludesAt(ox, oy, oz + sz);
              } else if (ny !== 0) {
                s1 = occludesAt(ox + sx, oy, oz);
                s2 = occludesAt(ox, oy, oz + sz);
              } else {
                s1 = occludesAt(ox + sx, oy, oz);
                s2 = occludesAt(ox, oy + sy, oz);
              }
              const corner = occludesAt(ox + sx, oy + sy, oz + sz);
              ao[c] = s1 && s2 ? 0 : 3 - (s1 + s2 + corner);
            }
            const shade = AO_CURVE[ao[c]];
            const vy = cyo === 1 ? y + topH : y;
            const [u, v] = FACE_UVS[c];
            ids[c] = group.vertex(
              x + cxo,
              vy,
              z + czo,
              nx,
              ny,
              nz,
              u,
              f !== 2 && f !== 3 && cyo === 1 ? topH : v,
              layer,
              r0 * shade,
              g0 * shade,
              b0 * shade,
              emit
            );
          }
          // Flip the diagonal so AO gradients interpolate without seams.
          group.quad(
            ids[0],
            ids[1],
            ids[2],
            ids[3],
            ao[0] + ao[2] < ao[1] + ao[3]
          );
        }
      }
    }
  }

  return {
    solid: solid.finish(),
    cross: cross.finish(),
    liquid: liquid.finish(),
  };
}

function faceVisible(kind, num, flags, nNum, nKind) {
  if (nNum === 0 || nKind === KIND_AIR) return true;
  if (nKind === KIND_OPAQUE) return false;
  if (nNum === num) return (flags & FLAG_SAME_FACES) !== 0;
  // Cutout, translucent, liquid, cross and special neighbours never fully
  // hide a face.
  return true;
}

function emitCross(group, x, y, z, layer, tinted, tr, tg, tb, emit) {
  const r = tinted ? tr : 1;
  const g = tinted ? tg : 1;
  const b = tinted ? tb : 1;
  const inset = 0.15;
  const planes = [
    [inset, inset, 1 - inset, 1 - inset],
    [inset, 1 - inset, 1 - inset, inset],
  ];
  for (const [x0, z0, x1, z1] of planes) {
    const nx = z1 - z0;
    const nz = -(x1 - x0);
    const len = Math.hypot(nx, nz) || 1;
    const a = group.vertex(
      x + x0,
      y,
      z + z0,
      nx / len,
      0,
      nz / len,
      0,
      0,
      layer,
      r,
      g,
      b,
      emit
    );
    const b1 = group.vertex(
      x + x1,
      y,
      z + z1,
      nx / len,
      0,
      nz / len,
      1,
      0,
      layer,
      r,
      g,
      b,
      emit
    );
    const c = group.vertex(
      x + x1,
      y + 1,
      z + z1,
      nx / len,
      0,
      nz / len,
      1,
      1,
      layer,
      r,
      g,
      b,
      emit
    );
    const d = group.vertex(
      x + x0,
      y + 1,
      z + z0,
      nx / len,
      0,
      nz / len,
      0,
      1,
      layer,
      r,
      g,
      b,
      emit
    );
    group.quad(a, b1, c, d, false);
  }
}
