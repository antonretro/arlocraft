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
        
        this.initStartingInventory();
    }

    initStartingInventory() {
        this.inventory[0] = { id: 'stone', count: 64, kind: 'block' };
        this.inventory[1] = { id: 'grass', count: 64, kind: 'block' };
        this.inventory[2] = { id: 'wood', count: 48, kind: 'block' };
        this.inventory[3] = { id: 'pick_wood', count: 1, kind: 'tool' };
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
            window.dispatchEvent(new CustomEvent('inventory-changed'));
            return true;
        }

        const emptyIdx = this.inventory.findIndex((slot) => slot === null);
        if (emptyIdx >= 0) {
            this.inventory[emptyIdx] = { id: itemId, count, kind };
            window.dispatchEvent(new CustomEvent('inventory-changed'));
            return true;
        }

        return false;
    }

    addBlockToInventory(blockId, count = 1) {
        return this.addItemToInventory(blockId, count, 'block');
    }
}
