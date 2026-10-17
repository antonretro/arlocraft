import { registerBlockHandler } from '../../engine/BlockHandlerRegistry.js';
import { rollLoot } from '../../data/LootTables.js';
import { resolveItemKind } from '../../data/itemKinds.js';

// ── Chest Handler ──────────────────────────────────────────────────────────
// Opens the inventory screen in CHEST mode: a 27-slot chest above the player
// inventory. Contents are keyed by block coordinate in
// world.state.chestInventories and saved with the world. Generated chests
// roll loot the first time they are opened ("chest:<table>" picks the
// table); chests the player placed (tracked in changedBlocks) start empty.
// ──────────────────────────────────────────────────────────────────────────

export const CHEST_SLOTS = 27;

export function getChestInventory(world, blockKey) {
  const state = world?.state;
  if (!state || !blockKey) return null;
  if (!state.chestInventories) state.chestInventories = new Map();

  if (!state.chestInventories.has(blockKey)) {
    const inv = new Array(CHEST_SLOTS).fill(null);
    const coords = world.keyToCoords?.(blockKey);
    const fullId = (coords && world.getBlockAt?.(...coords)) || 'chest';
    const placedByPlayer = state.changedBlocks?.get(blockKey) != null;
    const tag = fullId.includes(':') ? fullId.split(':')[1] : null;
    const lootTable = placedByPlayer ? null : tag || 'common_village';
    if (lootTable) {
      rollLoot(lootTable, 6).forEach((item, i) => {
        inv[i] = {
          id: item.id,
          count: item.count,
          kind: resolveItemKind(item.id),
        };
      });
    }
    state.chestInventories.set(blockKey, inv);
  }
  return state.chestInventories.get(blockKey);
}

function open(blockKey, game) {
  getChestInventory(game?.world, blockKey);
  game?.gameState?.openContainer('CHEST', blockKey);
}

function close(game) {
  if (game?.gameState?.isInventoryOpen) game.gameState.toggleInventory();
}

const handler = { open, close };
registerBlockHandler('chest', handler);
registerBlockHandler('starter_chest', handler);
registerBlockHandler('barrel', handler);
