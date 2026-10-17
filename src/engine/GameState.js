import { ACHIEVEMENTS } from '../data/achievements.js';
import {
  resolveItemKind,
  getMaxStackSize,
  canStackTogether,
  getArmorDefinition,
} from '../data/itemKinds.js';

export class GameState {
  constructor() {
    this.mode = 'SURVIVAL';
    this.hp = 20;
    this.maxHp = 20;
    this.hunger = 20;

    // 0-8: Hotbar | 9-35: Main Inventory
    this.inventory = new Array(36).fill(null);
    this.selectedSlot = 0;
    this.offhand = null;
    this.armor = new Array(4).fill(null); // 0: Helmet, 1: Chest, 2: Legs, 3: Boots
    this.morphId = null; // Current mob morph ID (e.g. 'cow')

    // UI State
    this.isInventoryOpen = false;
    this.isPaused = false;
    this.isDead = false;
    this.spawnPoint = null; // { x, y, z } set by sleeping in a bed

    // Crafting State
    this.craftingGrid = new Array(9).fill(null); // 3x3
    this.craftingResult = null;

    // Discovery & Progression
    this.discoveredBlocks = new Set();
    this.discoveredRecipes = new Set();
    this.unlockedAchievements = new Set();
    this.activeEffects = []; // { id, name, duration, level }
    this.stats = null; // Injected by Game

    this.achievementCheckTimer = setInterval(
      () => this.checkAchievements(),
      2000
    );
  }

  getToolDurability(id) {
    if (id.includes('wood')) return 120;
    if (id.includes('stone') || id.includes('cobble')) return 260;
    if (id.includes('iron')) return 500;
    if (id.includes('gold')) return 64;
    if (id.includes('diamond')) return 3000;
    if (id.includes('virus')) return 1500; // Special virus-tier
    return 100;
  }

  initStartingInventory() {
    this.inventory[0] = {
      id: 'sword_wood',
      count: 1,
      kind: 'tool',
      durability: this.getToolDurability('sword_wood'),
      maxDurability: this.getToolDurability('sword_wood'),
      enchantments: [],
    };
    this.inventory[1] = {
      id: 'pick_wood',
      count: 1,
      kind: 'tool',
      durability: this.getToolDurability('pick_wood'),
      maxDurability: this.getToolDurability('pick_wood'),
      enchantments: [],
    };
    this.inventory[2] = {
      id: 'axe_wood',
      count: 1,
      kind: 'tool',
      durability: this.getToolDurability('axe_wood'),
      maxDurability: this.getToolDurability('axe_wood'),
      enchantments: [],
    };
    this.inventory[3] = { id: 'oak_log', count: 16, kind: 'block' };
    this.inventory[4] = { id: 'grass_block', count: 16, kind: 'block' };

    // Initial discoveries
    this.discoverBlock('oak_log');
    this.discoverBlock('grass_block');
  }

  // --- Discovery & Stats ---

  discoverBlock(id) {
    if (!id || this.discoveredBlocks.has(id)) return;
    this.discoveredBlocks.add(id);
    if (this.stats) {
      this.stats.discoveredBlocksCount = this.discoveredBlocks.size;
    }
    window.dispatchEvent(
      new CustomEvent('discovery-block', { detail: { id } })
    );
    this.checkRecipeDiscovery();
  }

  discoverRecipe(id) {
    if (!id || this.discoveredRecipes.has(id)) return;
    this.discoveredRecipes.add(id);
    window.dispatchEvent(
      new CustomEvent('discovery-recipe', { detail: { id } })
    );
  }

  unlockAchievement(id) {
    if (!id || this.unlockedAchievements.has(id)) return;
    this.unlockedAchievements.add(id);
    const achievement = ACHIEVEMENTS.find((a) => a.id === id);
    window.dispatchEvent(
      new CustomEvent('achievement-unlocked', {
        detail: {
          id,
          name: achievement?.name || id,
          icon: achievement?.icon || '🏆',
        },
      })
    );
  }

  checkAchievements() {
    if (this.mode === 'CREATIVE') return;

    for (const ach of ACHIEVEMENTS) {
      if (this.unlockedAchievements.has(ach.id)) continue;
      if (!this.stats) continue;
      try {
        if (ach.check(this.stats)) {
          this.unlockAchievement(ach.id);
        }
      } catch (e) {
        console.warn('[Achievements] Check failed for', ach.id, e);
      }
    }
  }

  updateStat(key, value, mode = 'set') {
    if (mode === 'add') this.stats[key] = (this.stats[key] || 0) + value;
    else if (mode === 'max')
      this.stats[key] = Math.max(this.stats[key] || 0, value);
    else if (mode === 'min')
      this.stats[key] = Math.min(this.stats[key] || 0, value);
    else this.stats[key] = value;
  }

  recordBlockMine(id) {
    const count = (this.stats.blocksMined.get(id) || 0) + 1;
    this.stats.blocksMined.set(id, count);
  }

  recordBlockPlace(id) {
    const count = (this.stats.blocksPlaced.get(id) || 0) + 1;
    this.stats.blocksPlaced.set(id, count);
  }

  recordCraft(id, count = 1) {
    const total = (this.stats.blocksCrafted.get(id) || 0) + count;
    this.stats.blocksCrafted.set(id, total);
  }

  async checkRecipeDiscovery() {
    // This will be called whenever the player collects a new item.
    // It should match available items against RECIPE_BOOK (imported dynamically or via HUD).
    // For now, we'll dispatch an event so HUD/Game can handle the mapping.
    window.dispatchEvent(new CustomEvent('check-recipes'));
  }

  // --- Persistence ---

  serialize() {
    return {
      mode: this.mode,
      hp: this.hp,
      hunger: this.hunger,
      inventory: this.inventory,
      selectedSlot: this.selectedSlot,
      offhand: this.offhand,
      armor: this.armor,
      spawnPoint: this.spawnPoint,
      discoveredBlocks: Array.from(this.discoveredBlocks),
      discoveredRecipes: Array.from(this.discoveredRecipes),
      unlockedAchievements: Array.from(this.unlockedAchievements),
      stats: {
        ...this.stats,
        blocksMined: Array.from(this.stats.blocksMined.entries()),
        blocksPlaced: Array.from(this.stats.blocksPlaced.entries()),
        blocksCrafted: Array.from(this.stats.blocksCrafted.entries()),
      },
    };
  }

  deserialize(data) {
    if (!data) return;
    this.mode = data.mode || 'SURVIVAL';
    this.hp = data.hp ?? 20;
    this.hunger = data.hunger ?? 20;
    this.inventory = data.inventory || new Array(36).fill(null);
    this.selectedSlot = data.selectedSlot ?? 0;
    this.offhand = data.offhand ?? null;
    this.armor = data.armor || new Array(4).fill(null);
    this.spawnPoint = data.spawnPoint ?? null;

    if (data.discoveredBlocks)
      this.discoveredBlocks = new Set(data.discoveredBlocks);
    if (data.discoveredRecipes)
      this.discoveredRecipes = new Set(data.discoveredRecipes);
    if (data.unlockedAchievements)
      this.unlockedAchievements = new Set(data.unlockedAchievements);

    if (data.stats) {
      this.stats = { ...this.stats, ...data.stats };
      this.stats.blocksMined = new Map(data.stats.blocksMined || []);
      this.stats.blocksPlaced = new Map(data.stats.blocksPlaced || []);
      this.stats.blocksCrafted = new Map(data.stats.blocksCrafted || []);
      this.stats.discoveredBlocksCount = this.discoveredBlocks.size;
    }

    window.dispatchEvent(
      new CustomEvent('mode-changed', { detail: this.mode })
    );
    window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.hp }));
    window.dispatchEvent(
      new CustomEvent('hunger-changed', { detail: this.hunger })
    );
    window.dispatchEvent(new CustomEvent('inventory-changed'));
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'CREATIVE') {
      this.hp = this.maxHp;
      this.hunger = 20;
    }
    window.dispatchEvent(new CustomEvent('mode-changed', { detail: mode }));
    window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.hp }));
    window.dispatchEvent(
      new CustomEvent('hunger-changed', { detail: this.hunger })
    );
  }

  toggleInventory() {
    if (this.isDead && !this.isInventoryOpen) return;
    this.isInventoryOpen = !this.isInventoryOpen;
    window.dispatchEvent(
      new CustomEvent('inventory-toggle', { detail: this.isInventoryOpen })
    );
  }

  /**
   * Opens the inventory screen for a block UI: 'WORKSHOP' (crafting table),
   * 'FURNACE' or 'CHEST'. `blockKey` identifies the furnace/chest.
   */
  openContainer(mode, blockKey = null) {
    if (this.isDead) return;
    this.isInventoryOpen = true;
    window.dispatchEvent(
      new CustomEvent('inventory-toggle', {
        detail: { detail: true, mode, blockKey },
      })
    );
  }

  setPaused(value) {
    const next = Boolean(value);
    if (this.isPaused === next) return;
    this.isPaused = next;
    window.dispatchEvent(
      new CustomEvent('pause-changed', { detail: this.isPaused })
    );
  }

  /** Total armor points worn (Minecraft: each point blocks 4% damage). */
  getArmorPoints() {
    return this.armor.reduce(
      (total, piece) =>
        total + (piece ? (getArmorDefinition(piece.id)?.protection ?? 0) : 0),
      0
    );
  }

  /**
   * Applies damage after armor. `options.bypassArmor` is used for fall
   * damage and starvation, which armor does not block in Minecraft.
   */
  takeDamage(amount, options = {}) {
    if (this.mode === 'CREATIVE' || this.isDead) return;
    let damage = Math.max(0, Number(amount) || 0);
    if (!options.bypassArmor) {
      const reduction = Math.min(20, this.getArmorPoints()) * 0.04;
      damage *= 1 - reduction;
      if (damage > 0) this.damageArmor(Math.max(1, Math.floor(amount / 4)));
    }
    if (damage <= 0) return;
    // Keep half-hearts: round to 0.5 so light hits on armor still count.
    damage = Math.max(0.5, Math.round(damage * 2) / 2);
    this.hp = Math.max(0, this.hp - damage);
    window.dispatchEvent(new CustomEvent('player-damaged', { detail: damage }));
    window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.hp }));
    if (this.hp <= 0) this.die(options.cause);
  }

  damageArmor(amount) {
    let changed = false;
    for (let i = 0; i < this.armor.length; i++) {
      const piece = this.armor[i];
      if (!piece) continue;
      if (piece.durability === undefined) {
        piece.maxDurability = this.getToolDurability(piece.id);
        piece.durability = piece.maxDurability;
      }
      piece.durability -= amount;
      if (piece.durability <= 0) {
        this.armor[i] = null;
        window.dispatchEvent(new CustomEvent('item-broken', { detail: piece }));
      }
      changed = true;
    }
    if (changed) window.dispatchEvent(new CustomEvent('inventory-changed'));
  }

  die(cause = 'damage') {
    if (this.isDead) return;
    this.isDead = true;
    this.hp = 0;
    if (this.isInventoryOpen) this.toggleInventory();
    window.dispatchEvent(new CustomEvent('player-died', { detail: { cause } }));
  }

  heal(amount) {
    if (this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.hp }));
  }

  modifyHunger(amount) {
    this.hunger = Math.max(0, Math.min(20, this.hunger + amount));
    window.dispatchEvent(
      new CustomEvent('hunger-changed', { detail: this.hunger })
    );
  }

  respawn() {
    this.isDead = false;
    this.hp = this.maxHp;
    this.hunger = 20;
    window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.hp }));
    window.dispatchEvent(
      new CustomEvent('hunger-changed', { detail: this.hunger })
    );
    window.dispatchEvent(
      new CustomEvent('player-respawn', {
        detail: { spawnPoint: this.spawnPoint },
      })
    );
  }

  setSpawnPoint(x, y, z) {
    this.spawnPoint = { x, y, z };
  }

  setSlot(idx) {
    const slot = Math.max(0, Math.min(8, idx));
    if (slot === this.selectedSlot) return;
    this.selectedSlot = slot;
    window.dispatchEvent(new CustomEvent('slot-changed', { detail: slot }));
  }

  getSelectedItem() {
    return this.inventory[this.selectedSlot] ?? null;
  }

  getOffhandItem() {
    return this.offhand;
  }

  equipOffhandFromSlot(slotIndex = this.selectedSlot) {
    const idx = Math.max(0, Math.min(this.inventory.length - 1, slotIndex));
    const next = this.inventory[idx];
    this.inventory[idx] = this.offhand;
    this.offhand = next ?? null;
    window.dispatchEvent(
      new CustomEvent('offhand-changed', { detail: this.offhand })
    );
    window.dispatchEvent(new CustomEvent('inventory-changed'));
  }

  getInventoryItem(idx) {
    return this.inventory[idx] ?? null;
  }

  getItemCount(itemId) {
    return this.inventory.reduce((total, slot) => {
      if (!slot || slot.id !== itemId) return total;
      return total + (slot.count ?? 0);
    }, 0);
  }

  createItemStack(itemId, count = 1, kind = 'block') {
    const item = { id: itemId, count, kind: resolveItemKind(itemId, kind) };
    if (item.kind === 'tool' || item.kind === 'armor') {
      item.durability = this.getToolDurability(itemId);
      item.maxDurability = item.durability;
      if (item.kind === 'tool') item.enchantments = [];
    }
    return item;
  }

  addItemToInventory(itemId, count = 1, kind = 'block') {
    if (!itemId || count <= 0) return false;
    return this.addItemStack(this.createItemStack(itemId, count, kind));
  }

  /**
   * Merges a stack into the inventory (hotbar first), respecting stack
   * limits and keeping per-item state such as tool durability. Mutates
   * `item.count` to whatever did not fit; returns true when all of it fit.
   */
  addItemStack(item, slotOrder = null) {
    if (!item?.id || !(item.count > 0)) return false;
    item.kind = resolveItemKind(item.id, item.kind);
    const order = slotOrder ?? this.inventory.map((_, i) => i);
    const maxStack = getMaxStackSize(item);
    const startCount = item.count;

    if (maxStack > 1) {
      for (const i of order) {
        const slot = this.inventory[i];
        if (!slot || !canStackTogether(slot, item)) continue;
        const space = maxStack - (slot.count ?? 0);
        if (space <= 0) continue;
        const moved = Math.min(space, item.count);
        slot.count += moved;
        item.count -= moved;
        if (item.count <= 0) break;
      }
    }

    for (const i of order) {
      if (item.count <= 0) break;
      if (this.inventory[i]) continue;
      const moved = Math.min(maxStack, item.count);
      this.inventory[i] = { ...item, count: moved };
      item.count -= moved;
    }

    if (item.count !== startCount) {
      this.discoverBlock(item.id);
      window.dispatchEvent(new CustomEvent('inventory-changed'));
    }
    return item.count <= 0;
  }

  /** True when the whole stack fits into the inventory. */
  canAccept(item) {
    if (!item?.id) return false;
    const maxStack = getMaxStackSize(item);
    let space = 0;
    for (const slot of this.inventory) {
      if (!slot) space += maxStack;
      else if (maxStack > 1 && canStackTogether(slot, item))
        space += Math.max(0, maxStack - (slot.count ?? 0));
      if (space >= item.count) return true;
    }
    return space >= item.count;
  }

  addBlockToInventory(blockId, count = 1) {
    return this.addItemToInventory(blockId, count, 'block');
  }

  grantLootRoll(lootItems) {
    if (!Array.isArray(lootItems)) return;
    lootItems.forEach((item) => {
      this.addItemToInventory(item.id, item.count, resolveItemKind(item.id));
    });
  }

  // --- RPG Logic Helpers ---

  applyDurabilityDamage(slotIndex, amount = 1) {
    const item = this.inventory[slotIndex];
    if (item && item.kind === 'tool' && item.durability !== undefined) {
      item.durability = Math.max(0, item.durability - amount);
      if (item.durability <= 0) {
        this.inventory[slotIndex] = null;
        window.dispatchEvent(new CustomEvent('item-broken', { detail: item }));
      }
      window.dispatchEvent(new CustomEvent('inventory-changed'));
    }
  }
}
