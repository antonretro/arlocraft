import { registerBlockHandler } from '../../engine/BlockHandlerRegistry.js';

class CommandBlockHandler {
  constructor() {
    this.activeCoords = null;
  }

  onInteract(game, world, x, y, z) {
    console.log(`[CommandBlock] Interacting at ${x},${y},${z}`);
    this.activeCoords = { x, y, z };

    const overlay = document.getElementById('command-block-overlay');
    const textarea = document.getElementById('cmd-input-area');

    if (!overlay || !textarea) return false;

    // Load existing command
    const key = world.coords.getKey(x, y, z);
    const code = world.state.blockData.get(key + ':cmd') || '';
    textarea.value = code;

    // Show UI
    overlay.style.display = 'flex';
    game.input.unlockPointer();

    // Setup buttons
    const closeBtn = document.getElementById('btn-cmd-close');
    const saveBtn = document.getElementById('btn-cmd-save');

    const close = () => {
      overlay.style.display = 'none';
      game.input.setPointerLock();
    };

    closeBtn.onclick = close;
    saveBtn.onclick = () => {
      const newCode = textarea.value;
      world.state.blockData.set(key + ':cmd', newCode);
      game.notifications?.show('System', 'Command saved!', 'success');
      close();
    };

    return true;
  }

  execute(game, world, x, y, z) {
    const key = world.coords.getKey(x, y, z);
    const code = world.state.blockData.get(key + ':cmd');
    if (!code) return;

    console.log(`[CommandBlock] Executing at ${x},${y},${z}`);
    game.scripts?.execute(code, { pos: { x, y, z } });
  }
}

registerBlockHandler('command_block', new CommandBlockHandler());
