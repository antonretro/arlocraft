import { CHUNK_SHIFT, chunkKeyOf } from './VoxelStore.js';

/**
 * Player edits: Map<blockKey, blockId | null> (null = removed), exactly like
 * the old `state.changedBlocks`, plus an index by chunk so a chunk can
 * replay its edits when it loads without scanning every edit in the world.
 */
export class ChangeLog extends Map {
  constructor(coords, entries) {
    super();
    this.coords = coords;
    this.byChunk = new Map(); // chunkKey -> Set<blockKey>
    // Highest edited chunk layer per column, so tall builds stay loaded.
    this.topLayerByColumn = new Map(); // "cx|cz" -> cy
    if (entries) for (const [k, v] of entries) this.set(k, v);
  }

  chunkKeyFor(key) {
    const [x, y, z] = this.coords.keyToCoords(key);
    return chunkKeyOf(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT, z >> CHUNK_SHIFT);
  }

  noteTopLayer(key, id) {
    if (id === null || id === undefined) return;
    const [x, y, z] = this.coords.keyToCoords(key);
    const col = `${x >> CHUNK_SHIFT}|${z >> CHUNK_SHIFT}`;
    const cy = y >> CHUNK_SHIFT;
    const top = this.topLayerByColumn.get(col);
    if (top === undefined || cy > top) {
      this.topLayerByColumn.set(col, cy);
      this.topLayersChanged = true;
    }
  }

  topEditedLayer(cx, cz) {
    return this.topLayerByColumn.get(`${cx}|${cz}`);
  }

  set(key, id) {
    // Map's constructor calls set() before our fields exist.
    if (this.byChunk) {
      const ck = this.chunkKeyFor(key);
      let keys = this.byChunk.get(ck);
      if (!keys) {
        keys = new Set();
        this.byChunk.set(ck, keys);
      }
      keys.add(key);
      this.noteTopLayer(key, id);
    }
    return super.set(key, id);
  }

  delete(key) {
    if (this.byChunk) this.byChunk.get(this.chunkKeyFor(key))?.delete(key);
    return super.delete(key);
  }

  clear() {
    this.byChunk?.clear();
    this.topLayerByColumn?.clear();
    super.clear();
  }

  /** Iterates [blockKey, id] edits inside one chunk. */
  *forChunk(chunkKey) {
    const keys = this.byChunk.get(chunkKey);
    if (!keys) return;
    for (const key of keys) yield [key, super.get(key)];
  }
}
