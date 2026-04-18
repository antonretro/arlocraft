import * as THREE from 'three';

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
    }
}
