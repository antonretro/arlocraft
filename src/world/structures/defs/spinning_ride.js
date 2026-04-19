export const spinning_ride = {
    name: 'Carnival Ride',
    biomes: ['plains', 'forest', 'desert'],
    width: 17, height: 12, depth: 17,
    blueprints: (x, y, z) => {
        const blocks = [];
        const baseY = y;

        for (let dx = -7; dx <= 7; dx++) {
            for (let dz = -7; dz <= 7; dz++) {
                const ring = Math.abs(dx) === 7 || Math.abs(dz) === 7;
                blocks.push({ x: x + dx, y: baseY, z: z + dz, id: ring ? 'cobblestone' : 'path_block' });
            }
        }

        for (let dy = 1; dy <= 8; dy++) {
            blocks.push({ x, y: baseY + dy, z, id: 'oak_planks' });
        }
        blocks.push({ x, y: baseY + 9, z, id: 'lantern' });

        for (let arm = 0; arm < 8; arm++) {
            const ang = (arm / 8) * Math.PI * 2;
            const rx = Math.round(Math.cos(ang) * 5);
            const rz = Math.round(Math.sin(ang) * 5);
            blocks.push({ x: x + rx, y: baseY + 7, z: z + rz, id: 'oak_planks' });
            blocks.push({ x: x + rx, y: baseY + 6, z: z + rz, id: 'wool_magenta' });
            blocks.push({ x: x + rx, y: baseY + 5, z: z + rz, id: 'lantern' });
        }

        for (let dx = -5; dx <= 5; dx++) {
            blocks.push({ x: x + dx, y: baseY + 7, z, id: 'oak_planks' });
            blocks.push({ x, y: baseY + 7, z: z + dx, id: 'oak_planks' });
        }

        return blocks;
    }
};
