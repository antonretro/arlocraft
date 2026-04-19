export const monument = {
    name: 'Gold Monument',
    biomes: ['plains', 'highlands'],
    width: 5, height: 5, depth: 5,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                for (let dy = 0; dy < 5; dy++) {
                    if (Math.abs(dx) === 2 && Math.abs(dz) === 2) {
                        blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'gold' });
                    }
                }
            }
        }
        return blocks;
    }
};
