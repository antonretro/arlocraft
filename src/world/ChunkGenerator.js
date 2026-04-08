import { wrap } from 'comlink';
import ChunkWorker from '../workers/chunkWorker?worker';

export class ChunkGenerator {
    constructor(world) {
        this.world = world;
        this.available = false;
        this.worker = null;
        this.api = null;
        this.init();
    }

    init() {
        try {
            this.worker = new ChunkWorker();
            this.api = wrap(this.worker);
            this.available = true;
        } catch {
            this.available = false;
            this.worker = null;
            this.api = null;
        }
    }

    getChangedEntriesForChunk(cx, cz) {
        const out = [];
        for (const [key, id] of this.world.changedBlocks.entries()) {
            const [x, , z] = this.world.keyToCoords(key);
            const ccx = this.world.getChunkCoord(x);
            const ccz = this.world.getChunkCoord(z);
            if (ccx !== cx || ccz !== cz) continue;
            out.push([key, id]);
        }
        return out;
    }

    async generateChunk(cx, cz) {
        if (!this.available || !this.api) return null;
        return this.api.generateChunk({
            cx,
            cz,
            chunkSize: this.world.chunkSize,
            seedString: this.world.seedString,
            changedEntries: this.getChangedEntriesForChunk(cx, cz),
            cavesEnabled: Boolean(this.world.game?.features?.caves)
        });
    }

    destroy() {
        if (this.worker) this.worker.terminate();
        this.worker = null;
        this.api = null;
        this.available = false;
    }
}
