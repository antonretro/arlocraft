export const crashed_beacon = {
  name: 'Crashed Beacon',
  biomes: ['any'],
  width: 9,
  height: 5,
  depth: 9,
  blueprints: (x, y, z) => {
    const blocks = [];
    // Crater rim
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > 3.2 && d < 4.5) {
          blocks.push({ x: x + dx, y: y - 1, z: z + dz, id: 'stone' });
        }
        if (d < 3.2) {
          blocks.push({ x: x + dx, y: y - 1, z: z + dz, id: 'obsidian' });
        }
      }
    }
    // Broken pillar (beacon remains)
    for (let dy = 0; dy < 3; dy++) {
      blocks.push({ x, y: y + dy, z, id: 'iron' });
    }
    blocks.push({ x, y: y + 3, z, id: 'uranium' });
    // Debris
    for (let i = 0; i < 8; i++) {
      const ox = Math.round(Math.cos(i) * 2);
      const oz = Math.round(Math.sin(i) * 2);
      blocks.push({
        x: x + ox,
        y,
        z: z + oz,
        id: i % 2 === 0 ? 'cobblestone' : 'iron',
      });
    }
    return blocks;
  },
};
