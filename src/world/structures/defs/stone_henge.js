export const stone_henge = {
  name: 'Stone Circle',
  width: 8,
  height: 4,
  depth: 8,
  blueprints: (x, y, z) => {
    const blocks = [];
    const circle = [
      [3, 0],
      [-3, 0],
      [0, 3],
      [0, -3],
    ];
    for (const [cx, cz] of circle) {
      for (let dy = 0; dy < 3; dy++) {
        blocks.push({ x: x + cx, y: y + dy, z: z + cz, id: 'stone' });
      }
    }
    return blocks;
  },
};
