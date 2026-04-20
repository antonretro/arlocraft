export const ancient_temple = {
  name: 'Ancient Temple',
  width: 7,
  height: 8,
  depth: 7,
  blueprints: (x, y, z) => {
    const blocks = [];
    // Base
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        blocks.push({ x: x + dx, y: y, z: z + dz, id: 'obsidian' });
      }
    }
    // Pillars
    const pillarPos = [
      [-2, -2],
      [2, -2],
      [-2, 2],
      [2, 2],
    ];
    for (const [px, pz] of pillarPos) {
      for (let dy = 1; dy < 6; dy++) {
        blocks.push({ x: x + px, y: y + dy, z: z + pz, id: 'stone' });
      }
    }
    // Top gem
    blocks.push({ x, y: y + 7, z, id: 'ruby' });
    return blocks;
  },
};
