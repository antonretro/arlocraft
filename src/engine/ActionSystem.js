import * as THREE from 'three';

/**
 * ActionSystem
 * Controls high-level gameplay interactions: clicking, mining, placement, combat, 
 * and background tasks like smelting.
 */
export class ActionSystem {
  constructor(game) {
    this.game = game;
    this.gameState = game.gameState;
    this.activePrompt = null;
    
    // Internal tracking for selection
    this._lastTargetId = null;
    this._camHead = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this.smeltTimer = 0;
  }

  update(delta) {
    // 1. Smelting Logic
    this.smeltTimer += delta;
    if (this.smeltTimer > 3.0) {
      this.processSmelting();
      this.smeltTimer = 0;
    }

    // 2. Continuous actions (like mining)
    if (this.game.hasStarted && !this.game.isPaused && !this.gameState.isInventoryOpen) {
        if (this.game.input.mouseButtons.left) {
          this.handlePrimaryAction(delta);
        } else {
          this.game.cancelMining();
        }
        
        if (this.game.input.mouseButtons.rightJustPressed) {
          this.handleSecondaryAction();
        }

        this.updateSelection();
    }
  }

  handlePrimaryAction(delta) {
    if (this.game.hand) this.game.hand.swing();
    const selectedItem = this.gameState.getSelectedItem();

    // Bucket Pickup Logic
    if (selectedItem?.id === 'bucket') {
      if (this.game.input.consumeLeftClick()) {
        this.game.world.handleBucketAction(this.game.camera.instance, 'pickup');
      }
      return;
    }

    const attackProfile = this.game.entities.getAttackProfile(selectedItem);
    const hasEnemyTarget = this.game.entities.hasHostileTarget(
      this.game.camera.instance,
      attackProfile.range
    );
    if (hasEnemyTarget) {
      this.game.entities.attackFromCamera(this.game.camera.instance, selectedItem);
      this.game.world.resetMiningProgress();
      return;
    }

    this.game.world.mineBlockProgress(
      this.game.camera.instance,
      delta,
      selectedItem,
      this.gameState.mode
    );
  }

  handleSecondaryAction() {
    const selected = this.gameState.getSelectedItem();
    if (!selected) return;

    // Bucket Place/Use Logic
    if (
      selected.id === 'bucket' ||
      selected.id === 'water_bucket' ||
      selected.id === 'lava_bucket'
    ) {
      this.game.world.handleBucketAction(
        this.game.camera.instance,
        'place',
        this.gameState.selectedSlot
      );
      return;
    }

    if (this.game.survival.isFoodItem(selected.id)) {
      this.game.survival.tryEatFood(this.gameState.selectedSlot);
      return;
    }

    // THROWABLES
    const throwables = ['snowball', 'egg', 'ender_pearl'];
    if (throwables.includes(selected.id)) {
      this.throwProjectile(selected);
      return;
    }

    // Entity Interaction (e.g. Milking)
    const entityInt = this.game.entities.interactEntityFromCamera(this.game.camera.instance);
    if (entityInt && entityInt.action) return;

    if (this.game.world.handleBucketAction(this.game.camera.instance, 'use', this.gameState.selectedSlot)) return;
    if (this.game.world.interactBlock(this.game.camera.instance)) return;

    const selectedSlot = this.gameState.selectedSlot;
    const placed = this.game.world.placeBlock(this.game.camera.instance, selectedSlot);
    if (!placed) return;
    if (this.gameState.mode === 'CREATIVE') return;

    selected.count--;
    if (selected.count <= 0) {
      this.gameState.inventory[selectedSlot] = null;
    }
    window.dispatchEvent(new CustomEvent('inventory-changed'));
  }

  throwProjectile(selected) {
    const pos = this.game.camera.instance.position.clone();
    const dir = new THREE.Vector3();
    this.game.camera.instance.getWorldDirection(dir);

    this.game.entities.spawnProjectile(selected.id, null, pos, dir);
    this.game.audio?.play('throw');

    if (this.gameState.mode !== 'CREATIVE') {
      selected.count--;
      if (selected.count <= 0) {
        this.gameState.inventory[this.gameState.selectedSlot] = null;
      }
      window.dispatchEvent(new CustomEvent('inventory-changed'));
    }
  }

  pickBlock() {
    if (!this.game.hasStarted || this.game.isPaused) return;
    const hit = this.game.world.raycastBlocks?.(
      this.game.camera.instance,
      6,
      false,
      this._camHead,
      this._camLook
    );
    if (!hit?.id) return;

    const id = this.game.world.getBlockPickId(hit.id);
    const blockName = this.game.world.getBlockData(id)?.name ?? id;
    const inv = this.gameState.inventory;
    
    // First check hotbar slots 0-8
    for (let i = 0; i < 9; i++) {
      if (inv[i]?.id === id) {
        this.gameState.setSlot(i);
        this.game.hud?.flashPrompt?.(`Selected: ${blockName}`, '#aaddff');
        return;
      }
    }
    
    // Creative: add block to selected slot
    if (this.gameState.mode === 'CREATIVE') {
      const slot = this.gameState.selectedSlot;
      inv[slot] = { id, count: 64, kind: 'block' };
      window.dispatchEvent(new CustomEvent('inventory-changed'));
      this.game.hud?.flashPrompt?.(`Picked: ${blockName}`, '#aaddff');
    }
  }

  updateSelection() {
    const hit = this.game.world.raycastBlocks?.(
      this.game.camera.instance,
      6,
      false,
      this._camHead,
      this._camLook
    );

    if (hit) {
      this.game.world.visuals.updateHover(hit.cell.x, hit.cell.y, hit.cell.z, true);
      
      const targetId = hit.id;
      if (this._lastTargetId !== targetId) {
        this._lastTargetId = targetId;
        const block = this.game.world.blockRegistry.blocks.get(targetId);
        const name = block?.name || targetId;
        window.dispatchEvent(new CustomEvent('target-block-changed', { 
            detail: { id: String(targetId), name: String(name) } 
        }));
      }

      // Placement Ghost
      const item = this.gameState.inventory[this.gameState.selectedSlot];
      if (item && item.kind === 'block') {
        const px = hit.previous?.x ?? hit.x;
        const py = hit.previous?.y ?? hit.y;
        const pz = hit.previous?.z ?? hit.z;
        this.game.world.visuals.updatePlacement(px, py, pz, true);
      } else {
        this.game.world.visuals.updatePlacement(0, 0, 0, false);
      }
    } else {
      if (this._lastTargetId !== null) {
        this._lastTargetId = null;
        window.dispatchEvent(new CustomEvent('target-block-changed', { detail: null }));
      }
      this.game.world.visuals.updateHover(0, 0, 0, false);
      this.game.world.visuals.updatePlacement(0, 0, 0, false);
    }
  }

  processSmelting() {
    if (!this.gameState?.inventory) return;
    const inv = this.gameState.inventory;
    const coalIdx = inv.findIndex((item) => item?.id === 'coal');
    if (coalIdx === -1) return;

    const recipes = { iron_ore: 'iron_ingot', gold_ore: 'gold_ingot', mythril_ore: 'mythril_ingot' };

    for (let i = 0; i < inv.length; i++) {
      const item = inv[i];
      if (item && recipes[item.id]) {
        const result = recipes[item.id];
        inv[i].count--;
        if (inv[i].count <= 0) inv[i] = null;

        inv[coalIdx].count--;
        if (inv[coalIdx].count <= 0) inv[coalIdx] = null;

        this.gameState.addBlockToInventory(result, 1);
        break;
      }
    }
  }

  // --- Prompt Legacy ---
  triggerPrompt(type, duration = 1000) {
    const prompt = { type, start: Date.now(), duration, perfectWindow: [duration * 0.7, duration * 0.9] };
    this.activePrompt = prompt;
    window.dispatchEvent(new CustomEvent('action-prompt', { detail: this.activePrompt }));
    setTimeout(() => { if (this.activePrompt === prompt) this.activePrompt = null; }, duration);
  }

  checkInput() {
    if (!this.activePrompt) return false;
    const elapsed = Date.now() - this.activePrompt.start;
    const [low, high] = this.activePrompt.perfectWindow;
    if (elapsed >= low && elapsed <= high) { this.success(); return true; } 
    else { this.fail(); return false; }
  }

  success() { window.dispatchEvent(new CustomEvent('action-success')); this.activePrompt = null; }
  fail() { window.dispatchEvent(new CustomEvent('action-fail')); this.activePrompt = null; }
}
