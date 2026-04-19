export const ruined_bridge = {
    name: 'Broken Bridge',
    biomes: ['plains', 'highlands', 'desert', 'swamp'],
    width: 15, height: 4, depth: 5,
    blueprints: (x, y, z) => {
        const blocks = [];
        for (let dx = -7; dx <= 7; dx++) {
            if (dx === -1 || dx === 2 || dx === 5) continue;
            blocks.push({ x: x + dx, y, z: z, id: 'cobblestone' });
            if (Math.abs(dx) % 3 === 0) {
                blocks.push({ x: x + dx, y: y + 1, z: z, id: 'oak_planks' });
            }
        }
        blocks.push({ x: x - 6, y: y + 2, z: z, id: 'lantern' });
        blocks.push({ x: x + 6, y: y + 2, z: z, id: 'lantern' });
        return blocks;
    }
};
