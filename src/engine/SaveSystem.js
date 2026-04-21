import LZString from 'lz-string';
import { migrateInventoryItem } from '../data/blockMigrations.js';

/**
 * SaveSystem
 * Manages the serialization, compression, and persistence of world data.
 */
export class SaveSystem {
  constructor(game) {
    this.game = game;
  }

  getSlotKey(slotId) {
    return `ArloCraft-world-save-${slotId}`;
  }

  encode(data) {
    const json = JSON.stringify(data);
    return {
      format: 'ArloCraft-lz-v1',
      data: LZString.compressToBase64(json),
    };
  }

  decode(rawText) {
    const text = String(rawText ?? '').trim();
    if (!text) throw new Error('Empty save payload');

    const parsed = JSON.parse(text);

    if (
      parsed?.format === 'ArloCraft-lz-v1' &&
      typeof parsed.data === 'string'
    ) {
      const decompressed = LZString.decompressFromBase64(parsed.data);
      if (!decompressed)
        throw new Error('Compressed save could not be decompressed');
      return JSON.parse(decompressed);
    }

    return parsed;
  }

  /**
   * Captures a complete state snapshot of the active game.
   */
  getSnapshot() {
    const g = this.game;
    const pos = g.getPlayerPosition();
    
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      world: g.world.serialize(),
      player: {
        position: { x: pos.x, y: pos.y, z: pos.z },
        look: { yaw: g.viewYaw, pitch: g.viewPitch },
        cameraMode: g.cameraModes[g.cameraModeIndex],
        mode: g.gameState.mode,
        hp: g.gameState.hp,
        hunger: g.gameState.hunger,
      },
      stats: {
        level: g.stats.level,
        xp: g.stats.xp,
        xpToNextLevel: g.stats.xpToNextLevel,
        attributes: g.stats.attributes,
      },
      inventory: g.gameState.inventory,
      offhand: g.gameState.offhand,
      craftingGrid: g.gameState.craftingGrid,
    };
  }

  /**
   * Applies a state snapshot to the active game instance.
   */
  applySnapshot(data) {
    if (!data?.world) throw new Error('Invalid save data: Missing world payload');
    const g = this.game;

    // 1. World & Entities
    g.world.loadFromData(data.world);
    g.resetEntities();

    const seedInput = document.getElementById('seed-input');
    if (seedInput) seedInput.value = g.world.seedString;

    // 2. State & Inventory
    if (Array.isArray(data.inventory)) {
      g.gameState.inventory = data.inventory.slice(0, 36).map(migrateInventoryItem);
      while (g.gameState.inventory.length < 36) g.gameState.inventory.push(null);
    }
    g.gameState.offhand = migrateInventoryItem(data?.offhand ?? null);
    
    if (Array.isArray(data.craftingGrid)) {
      g.gameState.craftingGrid = data.craftingGrid.slice(0, 9).map(migrateInventoryItem);
      while (g.gameState.craftingGrid.length < 9) g.gameState.craftingGrid.push(null);
    }

    // 3. Player Stats & Identity
    if (data.player) {
      if (data.player.mode) g.gameState.setMode(data.player.mode);
      if (Number.isFinite(data.player.hp)) g.gameState.hp = data.player.hp;
      if (Number.isFinite(data.player.hunger)) g.gameState.hunger = data.player.hunger;
      
      if (data.player.look) {
        g.viewYaw = Number(data.player.look.yaw) || 0;
        g.viewPitch = Number(data.player.look.pitch) || 0;
      }
      if (typeof data.player.cameraMode === 'string') {
        const idx = g.cameraModes.indexOf(data.player.cameraMode);
        if (idx >= 0) g.cameraModeIndex = idx;
      }
    }

    if (data.stats) {
      if (Number.isFinite(data.stats.level)) g.stats.level = data.stats.level;
      if (Number.isFinite(data.stats.xp)) g.stats.xp = data.stats.xp;
      if (Number.isFinite(data.stats.xpToNextLevel)) g.stats.xpToNextLevel = data.stats.xpToNextLevel;
      if (data.stats.attributes) {
        g.stats.attributes = { ...g.stats.attributes, ...data.stats.attributes };
      }
    }

    // 4. Physics & Positioning
    const px = data.player?.position?.x ?? 0;
    const py = data.player?.position?.y ?? 70;
    const pz = data.player?.position?.z ?? 0;
    
    if (g.physics.isReady) {
      const safe = g.physics.resolveSafeSpawn(px, py, pz, 32, {
        preferGround: true,
      });
      g.physics.playerBody.setTranslation(safe, true);
      g.physics.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      g.physics.setMode(g.gameState.mode);
      g.physics.lastSafePosition.copy(g.physics.position);
      g.lastKnownPosition.set(safe.x, safe.y, safe.z);
      g.updateCameraRotation?.();
    }

    // 5. Finalize App State
    g.hasStarted = true;
    g.isPaused = false;
    g.showTitle(false);
    g.showPause(false);
    g.ui.showHUD(true);
    g.touchControls ? g.touchControls.show(true) : g.input.setPointerLock();

    // Trigger UI refreshes
    window.dispatchEvent(new CustomEvent('inventory-changed'));
    window.dispatchEvent(new CustomEvent('hp-changed', { detail: g.gameState.hp }));
    window.dispatchEvent(new CustomEvent('hunger-changed', { detail: g.gameState.hunger }));
  }

  saveToSlot(slotId) {
    const data = this.getSnapshot();
    const packed = this.encode(data);
    localStorage.setItem(this.getSlotKey(slotId), JSON.stringify(packed));
    return true;
  }

  loadFromSlot(slotId) {
    const raw = localStorage.getItem(this.getSlotKey(slotId));
    if (!raw) return false;

    const data = this.decode(raw);
    this.applySnapshot(data);
    return true;
  }

  exportToFile(filename = 'ArloCraft_world.json') {
    const data = this.getSnapshot();
    const payload = JSON.stringify(this.encode(data));
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  async importFromFile(file) {
    const text = await file.text();
    const data = this.decode(text);
    this.applySnapshot(data);
    return true;
  }
}
