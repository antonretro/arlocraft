export const village_hut = {
    name: 'Old Hut',
    biomes: ['plains', 'forest'],
    width: 4, height: 4, depth: 4,
    blueprints: (ox, oy, oz) => {
        const blocks = [];
        const width = 5;
        const depth = 5;
        const height = 4;

        // 1. Foundation & Floor (Cobblestone / Dirt / Path)
        for (let dx = 0; dx < width; dx++) {
            for (let dz = 0; dz < depth; dz++) {
                const isEdge = dx === 0 || dx === width - 1 || dz === 0 || dz === depth - 1;
                blocks.push({ x: ox + dx, y: oy, z: oz + dz, id: isEdge ? 'cobblestone' : 'oak_planks' });
            }
        }

        // 2. Path details around the hut
        for (let dx = -1; dx <= width; dx++) {
            for (let dz = -1; dz <= depth; dz++) {
                if (dx === -1 || dx === width || dz === -1 || dz === depth) {
                    if (Math.random() > 0.4) blocks.push({ x: ox + dx, y: oy, z: oz + dz, id: 'path_block' });
                }
            }
        }

        // 3. Walls and Corners
        for (let dy = 1; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                for (let dz = 0; dz < depth; dz++) {
                    const isCorner = (dx === 0 || dx === width - 1) && (dz === 0 || dz === depth - 1);
                    const isWall = dx === 0 || dx === width - 1 || dz === 0 || dz === depth - 1;
                    
                    if (isCorner) {
                        blocks.push({ x: ox + dx, y: oy + dy, z: oz + dz, id: 'oak_log' });
                    } else if (isWall) {
                        // Door opening (center of front wall dz=0)
                        if (dz === 0 && dx === 2 && dy < 3) continue;
                        
                        // Windows (front wall dy=2)
                        const isFront = dz === 0;
                        if (isFront && (dx === 1 || dx === 3) && dy === 2) {
                            blocks.push({ x: ox + dx, y: oy + dy, z: oz + dz, id: 'glass' });
                        } else {
                            blocks.push({ x: ox + dx, y: oy + dy, z: oz + dz, id: 'oak_planks' });
                        }
                    }
                }
            }
        }

        // 4. Sloped Roof (Layers of slabs and leaves)
        for (let l = 0; l <= 2; l++) {
            const rY = oy + height + l;
            const rSize = l;
            for (let dx = -1 + rSize; dx <= width - rSize; dx++) {
                for (let dz = -1 + rSize; dz <= depth - rSize; dz++) {
                    const isCap = l === 2;
                    blocks.push({ x: ox + dx, y: rY, z: oz + dz, id: isCap ? 'oak_leaves' : 'oak_slab' });
                }
            }
        }

        // 5. Chimney (3 high Cobblestone on the back-left corner)
        blocks.push({ x: ox + 0, y: oy + 4, z: oz + 4, id: 'cobblestone' });
        blocks.push({ x: ox + 0, y: oy + 5, z: oz + 4, id: 'cobblestone' });
        blocks.push({ x: ox + 0, y: oy + 6, z: oz + 4, id: 'cobblestone' });

        // 6. Final Detail (Lantern)
        blocks.push({ x: ox + 2, y: oy + 3, z: oz + 2, id: 'lantern' });

        return blocks;
    }
};
