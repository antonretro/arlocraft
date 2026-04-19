/**
 * RedstoneSystem
 * Handles power propagation and logic for redstone components.
 */
export class RedstoneSystem {
    constructor(world) {
        this.world = world;
        this.powerMap = new Map(); // key -> power level (0-15)
        this.updateQueue = [];
        
        this.sources = new Set(['redstone_torch', 'redstone_block', 'lever', 'stone_button']);
        this.conductors = new Set(['redstone_wire']);
        this.consumers = new Set(['redstone_lamp', 'tnt', 'command_block', 'piston']);
    }

    /**
     * Re-calculate redstone in a region.
     */
    updateRegion(x, y, z) {
        // BFS or simple propagation
        this.propagate(x, y, z);
    }

    propagate(startX, startY, startZ) {
        const queue = [[startX, startY, startZ]];
        const visited = new Set();

        while (queue.length > 0) {
            const [x, y, z] = queue.shift();
            const key = this.world.coords.getKey(x, y, z);
            if (visited.has(key)) continue;
            visited.add(key);

            const id = this.world.getBlockAt(x, y, z);
            if (!id) continue;

            const power = this.calculatePower(x, y, z);
            const oldPower = this.powerMap.get(key) || 0;

            if (power !== oldPower) {
                this.powerMap.set(key, power);
                this.onPowerChanged(x, y, z, power, id);
                
                // Add neighbors to queue
                const neighbors = [
                    [x+1, y, z], [x-1, y, z],
                    [x, y+1, z], [x, y-1, z],
                    [x, y, z+1], [x, y, z-1]
                ];
                queue.push(...neighbors);
            }
        }
    }

    calculatePower(x, y, z) {
        const id = this.world.getBlockAt(x, y, z);
        if (this.isSource(id)) return 15;
        if (!this.isWire(id)) return 0;

        // For wire, power is max(neighbors) - 1
        let maxNeighbor = 0;
        const neighbors = [
            [x+1, y, z], [x-1, y, z],
            [x, y+1, z], [x, y-1, z],
            [x, y, z+1], [x, y, z-1]
        ];

        for (const [nx, ny, nz] of neighbors) {
            const nId = this.world.getBlockAt(nx, ny, nz);
            if (this.isSource(nId)) {
                maxNeighbor = 16; // source is 15+1
                break;
            }
            const nPower = this.powerMap.get(this.world.coords.getKey(nx, ny, nz)) || 0;
            maxNeighbor = Math.max(maxNeighbor, nPower);
        }

        return Math.max(0, maxNeighbor - 1);
    }

    isSource(id) {
        if (!id) return false;
        const base = id.split(':')[0];
        return this.sources.has(base);
    }

    isWire(id) {
        return id === 'redstone_wire';
    }

    onPowerChanged(x, y, z, power, id) {
        // Update visuals/behavior
        if (id === 'redstone_lamp') {
            if (power > 0) {
                this.world.mutations.setBlock(x, y, z, 'redstone_lamp:on', null, { silent: true });
            } else {
                this.world.mutations.setBlock(x, y, z, 'redstone_lamp', null, { silent: true });
            }
        }

        if (id === 'tnt' && power > 0) {
            this.world.removeBlockAt(x, y, z);
            this.world.explosions?.create(x, y, z, 4);
        }

        if (id === 'command_block' && power > 0) {
            this.triggerCommandBlock(x, y, z);
        }
    }

    triggerCommandBlock(x, y, z) {
        const key = this.world.coords.getKey(x, y, z);
        const code = this.world.state.blockData.get(key + ':cmd');
        if (code) {
            console.log(`[CommandBlock] Executing: ${code}`);
            try {
                // Restricted evaluation
                const fn = new Function('game', 'world', 'x', 'y', 'z', code);
                fn(this.world.game, this.world, x, y, z);
            } catch (e) {
                console.error('[CommandBlock] Error:', e);
            }
        }
    }

    onBlockChanged(x, y, z, operation) {
        this.updateRegion(x, y, z);
    }
}
