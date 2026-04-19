export const mine_entrance = {
    name: 'Mine Entrance',
    biomes: ['highlands', 'forest'],
    width: 7, height: 6, depth: 9,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dz = -1; dz <= 3; dz++) {
            blocks.push({ x, y, z: z + dz, id: 'path_block' });
            blocks.push({ x: x - 1, y, z: z + dz, id: 'cobblestone' });
            blocks.push({ x: x + 1, y, z: z + dz, id: 'cobblestone' });
        }
        for (let dy = 1; dy <= 3; dy++) {
            blocks.push({ x: x - 2, y: y + dy, z: z - 1, id: 'cobblestone' });
            blocks.push({ x: x + 2, y: y + dy, z: z - 1, id: 'cobblestone' });
        }
        for (let dx = -2; dx <= 2; dx++) {
            blocks.push({ x: x + dx, y: y + 4, z: z - 1, id: 'stone' });
        }
        blocks.push({ x: x - 1, y: y + 2, z: z, id: 'lantern' });
        blocks.push({ x: x + 1, y: y + 2, z: z, id: 'lantern' });
        return blocks;
    }
};
