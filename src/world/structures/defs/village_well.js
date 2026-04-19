export const village_well = {
    name: 'Dry Well',
    biomes: ['plains', 'forest', 'desert'],
    width: 7, height: 6, depth: 7,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                const ring = Math.abs(dx) === 2 || Math.abs(dz) === 2;
                blocks.push({ x: x + dx, y, z: z + dz, id: ring ? 'cobblestone' : 'water' });
            }
        }
        const posts = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
        for (const [px, pz] of posts) {
            for (let dy = 1; dy <= 3; dy++) {
                blocks.push({ x: x + px, y: y + dy, z: z + pz, id: 'oak_planks' });
            }
        }
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                blocks.push({ x: x + dx, y: y + 4, z: z + dz, id: 'oak_planks' });
            }
        }
        return blocks;
    }
};
