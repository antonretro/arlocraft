import { registerBlockHandler } from '../../../engine/BlockHandlerRegistry.js';

// ── Chest Handler ──────────────────────────────────────────────────────────
// Opens a 9x3 chest inventory + player inventory.
// Each chest is keyed by its block coordinate key and persists in worldState.
// ──────────────────────────────────────────────────────────────────────────

let _game = null;
let _blockKey = null;
let _carryItem = null;
let _carryOrigin = null;

function getOverlay() {
  return document.getElementById('chest-overlay');
}

function getChestInventory() {
  if (!_game || !_blockKey) return null;
  const worldState = _game.world?.state;
  if (!worldState) return null;
  if (!worldState.chestInventories) worldState.chestInventories = new Map();
  if (!worldState.chestInventories.has(_blockKey)) {
    worldState.chestInventories.set(_blockKey, new Array(27).fill(null));
  }
  return worldState.chestInventories.get(_blockKey);
}

function open(blockKey, game) {
  _game = game;
  _blockKey = blockKey;
  _carryItem = null;
  _carryOrigin = null;
  const overlay = getOverlay();
  if (!overlay) return;
  overlay.style.display = 'flex';
  renderAll();
  if (document.pointerLockElement) document.exitPointerLock();
}

function close() {
  returnCarry();
  const overlay = getOverlay();
  if (overlay) overlay.style.display = 'none';
  _game = null;
  _blockKey = null;
}

function returnCarry() {
  if (!_carryItem || !_game) return;
  _game.gameState.addItemToInventory(
    _carryItem.id,
    _carryItem.count,
    _carryItem.kind ?? 'block'
  );
  _carryItem = null;
  _carryOrigin = null;
  window.dispatchEvent(new CustomEvent('inventory-changed'));
}

function renderAll() {
  renderChestGrid();
  renderPlayerInventory();
}

function renderChestGrid() {
  const grid = document.getElementById('chest-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const chest = getChestInventory();
  if (!chest) return;
  for (let i = 0; i < 27; i++) {
    grid.appendChild(makeSlot('chest', i, chest[i]));
  }
}

function renderPlayerInventory() {
  const mainGrid = document.getElementById('chest-player-main');
  const hotbarGrid = document.getElementById('chest-player-hotbar');
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

function getContainer(source) {
  if (source === 'chest') return getChestInventory() ?? [];
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
    } else if (
      slot.id === _carryItem.id &&
      slot.kind === _carryItem.kind &&
      (slot.count ?? 1) < 99
    ) {
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
      container[idx] = _carryItem;
      _carryItem = slot;
      _carryOrigin = { source, idx };
    }
  }

  window.dispatchEvent(new CustomEvent('inventory-changed'));
  renderAll();
}

document.addEventListener('pointerup', (e) => {
  if (getOverlay()?.style.display !== 'flex') return;
  if (!_carryItem) return;
  const target = document
    .elementFromPoint(e.clientX, e.clientY)
    ?.closest('.bh-slot[data-bh-source]');
  if (target) return;
  returnCarry();
  renderAll();
});

window.addEventListener('keydown', (e) => {
  if (getOverlay()?.style.display !== 'flex') return;
  if (e.code === 'KeyE' || e.code === 'Escape') close();
});

const handler = { open, close };
registerBlockHandler('chest', handler);
registerBlockHandler('starter_chest', handler);
