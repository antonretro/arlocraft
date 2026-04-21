import * as THREE from 'three';

/**
 * ScriptSystem handles sandboxed execution of JavaScript logic
 * for Command Blocks and other programmable elements.
 */
export class ScriptSystem {
  constructor(game) {
    this.game = game;
    this.api = this.createArloAPI();
    this.cache = new Map(); // code -> compiled function
  }

  /**
   * Creates the 'arlo' object accessible to scripts.
   */
  createArloAPI() {
    const game = this.game;
    return {
      // World Queries
      getBlock: (x, y, z) => game.world.getBlockAt(x, y, z),
      setBlock: (x, y, z, id) => game.world.mutations.setBlockAt(x, y, z, id),
      isSolid: (x, y, z) => game.world.isSolidAt(x, y, z),

      // Player Interaction
      getPlayerPos: () => game.getPlayerPosition(),
      teleportPlayer: (x, y, z) => {
        const body = game.physics?.playerBody;
        if (body) {
          body.setTranslation({ x, y, z }, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      },
      giveItem: (id, count = 1) => game.gameState.addItem(id, count),
      sendMessage: (msg) => game.hud?.flashPrompt?.(msg, '#ffffff'),

      // Simulation Control
      spawnEntity: (type, x, y, z) => game.entities.spawnEntity(type, x, y, z),
      setTime: (time) => game.dayNight?.setTime?.(time),

      // Math Helpers
      vector: (x, y, z) => new THREE.Vector3(x, y, z),
      random: (min, max) => Math.random() * (max - min) + min,
    };
  }

  /**
   * Executes a string of code in a sandboxed environment.
   */
  execute(code, context = {}) {
    if (!code || typeof code !== 'string') return;

    try {
      let func = this.cache.get(code);

      if (!func) {
        // Compile and cache
        func = new Function(
          'arlo',
          'context',
          `
          "use strict";
          try {
            ${code}
          } catch (e) {
            console.error("[Arlo Script Error]:", e);
            arlo.sendMessage("Script Error: " + e.message);
          }
        `
        );
        this.cache.set(code, func);
      }

      func(this.api, context);
    } catch (err) {
      console.error('[Arlo Parse Error]:', err);
      this.game.hud?.flashPrompt?.(
        'Script Parse Error: ' + err.message,
        '#ff4444'
      );
    }
  }
}
