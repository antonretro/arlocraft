export const graveyard_crypt = {
    name: 'Graveyard',
    biomes: ['plains', 'highlands', 'forest'],
    width: 11, height: 6, depth: 9,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dx = -4; dx <= 4; dx++) {
            blocks.push({ x: x + dx, y, z, id: 'path_block' });
        }
        const graves = [[-3, -2], [-1, -2], [1, -2], [3, -2], [-2, 2], [2, 2]];
        for (const [gx, gz] of graves) {
            blocks.push({ x: x + gx, y: y + 1, z: z + gz, id: 'stone' });
            blocks.push({ x: x + gx, y: y + 2, z: z + gz, id: 'stone' });
        }
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = 3; dz <= 5; dz++) {
                blocks.push({ x: x + dx, y: y + 1, z: z + dz, id: 'obsidian' });
            }
        }
        blocks.push({ x, y: y + 2, z: z + 5, id: 'lantern' });
        return blocks;
    }
};
