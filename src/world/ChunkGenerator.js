import { wrap } from 'comlink';
import ChunkWorker from '../workers/chunkWorker?worker';
import { generateChunkData } from '../voxel/gen/generateChunk.js';
import { meshChunk } from '../voxel/mesh/meshChunk.js';

/**
 * Pool of chunk workers that generate terrain and build chunk meshes off
 * the main thread. Falls back to running the same code synchronously when
 * workers are unavailable.
 */
export class ChunkGenerator {
  constructor(world) {
    this.world = world;
    this.workers = [];
    this.available = false;
    this.tableVersion = 0;
    // Separate in-flight limits so terrain generation never starves meshing.
    this.genInFlight = 0;
    this.meshInFlight = 0;
    this.table = new Int32Array(0);
    this.init();
  }

  init() {
    const cores = Number(globalThis.navigator?.hardwareConcurrency) || 4;
    const count = Math.max(1, Math.min(4, cores - 1));
    try {
      for (let i = 0; i < count; i++) {
        const worker = new ChunkWorker();
        this.workers.push({
          worker,
          api: wrap(worker),
          busy: 0,
          tableVersion: -1,
        });
      }
      this.available = this.workers.length > 0;
    } catch (error) {
      console.warn('[ArloCraft] Chunk workers unavailable:', error);
      this.destroy();
    }
  }

  get capacity() {
    return Math.max(1, this.workers.length) * 2;
  }

  get canGenerate() {
    return this.genInFlight < Math.max(1, this.workers.length) * 2;
  }

  get canMesh() {
    return this.meshInFlight < Math.max(1, this.workers.length) * 2;
  }

  get busy() {
    let n = 0;
    for (const w of this.workers) n += w.busy;
    return n;
  }

  pickWorker() {
    let best = this.workers[0];
    for (const w of this.workers) if (w.busy < best.busy) best = w;
    return best;
  }

  setBlockTable(table) {
    this.table = table;
    this.tableVersion++;
  }

  async run(fn) {
    const w = this.pickWorker();
    w.busy++;
    try {
      return await fn(w);
    } finally {
      w.busy--;
    }
  }

  generate(params) {
    if (!this.available) return Promise.resolve(generateChunkData(params));
    this.genInFlight++;
    return this.run((w) => w.api.generate(params)).finally(() => {
      this.genInFlight--;
    });
  }

  mesh(padded, tints) {
    if (!this.available) {
      return Promise.resolve(meshChunk(padded, this.table, tints));
    }
    this.meshInFlight++;
    return this.run(async (w) => {
      if (w.tableVersion !== this.tableVersion) {
        w.tableVersion = this.tableVersion;
        await w.api.setTable(this.table);
      }
      return w.api.mesh(padded, tints);
    }).finally(() => {
      this.meshInFlight--;
    });
  }

  destroy() {
    for (const w of this.workers) w.worker.terminate();
    this.workers = [];
    this.available = false;
  }
}
