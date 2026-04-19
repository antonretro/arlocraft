export const castle = {
    name: 'Anton Castle',
    biomes: ['highlands', 'alpine', 'canyon'],
    width: 15, height: 20, depth: 15,
    blueprints: (x, y, z) => {
        const blocks = [];
        // Base platform
        for (let dx = -7; dx <= 7; dx++) {
            for (let dz = -7; dz <= 7; dz++) {
                blocks.push({ x: x + dx, y, z: z + dz, id: 'stone' });
            }
        }
        // Corner Towers
        const corners = [[-6, -6], [6, -6], [-6, 6], [6, 6]];
        for (const [cx, cz] of corners) {
            for (let dy = 1; dy <= 12; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dz = -2; dz <= 2; dz++) {
                        const dist = Math.sqrt(dx*dx + dz*dz);
                        if (dist > 1.2 && dist < 2.2) {
                            blocks.push({ x: x + cx + dx, y: y + dy, z: z + cz + dz, id: 'stone' });
                        }
                    }
                }
            }
            // Battlements
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    if ((dx + dz) % 2 === 0) {
                        blocks.push({ x: x + cx + dx, y: y + 13, z: z + cz + dz, id: 'stone' });
                    }
                }
            }
        }
        // Main Keep
        for (let dy = 1; dy <= 16; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                for (let dz = -4; dz <= 4; dz++) {
                    const isWall = Math.abs(dx) === 4 || Math.abs(dz) === 4;
                    if (isWall) {
                        blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'stone' });
                    }
                }
            }
        }
        // Keep Roof & Flag (Partial extraction based on file content)
        for (let dx = -5; dx <= 5; dx++) {
            for (let dz = -5; dz <= 5; dz++) {
                blocks.push({ x: x + dx, y: y + 17, z: z + dz, id: 'stone' });
            }
        }
        return blocks;
    }
};
