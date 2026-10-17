import { registerBlockHandler } from '../../engine/BlockHandlerRegistry.js';

// ── Crafting Table Handler ─────────────────────────────────────────────────
// Opens the inventory screen in WORKSHOP mode (3x3 crafting grid). The
// player inventory on its own only gets the 2x2 grid.
// ──────────────────────────────────────────────────────────────────────────

function open(_blockKey, game) {
  game?.gameState?.openContainer('WORKSHOP');
  game?.audio?.play?.('crafting-open');
}

function close(game) {
  if (game?.gameState?.isInventoryOpen) game.gameState.toggleInventory();
}

registerBlockHandler('crafting_table', { open, close });
