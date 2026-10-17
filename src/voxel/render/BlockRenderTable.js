import { normalizeBlockVariantId } from '../../data/blockIds.js';
import { resolveChunkGeometry } from '../../world/mesh/renderTypes.js';
import {
  TABLE_STRIDE,
  KIND_AIR,
  KIND_OPAQUE,
  KIND_CUTOUT,
  KIND_TRANSLUCENT,
  KIND_LIQUID,
  KIND_CROSS,
  KIND_SPECIAL,
  FLAG_SAME_FACES,
  FLAG_OCCLUDES,
  FLAG_FOLIAGE,
  FLAG_MASKED_SIDES,
} from '../mesh/meshChunk.js';
import { FIXED_FOLIAGE } from './Colormaps.js';

const WATER_COLOR = 0x3f76e4;

/**
 * Describes how each numeric block id is meshed: render kind, texture layer
 * per face, biome tint, emission and base colour. Built lazily from the
 * block registry the first time an id shows up in a chunk.
 */
export class BlockRenderTable {
  constructor(world, textures) {
    this.world = world;
    this.textures = textures;
    this.table = new Int32Array(256 * TABLE_STRIDE);
    this.known = new Uint8Array(256);
    this.dirty = true;
  }

  grow(minIds) {
    let ids = this.known.length;
    while (ids < minIds) ids *= 2;
    const table = new Int32Array(ids * TABLE_STRIDE);
    table.set(this.table);
    const known = new Uint8Array(ids);
    known.set(this.known);
    this.table = table;
    this.known = known;
  }

  kindOf(num) {
    if (num === 0) return KIND_AIR;
    this.ensure(num);
    return this.table[num * TABLE_STRIDE];
  }

  isSpecial(num) {
    return num !== 0 && this.kindOf(num) === KIND_SPECIAL;
  }

  /** Makes sure every id in `nums` has an entry. Returns true if any added. */
  ensureAll(nums) {
    let added = false;
    for (const num of nums) if (this.ensure(num)) added = true;
    return added;
  }

  ensure(num) {
    if (num >= this.known.length) this.grow(num + 1);
    if (this.known[num]) return false;
    this.known[num] = 1;
    const id = this.world.state.reverseIdMap.get(num);
    this.describe(num, id);
    this.dirty = true;
    return true;
  }

  describe(num, id) {
    const t = this.table;
    const base = num * TABLE_STRIDE;
    t[base + 9] = 0xffffff;
    if (!id || id === 'air') {
      t[base] = KIND_AIR;
      return;
    }

    const registry = this.world.blockRegistry;
    const baseId = id.startsWith('water')
      ? 'water'
      : normalizeBlockVariantId(id);
    const blockData = this.world.getBlockData(baseId);

    if (baseId === 'water' || baseId === 'lava' || id.startsWith('lava')) {
      const isLava = baseId === 'lava' || id.startsWith('lava');
      const url = registry.resourceManager.getTextureUrl(
        isLava ? 'lava_still' : 'water_still'
      );
      const layer = url ? this.textures.layerFor(registry.loadTexture(url)) : 0;
      t[base] = KIND_LIQUID;
      for (let f = 0; f < 6; f++) t[base + 1 + f] = layer;
      t[base + 7] = 0;
      t[base + 8] = isLava ? 255 : 0;
      t[base + 9] = isLava ? 0xffffff : WATER_COLOR;
      return;
    }

    const geo = this.world.sharedChunkGeometries;
    const shape = geo
      ? resolveChunkGeometry(this.world, baseId, blockData)
      : null;
    const isCube = !geo || shape === geo.solid;
    const isCross =
      geo &&
      shape === geo.deco &&
      blockData?.renderShape !== 'paired_cross_tall';
    if (!isCube && !isCross) {
      t[base] = KIND_SPECIAL;
      return;
    }

    let material = null;
    try {
      material = registry.getMaterial(baseId);
    } catch (error) {
      console.warn('[ArloCraft] No material for', baseId, error);
    }
    const mats = Array.isArray(material) ? material : [material];
    const faceMat = (f) => mats[Math.min(f, mats.length - 1)] ?? null;
    const first = faceMat(0);

    let flags = 0;
    for (let f = 0; f < 6; f++) {
      const m = faceMat(f);
      t[base + 1 + f] = this.textures.layerFor(m?.map ?? null);
      if (m?.userData?.tintable) flags |= 1 << f;
    }

    if (isCross) {
      t[base] = KIND_CROSS;
      // Cross plants use a single texture; tint follows the first face.
      if (faceMat(0)?.userData?.tintable) flags |= 1;
    } else if (first?.transparent && (first?.opacity ?? 1) < 1) {
      t[base] = KIND_TRANSLUCENT;
    } else if (
      (first?.alphaTest ?? 0) > 0 ||
      first?.userData?.alphaCutout ||
      first?.transparent
    ) {
      t[base] = KIND_CUTOUT;
      if (baseId.includes('leaves')) flags |= FLAG_SAME_FACES;
    } else {
      t[base] = KIND_OPAQUE;
      flags |= FLAG_OCCLUDES;
    }

    // Grass block sides: dirt with the grey overlay on top, tinted like the
    // top so the green strip always matches the biome.
    if (baseId === 'grass_block') {
      const rm = registry.resourceManager;
      const sideUrl = rm.getTextureUrl('dirt');
      const overlayUrl = rm.getTextureUrl('grass_block_side_overlay');
      if (sideUrl && overlayUrl) {
        const layer = this.textures.layerForComposite(
          'grass_block_side_composite',
          registry.loadTexture(sideUrl),
          registry.loadTexture(overlayUrl)
        );
        for (const f of [0, 1, 4, 5]) t[base + 1 + f] = layer;
        flags |= 0b110011 | FLAG_MASKED_SIDES;
      }
    }
    const isFoliage =
      baseId.includes('leaves') || baseId === 'vine' || baseId === 'vines';
    if (isFoliage) flags |= FLAG_FOLIAGE;
    if (FIXED_FOLIAGE[baseId]) {
      // Spruce and birch keep their own colour in every biome.
      flags &= ~0b111111;
      t[base + 9] = FIXED_FOLIAGE[baseId];
    } else if (first?.color) {
      t[base + 9] = first.color.getHex();
    }
    t[base + 7] = flags;
    t[base + 8] = blockData?.emissive ? 255 : 0;
  }
}
