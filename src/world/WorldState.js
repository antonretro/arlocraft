import { BLOCKS } from '../data/blocks.js';
import { normalizeBlockVariantId } from '../data/blockIds.js';

export class WorldState {
  constructor() {
    this.blockMap = new Map();
    this.blockOwners = new Map();
    this.changedBlocks = new Map();

    this.waterMeshes = new Set();
    this.virusMeshes = new Set();
    this.virusBlockCount = 0;

    this.landmarks = new Map();
    this.restoredLandmarks = new Set();
    this.openedChestKeys = new Set();
    this.starterChestClaimed = false;
    this.starterChestKey = null;

    this.terrainHeightCache = new Map();
    this.biomeCache = new Map();

    this.miningState = { key: null, progress: 0, required: 0 };

    // Internal tick states
    this.animationTick = 0;
    this.subsurfaceTick = 0;
    this.hoverTick = 0;
    this.gifTick = 0;
    this.auraSampleTick = 0;

    this.areaInfluenceSample = { x: 0, y: 0, z: 0, virus: 0, arlo: 0 };

    // Numerical ID mapping for high-perf mesh loops
    this.idMap = new Map();
    this.reverseIdMap = new Map();
    this._nextInternalId = 1;
    
    // Properties indexed by internal ID for ultra-fast meshing (4096 capacity)
    // Bit 0: Opaque, Bit 1: Transparent, Bit 2: Tintable
    this.propertyCache = new Uint8Array(4096);

    // Bootstrap definition data
    this.blockDataById = new Map();
    for (const b of BLOCKS) {
      this.blockDataById.set(b.id, b);
      this._registerInternalId(b.id);
    }
    
    this._registerInternalId('air');
  }

  _registerInternalId(blockId) {
    if (this.idMap.has(blockId)) return this.idMap.get(blockId);
    const id = this._nextInternalId++;
    if (id < 4096) {
      this.idMap.set(blockId, id);
      this.reverseIdMap.set(id, blockId);
      this._updatePropertyCache(id, blockId);
    }
    return id;
  }

  _updatePropertyCache(id, blockId) {
    if (blockId === 'air') {
      this.propertyCache[id] = 0x02; // Bit 1: Transparent
      return;
    }

    const config = this.blockDataById.get(blockId) || 
                   this.blockDataById.get(normalizeBlockVariantId(blockId));
    
    let props = 0x00;
    const lowId = blockId.toLowerCase();
    
    const isTintable = lowId.includes('leaves') || lowId.includes('grass') || 
                       lowId === 'fern' || lowId === 'water' || config?.tintable;
    
    const isTransparent = lowId.includes('leaves') || lowId.includes('glass') || 
                          lowId === 'water' || lowId === 'ice' || 
                          config?.transparent || config?.deco;
    
    const isOpaque = !isTransparent;

    if (isOpaque) props |= 0x01;
    if (isTransparent) props |= 0x02;
    if (isTintable) props |= 0x04;

    this.propertyCache[id] = props;
  }

  getProperty(rawId) {
    return this.propertyCache[rawId];
  }

  getInternalId(blockId) {
    if (!blockId) return 0;
    const existing = this.idMap.get(blockId);
    if (existing !== undefined) return existing;
    return this._registerInternalId(blockId);
  }
}
