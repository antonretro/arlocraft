export const desert_pyramid = {
  name: 'Desert Pyramid',
  biomes: ['desert'],
  width: 11,
  height: 6,
  depth: 11,
  blueprints: (x, y, z) => {
    const blocks = [];
    for (let dy = 0; dy < 6; dy++) {
      const size = 5 - dy;
      for (let dx = -size; dx <= size; dx++) {
        for (let dz = -size; dz <= size; dz++) {
          blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'sandstone' });
        }
      }
    }
    return blocks;
  },
};
