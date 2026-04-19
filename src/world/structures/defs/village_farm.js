export const village_farm = {
    name: 'Village Farm',
    biomes: ['plains', 'meadow', 'forest', 'highlands'],
    width: 13, height: 4, depth: 13,
    clearGround: true,
    blueprints: (ox, oy, oz) => {
        const blocks = [];
        const h1 = Math.abs(Math.sin(ox * 173.3 + oz * 251.9) * 43758.5453) % 1;
        const h2 = Math.abs(Math.sin(ox * 251.9 + oz * 173.3) * 43758.5453) % 1;

        const W = 11, D = 11;
        const cx = Math.floor(W / 2), cz = Math.floor(D / 2);

        // Water source in centre
        blocks.push({ x: ox + cx, y: oy, z: oz + cz, id: 'water' });

        // Farmland plots (4 quadrants around water)
        const plots = [
            { x0: 1, x1: cx - 1, z0: 1, z1: cz - 1 },
            { x0: cx + 1, x1: W - 2, z0: 1, z1: cz - 1 },
            { x0: 1, x1: cx - 1, z0: cz + 1, z1: D - 2 },
            { x0: cx + 1, x1: W - 2, z0: cz + 1, z1: D - 2 }
        ];

        const crops = ['wheat_stage7', 'carrot_stage3', 'potato_stage3', 'wheat_stage7'];

        for (let p = 0; p < 4; p++) {
            const { x0, x1, z0, z1 } = plots[p];
            const crop = crops[p];
            for (let dx = x0; dx <= x1; dx++) {
                for (let dz = z0; dz <= z1; dz++) {
                    blocks.push({ x: ox + dx, y: oy, z: oz + dz, id: 'farmland' });
                    blocks.push({ x: ox + dx, y: oy + 1, z: oz + dz, id: crop });
                }
            }
        }

        // Fence perimeter
        for (let dx = 0; dx < W; dx++) {
            for (let dz = 0; dz < D; dz++) {
                const isEdge = dx === 0 || dx === W - 1 || dz === 0 || dz === D - 1;
                if (!isEdge) continue;
                // Gate gap on south side centre
                if (dz === D - 1 && (dx === cx - 1 || dx === cx || dx === cx + 1)) continue;
                blocks.push({ x: ox + dx, y: oy + 1, z: oz + dz, id: 'oak_fence' });
            }
        }

        // Gravel path from gate inward
        for (let dz = D; dz <= D + 3; dz++) {
            blocks.push({ x: ox + cx, y: oy, z: oz + dz, id: 'gravel' });
        }

        // Hay bales in two corners
        const hayCrns = h1 > 0.5
            ? [[1, 1], [W - 2, D - 2]]
            : [[W - 2, 1], [1, D - 2]];
        for (const [hx, hz] of hayCrns) {
            blocks.push({ x: ox + hx, y: oy + 1, z: oz + hz, id: 'hay_bale' });
        }

        // Scarecrow (oak_log + carved pumpkin) near centre
        const sx = h2 > 0.5 ? cx - 2 : cx + 2;
        blocks.push({ x: ox + sx, y: oy + 1, z: oz + cz, id: 'oak_log' });
        blocks.push({ x: ox + sx, y: oy + 2, z: oz + cz, id: 'carved_pumpkin' });

        return blocks;
    }
};
