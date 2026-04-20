/**
 * Village Hut — redesigned to feel like a real lived-in home.
 * Footprint varies by hash. Biome-variant wall materials.
 * Features: pitched gabled roof, corner posts, windows, interior furniture,
 *           fenced garden with crops, and a gravel path to the door.
 */
export const village_hut = {
  name: 'Village Hut',
  biomes: ['plains', 'forest', 'meadow', 'highlands', 'desert'],
  width: 9,
  height: 8,
  depth: 11,
  blueprints: (ox, oy, oz) => {
    const blocks = [];

    // --- Deterministic hash helpers (no Math.random — seed-stable) ---
    const h1 = Math.abs(Math.sin(ox * 127.1 + oz * 311.7) * 43758.5453) % 1;
    const h2 = Math.abs(Math.sin(ox * 311.7 + oz * 127.1) * 43758.5453) % 1;
    const h3 =
      Math.abs(Math.sin((ox + 73) * 17.1 + (oz - 31) * 91.7) * 43758.5453) % 1;

    // --- Footprint: 5x5, 6x5, or 7x6 ---
    const footprintSizes = [
      [5, 5],
      [6, 5],
      [7, 6],
    ];
    const [W, D] = footprintSizes[Math.floor(h1 * footprintSizes.length)];
    const wallH = 4; // wall height (floors 1–3 above floor)

    // --- Biome wall material (use ox/oz hash to pick) ---
    // We don't have direct biome access here, so pick by hash bands
    // plains/meadow→oak_planks, forest→birch_planks, highlands→stone_bricks, desert→sandstone
    const wallMats = [
      'oak_planks',
      'birch_planks',
      'stone_bricks',
      'sandstone',
      'spruce_planks',
    ];
    const wallId = wallMats[Math.floor(h2 * wallMats.length)];

    // ── 1. Foundation slab (cobblestone perimeter, oak_planks interior) ──
    for (let dx = 0; dx < W; dx++) {
      for (let dz = 0; dz < D; dz++) {
        const isEdge = dx === 0 || dx === W - 1 || dz === 0 || dz === D - 1;
        blocks.push({
          x: ox + dx,
          y: oy,
          z: oz + dz,
          id: isEdge ? 'cobblestone' : 'oak_planks',
        });
      }
    }

    // ── 2. Gravel path leading to the door (front center, dz < 0) ──
    const doorX = Math.floor(W / 2);
    for (let pg = 1; pg <= 4; pg++) {
      blocks.push({ x: ox + doorX, y: oy, z: oz - pg, id: 'gravel' });
      // Widen path at base
      if (pg <= 2) {
        blocks.push({ x: ox + doorX - 1, y: oy, z: oz - pg, id: 'gravel' });
        blocks.push({ x: ox + doorX + 1, y: oy, z: oz - pg, id: 'gravel' });
      }
    }

    // ── 3. Walls (dy 1..wallH-1) ──
    // Corner posts: oak_log. Wall fill: wallId. Windows: glass at dy=2.
    const corners = [
      [0, 0],
      [W - 1, 0],
      [0, D - 1],
      [W - 1, D - 1],
    ];
    const cornerSet = new Set(corners.map(([x, z]) => `${x},${z}`));

    for (let dy = 1; dy < wallH; dy++) {
      for (let dx = 0; dx < W; dx++) {
        for (let dz = 0; dz < D; dz++) {
          const isWall = dx === 0 || dx === W - 1 || dz === 0 || dz === D - 1;
          if (!isWall) continue;

          const isCorner = cornerSet.has(`${dx},${dz}`);
          if (isCorner) {
            blocks.push({ x: ox + dx, y: oy + dy, z: oz + dz, id: 'oak_log' });
            continue;
          }

          // Door opening: front wall, center column, dy 1–2
          if (dz === 0 && dx === doorX && dy <= 2) continue;

          // Windows: front/back walls at dy=2, side walls at dy=2 centered
          const isFront = dz === 0;
          const isBack = dz === D - 1;
          const isSide = dx === 0 || dx === W - 1;
          const windowDy = dy === 2;

          if (windowDy && isFront && (dx === 1 || dx === W - 2)) {
            blocks.push({ x: ox + dx, y: oy + dy, z: oz + dz, id: 'glass' });
          } else if (windowDy && isBack && (dx === 1 || dx === W - 2)) {
            blocks.push({ x: ox + dx, y: oy + dy, z: oz + dz, id: 'glass' });
          } else if (windowDy && isSide && dz === Math.floor(D / 2)) {
            blocks.push({ x: ox + dx, y: oy + dy, z: oz + dz, id: 'glass' });
          } else {
            blocks.push({ x: ox + dx, y: oy + dy, z: oz + dz, id: wallId });
          }
        }
      }
    }

    // Top wall ring (ceiling plate, solid)
    for (let dx = 0; dx < W; dx++) {
      for (let dz = 0; dz < D; dz++) {
        const isWall = dx === 0 || dx === W - 1 || dz === 0 || dz === D - 1;
        if (isWall) {
          blocks.push({ x: ox + dx, y: oy + wallH, z: oz + dz, id: 'oak_log' });
        }
      }
    }

    // ── 4. Gabled / pitched roof using slab layers stepping inward ──
    // Roof starts at oy + wallH + 1, each layer insets by 1
    const roofBase = oy + wallH + 1;
    const roofLayers = Math.floor(Math.min(W, D) / 2) + 1;
    for (let l = 0; l < roofLayers; l++) {
      const rY = roofBase + l;
      for (let dx = -1 + l; dx <= W - l; dx++) {
        for (let dz = -1 + l; dz <= D - l; dz++) {
          const isRidge = l === roofLayers - 1;
          blocks.push({
            x: ox + dx,
            y: rY,
            z: oz + dz,
            id: isRidge ? 'oak_log' : l === 0 ? 'cobblestone' : 'oak_planks',
          });
        }
      }
    }

    // ── 5. Chimney (back-left corner, rises above roof) ──
    const chimneyTopY = roofBase + roofLayers + 1;
    for (let cy = oy + wallH; cy <= chimneyTopY; cy++) {
      blocks.push({ x: ox + 1, y: cy, z: oz + D - 1, id: 'cobblestone' });
    }

    // ── 6. Interior furniture ──
    const iY = oy + 1; // interior y (floor level + 1)
    // Crafting table back-right corner
    blocks.push({ x: ox + W - 2, y: iY, z: oz + D - 2, id: 'crafting_table' });
    // Furnace back-left corner
    blocks.push({ x: ox + 1, y: iY, z: oz + D - 2, id: 'furnace' });
    // Chest mid-left wall
    blocks.push({ x: ox + 1, y: iY, z: oz + 2, id: 'starter_chest' });
    // Bed (two wool blocks: foot and head) center-right
    blocks.push({ x: ox + W - 2, y: iY, z: oz + 2, id: 'wool_white' });
    blocks.push({ x: ox + W - 2, y: iY, z: oz + 3, id: 'wool_red' });
    // Glowstone lamp on ceiling (center)
    blocks.push({
      x: ox + Math.floor(W / 2),
      y: oy + wallH - 1,
      z: oz + Math.floor(D / 2),
      id: 'glowstone',
    });

    // ── 7. Fenced garden patch (right side of house) ──
    const gX = ox + W + 1;
    const gZ = oz;
    const gW = 4;
    const gD = Math.min(D, 5);
    const gY = oy;

    // Garden soil ring
    for (let dx = 0; dx < gW; dx++) {
      for (let dz = 0; dz < gD; dz++) {
        const isEdge = dx === 0 || dx === gW - 1 || dz === 0 || dz === gD - 1;
        if (isEdge) {
          // Fence post using cobblestone as proxy (iron_bars for visual variety)
          blocks.push({ x: gX + dx, y: gY, z: gZ + dz, id: 'cobblestone' });
          blocks.push({ x: gX + dx, y: gY + 1, z: gZ + dz, id: 'iron_bars' });
        } else {
          // Crops: alternate wheat and carrot
          const cropId = (dx + dz) % 2 === 0 ? 'wheat_stage2' : 'carrot_stage2';
          blocks.push({ x: gX + dx, y: gY, z: gZ + dz, id: 'dirt' });
          blocks.push({ x: gX + dx, y: gY + 1, z: gZ + dz, id: cropId });
        }
      }
    }

    return blocks;
  },
};
