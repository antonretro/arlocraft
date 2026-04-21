import { getBlockHandler, registerBlockHandler } from './BlockHandlerRegistry.js';
import { scriptModules } from '../data/blocks.js';

export class BlockScriptManager {
    constructor(game) {
        this.game = game;
        this.scripts = new Map(); // id -> script module
    }

    async init() {
        // Use the modules already loaded by Vite's import.meta.glob in blocks.js
        for (const [path, module] of Object.entries(scriptModules)) {
            const folderId = path.split('/')[2]; // e.g. oak_sign
            this.scripts.set(folderId, module);
            
            // Register as a block handler if it has the required methods
            if (module.onInteract) {
                registerBlockHandler(folderId, {
                    open: (key, game) => {
                        const [x, y, z] = game.world.coords.keyToCoords(key);
                        module.onInteract(game, x, y, z);
                    }
                });
            }
        }
    }

    onRedstoneUpdate(id, x, y, z, power) {
        const script = this.scripts.get(id);
        if (script?.onRedstoneUpdate) {
            script.onRedstoneUpdate(this.game, x, y, z, power);
        }
    }
}
