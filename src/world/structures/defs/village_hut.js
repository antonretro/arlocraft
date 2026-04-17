export const village_hut = {
    name: 'Old Hut',
    biomes: ['plains', 'forest'],
    width: 4, height: 4, depth: 4,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dy = 0; dy < 3; dy++) {
            for (let dx = -1; dx <= 2; dx++) {
                for (let dz = -1; dz <= 2; dz++) {
                    const isWall = dx === -1 || dx === 2 || dz === -1 || dz === 2;
                    if (isWall) blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: dy === 0 ? 'stone' : 'oak_log' });
                }
            }
        }
        // Roof
        for (let dx = -2; dx <= 3; dx++) {
            for (let dz = -2; dz <= 3; dz++) {
                blocks.push({ x: x + dx, y: y + 3, z: z + dz, id: 'oak_log' });
            }
        }
        return blocks;
    }
};
