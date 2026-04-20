export const mega_rollercoaster = {
  name: 'Lost Rollercoaster',
  biomes: ['plains', 'forest'],
  width: 31,
  height: 18,
  depth: 31,
  blueprints: (x, y, z) => {
    const blocks = [];
    const baseY = y;

    // Ground perimeter
    for (let dx = -14; dx <= 14; dx++) {
      for (let dz = -14; dz <= 14; dz++) {
        if (Math.abs(dx) === 14 || Math.abs(dz) === 14) {
          blocks.push({ x: x + dx, y: baseY, z: z + dz, id: 'path_block' });
        }
      }
    }

    // Support columns
    const supports = [
      [-12, -12],
      [12, -12],
      [-12, 12],
      [12, 12],
      [0, -12],
      [0, 12],
      [-12, 0],
      [12, 0],
      [-6, -12],
      [6, -12],
      [-6, 12],
      [6, 12],
      [-12, -6],
      [12, -6],
      [-12, 6],
      [12, 6],
    ];
    for (const [sx, sz] of supports) {
      const height = 8 + Math.floor((Math.abs(sx) + Math.abs(sz)) * 0.15);
      for (let dy = 1; dy <= height; dy++) {
        const id = dy % 3 === 0 ? 'oak_log' : 'oak_planks';
        blocks.push({ x: x + sx, y: baseY + dy, z: z + sz, id });
      }
      blocks.push({
        x: x + sx,
        y: baseY + height + 1,
        z: z + sz,
        id: 'sea_lantern',
      });
    }

    // Track loop — plank beam + powered_rail on top
    for (let i = -12; i <= 12; i++) {
      const waveN = Math.floor(3 + Math.sin(i * 0.45) * 3);
      const waveE = Math.floor(3 + Math.sin(i * 0.45) * 3);
      const waveS = Math.floor(3 + Math.sin(-i * 0.45) * 3);
      const waveW = Math.floor(3 + Math.sin(-i * 0.45) * 3);

      // North track
      blocks.push({
        x: x + i,
        y: baseY + 10 + waveN,
        z: z - 12,
        id: 'oak_planks',
      });
      blocks.push({
        x: x + i,
        y: baseY + 10 + waveN + 1,
        z: z - 12,
        id: 'powered_rail',
      });

      // East track
      blocks.push({
        x: x + 12,
        y: baseY + 10 - waveE,
        z: z + i,
        id: 'oak_planks',
      });
      blocks.push({
        x: x + 12,
        y: baseY + 10 - waveE + 1,
        z: z + i,
        id: 'rail',
      });

      // South track
      blocks.push({
        x: x - i,
        y: baseY + 8 + waveS,
        z: z + 12,
        id: 'oak_planks',
      });
      blocks.push({
        x: x - i,
        y: baseY + 8 + waveS + 1,
        z: z + 12,
        id: 'powered_rail',
      });

      // West track
      blocks.push({
        x: x - 12,
        y: baseY + 8 - waveW,
        z: z - i,
        id: 'oak_planks',
      });
      blocks.push({
        x: x - 12,
        y: baseY + 8 - waveW + 1,
        z: z - i,
        id: 'rail',
      });
    }

    // Diagonal cross-supports (X bracing) between corner columns
    const braces = [
      [
        [-12, -12],
        [0, -12],
      ],
      [
        [0, -12],
        [12, -12],
      ],
      [
        [12, -12],
        [12, 0],
      ],
      [
        [12, 0],
        [12, 12],
      ],
      [
        [12, 12],
        [0, 12],
      ],
      [
        [0, 12],
        [-12, 12],
      ],
      [
        [-12, 12],
        [-12, 0],
      ],
      [
        [-12, 0],
        [-12, -12],
      ],
    ];
    for (const [[ax, az], [bx, bz]] of braces) {
      const steps = 6;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const bx2 = Math.round(ax + (bx - ax) * t);
        const bz2 = Math.round(az + (bz - az) * t);
        const by = baseY + 4 + Math.floor(Math.sin(t * Math.PI) * 3);
        blocks.push({ x: x + bx2, y: by, z: z + bz2, id: 'oak_log' });
      }
    }

    // Decorative banners / colored flags along track peaks
    const flagColors = [
      'wool_red',
      'wool_yellow',
      'wool_blue',
      'wool_green',
      'wool_orange',
      'wool_purple',
    ];
    for (let t = -10; t <= 10; t += 4) {
      const fi = Math.abs(t) % flagColors.length;
      const waveN2 = Math.floor(3 + Math.sin(t * 0.45) * 3);
      blocks.push({
        x: x + t,
        y: baseY + 12 + waveN2,
        z: z - 12,
        id: flagColors[fi],
      });
      blocks.push({
        x: x + 12,
        y: baseY + 12 - waveN2,
        z: z + t,
        id: flagColors[(fi + 2) % flagColors.length],
      });
    }

    // Detector rails at key corners for variety
    blocks.push({ x: x - 12, y: baseY + 10, z: z - 12, id: 'detector_rail' });
    blocks.push({ x: x + 12, y: baseY + 10, z: z + 12, id: 'detector_rail' });

    return blocks;
  },
};
