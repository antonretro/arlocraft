export const fishing_dock = {
    name: 'Fishing Dock',
    biomes: ['swamp', 'plains'],
    width: 9, height: 4, depth: 11,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dz = -1; dz <= 5; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                blocks.push({ x: x + dx, y, z: z + dz, id: 'oak_planks' });
            }
            blocks.push({ x: x - 1, y: y - 1, z: z + dz, id: 'oak_log' });
            blocks.push({ x: x + 1, y: y - 1, z: z + dz, id: 'oak_log' });
        }
        blocks.push({ x, y: y + 1, z: z + 5, id: 'lantern' });
        blocks.push({ x, y: y + 1, z: z + 2, id: 'starter_chest' });
        return blocks;
    }
};
