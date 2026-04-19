export const wizard_tower = {
    name: 'Sorcerer Tower',
    biomes: ['highlands', 'forest'],
    width: 7, height: 12, depth: 7,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dy = 0; dy < 10; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const ring = Math.abs(dx) === 2 || Math.abs(dz) === 2;
                    if (!ring) continue;
                    blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'stone' });
                }
            }
        }
        for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
                if (Math.abs(dx) + Math.abs(dz) > 5) continue;
                blocks.push({ x: x + dx, y: y + 10, z: z + dz, id: 'obsidian' });
            }
        }
        blocks.push({ x, y: y + 11, z, id: 'amethyst' });
        return blocks;
    }
};
