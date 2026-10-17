/**
 * VoxelStore — the world's block storage.
 *
 * Blocks live in per-chunk Uint16Arrays (CHUNK_SIZE³ entries) holding the
 * numeric ids from WorldState's id map; 0 is air. This replaces the old
 * global `Map<key, blockId>` that held one entry per block in the world.
 *
 * World-generation writes that land outside the chunk being generated
 * (tree canopies, structures) are recorded in `generated` and replayed on
 * top of a chunk's terrain whenever that chunk is (re)loaded, so a
 * structure is never cut off because its neighbour loaded first or was
 * unloaded and loaded again.
 */
export const CHUNK_SIZE = 16;
export const CHUNK_SHIFT = 4;
export const CHUNK_MASK = CHUNK_SIZE - 1;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * CHUNK_SIZE;

// Marks a generated write that only fills air (tree leaves), as opposed to
// one that replaces terrain (structures, carved air).
const FILL_ONLY = 0x10000;

export function localIndex(lx, ly, lz) {
  return (ly << 8) | (lz << 4) | lx;
}

export function chunkKeyOf(cx, cy, cz) {
  return `${cx}|${cy}|${cz}`;
}

export class VoxelStore {
  constructor(state, coords) {
    this.state = state; // WorldState: id <-> numeric id mapping
    this.coords = coords;
    this.chunks = new Map(); // chunkKey -> Uint16Array
    this.generated = new Map(); // chunkKey -> Map<localIndex, num | FILL_ONLY>
    this.blockMap = new BlockMapView(this);
    this.listeners = new Set(); // (cx, cy, cz, lx, ly, lz, oldNum, newNum)
  }

  toNumeric(id) {
    if (!id || id === 'air') return 0;
    return this.state.getInternalId(id);
  }

  toId(num) {
    if (num === 0) return null;
    return this.state.reverseIdMap.get(num) ?? null;
  }

  hasChunk(cx, cy, cz) {
    return this.chunks.has(chunkKeyOf(cx, cy, cz));
  }

  getChunkArray(cx, cy, cz) {
    return this.chunks.get(chunkKeyOf(cx, cy, cz)) ?? null;
  }

  /** Installs freshly generated terrain plus recorded generation writes. */
  setChunkArray(cx, cy, cz, blocks) {
    const key = chunkKeyOf(cx, cy, cz);
    const writes = this.generated.get(key);
    if (writes) {
      for (const [idx, value] of writes) {
        if (value & FILL_ONLY) {
          if (blocks[idx] === 0) blocks[idx] = value & 0xffff;
        } else {
          blocks[idx] = value;
        }
      }
    }
    this.chunks.set(key, blocks);
  }

  /**
   * Records a world-generation write and applies it now if the chunk is
   * loaded. Returns true when a loaded chunk changed.
   */
  setGenerated(x, y, z, id, fillOnly = false) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    const num = this.toNumeric(id);
    const key = chunkKeyOf(
      x >> CHUNK_SHIFT,
      y >> CHUNK_SHIFT,
      z >> CHUNK_SHIFT
    );
    const idx = localIndex(x & CHUNK_MASK, y & CHUNK_MASK, z & CHUNK_MASK);
    let writes = this.generated.get(key);
    if (!writes) {
      writes = new Map();
      this.generated.set(key, writes);
    }
    writes.set(idx, fillOnly ? num | FILL_ONLY : num);

    const arr = this.chunks.get(key);
    if (!arr) return false;
    if (fillOnly && arr[idx] !== 0) return false;
    if (arr[idx] === num) return false;
    arr[idx] = num;
    return true;
  }

  dropChunk(cx, cy, cz) {
    this.chunks.delete(chunkKeyOf(cx, cy, cz));
  }

  clear() {
    this.chunks.clear();
    this.generated.clear();
  }

  getNumeric(x, y, z) {
    const cx = x >> CHUNK_SHIFT;
    const cy = y >> CHUNK_SHIFT;
    const cz = z >> CHUNK_SHIFT;
    const arr = this.chunks.get(chunkKeyOf(cx, cy, cz));
    if (!arr) return 0;
    return arr[localIndex(x & CHUNK_MASK, y & CHUNK_MASK, z & CHUNK_MASK)];
  }

  get(x, y, z) {
    return this.toId(
      this.getNumeric(Math.floor(x), Math.floor(y), Math.floor(z))
    );
  }

  /**
   * Writes a block at runtime and returns the previous id. Writes into
   * chunks that are not loaded are dropped; player edits are recorded in
   * changedBlocks by the caller and replayed when the chunk loads.
   */
  set(x, y, z, id) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    const num = this.toNumeric(id);
    const cx = x >> CHUNK_SHIFT;
    const cy = y >> CHUNK_SHIFT;
    const cz = z >> CHUNK_SHIFT;
    const key = chunkKeyOf(cx, cy, cz);
    const lx = x & CHUNK_MASK;
    const ly = y & CHUNK_MASK;
    const lz = z & CHUNK_MASK;
    const idx = localIndex(lx, ly, lz);
    const arr = this.chunks.get(key);
    if (!arr) return null;
    const old = arr[idx];
    if (old === num) return this.toId(old);
    arr[idx] = num;
    for (const fn of this.listeners) fn(cx, cy, cz, lx, ly, lz, old, num);
    return this.toId(old);
  }

  /** Number of non-air blocks in loaded chunks (diagnostics only). */
  countBlocks() {
    let n = 0;
    for (const arr of this.chunks.values()) {
      for (let i = 0; i < arr.length; i++) if (arr[i] !== 0) n++;
    }
    return n;
  }

  *entries() {
    for (const [key, arr] of this.chunks) {
      const [cx, cy, cz] = key.split('|').map(Number);
      const bx = cx * CHUNK_SIZE;
      const by = cy * CHUNK_SIZE;
      const bz = cz * CHUNK_SIZE;
      for (let i = 0; i < arr.length; i++) {
        const num = arr[i];
        if (num === 0) continue;
        const lx = i & CHUNK_MASK;
        const lz = (i >> 4) & CHUNK_MASK;
        const ly = i >> 8;
        yield [this.coords.getKey(bx + lx, by + ly, bz + lz), this.toId(num)];
      }
    }
  }
}

/**
 * Map-compatible view over VoxelStore keyed by WorldCoordinates.getKey(),
 * so code written against the old `state.blockMap` keeps working.
 */
export class BlockMapView {
  constructor(store) {
    this.store = store;
  }

  get(key) {
    const [x, y, z] = this.store.coords.keyToCoords(key);
    return this.store.get(x, y, z) ?? undefined;
  }

  has(key) {
    const [x, y, z] = this.store.coords.keyToCoords(key);
    return this.store.getNumeric(x, y, z) !== 0;
  }

  set(key, id) {
    const [x, y, z] = this.store.coords.keyToCoords(key);
    this.store.set(x, y, z, id);
    return this;
  }

  delete(key) {
    const [x, y, z] = this.store.coords.keyToCoords(key);
    return this.store.set(x, y, z, null) !== null;
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.countBlocks();
  }

  entries() {
    return this.store.entries();
  }

  *keys() {
    for (const [key] of this.store.entries()) yield key;
  }

  *values() {
    for (const [, id] of this.store.entries()) yield id;
  }

  forEach(fn) {
    for (const [key, id] of this.store.entries()) fn(id, key, this);
  }

  [Symbol.iterator]() {
    return this.store.entries();
  }
}
