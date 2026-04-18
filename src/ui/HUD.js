import { BLOCKS } from '../data/blocks.js';
import { TOOLS } from '../data/tools.js';
import { CraftingSystem } from '../engine/CraftingSystem.js';

const itemTextureModules = import.meta.glob('../Igneous 1.19.4/assets/minecraft/textures/item/*.png', { eager: true, query: '?url' });
const blockTextureModules = import.meta.glob('../Igneous 1.19.4/assets/minecraft/textures/block/*.png', { eager: true, query: '?url' });
const contentBlockAllModules = import.meta.glob('../content/blocks/*/all.png', { eager: true, query: '?url' });
const GRASS_PREVIEW_TINT_CLASS = 'tint-grass-face';

export class HUD {
    constructor(gameState, game = null) {
        this.gameState = gameState;
        this.game = game;
        this.blockById = new Map(BLOCKS.map((block) => [block.id, block]));
        this.toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));
        this.craftingSystem = new CraftingSystem();

        this.itemTextures = {};
        for (const [path, module] of Object.entries(itemTextureModules)) {
            const fileName = path.split('/').pop().replace('.png', '');
            this.itemTextures[fileName] = module.default || module;
        }

        this.blockTextures = {};
        for (const [path, module] of Object.entries(blockTextureModules)) {
            const fileName = path.split('/').pop().replace('.png', '');
            this.blockTextures[fileName] = module.default || module;
        }
        for (const [path, module] of Object.entries(contentBlockAllModules)) {
            const parts = path.split('/');
            const folderId = parts[parts.length - 2];
            this.blockTextures[folderId] = module.default || module;
        }

        
        this.availableIconIds = new Set([
            'arlo',
            'data_drill',
            'decoder_wand',
            'dirt',
            'glass',
            'glitch_saber',
            'grass',
            'oak_leaves',
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
            'oak_log'
        ]);
        this.iconAliasById = {
            cobblestone: 'stone',
            brick: 'bricks',
            path_block: 'dirt_path',
            nuke: 'virus',
            obsidian: 'obsidian',
            wood: 'oak_log',
            leaves: 'oak_leaves',
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
        this.generatedIconCache = new Map();

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

    resolveAsset(path) {
        const base = import.meta.env.BASE_URL || '/';
        const normalized = String(path || '').replace(/^\/+/, '');
        return `${base}${normalized}`;
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
            this.updateHotbarSelection(event.detail); // Slot logic
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
            happy: 'faces/arlo_happy.png',
            sad: 'faces/arlo_sad.png',
            surprised: 'faces/arlo_surprised.png',
            mad: 'faces/arlo_mad.png'
        };

        if (!img.dataset.faceFallbackBound) {
            img.dataset.faceFallbackBound = '1';
            img.addEventListener('error', () => {
                if (img.dataset.faceFallbackApplied === '1') return;
                img.dataset.faceFallbackApplied = '1';
                img.src = this.resolveAsset(faces.happy);
            });
        }

        img.dataset.faceFallbackApplied = '0';
        img.src = this.resolveAsset(faces[mood] ?? faces.happy);

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

    getWorldTimeLabel(timeOfDay = 0) {
        const t = ((Number(timeOfDay) % 1) + 1) % 1;
        // 0.25 = Noon, 0.75 = Midnight (or vice-versa depending on angle offset)
        // In Game.js: angle = (timeOfDay * 2PI) - PI/2
        // timeOfDay 0.25 -> angle = 0 -> sunHeight = 0 (Sunrise)
        // timeOfDay 0.5 -> angle = PI/2 -> sunHeight = 1 (Noon)
        // timeOfDay 0.75 -> angle = PI -> sunHeight = 0 (Sunset)
        // timeOfDay 0 or 1.0 -> angle = -PI/2 -> sunHeight = -1 (Midnight)
        
        if (t < 0.20 || t >= 0.85) return 'MIDNIGHT';
        if (t < 0.32) return 'DAWN';
        if (t < 0.68) return 'DAY';
        return 'DUSK';
    }

    formatBiomeLabel(id) {
        return String(id || 'plains')
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
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
        const biomeLabel = this.formatBiomeLabel(biome);
        const mode = this.gameState?.mode ?? 'SURVIVAL';
        const worldTime = this.getWorldTimeLabel(this.game?.timeOfDay ?? 0);
        const seed = world?.seedString ?? 'arlocraft';

        el.textContent = [
            `XYZ: ${bx} / ${by} / ${bz}`,
            `Facing: ${facing}`,
            `Chunk: ${cx}, ${cz}`,
            `Biome: ${biome}`,
            `Time: ${worldTime}`
        ].join('\n');

        const modePill = document.getElementById('mode-pill');
        if (modePill) modePill.textContent = mode;
        const timePill = document.getElementById('world-time-pill');
        if (timePill) timePill.textContent = worldTime;
        const biomePill = document.getElementById('biome-pill');
        if (biomePill) biomePill.textContent = biomeLabel.toUpperCase();
        const miniContext = document.getElementById('minimap-context');
        if (miniContext) miniContext.textContent = `Seed ${seed} | ${biomeLabel}`;
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
        const block = this.blockById.get(item.id);
        const textureKey = this.getDisplayTextureKey(item.id);
        const isDeco = Boolean(block?.deco);
        const shouldTintGrassFace = item.id === 'grass_block';
        const shouldTintFoliageIcon = ((isDeco && (textureKey === 'grass' || textureKey.includes('grass') || textureKey === 'fern')) || textureKey.includes('leaves'));
        const shouldUseGrassSpriteTint = isDeco && (textureKey === 'grass' || item.id === 'short_grass' || item.id === 'tall_grass');
        const isBlockItem = (block && !block.deco) || 
                           item.id === 'wood' || item.id === 'leaves' || 
                           item.id.startsWith('wood_') || item.id.startsWith('leaves_') ||
                           item.id.includes('_stairs') || item.id.includes('_slab');

        if (isBlockItem) {
             const set = this.getBlockTextureSet(item.id);
             if (set && (set.top || set.all || set.side || set.front || set.bottom)) {
                 const topTex = set.top || set.all || set.side || set.front || set.bottom;
                 const leftTex = set.front || set.side || set.all || set.top || set.bottom;
                 const rightTex = set.side || set.front || set.all || set.top || set.bottom;

                 const isoContainer = document.createElement('div');
                 isoContainer.className = 'iso-icon';
                 
                 const topFace = document.createElement('div');
                 topFace.className = 'iso-face top';
                 topFace.style.backgroundImage = `url('${topTex}')`;
                 if (shouldTintGrassFace) {
                     topFace.classList.add(GRASS_PREVIEW_TINT_CLASS);
                 }
                 
                 const leftFace = document.createElement('div');
                 leftFace.className = 'iso-face left';
                 leftFace.style.backgroundImage = `url('${leftTex}')`;
                 
                 const rightFace = document.createElement('div');
                 rightFace.className = 'iso-face right';
                 rightFace.style.backgroundImage = `url('${rightTex}')`;
                 
                 isoContainer.appendChild(topFace);
                 isoContainer.appendChild(leftFace);
                 isoContainer.appendChild(rightFace);

                 if (shouldTintFoliageIcon) {
                     isoContainer.classList.add('tint-grass');
                 }

                 element.appendChild(isoContainer);
             } else {
                 element.textContent = String(item.id).slice(0, 2).toUpperCase();
             }
        } else {
             const icon = this.getIconPath(item.id);
             if (icon) {
                 element.style.backgroundImage = `url('${icon}')`;
                 if (shouldUseGrassSpriteTint) {
                     element.classList.add('tint-grass-sprite');
                 } else if (shouldTintFoliageIcon) {
                     element.classList.add('tint-grass');
                 }
                 if (icon.startsWith('data:image/svg+xml')) {
                     element.classList.add('generated');
                 }
             } else {
                 element.textContent = String(item.id).slice(0, 2).toUpperCase();
             }
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

    getBlockTextureSet(id) {
        const legacyMap = {
            'wood': 'oak_log',
            'leaves': 'oak_leaves',
            'wood_birch': 'birch_log', 
            'leaves_birch': 'birch_leaves',
            'wood_pine': 'spruce_log', 
            'leaves_pine': 'spruce_leaves',
            'gravel': 'gravel',
            'glass': 'glass',
            'snow': 'snow',
            'ice': 'ice',
            'obsidian': 'obsidian',
            'bedrock': 'bedrock',
            'water': 'water_still',
            'lava': 'lava_still',
            'sand': 'sand',
            'cobblestone': 'cobblestone',
            'oak_plank': 'oak_planks',
            'sandstone': 'sandstone',
            'dirt': 'dirt',
            'stone': 'stone',
            'tnt': 'tnt',
            'crafting_table': 'crafting_table',
            'lantern': 'lantern',
            'path_block': 'dirt_path',
            'clay': 'clay',
            'brick': 'bricks'
        };
        
        let alias = this.getBlockTextureKey(id);
        if (legacyMap[alias]) alias = legacyMap[alias];

        const all = this.blockTextures[alias] || this.blockTextures[`${alias}_all`];
        return {
            all: all,
            top: this.blockTextures[`${alias}_top`] || all,
            side: this.blockTextures[`${alias}_side`] || all,
            front: this.blockTextures[`${alias}_front`] || this.blockTextures[`${alias}_side`] || all,
            bottom: this.blockTextures[`${alias}_bottom`] || all
        };
    }

    getIconPath(itemId) {
        if (!itemId) return this.getGeneratedIconPath('item');

        const block = this.blockById.get(itemId);
        if (block?.deco) {
            const textureKey = this.getDisplayTextureKey(itemId);
            return this.blockTextures?.[textureKey]
                || this.blockTextures?.[`${textureKey}_front`]
                || this.blockTextures?.[`${textureKey}_top`]
                || this.blockTextures?.[`${textureKey}_bottom`]
                || this.getGeneratedIconPath(itemId);
        }

        const alias = this.resolveIconAlias(itemId) || itemId;
        
        const toolMap = {
            // Picks / drills
            pick_wood:      'wooden_pickaxe',
            sledge_iron:    'iron_pickaxe',
            data_drill:     'netherite_pickaxe',
            // Swords / blades
            sword_wood:     'wooden_sword',
            power_blade:    'iron_sword',
            glitch_saber:   'diamond_sword',
            // Axes
            axe_wood:       'wooden_axe',
            byte_axe:       'diamond_axe',
            // Daggers → stone sword (closest short blade)
            echo_dagger:    'stone_sword',
            // Spears → trident
            arc_spear:      'trident',
            // Hammers → iron_axe (closest heavy weapon)
            plasma_hammer:  'iron_axe',
            // Ranged
            static_bow:     'bow',
            pulse_pistol:   'crossbow',
            rail_rifle:     'crossbow',
            scatter_blaster:'crossbow',
            // Utility
            decoder_wand:   'stick',
            magnet_glove:   'iron_ingot',
            rocket_boots:   'iron_boots',
            grappler:       'fishing_rod',
            scanner:        'compass_16',
            master_key:     'gold_ingot',
            // Food
            apple:          'apple',
            bread:          'bread',
            steak:          'cooked_beef',
            carrot:         'carrot',
            potato:         'baked_potato',
            corn:           'wheat',
            blueberry:      'sweet_berries',
            strawberry:     'sweet_berries',
            melon_slice:    'melon_slice',
            pumpkin_pie:    'pumpkin_pie',
            cookie:         'cookie',
            cooked_fish:    'cooked_cod',
            honey_bottle:   'honey_bottle',
            mushroom_brown: 'brown_mushroom',
            mushroom_red:   'red_mushroom',
        };
        const mcId = toolMap[alias] || alias;

        if (this.itemTextures && this.itemTextures[mcId]) return this.itemTextures[mcId];
        if (this.blockTextures && this.blockTextures[mcId]) return this.blockTextures[mcId];

        return this.getGeneratedIconPath(itemId);
    }

    getGeneratedIconPath(itemId) {
        const id = String(itemId || 'item').toLowerCase();
        if (this.generatedIconCache.has(id)) return this.generatedIconCache.get(id);

        const monogram = this.getIconMonogram(id);
        const accent = this.getIconAccentColor(id);
        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="#151f35"/>
<stop offset="100%" stop-color="#09101d"/>
</linearGradient>
<linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${accent}"/>
<stop offset="100%" stop-color="#ffffff"/>
</linearGradient>
</defs>
<rect x="4" y="4" width="56" height="56" rx="12" fill="url(#bg)" stroke="${accent}" stroke-width="2.5"/>
<rect x="10" y="10" width="44" height="44" rx="8" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
<circle cx="16" cy="16" r="2.2" fill="${accent}" />
<text x="32" y="39" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="23" font-weight="700" fill="url(#accent)">${monogram}</text>
</svg>`;

        const data = `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
        this.generatedIconCache.set(id, data);
        return data;
    }

    _buildAbbrevMap() {
        const allIds = [
            ...Array.from(this.blockById.keys()),
            ...Array.from(this.toolById.keys()),
        ];
        const map = new Map();
        const used = new Set();

        const candidate = (id) => {
            const parts = id.split(/[_-]+/).filter(Boolean);
            const initials = parts.map((p) => p[0].toUpperCase());
            // Two-letter: first letters of first two parts, or first two chars of single word
            const two = parts.length >= 2
                ? initials.slice(0, 2).join('')
                : parts[0].slice(0, 2).toUpperCase();
            if (!used.has(two)) return two;

            // Three-letter: first letters of up to 3 parts, or first 3 chars
            const three = parts.length >= 3
                ? initials.slice(0, 3).join('')
                : (parts.length === 2
                    ? (initials[0] + parts[1].slice(0, 2).toUpperCase())
                    : parts[0].slice(0, 3).toUpperCase());
            if (!used.has(three)) return three;

            // Fallback: first + third char of first part
            const alt = (parts[0][0] + (parts[0][2] || parts[0][1] || 'X')).toUpperCase();
            if (!used.has(alt)) return alt;

            // Last resort: first char + numeric index
            for (let i = 1; i <= 9; i++) {
                const indexed = parts[0][0].toUpperCase() + i;
                if (!used.has(indexed)) return indexed;
            }
            return parts[0][0].toUpperCase() + '?';
        };

        for (const id of allIds) {
            const abbrev = candidate(id);
            map.set(id, abbrev);
            used.add(abbrev);
        }
        return map;
    }

    getIconMonogram(itemId) {
        if (!this._abbrevMap) this._abbrevMap = this._buildAbbrevMap();
        const id = String(itemId || 'it').toLowerCase();
        if (this._abbrevMap.has(id)) return this._abbrevMap.get(id);

        // Fallback for unknown/dynamic IDs
        const parts = id.split(/[_-]+/).filter(Boolean);
        if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        return (parts[0] || 'it').slice(0, 2).toUpperCase();
    }

    getIconAccentColor(itemId) {
        const alias = this.resolveIconAlias(itemId) ?? itemId;
        const palette = {
            stone: '#7bc8ff',
            dirt: '#f0a56d',
            grass: '#76f59f',
            wood: '#ffc176',
            leaves: '#8de86b',
            sand: '#ffe384',
            water: '#7bd2ff',
            iron: '#b8c8ff',
            gold: '#ffe36a',
            diamond: '#6bffe6',
            static_bow: '#8ad7ff',
            power_blade: '#ff8fb2',
            pick_wood: '#ffcf8d',
            magnet_glove: '#ffd28f',
            virus: '#d08bff',
            arlo: '#ffb0d7'
        };
        if (palette[alias]) return palette[alias];

        let hash = 0;
        const value = String(itemId ?? '');
        for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash) + value.charCodeAt(i);
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue} 82% 66%)`;
    }

    resolveIconAlias(itemId) {
        const id = String(itemId);
        const legacyMap = {
            'wood': 'oak_log', 'leaves': 'oak_leaves',
            'wood_birch': 'birch_log', 'leaves_birch': 'birch_leaves',
            'wood_pine': 'spruce_log', 'leaves_pine': 'spruce_leaves',
            'wood_cherry': 'cherry_log', 'leaves_cherry': 'cherry_leaves',
            'wood_crystal': 'crystal_log', 'leaves_crystal': 'crystal_leaves',
            'wood_palm': 'jungle_log', 'leaves_palm': 'jungle_leaves',
            'wood_willow': 'mangrove_log', 'leaves_willow': 'mangrove_leaves'
        };
        if (legacyMap[id]) return legacyMap[id];
        const explicit = this.iconAliasById[id];
        if (explicit) return explicit;

        if (id.startsWith('wool_')) return 'grass';
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

    getBlockTextureKey(itemId) {
        const block = this.blockById.get(itemId);
        if (block?.textureId) return block.textureId;
        return this.resolveIconAlias(itemId) || itemId;
    }

    getDisplayTextureKey(itemId) {
        const block = this.blockById.get(itemId);
        if (block?.pairId && typeof block.textureId === 'string' && block.textureId.endsWith('_bottom')) {
            const pairTexture = this.blockById.get(block.pairId)?.textureId;
            if (pairTexture) return pairTexture;
        }
        return this.getBlockTextureKey(itemId);
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
            slot.addEventListener('pointerdown', (e) => {
                if (e.button === 0 || e.pointerType === 'touch') {
                    this.gameState.setSlot(i);
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

    updateHP(value) {
        const container = document.getElementById('hp-bar');
        if (!container) return;
        const maxHp = Math.max(1, this.gameState?.maxHp ?? 20);
        const hp = Math.max(0, Math.min(maxHp, Number(value) || 0));
        const ratio = hp / maxHp;
        container.innerHTML = `<span class="bar-label">HP</span><div class="hud-meter"><div class="hud-meter-fill hp-fill" style="width:${(ratio * 100).toFixed(1)}%"></div></div><span class="bar-value">${Math.round(hp)}/${maxHp}</span>`;
    }

    updateFood(value) {
        const container = document.getElementById('food-bar');
        if (!container) return;
        const maxFood = 20;
        const hunger = Math.max(0, Math.min(maxFood, Number(value) || 0));
        const ratio = hunger / maxFood;
        container.innerHTML = `<span class="bar-label">FOOD</span><div class="hud-meter"><div class="hud-meter-fill food-fill" style="width:${(ratio * 100).toFixed(1)}%"></div></div><span class="bar-value">${Math.round(hunger)}/${maxFood}</span>`;
    }

    updateMode(mode) {
        const label = document.getElementById('gamemode-indicator');
        if (label) label.textContent = `${mode} MODE`;
        const modePill = document.getElementById('mode-pill');
        if (modePill) modePill.textContent = mode;
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
