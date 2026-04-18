export const sunken_ship = {
    name: 'Sunken Ship',
    biomes: ['any'],
    underwater: true,
    width: 18, height: 7, depth: 7,
    blueprints: (x, y, z) => {
        const blocks = [];
        const hull = 'oak_planks';
        const beam = 'oak_log';
        const deck = 'spruce_planks';

        // Hull (tilted slightly — one side buried)
        for (let dx = -7; dx <= 7; dx++) {
            const tilt = Math.floor(dx * 0.15);
            // Keel
            blocks.push({ x: x + dx, y: y + tilt, z: z, id: beam });
            // Sides
            for (let dy = 1; dy <= 3; dy++) {
                blocks.push({ x: x + dx, y: y + tilt + dy, z: z - 2, id: hull });
                blocks.push({ x: x + dx, y: y + tilt + dy, z: z + 2, id: hull });
            }
            // Deck (partial collapse in middle)
            if (Math.abs(dx) > 2) {
                blocks.push({ x: x + dx, y: y + tilt + 3, z: z - 1, id: deck });
                blocks.push({ x: x + dx, y: y + tilt + 3, z: z,     id: deck });
                blocks.push({ x: x + dx, y: y + tilt + 3, z: z + 1, id: deck });
            }
        }

        // Mast (snapped)
        for (let dy = 1; dy <= 5; dy++) {
            blocks.push({ x: x, y: y + 3 + dy, z: z, id: beam });
        }
        // Fallen mast piece
        for (let dx = 1; dx <= 4; dx++) {
            blocks.push({ x: x + dx, y: y + 3, z: z, id: beam });
        }

        // Tattered sail (wool)
        for (let dy = 1; dy <= 3; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dy === 2 && dz === 0) continue;
                blocks.push({ x: x, y: y + 5 + dy, z: z + dz, id: 'wool_white' });
            }
        }

        // Cargo — chests replaced with prismarine/gold scattered
        blocks.push({ x: x - 2, y: y + 1, z: z, id: 'prismarine' });
        blocks.push({ x: x + 2, y: y + 1, z: z, id: 'gold' });
        blocks.push({ x: x,     y: y + 1, z: z, id: 'diamond' });
        blocks.push({ x: x - 4, y: y + 1, z: z, id: 'sea_lantern' });

        return blocks;
    }
};
