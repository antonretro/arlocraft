import { registerBlockHandler } from '../../../engine/BlockHandlerRegistry.js';

// ── Furnace Handler ────────────────────────────────────────────────────────
// Input slot, fuel slot, output slot, animated progress bar.
// Each furnace is keyed by block coordinate. State persists in world.state.
// ──────────────────────────────────────────────────────────────────────────

const SMELT_RECIPES = [
    { input: 'iron_ore',    output: { id: 'iron_ingot',    count: 1, kind: 'block' } },
    { input: 'copper_ore',  output: { id: 'copper_ingot',  count: 1, kind: 'block' } },
    { input: 'sand',        output: { id: 'glass',         count: 1, kind: 'block' } },
    { input: 'oak_log',     output: { id: 'charcoal',      count: 1, kind: 'block' } },
    { input: 'wood',        output: { id: 'charcoal',      count: 1, kind: 'block' } },
    { input: 'iron',        output: { id: 'iron_ingot',    count: 1, kind: 'block' } },
    { input: 'stone',       output: { id: 'smooth_stone',  count: 1, kind: 'block' } },
];

// Fuel burn times (ticks at 20 tps equivalent; we use ms)
const FUEL_MS = {
    coal:       8000,
    charcoal:   8000,
    oak_log:    1500,
    wood:       1500,
    oak_planks: 750,
};

const SMELT_MS = 10000; // 10 seconds per item

let _game = null;
let _blockKey = null;
let _tickInterval = null;

function getOverlay() { return document.getElementById('furnace-overlay'); }

function getFurnaceState() {
    if (!_game || !_blockKey) return null;
    const worldState = _game.world?.state;
    if (!worldState) return null;
    if (!worldState.furnaceStates) worldState.furnaceStates = new Map();
    if (!worldState.furnaceStates.has(_blockKey)) {
        worldState.furnaceStates.set(_blockKey, {
            input:    null,
            fuel:     null,
            output:   null,
            smeltProgress: 0,  // ms elapsed on current smelt
            fuelRemaining: 0,  // ms of fuel left
            isActive: false,
        });
    }
    return worldState.furnaceStates.get(_blockKey);
}

function open(blockKey, game) {
    _game = game;
    _blockKey = blockKey;
    const overlay = getOverlay();
    if (!overlay) return;
    overlay.style.display = 'flex';
    renderAll();
    startTick();
    if (document.pointerLockElement) document.exitPointerLock();
}

function close() {
    stopTick();
    const overlay = getOverlay();
    if (overlay) overlay.style.display = 'none';
    _game = null;
    _blockKey = null;
}

function startTick() {
    stopTick();
    let last = performance.now();
    _tickInterval = setInterval(() => {
        const now = performance.now();
        const delta = now - last;
        last = now;
        tickFurnace(delta);
        if (getOverlay()?.style.display === 'flex') renderAll();
    }, 100);
}

function stopTick() {
    if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }
}

function findSmeltRecipe(inputId) {
    return SMELT_RECIPES.find((r) => r.input === inputId) ?? null;
}

function tickFurnace(deltaMs) {
    const fs = getFurnaceState();
    if (!fs) return;

    const recipe = fs.input ? findSmeltRecipe(fs.input.id) : null;

    // Consume fuel if we have a recipe and need fuel
    if (recipe && fs.fuelRemaining <= 0 && fs.fuel) {
        const burnTime = FUEL_MS[fs.fuel.id] ?? 1500;
        fs.fuel.count = (fs.fuel.count ?? 1) - 1;
        if (fs.fuel.count <= 0) fs.fuel = null;
        fs.fuelRemaining = burnTime;
        fs.isActive = true;
    }

    if (fs.fuelRemaining > 0) {
        fs.fuelRemaining = Math.max(0, fs.fuelRemaining - deltaMs);
    } else {
        fs.isActive = false;
    }

    if (recipe && fs.isActive && fs.input) {
        fs.smeltProgress += deltaMs;
        if (fs.smeltProgress >= SMELT_MS) {
            fs.smeltProgress = 0;
            // Produce output
            if (!fs.output) {
                fs.output = { ...recipe.output };
            } else if (fs.output.id === recipe.output.id && (fs.output.count ?? 1) < 99) {
                fs.output.count = (fs.output.count ?? 1) + 1;
            } else {
                // Output full; pause
                return;
            }
            // Consume one input
            fs.input.count = (fs.input.count ?? 1) - 1;
            if (fs.input.count <= 0) fs.input = null;
        }
    } else {
        if (!recipe || !fs.isActive) fs.smeltProgress = 0;
    }
}

function renderAll() {
    const fs = getFurnaceState();
    if (!fs) return;

    renderSlot('furnace-input-slot',  fs.input,  'input');
    renderSlot('furnace-fuel-slot',   fs.fuel,   'fuel');
    renderSlot('furnace-output-slot', fs.output, 'output');

    // Progress bar
    const bar = document.getElementById('furnace-progress-bar');
    if (bar) {
        const recipe = fs.input ? findSmeltRecipe(fs.input.id) : null;
        const pct = (recipe && fs.isActive) ? Math.min(100, (fs.smeltProgress / SMELT_MS) * 100) : 0;
        bar.style.width = `${pct}%`;
        bar.parentElement?.setAttribute('title', recipe ? `Smelting: ${Math.round(pct)}%` : 'No recipe');
    }

    // Flame indicator
    const flame = document.getElementById('furnace-flame');
    if (flame) {
        flame.classList.toggle('active', fs.isActive && fs.fuelRemaining > 0);
    }

    // Player inventory
    renderPlayerInventory();
}

function renderSlot(slotId, item, role) {
    const el = document.getElementById(slotId);
    if (!el) return;
    el.innerHTML = '';
    if (item) el.appendChild(makeItemEl(item));
    el.onclick = () => handleSlotClick(role);
}

function renderPlayerInventory() {
    const mainGrid = document.getElementById('furnace-player-main');
    const hotbarGrid = document.getElementById('furnace-player-hotbar');
    if (!mainGrid || !hotbarGrid || !_game) return;
    mainGrid.innerHTML = '';
    for (let i = 9; i < 36; i++) {
        mainGrid.appendChild(makeInvSlot(i));
    }
    hotbarGrid.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        hotbarGrid.appendChild(makeInvSlot(i));
    }
}

function makeInvSlot(idx) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const item = _game?.gameState?.inventory[idx] ?? null;
    if (item) slot.appendChild(makeItemEl(item));
    slot.addEventListener('click', () => handleInventoryClick(idx));
    return slot;
}

function makeItemEl(item) {
    const el = document.createElement('div');
    el.className = 'item-icon';
    const icon = _game?.hud?.getIconPath?.(item.id) ?? '';
    if (icon) {
        el.style.backgroundImage = `url('${icon}')`;
        el.style.backgroundSize = 'contain';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
    } else {
        el.textContent = String(item.id).slice(0, 2).toUpperCase();
    }
    if ((item.count ?? 1) > 1) {
        const cnt = document.createElement('div');
        cnt.className = 'item-count';
        cnt.textContent = String(item.count);
        el.appendChild(cnt);
    }
    el.title = item.id;
    return el;
}

// Simple click-to-move interaction (no drag)
function handleSlotClick(role) {
    const fs = getFurnaceState();
    if (!fs || !_game) return;

    if (role === 'output') {
        // Move output to player inventory
        if (fs.output) {
            _game.gameState.addItemToInventory(fs.output.id, fs.output.count ?? 1, fs.output.kind ?? 'block');
            fs.output = null;
            window.dispatchEvent(new CustomEvent('inventory-changed'));
            renderAll();
        }
        return;
    }

    // For input/fuel: take item from selected hotbar slot and put in furnace slot
    const selectedItem = _game.gameState.getSelectedItem();
    if (!selectedItem) {
        // Take furnace item back to inventory
        const furnaceItem = role === 'input' ? fs.input : fs.fuel;
        if (furnaceItem) {
            _game.gameState.addItemToInventory(furnaceItem.id, furnaceItem.count ?? 1, furnaceItem.kind ?? 'block');
            if (role === 'input') fs.input = null; else fs.fuel = null;
            window.dispatchEvent(new CustomEvent('inventory-changed'));
        }
        renderAll();
        return;
    }

    if (role === 'input') {
        const recipe = findSmeltRecipe(selectedItem.id);
        if (!recipe) return; // Not smeltable
        if (fs.input && fs.input.id !== selectedItem.id) return; // Different item
        const transfer = selectedItem.count ?? 1;
        if (!fs.input) {
            fs.input = { id: selectedItem.id, count: transfer, kind: selectedItem.kind ?? 'block' };
        } else {
            fs.input.count = (fs.input.count ?? 1) + transfer;
        }
        // Remove from inventory
        const slot = _game.gameState.selectedSlot;
        _game.gameState.inventory[slot] = null;
        window.dispatchEvent(new CustomEvent('inventory-changed'));
    } else if (role === 'fuel') {
        if (!FUEL_MS[selectedItem.id]) return; // Not a valid fuel
        if (fs.fuel && fs.fuel.id !== selectedItem.id) return;
        const transfer = selectedItem.count ?? 1;
        if (!fs.fuel) {
            fs.fuel = { id: selectedItem.id, count: transfer, kind: selectedItem.kind ?? 'block' };
        } else {
            fs.fuel.count = (fs.fuel.count ?? 1) + transfer;
        }
        const slot = _game.gameState.selectedSlot;
        _game.gameState.inventory[slot] = null;
        window.dispatchEvent(new CustomEvent('inventory-changed'));
    }
    renderAll();
}

function handleInventoryClick(idx) {
    // No special logic yet — slot display only
}

window.addEventListener('keydown', (e) => {
    if (getOverlay()?.style.display !== 'flex') return;
    if (e.code === 'KeyE' || e.code === 'Escape') close();
});

registerBlockHandler('furnace', { open, close });
