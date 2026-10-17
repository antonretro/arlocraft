export function onInteract(game, x, y, z) {
  const key = game.world.coords.getKey(x, y, z);
  const data = game.world.state.blockData.get(key) || { command: '' };

  window.dispatchEvent(
    new CustomEvent('open-command-editor', {
      detail: { x, y, z, command: data.command },
    })
  );
  return true;
}

// Redstone triggering is handled by RedstoneEngine -> game.commandBlocks.
export const handlerIds = ['onInteract'];
