export function onInteract(game, x, y, z) {
  const key = game.world.coords.getKey(x, y, z);
  const data = game.world.state.blockData.get(key) || { text: "" };
  
  window.dispatchEvent(new CustomEvent('open-sign-editor', { 
    detail: { x, y, z, text: data.text } 
  }));
  return true;
}

export const handlerIds = ['onInteract'];
