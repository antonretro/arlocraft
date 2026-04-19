export const collapsed_bunker = {
    name: 'Collapsed Bunker',
    biomes: ['plains', 'highlands', 'desert'],
    width: 11, height: 4, depth: 11,
    blueprints: (x, y, z) => {
        const blocks = [];
        // Crumbling walls
        for (let dx = -4; dx <= 4; dx++) {
            for (let dz = -4; dz <= 4; dz++) {
                const isEdge = Math.abs(dx) === 4 || Math.abs(dz) === 4;
                if (isEdge) {
                    const height = 1 + Math.floor(Math.abs(Math.sin(dx + dz)) * 2);
                    for (let dy = 0; dy <= height; dy++) {
                        blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'cobblestone' });
                    }
                } else if (Math.abs(dx) <= 3 && Math.abs(dz) <= 3) {
                    blocks.push({ x: x + dx, y: y - 1, z: z + dz, id: 'stone' });
                }
            }
        }
        // Loot
        blocks.push({ x: x + 1, y, z: z + 1, id: 'starter_chest' });
        blocks.push({ x: x - 1, y, z: z - 1, id: 'iron' });
        blocks.push({ x, y, z, id: 'furnace' });
        return blocks;
    }
};
