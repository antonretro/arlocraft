export class HUDCore {
  constructor(gameState, game = null) {
    this.gameState = gameState;
    this.game = game;
    this.faceResetTimer = null;
    this.refs = {};
  }

  cacheRefs() {
    this.refs.hpBar = document.getElementById('hp-bar');
    this.refs.foodBar = document.getElementById('food-bar');
    this.refs.xpBar = document.getElementById('xp-bar');
    this.refs.modeIndicator = document.getElementById('gamemode-indicator');
    this.refs.modePill = document.getElementById('mode-pill');
    this.refs.timePill = document.getElementById('world-time-pill');
    this.refs.biomePill = document.getElementById('biome-pill');
    this.refs.coordsDisplay = document.getElementById('coords-display');
    this.refs.minimapContext = document.getElementById('minimap-context');
    this.refs.statsMini = document.getElementById('ni-stats-mini');
    this.refs.actionPrompt = document.getElementById('action-prompt');
    this.refs.faceImage = document.getElementById('anton-face-image');
    this.refs.previewImage = document.getElementById('anton-preview-img');
    this.ensureActionPrompt();
  }

  ensureActionPrompt() {
    if (this.refs.actionPrompt) return;
    const el = document.createElement('div');
    el.id = 'action-prompt';
    document.body.appendChild(el);
    this.refs.actionPrompt = el;
  }

  init() {
    this.cacheRefs();
    this.updateHP(this.gameState.hp);
    this.updateFood(this.gameState.hunger);
    this.updateMode(this.gameState.mode);
    this.updateXPBar(0, 100);
    // loadSkinFace removed from init (delayed until title screen)

    window.addEventListener('mode-changed', (event) =>
      this.updateMode(event.detail)
    );
    window.addEventListener('hp-changed', (event) => {
      this.updateHP(event.detail);
      this.setFace('sad', 1200);
    });
    window.addEventListener('hunger-changed', (event) =>
      this.updateFood(event.detail)
    );
    window.addEventListener('xp-changed', (event) => {
      this.updateXPBar(event.detail?.xp ?? 0, event.detail?.max ?? 100);
    });
    window.addEventListener('action-prompt', (event) => {
      this.showActionPrompt(event.detail);
      this.setFace('surprised', 1800);
    });
    window.addEventListener('action-success', () =>
      this.flashPrompt('SYNC SUCCESS', '#b7ff83')
    );
    window.addEventListener('action-fail', () =>
      this.flashPrompt('SYNC FAILED', '#ff8585')
    );
    window.addEventListener('block-mined', (event) =>
      this.onBlockMined(event.detail)
    );
    window.addEventListener('mining-progress', (event) =>
      this.updateMiningProgress(event.detail)
    );
  }

  setEmotion(mood, reset = 0) {
    this.setFace(mood, reset);
  }

  setFace(mood, reset = 0) {
    const img = this.refs.faceImage;
    if (!img) return;

    const faces = {
      happy: 'faces/anton_happy.png',
      sad: 'faces/anton_sad.png',
      surprised: 'faces/anton_surprised.png',
      mad: 'faces/anton_mad.png',
    };

    const faceUrl = faces[mood] ?? faces.happy;
    img.src = faceUrl;
    if (this.refs.previewImage) this.refs.previewImage.src = faceUrl;

    if (this.faceResetTimer) {
      clearTimeout(this.faceResetTimer);
      this.faceResetTimer = null;
    }

    if (reset > 0) {
      this.faceResetTimer = setTimeout(() => this.setFace('happy'), reset);
    }
  }

  loadSkinFace(username = null) {
    const img = this.refs.faceImage;
    if (!img) return;

    const skinUrl = username
      ? `https://minotar.net/skin/${username}`
      : 'https://minotar.net/helm/MHF_Steve/128.png';

    const skinImg = new Image();
    skinImg.crossOrigin = 'anonymous';
    skinImg.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(skinImg, 8, 8, 8, 8, 0, 0, 8, 8);
      img.src = canvas.toDataURL();
    };
    skinImg.onerror = () => {
      if (skinUrl !== '/assets/steve.png') this.loadSkinFace(null);
    };
    skinImg.src = skinUrl;
  }

  /**
   * Manually trigger the high-res skin face loading.
   * Delayed to title screen to improve boot presentation.
   */
  loadFaceData() {
    if (this._faceDataLoaded) return;
    this.loadSkinFace();
    this._faceDataLoaded = true;
  }

  getFacingLabel(yaw) {
    const pi = Math.PI;
    const angle = ((yaw % (2 * pi)) + 2 * pi) % (2 * pi);
    if (angle >= (7 * pi) / 4 || angle < pi / 4) return 'North';
    if (angle < (3 * pi) / 4) return 'West';
    if (angle < (5 * pi) / 4) return 'South';
    return 'East';
  }

  getWorldTimeLabel(timeOfDay = 0) {
    const t = ((Number(timeOfDay) % 1) + 1) % 1;
    if (t < 0.2 || t >= 0.85) return 'MIDNIGHT';
    if (t < 0.32) return 'DAWN';
    if (t < 0.68) return 'DAY';
    return 'DUSK';
  }

  formatBiomeLabel(id) {
    return String(id || 'plains')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  updateCoordinates(position, yaw = 0, world = null) {
    const el = this.refs.coordsDisplay;
    if (!el || !position) return;

    const bx = Math.floor(position.x + 0.5);
    const by = Math.floor(position.y);
    const bz = Math.floor(position.z + 0.5);
    const cx = world?.getChunkCoord?.(position.x) ?? 0;
    const cz = world?.getChunkCoord?.(position.z) ?? 0;
    const biome = world?.getBiomeIdAt?.(position.x, position.z) ?? 'plains';
    const facing = this.getFacingLabel(yaw);
    const biomeLabel = this.formatBiomeLabel(biome);
    const mode = this.gameState?.mode ?? 'SURVIVAL';
    const worldTime = this.getWorldTimeLabel(this.game?.timeOfDay ?? 0);
    const seed = world?.seedString ?? 'ArloCraft';

    el.textContent = [
      `XYZ: ${bx} / ${by} / ${bz}`,
      `Facing: ${facing}`,
      `Chunk: ${cx}, ${cz}`,
      `Biome: ${biome}`,
      `Time: ${worldTime}`,
    ].join('\n');

    if (this.refs.modePill) this.refs.modePill.textContent = mode;
    if (this.refs.timePill) this.refs.timePill.textContent = worldTime;
    if (this.refs.biomePill)
      this.refs.biomePill.textContent = biomeLabel.toUpperCase();
    if (this.refs.minimapContext)
      this.refs.minimapContext.textContent = `Seed ${seed} | ${biomeLabel}`;

    if (this.refs.statsMini) {
      this.refs.statsMini.innerHTML = `
                <div class="mini-stat">HP ${Math.ceil(this.gameState.hp)}/20</div>
                <div class="mini-stat">MODE ${mode}</div>
                <div class="mini-stat">${worldTime} | ${biomeLabel.toUpperCase()}</div>
            `;
    }
  }

  updateMiningProgress(detail) {
    const prompt = this.refs.actionPrompt;
    const ratio = Math.max(0, Math.min(1, detail?.ratio ?? 0));

    if (ratio <= 0 || detail?.done) {
      prompt.style.opacity = '0';
      prompt.classList.remove('mining-active');
      return;
    }

    const pct = Math.round(ratio * 100);
    prompt.textContent = `MINING ${pct}%`;
    prompt.style.color = '#ffd884';
    prompt.style.opacity = '1';
    prompt.classList.add('mining-active');
  }

  updateHP(value) {
    const container = this.refs.hpBar;
    if (!container) return;

    const maxHp = Math.max(1, this.gameState?.maxHp ?? 20);
    const hp = Math.max(0, Math.min(maxHp, Number(value) || 0));
    const ratio = hp / maxHp;

    container.innerHTML = `<span class="bar-label">HP</span><div class="hud-meter"><div class="hud-meter-fill hp-fill ${hp <= 4 ? 'hp-critical' : ''}" style="width:${(ratio * 100).toFixed(1)}%"></div></div><span class="bar-value">${Math.round(hp)}/${maxHp}</span>`;
  }

  updateFood(value) {
    const container = this.refs.foodBar;
    if (!container) return;

    const maxFood = 20;
    const hunger = Math.max(0, Math.min(maxFood, Number(value) || 0));
    const ratio = hunger / maxFood;
    container.innerHTML = `<span class="bar-label">FOOD</span><div class="hud-meter"><div class="hud-meter-fill food-fill" style="width:${(ratio * 100).toFixed(1)}%"></div></div><span class="bar-value">${Math.round(hunger)}/${maxFood}</span>`;
  }

  updateMode(mode) {
    if (this.refs.modeIndicator)
      this.refs.modeIndicator.textContent = `${mode} MODE`;
    if (this.refs.modePill) this.refs.modePill.textContent = mode;
  }

  updateXPBar(xp, max) {
    const bar = this.refs.xpBar;
    if (!bar) return;
    const denom = Math.max(1, Number(max) || 1);
    const ratio = Math.max(0, Math.min(1, (Number(xp) || 0) / denom));
    bar.style.width = `${ratio * 100}%`;
  }

  onBlockMined(detail) {
    if (!detail?.id) return;
    this.flashPrompt(`+${detail.id.toUpperCase()}`, '#f8f87a');
  }

  showActionPrompt(detail) {
    const el = this.refs.actionPrompt;
    el.textContent = `${detail?.type ?? 'ACTION'}! [E]`;
    el.style.color = '#ffffff';
    el.style.opacity = '1';
    setTimeout(() => {
      el.style.opacity = '0';
    }, 1600);
  }

  flashPrompt(text, color) {
    const el = this.refs.actionPrompt;
    el.textContent = text;
    el.style.color = color;
    el.style.opacity = '1';
    setTimeout(() => {
      el.style.opacity = '0';
    }, 900);
  }
}
