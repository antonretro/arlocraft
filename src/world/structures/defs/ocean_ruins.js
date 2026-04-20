export const ocean_ruins = {
  name: 'Ocean Ruins',
  biomes: ['any'],
  underwater: true,
  width: 12,
  height: 8,
  depth: 12,
  blueprints: (x, y, z) => {
    const blocks = [];

    // Crumbling stone foundation
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        blocks.push({ x: x + dx, y: y, z: z + dz, id: 'cobblestone' });
      }
    }

    // Ruined walls (incomplete, mossy)
    const wallBlocks = [
      'mossy_cobblestone',
      'cobblestone',
      'stone_bricks',
      'mossy_stone_bricks',
      'cracked_stone_bricks',
    ];
    const wallPositions = [
      // North wall
      ...Array.from({ length: 9 }, (_, i) => ({ dx: i - 4, dz: -4 })),
      // South wall (partial)
      ...Array.from({ length: 6 }, (_, i) => ({ dx: i - 4, dz: 4 })),
      // West wall
      ...Array.from({ length: 9 }, (_, i) => ({ dx: -4, dz: i - 4 })),
      // East wall (partial)
      ...Array.from({ length: 5 }, (_, i) => ({ dx: 4, dz: i - 2 })),
    ];

    for (const { dx, dz } of wallPositions) {
      const maxH = 2 + Math.floor(Math.abs(Math.sin(dx * 0.9 + dz * 1.3)) * 4);
      for (let dy = 1; dy <= maxH; dy++) {
        const id =
          wallBlocks[Math.abs((dx * 3 + dz * 7 + dy) % wallBlocks.length)];
        blocks.push({ x: x + dx, y: y + dy, z: z + dz, id });
      }
    }

    // Collapsed pillars
    for (const [px, pz] of [
      [-3, -3],
      [3, -3],
      [-3, 3],
    ]) {
      for (let dy = 1; dy <= 5; dy++) {
        blocks.push({ x: x + px, y: y + dy, z: z + pz, id: 'stone_bricks' });
      }
      // Fallen pillar pieces
      blocks.push({
        x: x + px + 1,
        y: y + 1,
        z: z + pz,
        id: 'cracked_stone_bricks',
      });
      blocks.push({
        x: x + px + 2,
        y: y + 1,
        z: z + pz,
        id: 'mossy_stone_bricks',
      });
    }

    // Scattered treasure
    blocks.push({ x: x, y: y + 1, z: z, id: 'sea_lantern' });
    blocks.push({ x: x + 1, y: y + 1, z: z + 1, id: 'gold' });
    blocks.push({ x: x - 2, y: y + 1, z: z - 1, id: 'lapis_ore' });

    // Coral and sea life on floor
    const coralTypes = [
      'tube_coral_block',
      'brain_coral_block',
      'bubble_coral_block',
      'horn_coral_block',
    ];
    for (let dx = -3; dx <= 3; dx += 2) {
      for (let dz = -3; dz <= 3; dz += 2) {
        if (Math.abs(dx) === 3 && Math.abs(dz) === 3) continue;
        blocks.push({
          x: x + dx,
          y: y + 1,
          z: z + dz,
          id: coralTypes[Math.abs((dx + dz) % coralTypes.length)],
        });
      }
    }

    return blocks;
  },
};
