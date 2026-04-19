import { BLOCKS } from '../data/blocks.js';
import { TOOLS } from '../data/tools.js';
import { blockIdToDisplayName, normalizeBlockVariantId } from '../data/blockIds.js';
import { iconService } from './IconService.js';

export class InventoryUI {
    constructor(gameState, options = {}) {
        this.gameState = gameState;
        this.blockById = new Map(BLOCKS.map((block) => [block.id, block]));
        this.toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));

        this.onInventoryChanged = options.onInventoryChanged ?? (() => {});
        this.onSlotChanged = options.onSlotChanged ?? (() => {});
        this.onCraftRequest = options.onCraftRequest ?? (() => {});
        this.getCraftingResult = options.getCraftingResult ?? (() => null);
        this.getCraftingRecipeName = options.getCraftingRecipeName ?? (() => 'Unknown');

        this.carryItem = null;
        this.carryOrigin = null;
        this.dragGhost = null;
        this.pointerPickupPending = false;
        this.pointerPickupMoved = false;
        this.pointerDownX = 0;
        this.pointerDownY = 0;
        this.lastPointerButton = 0;

        this.refs = {};
    }

    cacheRefs() {
        this.refs.inventoryOverlay = document.getElementById('inventory-overlay');
        this.refs.inventoryGrid = document.getElementById('inventory-grid');
        this.refs.hotbarGrid = document.getElementById('hotbar-grid');
        this.refs.craftingGrid = document.getElementById('crafting-grid');
        this.refs.craftingResult = document.getElementById('crafting-result');
        this.refs.inventoryHint = document.getElementById('inventory-hint');
        this.refs.hotbar = document.getElementById('hotbar');
        this.refs.selectedItemName = document.getElementById('selected-item-name');
        this.refs.selectedItemStats = document.getElementById('selected-item-stats');
        this.refs.closeButton = document.getElementById('btn-inventory-close');
    }

    resolveAsset(path) {
        return iconService.resolveAsset(path);
    }

    createItemElement(item) {
        return iconService.createItemElement(item);
    }

    init() {
        this.cacheRefs();
        this.createDragGhost();
        this.generateHotbar();
        this.updateHotbarSelection(this.gameState.selectedSlot);
        this.renderSelectedItem();
        this.updateInventoryUI();

        if (this.refs.closeButton) {
            this.refs.closeButton.addEventListener('click', () => this.gameState.toggleInventory());
        }

        const sortBtn = document.getElementById('btn-sort-inv');
        if (sortBtn) sortBtn.addEventListener('click', () => this.sortInventory());

        window.addEventListener('inventory-toggle', (event) => this.toggleInventoryUI(Boolean(event.detail)));
        window.addEventListener('slot-changed', (event) => {
            this.updateHotbarSelection(event.detail);
            this.renderSelectedItem();
        });
        window.addEventListener('inventory-changed', () => {
            this.generateHotbar();
            this.updateInventoryUI();
            this.renderSelectedItem();
        });
        window.addEventListener('offhand-changed', () => this.renderSelectedItem());

        document.addEventListener('pointermove', (event) => this.onGlobalPointerMove(event));
        document.addEventListener('pointerup', (event) => this.onGlobalPointerUp(event));
    }

    createDragGhost() {
        if (this.dragGhost) return;
        const ghost = document.createElement('div');
        ghost.id = 'inventory-drag-ghost';
        ghost.style.display = 'none';
        document.body.appendChild(ghost);
        this.dragGhost = ghost;
    }

    setDragGhostPosition(x, y) {
        if (!this.dragGhost) return;
        this.dragGhost.style.left = `${x + 10}px`;
        this.dragGhost.style.top = `${y + 10}px`;
    }

    updateDragGhost() {
        if (!this.dragGhost) return;
        if (!this.carryItem) {
            this.dragGhost.style.display = 'none';
            this.dragGhost.innerHTML = '';
            return;
        }
        this.dragGhost.style.display = 'flex';
        this.dragGhost.innerHTML = '';
        this.dragGhost.appendChild(this.createItemElement(this.carryItem));
    }

    toggleInventoryUI(isOpen) {
        if (!this.refs.inventoryOverlay) return;
        this.refs.inventoryOverlay.style.display = isOpen ? 'flex' : 'none';
        if (!isOpen) this.returnCarryToInventory();
        if (isOpen) this.updateInventoryUI();
    }

    updateInventoryUI() {
        const mainGrid = this.refs.inventoryGrid;
        const hotbarGrid = this.refs.hotbarGrid;
        const craftingGrid = this.refs.craftingGrid;
        const resultSlot = this.refs.craftingResult;
        const hint = this.refs.inventoryHint;
        if (!mainGrid || !hotbarGrid || !craftingGrid || !resultSlot) return;

        mainGrid.innerHTML = '';
        for (let i = 9; i < 36; i++) {
            mainGrid.appendChild(this.createSlot(i, 'inventory'));
        }

        hotbarGrid.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            hotbarGrid.appendChild(this.createSlot(i, 'inventory'));
        }

        craftingGrid.innerHTML = '';
        const inventoryCraftingIndices = [0, 1, 3, 4];
        for (const i of inventoryCraftingIndices) {
            craftingGrid.appendChild(this.createSlot(i, 'crafting'));
        }

        resultSlot.innerHTML = '';
        const craftingResult = this.getCraftingResult();
        if (craftingResult) {
            resultSlot.appendChild(this.createItemElement(craftingResult));
            resultSlot.title = this.getCraftingRecipeName();
            if (hint) hint.textContent = `Recipe: ${this.getCraftingRecipeName()}`;
        } else if (hint) {
            hint.textContent = 'Use a Crafting Table [right-click] for 3x3 recipes.';
        }

        resultSlot.onclick = () => this.onCraftRequest();
        this.updateDragGhost();
    }

    createSlot(idx, type) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.dataset.slotIdx = String(idx);
        slot.dataset.slotType = type;

        if (type === 'inventory' && idx === this.gameState.selectedSlot) {
            slot.classList.add('active');
        }

        const item = type === 'inventory'
            ? this.gameState.inventory[idx]
            : this.gameState.craftingGrid[idx];

        if (item) {
            slot.appendChild(this.createItemElement(item));
            slot.title = this.describeItem(item);
        }

        slot.addEventListener('pointerdown', (event) => this.onSlotPointerDown(idx, type, event));
        return slot;
    }

    getContainer(type) {
        return type === 'inventory' ? this.gameState.inventory : this.gameState.craftingGrid;
    }

    cloneItem(item) {
        return item ? { ...item } : null;
    }

    sameItem(a, b) {
        if (!a || !b) return false;
        return a.id === b.id && a.kind === b.kind;
    }

    onSlotPointerDown(idx, type, event) {
        if (event.button !== 0 && event.button !== 2) return;
        event.preventDefault();
        event.stopPropagation();

        this.pointerDownX = event.clientX;
        this.pointerDownY = event.clientY;
        this.lastPointerButton = event.button;
        this.pointerPickupPending = false;
        this.pointerPickupMoved = false;
        this.setDragGhostPosition(event.clientX, event.clientY);

        const target = this.getContainer(type);
        const item = target[idx];

        if (!this.carryItem) {
            if (!item) return;

            if (event.button === 2 && (item.count ?? 1) > 1) {
                const take = Math.ceil((item.count ?? 1) / 2);
                this.carryItem = this.cloneItem(item);
                this.carryItem.count = take;
                item.count -= take;
                if (item.count <= 0) target[idx] = null;
            } else {
                this.carryItem = item;
                target[idx] = null;
            }

            this.carryOrigin = { idx, type };
            this.pointerPickupPending = true;
            this.onInventoryChanged();
            this.updateDragGhost();
        }
    }

    onGlobalPointerMove(event) {
        this.setDragGhostPosition(event.clientX, event.clientY);
        if (!this.pointerPickupPending) return;
        const dx = event.clientX - this.pointerDownX;
        const dy = event.clientY - this.pointerDownY;
        if ((dx * dx) + (dy * dy) > 18) this.pointerPickupMoved = true;
    }

    onGlobalPointerUp(event) {
        if (!this.carryItem) return;
        if (this.pointerPickupPending && !this.pointerPickupMoved) {
            this.pointerPickupPending = false;
            return;
        }

        const targetSlot = document.elementFromPoint(event.clientX, event.clientY)?.closest('.slot[data-slot-idx]');
        if (!targetSlot) {
            this.pointerPickupPending = false;
            return;
        }

        const idx = Number(targetSlot.dataset.slotIdx);
        const type = targetSlot.dataset.slotType;
        if (!Number.isFinite(idx) || (type !== 'inventory' && type !== 'crafting')) return;

        const changed = this.applyCarryToSlot(idx, type, event.button === 2 ? 2 : this.lastPointerButton);
        this.pointerPickupPending = false;
        this.pointerPickupMoved = false;
        if (!changed) return;

        this.onInventoryChanged();
        this.updateDragGhost();
    }

    applyCarryToSlot(idx, type, button = 0) {
        if (!this.carryItem) return false;
        const MAX_STACK = 99;
        const target = this.getContainer(type);
        const slotItem = target[idx];
        let changed = false;

        if (button === 2) {
            if (!slotItem) {
                target[idx] = this.cloneItem(this.carryItem);
                target[idx].count = 1;
                this.carryItem.count -= 1;
                changed = true;
            } else if (this.sameItem(slotItem, this.carryItem) && (slotItem.count ?? 1) < MAX_STACK) {
                slotItem.count = (slotItem.count ?? 1) + 1;
                this.carryItem.count -= 1;
                changed = true;
            }

            if (changed && this.carryItem.count <= 0) {
                this.carryItem = null;
                this.carryOrigin = null;
            }
            return changed;
        }

        if (!slotItem) {
            target[idx] = this.carryItem;
            this.carryItem = null;
            this.carryOrigin = null;
            return true;
        }

        if (this.sameItem(slotItem, this.carryItem) && (slotItem.count ?? 1) < MAX_STACK) {
            const space = MAX_STACK - (slotItem.count ?? 1);
            const moved = Math.min(space, this.carryItem.count ?? 1);
            slotItem.count = (slotItem.count ?? 1) + moved;
            this.carryItem.count -= moved;
            changed = moved > 0;
            if (this.carryItem.count <= 0) {
                this.carryItem = null;
                this.carryOrigin = null;
            }
            return changed;
        }

        target[idx] = this.carryItem;
        this.carryItem = slotItem;
        this.carryOrigin = { idx, type };
        return true;
    }

    returnCarryToInventory() {
        if (!this.carryItem) return;

        if (this.carryOrigin) {
            const origin = this.getContainer(this.carryOrigin.type);
            if (!origin[this.carryOrigin.idx]) {
                origin[this.carryOrigin.idx] = this.carryItem;
                this.carryItem = null;
                this.carryOrigin = null;
                this.updateDragGhost();
                this.onInventoryChanged();
                return;
            }
        }

        const inv = this.gameState.inventory;
        const sameStack = inv.find((slot) => this.sameItem(slot, this.carryItem) && (slot.count ?? 1) < 99);
        if (sameStack) {
            const space = 99 - (sameStack.count ?? 1);
            const moved = Math.min(space, this.carryItem.count ?? 1);
            sameStack.count += moved;
            this.carryItem.count -= moved;
        }

        if ((this.carryItem?.count ?? 0) > 0) {
            const empty = inv.findIndex((slot) => !slot);
            if (empty >= 0) {
                inv[empty] = this.carryItem;
                this.carryItem = null;
            }
        }

        if (this.carryItem) {
            const craftingEmpty = this.gameState.craftingGrid.findIndex((slot) => !slot);
            if (craftingEmpty >= 0) {
                this.gameState.craftingGrid[craftingEmpty] = this.carryItem;
                this.carryItem = null;
            }
        }

        this.carryOrigin = null;
        this.updateDragGhost();
        this.onInventoryChanged();
    }

    getItemKind(itemId) {
        if (this.toolById.has(itemId)) return 'tool';
        return 'block';
    }

    describeItem(item) {
        if (!item) return '';
        const normalizedId = normalizeBlockVariantId(item.id);
        const block = this.blockById.get(normalizedId);
        if (block) return `${block.name} | Hardness ${block.hardness} | XP ${block.xp}`;

        const tool = this.toolById.get(normalizedId);
        if (tool) return `${tool.name} | Damage ${tool.damage} | Efficiency ${tool.efficiency}`;

        return blockIdToDisplayName(normalizedId);
    }

    renderSelectedItem() {
        const name = this.refs.selectedItemName;
        const stats = this.refs.selectedItemStats;
        if (!name || !stats) return;

        const item = this.gameState.getSelectedItem();
        if (!item) {
            name.textContent = 'EMPTY HAND';
            const offhand = this.gameState.getOffhandItem();
            const offhandText = offhand ? `Offhand ${offhand.id.toUpperCase()} x${offhand.count ?? 1}` : 'Offhand EMPTY';
            stats.textContent = `Select a hotbar slot with 1-9 or mouse wheel. | ${offhandText}`;
            return;
        }

        const normalizedId = normalizeBlockVariantId(item.id);
        const block = this.blockById.get(normalizedId);
        if (block) {
            name.textContent = `${block.name.toUpperCase()} x${item.count ?? 1}`;
            const offhand = this.gameState.getOffhandItem();
            const offhandText = offhand ? `${offhand.id.toUpperCase()} x${offhand.count ?? 1}` : 'EMPTY';
            stats.textContent = `Block | Hardness ${block.hardness} | XP ${block.xp} | Offhand ${offhandText}`;
            return;
        }

        const tool = this.toolById.get(normalizedId);
        if (tool) {
            name.textContent = `${tool.name.toUpperCase()} x${item.count ?? 1}`;
            const offhand = this.gameState.getOffhandItem();
            const offhandText = offhand ? `${offhand.id.toUpperCase()} x${offhand.count ?? 1}` : 'EMPTY';
            stats.textContent = `Tool | Type ${tool.type} | Damage ${tool.damage} | Efficiency ${tool.efficiency} | Offhand ${offhandText}`;
            return;
        }

        name.textContent = `${blockIdToDisplayName(normalizedId).toUpperCase()} x${item.count ?? 1}`;
        stats.textContent = `Item ID ${normalizedId}`;
    }

    sortInventory() {
        const inv = this.gameState.inventory;
        // Collect main slots (9-35), merge stacks, sort by kind then id
        const items = [];
        for (let i = 9; i < 36; i++) {
            if (inv[i]) items.push({ ...inv[i] });
        }

        // Merge identical stacks
        const merged = [];
        for (const item of items) {
            const existing = merged.find(m => m.id === item.id && m.kind === item.kind && m.count < 99);
            if (existing) {
                const space = 99 - existing.count;
                const take = Math.min(space, item.count ?? 1);
                existing.count += take;
                const leftover = (item.count ?? 1) - take;
                if (leftover > 0) merged.push({ ...item, count: leftover });
            } else {
                merged.push({ ...item });
            }
        }

        // Sort: tools first, then blocks; alphabetically within groups
        merged.sort((a, b) => {
            const ka = this.toolById.has(a.id) ? 0 : 1;
            const kb = this.toolById.has(b.id) ? 0 : 1;
            if (ka !== kb) return ka - kb;
            return a.id.localeCompare(b.id);
        });

        for (let i = 9; i < 36; i++) {
            inv[i] = merged[i - 9] ?? null;
        }

        this.onInventoryChanged();
        window.dispatchEvent(new CustomEvent('inventory-changed'));
    }

    generateHotbar() {
        const container = this.refs.hotbar;
        if (!container) return;

        container.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const slot = document.createElement('div');
            slot.className = `slot ${i === this.gameState.selectedSlot ? 'active' : ''}`;
            const item = this.gameState.inventory[i];
            if (item) {
                slot.appendChild(this.createItemElement(item));
                slot.title = this.describeItem(item);
            }
            slot.addEventListener('pointerdown', (e) => {
                if (e.button === 0 || e.pointerType === 'touch') {
                    this.gameState.setSlot(i);
                    this.onSlotChanged(i);
                    e.preventDefault();
                }
            });
            container.appendChild(slot);
        }
    }

    updateHotbarSelection(slot) {
        const slots = document.querySelectorAll('#hotbar .slot');
        slots.forEach((node, index) => node.classList.toggle('active', index === slot));
    }
}
