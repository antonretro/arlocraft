export const abandoned_camp = {
    name: 'Abandoned Camp',
    width: 5, height: 2, depth: 5,
    blueprints: (x, y, z) => {
        const blocks = [];
        blocks.push({ x, y, z, id: 'coal' }); // Fire pit mockup
        blocks.push({ x: x + 1, y, z: z + 2, id: 'wool_white' });
        blocks.push({ x: x + 2, y, z: z + 2, id: 'wool_white' });
        blocks.push({ x: x + 1, y: y + 1, z: z + 2, id: 'wool_white' });
        return blocks;
    }
};
