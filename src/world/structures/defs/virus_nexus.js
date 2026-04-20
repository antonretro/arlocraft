export const virus_nexus = {
  name: 'Virus Nexus',
  biomes: ['any'],
  width: 7,
  height: 8,
  depth: 7,
  blueprints: (x, y, z) => {
    const blocks = [];
    // Corrupted spire
    for (let dy = 0; dy < 7; dy++) {
      blocks.push({ x, y: y + dy, z, id: 'virus' });
      if (dy < 3) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            blocks.push({
              x: x + dx,
              y: y + dy,
              z: z + dz,
              id: dy === 0 ? 'obsidian' : 'virus',
            });
          }
        }
      }
    }
    blocks.push({ x, y: y + 7, z, id: 'amethyst' });
    return blocks;
  },
};
