import { BLOCKS } from '../data/blocks.js';
import { TOOLS } from '../data/tools.js';
import { CraftingSystem } from '../engine/CraftingSystem.js';

export class HUD {
    constructor(gameState, game = null) {
        this.gameState = gameState;
        this.game = game;
        this.blockById = new Map(BLOCKS.map((block) => [block.id, block]));
        this.toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));
        this.craftingSystem = new CraftingSystem();

        this.iconMap = {
            stone: '/icons/items/stone.png',
            grass: '/icons/items/grass.png',
            wood: '/icons/items/wood.png',
            dirt: '/icons/items/dirt.png',
            sand: '/icons/items/sand.png',
            leaves: '/icons/items/leaves.png',
            water: '/icons/items/water.png',
            virus: '/icons/items/virus.png',
            arlo: '/icons/items/arlo.png',
            glass: '/icons/items/glass.png',
            brick: '/icons/items/brick.png',
            crafting_table: '/icons/items/crafting_table.png',
            pick_wood: '/icons/items/pick_wood.png',
            sledge_iron: '/icons/items/sledge_iron.png',
            power_blade: '/icons/items/power_blade.png',
            glitch_saber: '/icons/items/glitch_saber.png',
            data_drill: '/icons/items/data_drill.png',
            decoder_wand: '/icons/items/decoder_wand.png',
            magnet_glove: '/icons/items/magnet_glove.png',
            rocket_boots: '/icons/items/rocket_boots.png',
            static_bow: '/icons/items/static_bow.png',
            byte_axe: '/icons/items/power_blade.png',
            echo_dagger: '/icons/items/glitch_saber.png',
            arc_spear: '/icons/items/sledge_iron.png',
            plasma_hammer: '/icons/items/sledge_iron.png',
            pulse_pistol: '/icons/items/static_bow.png',
            rail_rifle: '/icons/items/static_bow.png',
            scatter_blaster: '/icons/items/static_bow.png'
        };
        this.availableIconIds = new Set([
            'arlo',
            'data_drill',
            'decoder_wand',
            'dirt',
            'glass',
            'glitch_saber',
            'grass',
            'leaves',
            'magnet_glove',
            'pick_wood',
            'power_blade',
            'rocket_boots',
            'sand',
            'sledge_iron',
            'static_bow',
            'stone',
            'virus',
            'water',
            'wood'
        ]);
        this.iconAliasById = {
            cobblestone: 'stone',
            brick: 'stone',
            clay: 'dirt',
            path_block: 'dirt',
            crafting_table: 'wood',
            starter_chest: 'wood',
            lantern: 'wood',
            tnt: 'dirt',
            nuke: 'virus',
            obsidian: 'stone',
            bedrock: 'stone',
            sandstone: 'sand',
            snow_block: 'stone',
            ice: 'water',
            cloud_block: 'water',
            lava: 'water',
            apple: 'grass',
            tomato: 'grass',
            carrot: 'grass',
            potato: 'dirt',
            corn: 'grass',
            blueberry: 'grass',
            strawberry: 'grass',
            melon_slice: 'grass',
            pumpkin_pie: 'dirt',
            bread: 'dirt',
            steak: 'dirt',
            cooked_fish: 'water',
            mushroom_brown: 'dirt',
            honey_bottle: 'grass',
            cookie: 'dirt',
            byte_axe: 'power_blade',
            echo_dagger: 'glitch_saber',
            arc_spear: 'sledge_iron',
            plasma_hammer: 'sledge_iron',
            pulse_pistol: 'static_bow',
            rail_rifle: 'static_bow',
            scatter_blaster: 'static_bow'
        };

        this.carryItem = null;
        this.carryOrigin = null;
        this.dragGhost = null;
        this.pointerPickupPending = false;
        this.pointerPickupMoved = false;
        this.pointerDownX = 0;
        this.pointerDownY = 0;
        this.lastPointerButton = 0;
        this.currentCraftingMatch = null;
        this.faceResetTimer = null;
    }

    init() {
        this.createDragGhost();
        this.updateHP(this.gameState.hp);
        this.updateFood(this.gameState.hunger);
        this.updateMode(this.gameState.mode);
        this.updateXPBar(0, 100);
        this.generateHotbar();
        this.updateHotbarSelection(this.gameState.selectedSlot);
        this.renderSelectedItem();
        this.setFace('happy');

        window.addEventListener('inventory-toggle', (event) => this.toggleInventoryUI(Boolean(event.detail)));
        window.addEventListener('mode-changed', (event) => {
            this.updateMode(event.detail);
            this.renderSelectedItem();
        });
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

        window.addEventListener('hp-changed', (event) => {
            this.updateHP(event.detail);
            this.setFace('sad', 1200);
        });
        window.addEventListener('hunger-changed', (event) => this.updateFood(event.detail));
        window.addEventListener('xp-changed', (event) => this.updateXPBar(event.detail?.xp ?? 0, event.detail?.max ?? 100));

        window.addEventListener('block-mined', (event) => this.onBlockMined(event.detail));
        window.addEventListener('action-prompt', (event) => {
            this.showActionPrompt(event.detail);
            this.setFace('surprised', 1800);
        });
        window.addEventListener('action-success', () => this.flashPrompt('SYNC SUCCESS', '#b7ff83'));
        window.addEventListener('action-fail', () => this.flashPrompt('SYNC FAILED', '#ff8585'));
        window.addEventListener('mining-progress', (event) => this.updateMiningProgress(event.detail));

        const closeButton = document.getElementById('btn-inventory-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => this.gameState.toggleInventory());
        }

        document.addEventListener('pointermove', (event) => this.onGlobalPointerMove(event));
        document.addEventListener('pointerup', (event) => this.onGlobalPointerUp(event));
    }

    setEmotion(mood, reset = 0) {
        this.setFace(mood, reset);
    }

    setFace(mood, reset = 0) {
        const img = document.getElementById('arlo-face-image');
        if (!img) return;

        const faces = {
            happy: '/faces/arlo_happy.png',
            sad: '/faces/arlo_sad.png',
            surprised: '/faces/arlo_surprised.png',
            mad: '/faces/arlo_mad.png'
        };

        img.src = faces[mood] ?? faces.happy;

        if (this.faceResetTimer) {
            clearTimeout(this.faceResetTimer);
            this.faceResetTimer = null;
        }

        if (reset > 0) {
            this.faceResetTimer = setTimeout(() => this.setFace('happy'), reset);
        }
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

    getFacingLabel(yaw) {
        const pi = Math.PI;
        const angle = ((yaw % (2 * pi)) + (2 * pi)) % (2 * pi);
        if (angle >= (7 * pi / 4) || angle < (pi / 4)) return 'North';
        if (angle < (3 * pi / 4)) return 'West';
        if (angle < (5 * pi / 4)) return 'South';
        return 'East';
    }

    updateCoordinates(position, yaw = 0, world = null) {
        const el = document.getElementById('coords-display');
        if (!el || !position) return;

        const bx = Math.floor(position.x + 0.5);
        const by = Math.floor(position.y);
        const bz = Math.floor(position.z + 0.5);
        const cx = world?.getChunkCoord?.(position.x) ?? 0;
        const cz = world?.getChunkCoord?.(position.z) ?? 0;
        const biome = world?.getBiomeIdAt?.(position.x, position.z) ?? 'plains';
        const facing = this.getFacingLabel(yaw);

        el.textContent = [
            `XYZ: ${bx} / ${by} / ${bz}`,
            `Facing: ${facing}`,
            `Chunk: ${cx}, ${cz}`,
            `Biome: ${biome}`
        ].join('\n');
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

    updateMiningProgress(detail) {
        const prompt = document.getElementById('action-prompt') || document.body.appendChild(document.createElement('div'));
        prompt.id = 'action-prompt';

        const ratio = Math.max(0, Math.min(1, detail?.ratio ?? 0));
        if (ratio <= 0 || detail?.done) {
            prompt.style.opacity = '0';
            return;
        }

        const pct = Math.round(ratio * 100);
        prompt.textContent = `MINING ${pct}%`;
        prompt.style.color = '#ffd884';
        prompt.style.opacity = '1';
    }

    toggleInventoryUI(isOpen) {
        const overlay = document.getElementById('inventory-overlay');
        if (!overlay) return;
        overlay.style.display = isOpen ? 'flex' : 'none';
        if (isOpen) {
            this.updateInventoryUI();
            this.setFace('surprised', 900);
        } else {
            this.returnCarryToInventory();
        }
    }

    updateInventoryUI() {
        this.checkCrafting();
        const mainGrid = document.getElementById('main-inventory-grid');
        const hotbarGrid = document.getElementById('hotbar-inventory-grid');
        const craftingGrid = document.getElementById('crafting-grid-3x3');
        const resultSlot = document.getElementById('crafting-result-slot');
        const hint = document.getElementById('crafting-hint');
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
        for (let i = 0; i < 9; i++) {
            craftingGrid.appendChild(this.createSlot(i, 'crafting'));
        }

        resultSlot.innerHTML = '';
        if (this.gameState.craftingResult) {
            resultSlot.appendChild(this.createItemElement(this.gameState.craftingResult));
            resultSlot.title = this.currentCraftingMatch?.recipeName ?? 'Crafted item';
            if (hint) hint.textContent = `Recipe: ${this.currentCraftingMatch?.recipeName ?? 'Unknown'}`;
        } else if (hint) {
            hint.textContent = 'Drag items into the 3x3 grid to discover recipes.';
        }
        resultSlot.onclick = () => this.handleResultClick();
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

        const item = type === 'inventory' ? this.gameState.inventory[idx] : this.gameState.craftingGrid[idx];
        if (item) {
            slot.appendChild(this.createItemElement(item));
            slot.title = this.describeItem(item);
        }

        slot.addEventListener('pointerdown', (event) => this.onSlotPointerDown(idx, type, event));
        return slot;
    }

    createItemElement(item) {
        const element = document.createElement('div');
        element.className = 'item-icon';

        const icon = this.getIconPath(item.id);
        if (icon) {
            element.style.backgroundImage = `url('${icon}')`;
        } else {
            element.textContent = item.id.slice(0, 2).toUpperCase();
        }

        if ((item.count ?? 1) > 1) {
            const count = document.createElement('div');
            count.className = 'item-count';
            count.textContent = String(item.count);
            element.appendChild(count);
        }

        return element;
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
            this.checkCrafting();
            this.updateDragGhost();
            window.dispatchEvent(new CustomEvent('inventory-changed'));
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

        this.checkCrafting();
        this.updateDragGhost();
        window.dispatchEvent(new CustomEvent('inventory-changed'));
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

    handleResultClick() {
        const result = this.gameState.craftingResult;
        if (!result) return;

        const itemKind = result.kind ?? this.getItemKind(result.id);
        const added = this.gameState.addItemToInventory(result.id, result.count ?? 1, itemKind);
        if (!added) {
            this.flashPrompt('INVENTORY FULL', '#ff8f8f');
            return;
        }

        for (let i = 0; i < 9; i++) {
            const item = this.gameState.craftingGrid[i];
            if (!item) continue;
            item.count = (item.count ?? 1) - 1;
            if (item.count <= 0) this.gameState.craftingGrid[i] = null;
        }

        this.checkCrafting();
        this.flashPrompt(`CRAFTED ${result.id.toUpperCase()}`, '#9cff8a');
        this.setFace('happy', 900);
        window.dispatchEvent(new CustomEvent('inventory-changed'));
    }

    checkCrafting() {
        this.currentCraftingMatch = this.craftingSystem.match(this.gameState.craftingGrid);
        this.gameState.craftingResult = this.currentCraftingMatch?.result ?? null;
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
                this.checkCrafting();
                window.dispatchEvent(new CustomEvent('inventory-changed'));
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
        this.checkCrafting();
        window.dispatchEvent(new CustomEvent('inventory-changed'));
    }

    getItemKind(itemId) {
        if (this.toolById.has(itemId)) return 'tool';
        return 'block';
    }

    getIconPath(itemId) {
        if (!itemId) return '/icons/items/stone.png';

        const direct = this.iconMap[itemId];
        if (direct) {
            const directId = direct.split('/').pop()?.replace('.png', '');
            if (directId && this.availableIconIds.has(directId)) return direct;
        }

        const alias = this.resolveIconAlias(itemId);
        if (alias && this.availableIconIds.has(alias)) {
            return `/icons/items/${alias}.png`;
        }

        return '/icons/items/stone.png';
    }

    resolveIconAlias(itemId) {
        const id = String(itemId);
        const explicit = this.iconAliasById[id];
        if (explicit) return explicit;

        if (id.startsWith('wood_')) return 'wood';
        if (id.startsWith('leaves_')) return 'leaves';
        if (id.startsWith('wool_')) return 'grass';
        if (id.startsWith('flower_') || id === 'grass_tall') return 'grass';

        const block = this.blockById.get(id);
        if (block?.name?.includes('Ore')) return 'stone';

        const tool = this.toolById.get(id);
        if (tool) {
            if (tool.type === 'gun' || tool.type === 'ranged') return 'static_bow';
            if (tool.type === 'pick') return 'pick_wood';
            if (tool.type === 'utility') return 'magnet_glove';
            return 'power_blade';
        }

        return null;
    }

    describeItem(item) {
        if (!item) return '';
        const block = this.blockById.get(item.id);
        if (block) {
            return `${block.name} | Hardness ${block.hardness} | XP ${block.xp}`;
        }

        const tool = this.toolById.get(item.id);
        if (tool) {
            return `${tool.name} | Damage ${tool.damage} | Efficiency ${tool.efficiency}`;
        }

        return item.id.toUpperCase();
    }

    renderSelectedItem() {
        const name = document.getElementById('selected-item-name');
        const stats = document.getElementById('selected-item-stats');
        if (!name || !stats) return;

        const item = this.gameState.getSelectedItem();
        if (!item) {
            name.textContent = 'EMPTY HAND';
            const offhand = this.gameState.getOffhandItem();
            const offhandText = offhand ? `Offhand ${offhand.id.toUpperCase()} x${offhand.count ?? 1}` : 'Offhand EMPTY';
            stats.textContent = `Select a hotbar slot with 1-9 or mouse wheel. | ${offhandText}`;
            return;
        }

        const block = this.blockById.get(item.id);
        if (block) {
            name.textContent = `${block.name.toUpperCase()} x${item.count ?? 1}`;
            const offhand = this.gameState.getOffhandItem();
            const offhandText = offhand ? `${offhand.id.toUpperCase()} x${offhand.count ?? 1}` : 'EMPTY';
            stats.textContent = `Block | Hardness ${block.hardness} | XP ${block.xp} | Offhand ${offhandText}`;
            return;
        }

        const tool = this.toolById.get(item.id);
        if (tool) {
            name.textContent = `${tool.name.toUpperCase()} x${item.count ?? 1}`;
            const offhand = this.gameState.getOffhandItem();
            const offhandText = offhand ? `${offhand.id.toUpperCase()} x${offhand.count ?? 1}` : 'EMPTY';
            stats.textContent = `Tool | Type ${tool.type} | Damage ${tool.damage} | Efficiency ${tool.efficiency} | Offhand ${offhandText}`;
            return;
        }

        name.textContent = `${item.id.toUpperCase()} x${item.count ?? 1}`;
        stats.textContent = 'Unknown item stats';
    }

    generateHotbar() {
        const container = document.getElementById('hotbar');
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
            slot.onclick = () => this.gameState.setSlot(i);
            container.appendChild(slot);
        }
    }

    updateHotbarSelection(slot) {
        const slots = document.querySelectorAll('#hotbar .slot');
        slots.forEach((node, index) => node.classList.toggle('active', index === slot));
    }

    updateHP(value) {
        const container = document.getElementById('hp-bar');
        if (!container) return;
        const full = Math.max(0, Math.min(10, Math.ceil((value ?? 0) / 2)));
        container.textContent = `HP ${'|'.repeat(full)}${'.'.repeat(10 - full)}`;
    }

    updateFood(value) {
        const container = document.getElementById('food-bar');
        if (!container) return;
        const full = Math.max(0, Math.min(10, Math.ceil((value ?? 0) / 2)));
        container.textContent = `FOOD ${'|'.repeat(full)}${'.'.repeat(10 - full)}`;
    }

    updateMode(mode) {
        const label = document.getElementById('gamemode-indicator');
        if (!label) return;
        label.textContent = `${mode} MODE`;
    }

    updateXPBar(xp, max) {
        const bar = document.getElementById('xp-bar');
        if (!bar) return;
        const denom = Math.max(1, Number(max) || 1);
        const ratio = Math.max(0, Math.min(1, (Number(xp) || 0) / denom));
        bar.style.width = `${ratio * 100}%`;
    }

    onBlockMined(detail) {
        if (!detail?.id) return;
        this.flashPrompt(`+${detail.id.toUpperCase()}`, '#f8f87a');
    }

    showActionPrompt(detail) {
        const element = document.getElementById('action-prompt') || document.body.appendChild(document.createElement('div'));
        element.id = 'action-prompt';
        element.textContent = `${detail?.type ?? 'ACTION'}! [E]`;
        element.style.opacity = '1';
        setTimeout(() => {
            element.style.opacity = '0';
        }, 1600);
    }

    flashPrompt(text, color) {
        const element = document.getElementById('action-prompt') || document.body.appendChild(document.createElement('div'));
        element.id = 'action-prompt';
        element.textContent = text;
        element.style.color = color;
        element.style.opacity = '1';
        setTimeout(() => {
            element.style.opacity = '0';
        }, 900);
    }
}
