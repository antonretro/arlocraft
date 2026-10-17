export const orchard_grove = {
  name: 'Lost Orchard',
  biomes: ['plains', 'forest'],
  width: 13,
  height: 8,
  depth: 13,
  blueprints: (x, y, z) => {
    const blocks = [];
    const trunks = [
      [-4, -4],
      [4, -4],
      [-4, 4],
      [4, 4],
      [0, 0],
    ];
    for (const [tx, tz] of trunks) {
      for (let dy = 0; dy <= 2; dy++) {
        blocks.push({ x: x + tx, y: y + dy, z: z + tz, id: 'oak_log' });
      }
      for (let lx = -1; lx <= 1; lx++) {
        for (let lz = -1; lz <= 1; lz++) {
          blocks.push({
            x: x + tx + lx,
            y: y + 3,
            z: z + tz + lz,
            id: 'oak_leaves',
          });
        }
      }
    }
    for (let px = -5; px <= 5; px++) {
      blocks.push({ x: x + px, y: y - 1, z, id: 'path_block' });
    }
    return blocks;
  },
};
