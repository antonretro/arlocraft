export const forest_shrine = {
    name: 'Forest Shrine',
    biomes: ['forest', 'swamp'],
    width: 3, height: 4, depth: 3,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dy = 0; dy < 3; dy++) {
            blocks.push({ x, y: y + dy, z, id: 'wood_willow' });
        }
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                blocks.push({ x: x + dx, y: y + 3, z: z + dz, id: 'leaves_willow' });
            }
        }
        blocks.push({ x, y, z: z + 1, id: 'crafting_table' });
        return blocks;
    }
};
