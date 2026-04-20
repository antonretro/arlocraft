export const corrupted_lab = {
  name: 'Corrupted Lab',
  biomes: ['any'],
  width: 9,
  height: 5,
  depth: 9,
  blueprints: (x, y, z) => {
    const blocks = [];
    // Walls (partially collapsed)
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const isWall = Math.abs(dx) === 3 || Math.abs(dz) === 3;
        blocks.push({ x: x + dx, y, z: z + dz, id: 'stone' });
        if (isWall) {
          const wallHeight = (Math.abs(dx * dz) % 3) + 1;
          for (let dy = 1; dy <= wallHeight; dy++) {
            blocks.push({
              x: x + dx,
              y: y + dy,
              z: z + dz,
              id: dy === wallHeight ? 'glass' : 'iron',
            });
          }
        }
      }
    }
    // Interior virus contamination
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        blocks.push({
          x: x + dx,
          y: y + 1,
          z: z + dz,
          id: dx === 0 && dz === 0 ? 'virus' : 'obsidian',
        });
      }
    }
    blocks.push({ x: x + 2, y: y + 1, z: z + 2, id: 'uranium' });
    return blocks; // FIXED: Added missing return
  },
};
