export class DebugProfiler {
  constructor(game) {
    this.game = game;
    this.visible = false;
    this.fps = 0;
    this.frameTime = 0;
    this.lastTime = performance.now();
    this.frames = 0;
    this.accumulator = 0;

    this.timers = new Map();
    this.metrics = {
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      chunks: 0,
      dirtyChunks: 0,
      particles: 0,
      rebuildQueue: 0,
      activeEntities: 0,
      playerPos: { x: 0, y: 0, z: 0 },
      chunkPos: { cx: 0, cz: 0 },
      biome: 'Unknown',
    };
  }

  toggle() {
    this.visible = !this.visible;
    window.dispatchEvent(
      new CustomEvent('debug-status-changed', { detail: this.visible })
    );
    console.log(`[ArloCraft] Debug Profiler: ${this.visible ? 'ON' : 'OFF'}`);
  }

  begin(label) {
    this.timers.set(label, performance.now());
  }

  end(label) {
    const start = this.timers.get(label);
    if (start) {
      const duration = performance.now() - start;
      this.metrics[`${label}Ms`] = duration; // Pure number
    }
  }

  update(renderer) {
    // We update stats even if hidden to keep averages stable
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;

    this.accumulator += delta;
    this.frames++;

    if (this.accumulator >= 1000) {
      this.fps = (this.frames * 1000) / this.accumulator; // Store as raw number
      this.frameTime = (this.accumulator / this.frames); // Store as raw number
      this.frames = 0;
      this.accumulator = 0;

      this._collectData(renderer);

      if (this.visible) {
        window.dispatchEvent(
          new CustomEvent('debug-metrics-updated', {
            detail: {
              fps: this.fps,
              frameTime: this.frameTime,
              metrics: { ...this.metrics },
            },
          })
        );
      }
    }
  }

  _collectData(renderer) {
    if (renderer?.info) {
      const info = renderer.info;
      this.metrics.drawCalls = info.render.calls;
      this.metrics.triangles = info.render.triangles;
      this.metrics.geometries = info.memory.geometries;
      this.metrics.textures = info.memory.textures;
    }

    if (this.game.world?.chunkManager) {
      const cm = this.game.world.chunkManager;
      this.metrics.chunks = cm.chunks?.size || 0;
      this.metrics.dirtyChunks = cm.priorityDirtyChunkKeys?.size || 0;
      this.metrics.rebuildQueue = cm.pendingChunkLoads?.length || 0;
    }

    if (this.game.entities) {
      this.metrics.activeEntities = this.game.entities.entities?.size || 0;
    }

    if (this.game.particles) {
      this.metrics.particles = this.game.particles.particles?.length || 0;
    }

    // World State
    const pos = this.game.camera?.instance?.position;
    if (pos) {
      this.metrics.playerPos = {
        x: pos.x,
        y: pos.y,
        z: pos.z,
      };
      this.metrics.chunkPos = {
        cx: Math.floor(pos.x / 16),
        cz: Math.floor(pos.z / 16),
      };
      
      const biome = this.game.world?.terrain?.getBiomeAt(pos.x, pos.z);
      this.metrics.biome = biome?.name || 'Ocean';
    }
  }
}
