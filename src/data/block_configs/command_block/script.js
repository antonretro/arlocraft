export function onInteract(game, x, y, z) {
  const key = game.world.coords.getKey(x, y, z);
  const data = game.world.state.blockData.get(key) || { command: "" };
  
  window.dispatchEvent(new CustomEvent('open-command-editor', { 
    detail: { x, y, z, command: data.command } 
  }));
  return true;
}

export function onRedstoneUpdate(game, x, y, z, power) {
  if (power > 0) {
    const key = game.world.coords.getKey(x, y, z);
    const data = game.world.state.blockData.get(key);
    if (data?.command) {
        game.commandManager?.execute(data.command);
    }
  }
}

export const handlerIds = ['onInteract', 'onRedstoneUpdate'];
