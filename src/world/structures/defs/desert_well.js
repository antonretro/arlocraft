export const desert_well = {
    name: 'Desert Well',
    biomes: ['desert'],
    width: 5, height: 6, depth: 5,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const isCenter = dx === 0 && dz === 0;
                blocks.push({ x: x + dx, y: y, z: z + dz, id: isCenter ? 'water' : 'sandstone' });
            }
        }
        const posts = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (const [px, pz] of posts) {
            for (let dy = 1; dy <= 2; dy++) {
                blocks.push({ x: x + px, y: y + dy, z: z + pz, id: 'sandstone' });
            }
        }
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                blocks.push({ x: x + dx, y: y + 3, z: z + dz, id: 'sandstone' });
            }
        }
        return blocks;
    }
};
