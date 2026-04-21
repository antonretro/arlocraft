/**
 * Ruined Tower structure definition.
 */
export const ruined_tower = {
  name: 'Ruined Tower',
  width: 5,
  height: 12,
  depth: 5,
  blueprints: (x, y, z) => {
    const hash = (nx, ny, nz) => {
      const v = Math.sin(nx * 12.9898 + ny * 78.233 + nz * 37.719) * 43758.5453;
      return v - Math.floor(v);
    };

    const blocks = [];
    for (let dy = 0; dy < 12; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 1.8 && dist < 2.5) {
            // Ruined effect: deterministic holes
            if (hash(x + dx, y + dy, z + dz) < 0.15 && dy > 2) continue;
            blocks.push({ x: x + dx, y: y + dy, z: z + dz, id: 'stone' });
          }
        }
      }
    }
    return blocks;
  },
};
