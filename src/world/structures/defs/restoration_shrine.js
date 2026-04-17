export const restoration_shrine = {
    name: 'Restoration Shrine',
    biomes: ['any'],
    width: 7, height: 6, depth: 7,
    blueprints: (x, y, z) => {
        const blocks = [];
        // Platform
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                blocks.push({ x: x + dx, y, z: z + dz, id: 'path_block' });
            }
        }
        // Pillars
        for (const [px, pz] of [[-2,-2],[2,-2],[-2,2],[2,2]]) {
            for (let dy = 1; dy <= 3; dy++) {
                blocks.push({ x: x + px, y: y + dy, z: z + pz, id: 'cobblestone' });
            }
            blocks.push({ x: x + px, y: y + 4, z: z + pz, id: 'lantern' });
        }
        // Central arlo block
        blocks.push({ x, y: y + 1, z, id: 'arlo' });
        blocks.push({ x, y: y + 2, z, id: 'diamond' });
        return blocks;
    }
};
