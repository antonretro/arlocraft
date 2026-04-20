export const void_obelisk = {
  name: 'Void Obelisk',
  width: 1,
  height: 10,
  depth: 1,
  blueprints: (x, y, z) => {
    const blocks = [];
    for (let dy = 0; dy < 10; dy++) {
      blocks.push({ x, y: y + dy, z, id: dy === 9 ? 'amethyst' : 'obsidian' });
    }
    return blocks;
  },
};
