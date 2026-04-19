export const broken_statue = {
    name: 'Broken Statue',
    biomes: ['plains', 'highlands', 'forest'],
    width: 5, height: 8, depth: 5,
    blueprints: (x, y, z) => {
        const blocks = [];
        // Base
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                blocks.push({ x: x + dx, y, z: z + dz, id: 'cobblestone' });
            }
        }
        // Body (rough humanoid silhouette, broken)
        for (let dy = 1; dy <= 4; dy++) {
            blocks.push({ x, y: y + dy, z, id: 'stone' });
            if (dy <= 2) {
                blocks.push({ x: x + 1, y: y + dy, z, id: 'stone' });
                blocks.push({ x: x - 1, y: y + dy, z, id: 'stone' });
            }
        }
        // Head (cracked)
        blocks.push({ x, y: y + 5, z, id: 'stone' });
        blocks.push({ x: x + 1, y: y + 5, z: z, id: 'cobblestone' });
        // Fallen arm
        for (let i = 0; i < 3; i++) {
            blocks.push({ x: x + 2 + i, y: y + 1, z, id: 'stone' });
        }
        return blocks;
    }
};
