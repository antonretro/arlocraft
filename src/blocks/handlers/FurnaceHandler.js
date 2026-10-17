import { registerBlockHandler } from '../../engine/BlockHandlerRegistry.js';
import { createFurnaceState, tickFurnace } from '../../data/smelting.js';
import { resolveItemKind } from '../../data/itemKinds.js';

// ── Furnace Handler ────────────────────────────────────────────────────────
// Input, fuel and output slots keyed by block coordinate in
// world.state.furnaceStates. Furnaces keep smelting while the UI is closed:
// ActionSystem ticks every furnace each frame (see tickAllFurnaces).
// ──────────────────────────────────────────────────────────────────────────

const makeItem = (id, count) => ({ id, count, kind: resolveItemKind(id) });

export function getFurnaceState(world, blockKey) {
  const state = world?.state;
  if (!state || !blockKey) return null;
  if (!state.furnaceStates) state.furnaceStates = new Map();
  if (!state.furnaceStates.has(blockKey)) {
    state.furnaceStates.set(blockKey, createFurnaceState());
  }
  return state.furnaceStates.get(blockKey);
}

export function tickFurnaceAt(world, blockKey, deltaSeconds) {
  const furnace = getFurnaceState(world, blockKey);
  if (furnace) tickFurnace(furnace, deltaSeconds, makeItem);
  return furnace;
}

export function tickAllFurnaces(world, deltaSeconds) {
  const furnaces = world?.state?.furnaceStates;
  if (!furnaces?.size) return;
  for (const furnace of furnaces.values()) {
    tickFurnace(furnace, deltaSeconds, makeItem);
  }
}

function open(blockKey, game) {
  getFurnaceState(game?.world, blockKey);
  game?.gameState?.openContainer('FURNACE', blockKey);
}

function close(game) {
  if (game?.gameState?.isInventoryOpen) game.gameState.toggleInventory();
}

const handler = { open, close };
registerBlockHandler('furnace', handler);
registerBlockHandler('furnace_active', handler);
