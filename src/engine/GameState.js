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
        
        // UI State
        this.isInventoryOpen = false;
        this.isPaused = false;
        
        // Crafting State
        this.craftingGrid = new Array(9).fill(null); // 3x3
        this.craftingResult = null;
        
        // Discovery & Progression
        this.discoveredBlocks = new Set();
        this.discoveredRecipes = new Set();
        this.unlockedAchievements = new Set();
        this.stats = {
            distanceTravelled: 0,
            blocksMined: new Map(), // id -> count
            blocksPlaced: new Map(), // id -> count
            blocksCrafted: new Map(), // id -> count
            enemiesDefeated: 0,
            daysSurvived: 0,
            lowestY: 64,
            discoveredBlocksCount: 0
        };
        
        this.initStartingInventory();
    }

    initStartingInventory() {
        this.inventory[0] = { id: 'sword_wood', count: 1, kind: 'tool' };
        this.inventory[1] = { id: 'pick_wood', count: 1, kind: 'tool' };
        this.inventory[2] = { id: 'axe_wood', count: 1, kind: 'tool' };
        this.inventory[3] = { id: 'oak_log', count: 16, kind: 'block' }; // Reduced from 64 for early challenge
        this.inventory[4] = { id: 'grass_block', count: 16, kind: 'block' };
        
        // Initial discoveries
        this.discoverBlock('oak_log');
        this.discoverBlock('grass_block');
    }

    // --- Discovery & Stats ---

    discoverBlock(id) {
        if (!id || this.discoveredBlocks.has(id)) return;
        this.discoveredBlocks.add(id);
        this.stats.discoveredBlocksCount = this.discoveredBlocks.size;
        window.dispatchEvent(new CustomEvent('discovery-block', { detail: { id } }));
        this.checkRecipeDiscovery();
    }

    discoverRecipe(id) {
        if (!id || this.discoveredRecipes.has(id)) return;
        this.discoveredRecipes.add(id);
        window.dispatchEvent(new CustomEvent('discovery-recipe', { detail: { id } }));
    }

    unlockAchievement(id) {
        if (!id || this.unlockedAchievements.has(id)) return;
        this.unlockedAchievements.add(id);
        window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: { id } }));
    }

    updateStat(key, value, mode = 'set') {
        if (mode === 'add') this.stats[key] = (this.stats[key] || 0) + value;
        else if (mode === 'max') this.stats[key] = Math.max(this.stats[key] || 0, value);
        else if (mode === 'min') this.stats[key] = Math.min(this.stats[key] || 0, value);
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
            discoveredBlocks: Array.from(this.discoveredBlocks),
            discoveredRecipes: Array.from(this.discoveredRecipes),
            unlockedAchievements: Array.from(this.unlockedAchievements),
            stats: {
                ...this.stats,
                blocksMined: Array.from(this.stats.blocksMined.entries()),
                blocksPlaced: Array.from(this.stats.blocksPlaced.entries()),
                blocksCrafted: Array.from(this.stats.blocksCrafted.entries())
            }
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
        
        if (data.discoveredBlocks) this.discoveredBlocks = new Set(data.discoveredBlocks);
        if (data.discoveredRecipes) this.discoveredRecipes = new Set(data.discoveredRecipes);
        if (data.unlockedAchievements) this.unlockedAchievements = new Set(data.unlockedAchievements);
        
        if (data.stats) {
            this.stats = { ...this.stats, ...data.stats };
            this.stats.blocksMined = new Map(data.stats.blocksMined || []);
            this.stats.blocksPlaced = new Map(data.stats.blocksPlaced || []);
            this.stats.blocksCrafted = new Map(data.stats.blocksCrafted || []);
            this.stats.discoveredBlocksCount = this.discoveredBlocks.size;
        }

        window.dispatchEvent(new CustomEvent('mode-changed', { detail: this.mode }));
        window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.hp }));
        window.dispatchEvent(new CustomEvent('hunger-changed', { detail: this.hunger }));
        window.dispatchEvent(new CustomEvent('inventory-changed'));
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'CREATIVE') {
            this.hp = this.maxHp;
            this.hunger = 20;
        }
        window.dispatchEvent(new CustomEvent('mode-changed', { detail: mode }));
        window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.hp }));
        window.dispatchEvent(new CustomEvent('hunger-changed', { detail: this.hunger }));
    }

    toggleInventory() {
        this.isInventoryOpen = !this.isInventoryOpen;
        window.dispatchEvent(new CustomEvent('inventory-toggle', { detail: this.isInventoryOpen }));
    }

    setPaused(value) {
        const next = Boolean(value);
        if (this.isPaused === next) return;
        this.isPaused = next;
        window.dispatchEvent(new CustomEvent('pause-changed', { detail: this.isPaused }));
    }

    takeDamage(amount) {
        if (this.mode === 'CREATIVE') return;
        this.hp = Math.max(0, this.hp - amount);
        window.dispatchEvent(new CustomEvent('player-damaged', { detail: amount }));
        window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.hp }));
        if (this.hp <= 0) this.respawn();
    }

    heal(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
        window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.hp }));
    }

    modifyHunger(amount) {
        this.hunger = Math.max(0, Math.min(20, this.hunger + amount));
        window.dispatchEvent(new CustomEvent('hunger-changed', { detail: this.hunger }));
    }

    respawn() {
        this.hp = this.maxHp;
        this.hunger = 20;
        window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.hp }));
        window.dispatchEvent(new CustomEvent('hunger-changed', { detail: this.hunger }));
        window.dispatchEvent(new CustomEvent('player-respawn'));
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
        window.dispatchEvent(new CustomEvent('offhand-changed', { detail: this.offhand }));
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

    addItemToInventory(itemId, count = 1, kind = 'block') {
        if (!itemId || count <= 0) return false;

        for (let i = 0; i < this.inventory.length; i++) {
            const slot = this.inventory[i];
            if (!slot) continue;
            if (slot.id !== itemId || slot.kind !== kind) continue;
            slot.count += count;
            this.discoverBlock(itemId);
            window.dispatchEvent(new CustomEvent('inventory-changed'));
            return true;
        }

        const emptyIdx = this.inventory.findIndex((slot) => slot === null);
        if (emptyIdx >= 0) {
            this.inventory[emptyIdx] = { id: itemId, count, kind };
            this.discoverBlock(itemId);
            window.dispatchEvent(new CustomEvent('inventory-changed'));
            return true;
        }

        return false;
    }

    addBlockToInventory(blockId, count = 1) {
        return this.addItemToInventory(blockId, count, 'block');
    }
}
