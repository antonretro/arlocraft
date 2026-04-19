export const blacksmith_forge = {
    name: "Blacksmith's Forge",
    biomes: ['plains', 'highlands', 'forest'],
    width: 7, height: 5, depth: 7,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                blocks.push({ x: x + dx, y, z: z + dz, id: 'cobblestone' });
                if (Math.abs(dx) === 2 || Math.abs(dz) === 2) {
                    blocks.push({ x: x + dx, y: y + 1, z: z + dz, id: 'stone' });
                }
            }
        }
        blocks.push({ x, y: y + 1, z, id: 'furnace' });
        blocks.push({ x: x + 1, y: y + 1, z, id: 'obsidian' });
        blocks.push({ x: x - 1, y: y + 1, z, id: 'lantern' });
        return blocks;
    }
};
