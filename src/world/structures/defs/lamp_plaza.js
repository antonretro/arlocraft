export const lamp_plaza = {
    name: 'Lamp Plaza',
    biomes: ['plains', 'forest', 'highlands'],
    width: 11, height: 6, depth: 11,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dx = -4; dx <= 4; dx++) {
            for (let dz = -4; dz <= 4; dz++) {
                const isBorder = Math.abs(dx) === 4 || Math.abs(dz) === 4;
                blocks.push({ x: x + dx, y, z: z + dz, id: isBorder ? 'cobblestone' : 'path_block' });
            }
        }
        const lamps = [[-3, -3], [3, -3], [-3, 3], [3, 3]];
        for (const [lx, lz] of lamps) {
            for (let dy = 1; dy <= 3; dy++) {
                blocks.push({ x: x + lx, y: y + dy, z: z + lz, id: 'oak_planks' });
            }
            blocks.push({ x: x + lx, y: y + 4, z: z + lz, id: 'lantern' });
        }
        blocks.push({ x, y: y + 1, z, id: 'crafting_table' });
        return blocks;
    }
};
