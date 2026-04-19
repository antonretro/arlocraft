export const castle_wall = {
    name: 'Castle Wall',
    biomes: ['plains', 'forest', 'meadow', 'highlands'],
    width: 9, height: 6, depth: 3,
    blueprints: (x, y, z, orientation = 'x') => {
        const blocks = [];
        const length = 9;
        const width = 3;
        const height = 5;

        for (let dl = -4; dl <= 4; dl++) {
            for (let dw = -1; dw <= 1; dw++) {
                for (let dy = 0; dy < height; dy++) {
                    const blockX = orientation === 'x' ? x + dl : x + dw;
                    const blockZ = orientation === 'x' ? z + dw : z + dl;
                    
                    const isOuter = orientation === 'x' ? Math.abs(dw) === 1 : Math.abs(dw) === 1;
                    const id = isOuter ? 'stone' : 'cobblestone';
                    
                    blocks.push({ x: blockX, y: y + dy, z: blockZ, id });
                }
                
                // Crenellations (Battles)
                if (Math.abs(dl) % 2 === 0) {
                    const blockX = orientation === 'x' ? x + dl : x + dw;
                    const blockZ = orientation === 'x' ? z + dw : z + dl;
                    const isOuter = Math.abs(dw) === 1;
                    if (isOuter) {
                        blocks.push({ x: blockX, y: y + height, z: blockZ, id: 'stone' });
                    }
                }
            }
        }
        return blocks;
    }
};
