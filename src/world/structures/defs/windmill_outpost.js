export const windmill_outpost = {
    name: 'Old Windmill',
    biomes: ['plains', 'forest'],
    width: 9, height: 10, depth: 9,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                blocks.push({ x: x + dx, y, z: z + dz, id: 'cobblestone' });
            }
        }
        for (let dy = 1; dy <= 6; dy++) {
            blocks.push({ x, y: y + dy, z, id: 'oak_planks' });
        }
        const bladeY = y + 6;
        for (let b = -3; b <= 3; b++) {
            blocks.push({ x: x + b, y: bladeY, z, id: 'oak_planks' });
            blocks.push({ x, y: bladeY, z: z + b, id: 'oak_planks' });
        }
        blocks.push({ x, y: bladeY + 1, z, id: 'lantern' });
        return blocks;
    }
};
