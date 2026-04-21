import { registerBlockHandler } from '../../engine/BlockHandlerRegistry.js';
import { CraftingSystem } from '../../engine/CraftingSystem.js';

// ── Crafting Table Handler ─────────────────────────────────────────────────
// Opens a full 3x3 crafting UI. The player inventory only gets a 2x2 grid.
// ──────────────────────────────────────────────────────────────────────────

const craftingSystem = new CraftingSystem();

// Shared state for the crafting-table session
let _game = null;
let _grid = new Array(9).fill(null); // 3x3 crafting grid
let _carryItem = null;
let _carryOrigin = null; // { source: 'grid'|'inventory', idx: number }
let _currentMatch = null;

function getOverlay() {
  return document.getElementById('crafting-table-overlay');
}

function open(_blockKey, game) {
  _game = game;
  _grid = new Array(9).fill(null);
  _currentMatch = null;
  _carryItem = null;
  _carryOrigin = null;
  const overlay = getOverlay();
  if (!overlay) return;
  overlay.style.display = 'flex';
  renderAll();

  // Unlock pointer so the player can click
  if (document.pointerLockElement) document.exitPointerLock();
}

function close() {
  // Return grid items to inventory
  if (_game) {
    for (let i = 0; i < 9; i++) {
      if (_grid[i]) {
        _game.gameState.addItemToInventory(
          _grid[i].id,
          _grid[i].count,
          _grid[i].kind ?? 'block'
        );
        _grid[i] = null;
      }
    }
    if (_carryItem) {
      _game.gameState.addItemToInventory(
        _carryItem.id,
        _carryItem.count,
        _carryItem.kind ?? 'block'
      );
      _carryItem = null;
    }
    window.dispatchEvent(new CustomEvent('inventory-changed'));
  }
  const overlay = getOverlay();
  if (overlay) overlay.style.display = 'none';
  _game = null;
}

function checkRecipe() {
  _currentMatch = craftingSystem.match(_grid);
  return _currentMatch?.result ?? null;
}

function renderAll() {
  renderGrid();
  renderResult();
  renderInventory();
}

function renderGrid() {
  const container = document.getElementById('ct-crafting-grid');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    container.appendChild(makeSlot('grid', i, _grid[i]));
  }
}

function renderResult() {
  const slot = document.getElementById('ct-result-slot');
  if (!slot) return;
  slot.innerHTML = '';
  const result = checkRecipe();
  if (result) {
    slot.appendChild(makeItemEl(result));
    slot.title = _currentMatch?.recipeName ?? 'Crafted item';
  }
  slot.onclick = handleResultClick;
}

function renderInventory() {
  const mainGrid = document.getElementById('ct-player-main');
  const hotbarGrid = document.getElementById('ct-player-hotbar');
  if (!mainGrid || !hotbarGrid || !_game) return;

  mainGrid.innerHTML = '';
  for (let i = 9; i < 36; i++) {
    mainGrid.appendChild(
      makeSlot('inventory', i, _game.gameState.inventory[i])
    );
  }
  hotbarGrid.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    hotbarGrid.appendChild(
      makeSlot('inventory', i, _game.gameState.inventory[i])
    );
  }
}

function makeSlot(source, idx, item) {
  const slot = document.createElement('div');
  slot.className = 'slot bh-slot';
  slot.dataset.bhSource = source;
  slot.dataset.bhIdx = String(idx);
  if (item) slot.appendChild(makeItemEl(item));
  slot.addEventListener('pointerdown', (e) => onSlotDown(source, idx, e));
  return slot;
}

function makeItemEl(item) {
  const el = document.createElement('div');
  el.className = 'item-icon';
  el.style.backgroundImage = `url('${resolveIcon(item.id)}')`;
  el.style.backgroundSize = 'contain';
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundPosition = 'center';
  el.textContent = '';
  if ((item.count ?? 1) > 1) {
    const cnt = document.createElement('div');
    cnt.className = 'item-count';
    cnt.textContent = String(item.count);
    el.appendChild(cnt);
  }
  el.title = item.id;
  return el;
}

function resolveIcon(id) {
  // Delegate to the HUD's icon system via a best-effort lookup
  if (_game?.hud?.getIconPath) return _game.hud.getIconPath(id) ?? '';
  return '';
}

function getContainer(source) {
  if (source === 'grid') return _grid;
  return _game?.gameState?.inventory ?? [];
}

function onSlotDown(source, idx, event) {
  if (event.button !== 0 && event.button !== 2) return;
  event.preventDefault();
  const container = getContainer(source);
  const item = container[idx] ?? null;

  if (!_carryItem) {
    if (!item) return;
    if (event.button === 2 && (item.count ?? 1) > 1) {
      const take = Math.ceil((item.count ?? 1) / 2);
      _carryItem = { ...item, count: take };
      item.count -= take;
      if (item.count <= 0) container[idx] = null;
    } else {
      _carryItem = item;
      container[idx] = null;
    }
    _carryOrigin = { source, idx };
  } else {
    // Place carry into this slot
    const slot = container[idx];
    if (!slot) {
      if (event.button === 2) {
        container[idx] = { ..._carryItem, count: 1 };
        _carryItem.count -= 1;
        if (_carryItem.count <= 0) {
          _carryItem = null;
          _carryOrigin = null;
        }
      } else {
        container[idx] = _carryItem;
        _carryItem = null;
        _carryOrigin = null;
      }
    } else if (slot.id === _carryItem.id && slot.kind === _carryItem.kind) {
      const space = 99 - (slot.count ?? 1);
      const put =
        event.button === 2 ? 1 : Math.min(space, _carryItem.count ?? 1);
      slot.count = (slot.count ?? 1) + put;
      _carryItem.count = (_carryItem.count ?? 1) - put;
      if (_carryItem.count <= 0) {
        _carryItem = null;
        _carryOrigin = null;
      }
    } else {
      // Swap
      container[idx] = _carryItem;
      _carryItem = slot;
      _carryOrigin = { source, idx };
    }
  }

  window.dispatchEvent(new CustomEvent('inventory-changed'));
  renderAll();
}

function handleResultClick() {
  const result = checkRecipe();
  if (!result || !_game) return;
  const kind = result.kind ?? 'block';
  const added = _game.gameState.addItemToInventory(
    result.id,
    result.count ?? 1,
    kind
  );
  if (!added) return;
  for (let i = 0; i < 9; i++) {
    if (!_grid[i]) continue;
    _grid[i].count = (_grid[i].count ?? 1) - 1;
    if (_grid[i].count <= 0) _grid[i] = null;
  }
  window.dispatchEvent(new CustomEvent('inventory-changed'));
  renderAll();
}

if (typeof document !== 'undefined') {
  // Global pointer-up to handle drag-drops outside slots
  document.addEventListener('pointerup', (e) => {
    if (!getOverlay()?.style.display || getOverlay().style.display === 'none')
      return;
    if (!_carryItem) return;
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest('.bh-slot[data-bh-source]');
    if (target) return; // handled by slot's own pointerdown
    // Drop carry back to origin
    if (_carryOrigin) {
      const c = getContainer(_carryOrigin.source);
      if (!c[_carryOrigin.idx]) {
        c[_carryOrigin.idx] = _carryItem;
        _carryItem = null;
        _carryOrigin = null;
        window.dispatchEvent(new CustomEvent('inventory-changed'));
        renderAll();
      }
    }
  });

  // Close on E key or Escape
  window.addEventListener('keydown', (e) => {
    if (getOverlay()?.style.display !== 'flex') return;
    if (e.code === 'KeyE' || e.code === 'Escape') close();
  });
}

// Register
registerBlockHandler('crafting_table', { open, close });
