export const igloo = {
    name: 'Frozen Shelter',
    biomes: ['highlands'],
    width: 5, height: 4, depth: 5,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dy = 0; dy < 4; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist > 1.8 && dist < 2.5) {
                        blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'snow_block' });
                    }
                }
            }
        }
        return blocks;
    }
};
