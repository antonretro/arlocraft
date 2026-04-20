export class MiniMap {
  constructor(game) {
    this.game = game;
    this.container = document.getElementById('minimap');
    this.canvas = document.getElementById('minimap-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.visible = true;
    this.accumulator = 0;
    this.radius = 24;
    this.cells = 34;

    this.colors = {
      grass_block: '#5c914d',
      dirt: '#6b5138',
      stone: '#636c75',
      sand: '#bdae76',
      water: '#3459a8',
      wood: '#75573a',
      leaves: '#32713c',
      iron: '#a1a1a8',
      gold: '#d4bb3d',
      diamond: '#5dc8bf',
      coal: '#3a3d45',
      copper: '#b27443',
      tin: '#aab4bd',
      silver: '#ced7e0',
      ruby: '#cb2952',
      sapphire: '#366ce9',
      amethyst: '#8652d8',
      uranium: '#6af44c',
      platinum: '#bad6ea',
      mythril: '#4de4f0',
      virus: '#914cbc',
      arlo: '#e095ab',
      crafting_table: '#94724b',
      brick: '#a6543f',
      obsidian: '#2d283e',
      bedrock: '#1f1f1f',
      snow_block: '#d9ecff',
      sandstone: '#cbbd8f',
    };

    if (this.container) this.container.style.display = 'block';
  }

  toggle() {
    this.visible = !this.visible;
    if (this.container) {
      this.container.style.display = this.visible ? 'block' : 'none';
    }
  }

  getColorForBlock(id) {
    return this.colors[id] ?? '#5b6570';
  }

  update(delta, playerPos, yaw) {
    if (!this.visible || !this.ctx || !playerPos || !this.game.world) return;

    const quality = this.game?.qualityTier ?? 'balanced';
    const updateInterval =
      quality === 'low' ? 0.33 : quality === 'balanced' ? 0.24 : 0.18;
    const cells =
      quality === 'low' ? 24 : quality === 'balanced' ? 30 : this.cells;

    this.accumulator += delta;
    if (this.accumulator < updateInterval) return;
    this.accumulator = 0;

    const ctx = this.ctx;
    const size = this.canvas.width;
    const cellSize = size / cells;
    const startX = Math.floor(playerPos.x - this.radius);
    const startZ = Math.floor(playerPos.z - this.radius);

    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, size, size);

    for (let z = 0; z < cells; z++) {
      for (let x = 0; x < cells; x++) {
        const wx = startX + x;
        const wz = startZ + z;
        const topId = this.game.world.getTopBlockIdAt(wx, wz);
        ctx.fillStyle = this.getColorForBlock(topId);
        ctx.fillRect(
          x * cellSize,
          z * cellSize,
          Math.ceil(cellSize),
          Math.ceil(cellSize)
        );
      }
    }

    const c = size / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Compass cardinal labels (rotate with yaw)
    const cardinals = [
      { label: 'N', a: 0, color: '#ff4a4a' },
      { label: 'E', a: Math.PI / 2, color: 'rgba(255,255,255,0.85)' },
      { label: 'S', a: Math.PI, color: 'rgba(255,255,255,0.85)' },
      { label: 'W', a: -Math.PI / 2, color: 'rgba(255,255,255,0.85)' },
    ];
    ctx.font = 'bold 11px monospace';
    for (const { label, a, color } of cardinals) {
      const rot = a - yaw;
      const r = c - 9;
      const lx = c + Math.sin(rot) * r;
      const ly = c - Math.cos(rot) * r;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(label, lx - 4 + 1, ly + 4 + 1);
      ctx.fillStyle = color;
      ctx.fillText(label, lx - 4, ly + 4);
    }

    // Draw landmark labels
    const landmarks = this.game.world?.getLandmarksNear?.(
      playerPos.x,
      playerPos.z,
      this.radius + 8
    );
    if (landmarks?.length) {
      ctx.font = 'bold 7px sans-serif';
      for (const lm of landmarks) {
        const lx = ((lm.x - startX) / (this.radius * 2)) * size;
        const lz = ((lm.z - startZ) / (this.radius * 2)) * size;
        if (lx < 4 || lx > size - 4 || lz < 4 || lz > size - 4) continue;
        // Dot
        ctx.fillStyle = lm.restored ? '#7cff9c' : '#ffe87a';
        ctx.beginPath();
        ctx.arc(lx, lz, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Label with shadow
        const baseLabel =
          lm.name.length > 14 ? lm.name.slice(0, 13) + '...' : lm.name;
        const label = lm.restored ? `+ ${baseLabel}` : baseLabel;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillText(label, lx + 5 + 1, lz + 1);
        ctx.fillStyle = lm.restored ? '#7cff9c' : '#ffe87a';
        ctx.fillText(label, lx + 5, lz);
      }
    }
  }
}
