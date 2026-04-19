export const market_stall = {
    name: 'Market Ruins',
    biomes: ['plains', 'forest'],
    width: 7, height: 5, depth: 5,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                blocks.push({ x: x + dx, y, z: z + dz, id: 'path_block' });
            }
        }
        const posts = [[-2, -1], [2, -1], [-2, 1], [2, 1]];
        for (const [px, pz] of posts) {
            blocks.push({ x: x + px, y: y + 1, z: z + pz, id: 'oak_planks' });
            blocks.push({ x: x + px, y: y + 2, z: z + pz, id: 'oak_planks' });
            blocks.push({ x: x + px, y: y + 3, z: z + pz, id: 'lantern' });
        }
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                blocks.push({ x: x + dx, y: y + 3, z: z + dz, id: 'wool_red' });
            }
        }
        blocks.push({ x, y: y + 1, z, id: 'starter_chest' });
        return blocks;
    }
};
