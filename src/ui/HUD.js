import { HUDCore } from './HUDCore.js';
import { InventoryUI } from './InventoryUI.js';
import { CraftingController } from './CraftingController.js';
import { CollectionsUI } from './CollectionsUI.js';

export class HUD {
  constructor(gameState, game = null) {
    this.gameState = gameState;
    this.game = game;

    // --- Modular Components ---
    this.core = new HUDCore(gameState, game);
    this.crafting = new CraftingController(game?.world, gameState);
    this.collections = new CollectionsUI(gameState);

    this.inventory = new InventoryUI(gameState, {
      onInventoryChanged: () => {
        window.dispatchEvent(new CustomEvent('inventory-changed'));
      },
      onSlotChanged: (slot) => {
        // Any specific logic when slot changes besides selection
      },
      onCraftRequest: () => {
        this.crafting.executeCraft();
      },
      getCraftingResult: () => this.crafting.getCraftingResult(),
      getCraftingRecipeName: () => this.crafting.getRecipeName(),
    });
  }

  init() {
    console.log('[ArloCraft] HUD modular initialization starting...');

    try {
      // 1. Core systems (bars, world info)
      if (this.core) this.core.init();
    } catch (e) {
      console.error('[HUD] Core init failed:', e);
    }

    try {
      // 2. Inventory / Hotbar
      if (this.inventory) this.inventory.init();
    } catch (e) {
      console.error('[HUD] Inventory init failed:', e);
    }

    try {
      // 3. Collections (tabs, blocklog)
      if (this.collections) this.collections.init();
    } catch (e) {
      console.error('[HUD] Collections init failed:', e);
    }

    try {
      // 4. Crafting (discovery logic)
      if (this.crafting) this.crafting.init();
    } catch (e) {
      console.error('[HUD] Crafting init failed:', e);
    }

    // 5. Global Discovery Notifications (Bridge)
    window.addEventListener('discovery-block', (e) => {
      this.game?.notifications?.show('NEW DISCOVERY', e.detail.id, 'block');
    });
    window.addEventListener('discovery-recipe', (e) => {
      this.game?.notifications?.show('RECIPE UNLOCKED', e.detail.id, 'recipe');
    });
    window.addEventListener('achievement-unlocked', (e) => {
      this.game?.notifications?.show(
        'ACHIEVEMENT UNLOCKED',
        e.detail.id,
        'medal'
      );
    });

    console.log('[ArloCraft] HUD modular initialization complete.');
  }

  // --- Bridge Methods for Game.js / SurvivalSystem.js ---

  updateCoordinates(position, yaw = 0, world = null) {
    this.core.updateCoordinates(position, yaw, world);
  }

  setEmotion(mood, reset = 0) {
    this.core.setFace(mood, reset);
  }

  setFace(mood, reset = 0) {
    this.core.setFace(mood, reset);
  }

  generateHotbar() {
    this.inventory.generateHotbar();
  }

  updateInventoryUI() {
    this.inventory.updateInventoryUI();
  }

  renderSelectedItem() {
    this.inventory.renderSelectedItem();
  }

  updateHP(v) {
    this.core.updateHP(v);
  }
  updateFood(v) {
    this.core.updateFood(v);
  }
  updateMode(v) {
    this.core.updateMode(v);
  }
  updateXPBar(v, m) {
    this.core.updateXPBar(v, m);
  }

  showActionPrompt(detail) {
    this.core.showActionPrompt(detail);
  }
  flashPrompt(text, color) {
    this.core.flashPrompt(text, color);
  }
}
