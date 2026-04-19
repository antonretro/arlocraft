export const desert_oasis_shrine = {
    name: 'Oasis Shrine',
    biomes: ['desert'],
    width: 9, height: 6, depth: 9,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
                const border = Math.abs(dx) === 3 || Math.abs(dz) === 3;
                blocks.push({ x: x + dx, y, z: z + dz, id: border ? 'sandstone' : 'water' });
            }
        }
        for (let dy = 1; dy <= 3; dy++) {
            blocks.push({ x: x - 4, y: y + dy, z: z - 4, id: 'wood_palm' });
            blocks.push({ x: x + 4, y: y + dy, z: z + 4, id: 'wood_palm' });
        }
        blocks.push({ x: x - 4, y: y + 4, z: z - 4, id: 'leaves_palm' });
        blocks.push({ x: x + 4, y: y + 4, z: z + 4, id: 'leaves_palm' });
        blocks.push({ x, y: y + 1, z, id: 'lantern' });
        return blocks;
    }
};
