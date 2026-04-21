import { getBlockHandler, registerBlockHandler } from './BlockHandlerRegistry.js';

export class BlockScriptManager {
    constructor(game) {
        this.game = game;
        this.scripts = new Map(); // id -> script module
    }

    async init() {
        // We'll manually register the ones we know about for now
        // In a real system, we'd scan the directories
        const scriptsToLoad = [
            { id: 'oak_sign', path: '../data/block_configs/oak_sign/script.js' },
            { id: 'command_block', path: '../data/block_configs/command_block/script.js' }
        ];

        for (const item of scriptsToLoad) {
            try {
                const module = await import(item.path);
                this.scripts.set(item.id, module);
                
                // Register as a block handler if it has the required methods
                if (module.onInteract) {
                    registerBlockHandler(item.id, {
                        open: (key, game) => {
                            const [x, y, z] = game.world.coords.keyToCoords(key);
                            module.onInteract(game, x, y, z);
                        }
                    });
                }
            } catch (err) {
                console.warn(`[ArloCraft] Failed to load script for ${item.id}:`, err);
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
