export const mega_rollercoaster = {
    name: 'Lost Rollercoaster',
    biomes: ['plains', 'forest'],
    width: 31, height: 18, depth: 31,
    blueprints: (x, y, z) => {
        const blocks = [];
        const baseY = y;

        for (let dx = -14; dx <= 14; dx++) {
            for (let dz = -14; dz <= 14; dz++) {
                if (Math.abs(dx) === 14 || Math.abs(dz) === 14) {
                    blocks.push({ x: x + dx, y: baseY, z: z + dz, id: 'path_block' });
                }
            }
        }

        const supports = [
            [-12, -12], [12, -12], [-12, 12], [12, 12],
            [0, -12], [0, 12], [-12, 0], [12, 0]
        ];
        for (const [sx, sz] of supports) {
            const height = 8 + Math.floor((Math.abs(sx) + Math.abs(sz)) * 0.2);
            for (let dy = 1; dy <= height; dy++) {
                blocks.push({ x: x + sx, y: baseY + dy, z: z + sz, id: 'oak_planks' });
            }
            blocks.push({ x: x + sx, y: baseY + height + 1, z: z + sz, id: 'lantern' });
        }

        for (let i = -12; i <= 12; i++) {
            const wave = Math.floor(3 + (Math.sin(i * 0.45) * 3));
            blocks.push({ x: x + i, y: baseY + 10 + wave, z: z - 12, id: 'oak_planks' });
            blocks.push({ x: x + 12, y: baseY + 10 - wave, z: z + i, id: 'oak_planks' });
            blocks.push({ x: x - i, y: baseY + 8 + wave, z: z + 12, id: 'oak_planks' });
            blocks.push({ x: x - 12, y: baseY + 8 - wave, z: z - i, id: 'oak_planks' });
        }

        for (let t = -10; t <= 10; t += 5) {
            blocks.push({ x: x + t, y: baseY + 13, z: z - 12, id: 'wool_red' });
            blocks.push({ x: x + 12, y: baseY + 13, z: z + t, id: 'wool_yellow' });
            blocks.push({ x: x - t, y: baseY + 11, z: z + 12, id: 'wool_blue' });
            blocks.push({ x: x - 12, y: baseY + 11, z: z - t, id: 'wool_green' });
        }

        return blocks;
    }
};
