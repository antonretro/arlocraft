export const village_manor = {
    name: 'Grand Manor',
    biomes: ['plains', 'forest', 'meadow'],
    width: 8, height: 8, depth: 8,
    blueprints: (x, y, z) => {
        const blocks = [];
        // Foundation
        for (let dx = -4; dx <= 4; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
                blocks.push({ x: x + dx, y: y, z: z + dz, id: 'cobblestone' });
            }
        }
        // Walls
        for (let dy = 1; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                for (let dz = -3; dz <= 3; dz++) {
                    const isWall = Math.abs(dx) === 4 || Math.abs(dz) === 3;
                    if (isWall) {
                        const isWindow = dy >= 2 && dy <= 3 && (Math.abs(dx) === 2 || Math.abs(dz) === 1);
                        blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: isWindow ? 'glass' : 'oak_planks' });
                    }
                }
            }
        }
        // Flooring & Interior
        for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                blocks.push({ x: x + dx, y: y + 1, z: z + dz, id: 'wool_white' });
            }
        }
        blocks.push({ x: x - 3, y: y + 1, z: z + 2, id: 'crafting_table' });
        blocks.push({ x: x + 3, y: y + 1, z: z + 2, id: 'furnace' });
        
        // Second Floor Roof/Floor
        for (let dx = -5; dx <= 5; dx++) {
            for (let dz = -4; dz <= 4; dz++) {
                blocks.push({ x: x + dx, y: y + 5, z: z + dz, id: 'oak_log' });
            }
        }
        // Peak Roof
        for (let h = 0; h <= 2; h++) {
            for (let dx = -5 + h; dx <= 5 - h; dx++) {
                for (let dz = -4 + h; dz <= 4 - h; dz++) {
                    blocks.push({ x: x + dx, y: y + 6 + h, z: z + dz, id: 'oak_planks' });
                }
            }
        }
        return blocks;
    }
};
