export const desert_hut = {
  name: 'Desert Hut',
  biomes: ['desert'],
  width: 5,
  height: 4,
  depth: 5,
  blueprints: (x, y, z) => {
    const blocks = [];
    // Foundation & Walls
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy <= 3; dy++) {
          const isEdge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          if (isEdge) {
            // Door
            if (dx === 0 && dz === -2 && (dy === 0 || dy === 1)) continue;
            // Window
            if (Math.abs(dx) === 2 && dz === 0 && dy === 1) continue;
            blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'sandstone' });
          }
        }
      }
    }
    // Flat Roof
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        blocks.push({ x: x + dx, y: y + 3, z: z + dz, id: 'sandstone' });
      }
    }
    // Interior items
    blocks.push({ x: x + 1, y, z: z + 1, id: 'chest' });
    blocks.push({ x: x - 1, y, z: z + 1, id: 'crafting_table' });
    return blocks;
  },
};
