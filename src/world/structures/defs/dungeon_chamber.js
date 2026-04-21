/**
 * Ancient Dungeon Chamber definition.
 * Mossy cobblestone, cracked bricks, and a spawner.
 */
export const dungeon_chamber = {
  name: 'Ancient Dungeon',
  width: 9,
  height: 6,
  depth: 9,
  blueprints: (ox, oy, oz) => {
    const blocks = [];
    const hash = (x, y, z) => {
      const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      return v - Math.floor(v);
    };

    const W = 9;
    const H = 5;
    const D = 9;

    for (let dy = 0; dy <= H; dy++) {
      for (let dx = 0; dx < W; dx++) {
        for (let dz = 0; dz < D; dz++) {
          const isFloor = dy === 0;
          const isCeiling = dy === H;
          const isWall = dx === 0 || dx === W - 1 || dz === 0 || dz === D - 1;

          if (isFloor || isCeiling || isWall) {
            const r = hash(ox + dx, oy + dy, oz + dz);
            let id = 'cobblestone';
            if (r < 0.3) id = 'mossy_cobblestone';
            else if (r < 0.5) id = 'cracked_stone_bricks';
            
            blocks.push({ x: ox + dx, y: oy + dy, z: oz + dz, id });
          }
        }
      }
    }

    // Interior: Spawner in center, chests in corners
    const centerX = Math.floor(W / 2);
    const centerD = Math.floor(D / 2);
    blocks.push({ x: ox + centerX, y: oy + 1, z: oz + centerD, id: 'spawner' });

    // Chests
    if (hash(ox, oy, oz) > 0.5) {
       blocks.push({ x: ox + 1, y: oy + 1, z: oz + 1, id: 'chest' });
    }
    if (hash(ox + 10, oy, oz - 10) > 0.5) {
       blocks.push({ x: ox + W - 2, y: oy + 1, z: oz + D - 2, id: 'chest' });
    }

    return blocks;
  },
};
