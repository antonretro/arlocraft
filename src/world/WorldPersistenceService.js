export class WorldPersistenceService {
  constructor(world) {
    this.world = world;
  }

  serialize() {
    return {
      seed: this.world.seedString,
      changedBlocks: Array.from(this.world.state.changedBlocks.entries()),
      starterChestClaimed: this.world.state.starterChestClaimed,
      openedChestKeys: Array.from(this.world.state.openedChestKeys.values()),
      starterChestKey: this.world.state.starterChestKey,
      restoredLandmarks: Array.from(
        this.world.state.restoredLandmarks.values()
      ),
    };
  }

  async loadFromData(data) {
    if (!data) return;

    if (data.seed) {
      this.world.setSeed(data.seed);
    }

    if (Array.isArray(data.changedBlocks)) {
      for (const [key, rawId] of data.changedBlocks) {
        const id = this.migrateBlockId(rawId);
        this.world.state.changedBlocks.set(key, id);

        const [x, y, z] = this.world.coords.keyToCoords(key);
        if (id === null || id === 'air') {
          this.world.state.blockMap.delete(key);
        } else {
          this.world.state.blockMap.set(key, id);
        }
      }
    }

    this.world.state.starterChestClaimed = !!data.starterChestClaimed;

    if (Array.isArray(data.openedChestKeys)) {
      this.world.state.openedChestKeys = new Set(data.openedChestKeys);
    }

    if (Array.isArray(data.restoredLandmarks)) {
      this.world.state.restoredLandmarks = new Set(data.restoredLandmarks);
    }

    // Logic to refresh chunks after load
    this.world.chunkManager.clearAll();
  }

  migrateBlockId(id) {
    if (!id) return id;
    // logic moved from World.js migrateBlockId
    if (id === 'short_grass') return 'short_grass'; // confirmed not aliased
    return id;
  }
}
