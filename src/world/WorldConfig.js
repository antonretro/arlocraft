import { CHUNK_SIZE } from '../voxel/VoxelStore.js';

export class WorldConfig {
  constructor() {
    this.chunkSize = CHUNK_SIZE;
    this.qualityTier = 'balanced'; // Default tier
    this.renderDistance = 8; // chunk columns; set from settings at startup
    this.terrain = {
      minY: -64,
      maxY: 65,
      deepMinY: -220,
      seaLevel: 1,
    };
    this.influence = {
      virusRadius: 3,
    };
    this.cache = {
      terrainMaxEntries: 120000,
      biomeMaxEntries: 120000,
    };
  }
}
