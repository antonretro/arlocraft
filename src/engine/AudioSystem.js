const CLAMP01 = (value, fallback = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
};

export class AudioSystem {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.uiGain = null;
    this.worldGain = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.mix = {
      master: 0.82,
      sfx: 0.9,
      ui: 0.78,
      world: 0.85,
    };
    this.recentPlay = new Map();
    this.unlockBound = false;
    this.userInteracted = false;
  }

  ensureContext() {
    if (this.context) return this.context;
    // Do not create context until user has interacted to avoid browser warnings
    if (!this.userInteracted) return null;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    const ctx = new Ctx();
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const ui = ctx.createGain();
    const world = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();

    compressor.threshold.value = -20;
    compressor.knee.value = 14;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;

    sfx.connect(master);
    ui.connect(master);
    world.connect(master);
    master.connect(compressor);
    compressor.connect(ctx.destination);

    this.context = ctx;
    this.masterGain = master;
    this.sfxGain = sfx;
    this.uiGain = ui;
    this.worldGain = world;
    this.compressor = compressor;
    this.noiseBuffer = this.createNoiseBuffer();
    this.applyMixNow();
    return ctx;
  }

  createNoiseBuffer() {
    if (!this.context) return null;
    const length = this.context.sampleRate;
    const buffer = this.context.createBuffer(
      1,
      length,
      this.context.sampleRate
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  installAutoUnlock(target = document) {
    if (this.unlockBound) return;
    const unlock = () => {
      this.userInteracted = true;
      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    };
    target.addEventListener('pointerdown', unlock, { passive: true });
    target.addEventListener('keydown', unlock, { passive: true });
    target.addEventListener('touchstart', unlock, { passive: true });
    this.unlockBound = true;
  }

  applyFromSettings(settings = {}) {
    this.enabled = !settings.audioMuted;
    this.mix.master = CLAMP01(settings.audioMaster, 0.82);
    this.mix.sfx = CLAMP01(settings.audioSfx, 0.9);
    this.mix.ui = CLAMP01(settings.audioUi, 0.78);
    this.mix.world = CLAMP01(settings.audioWorld, 0.85);
    this.applyMixNow();
  }

  applyMixNow() {
    if (!this.context || !this.masterGain) return;
    const t = this.context.currentTime;
    const smooth = 0.02;
    const masterTarget = this.enabled ? this.mix.master : 0;
    this.masterGain.gain.cancelScheduledValues(t);
    this.sfxGain.gain.cancelScheduledValues(t);
    this.uiGain.gain.cancelScheduledValues(t);
    this.worldGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setTargetAtTime(masterTarget, t, smooth);
    this.sfxGain.gain.setTargetAtTime(this.mix.sfx, t, smooth);
    this.uiGain.gain.setTargetAtTime(this.mix.ui, t, smooth);
    this.worldGain.gain.setTargetAtTime(this.mix.world, t, smooth);
  }

  canPlay(key, cooldownMs = 18) {
    const now = performance.now();
    const prev = this.recentPlay.get(key) ?? 0;
    if (now - prev < cooldownMs) return false;
    this.recentPlay.set(key, now);
    return true;
  }

  createGainNode(targetGain = 1, attack = 0.002, release = 0.06, start = 0) {
    if (!this.context) return null;
    const g = this.context.createGain();
    const now = this.context.currentTime + start;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, targetGain),
      now + attack
    );
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
    return g;
  }

  getBus(type) {
    if (type === 'ui') return this.uiGain;
    if (type === 'world') return this.worldGain;
    return this.sfxGain;
  }

  playOsc({
    type = 'triangle',
    freq = 440,
    freqEnd = null,
    duration = 0.06,
    gain = 0.18,
    detune = 0,
    start = 0,
    bus = 'sfx',
  }) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = this.createGainNode(
      gain,
      0.003,
      Math.max(0.01, duration),
      start
    );
    if (!env) return;
    osc.type = type;
    const t0 = ctx.currentTime + start;
    osc.frequency.setValueAtTime(Math.max(30, freq), t0);
    if (Number.isFinite(freqEnd)) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(30, freqEnd),
        t0 + duration
      );
    }
    osc.detune.value = detune;
    osc.connect(env);
    env.connect(this.getBus(bus));
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  playNoise({
    duration = 0.05,
    gain = 0.1,
    cutoffStart = 3600,
    cutoffEnd = 1200,
    q = 0.8,
    start = 0,
    bus = 'sfx',
  }) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const t0 = ctx.currentTime + start;
    filter.frequency.setValueAtTime(Math.max(100, cutoffStart), t0);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(80, cutoffEnd),
      t0 + duration
    );
    filter.Q.value = q;
    const env = this.createGainNode(
      gain,
      0.001,
      Math.max(0.01, duration),
      start
    );
    if (!env) return;
    src.connect(filter);
    filter.connect(env);
    env.connect(this.getBus(bus));
    src.start(t0);
    src.stop(t0 + duration + 0.01);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  play(eventName, detail = {}) {
    if (!this.enabled) return;
    if (!this.canPlay(eventName)) return;
    
    // Resume context if suspended (common after autoplay block)
    if (this.context && this.context.state === 'suspended' && this.userInteracted) {
      this.context.resume().catch(() => {});
    }
    
    this.ensureContext();
    if (!this.context) return;

    switch (eventName) {
      case 'block-mined': {
        const id = String(detail?.id ?? '');
        const stoneLike =
          id.includes('stone') || id.includes('ore') || id.includes('brick');
        const base = stoneLike ? 160 : 220;
        this.playNoise({
          duration: 0.045,
          gain: stoneLike ? 0.11 : 0.08,
          cutoffStart: stoneLike ? 2400 : 4200,
          cutoffEnd: 900,
          bus: 'world',
        });
        this.playOsc({
          type: 'triangle',
          freq: base * 1.2,
          freqEnd: base * 0.82,
          duration: 0.04,
          gain: 0.075,
          bus: 'world',
        });
        break;
      }
      case 'block-placed':
        this.playOsc({
          type: 'square',
          freq: 240,
          freqEnd: 200,
          duration: 0.018,
          gain: 0.05,
          bus: 'world',
        });
        this.playNoise({
          duration: 0.016,
          gain: 0.04,
          cutoffStart: 5200,
          cutoffEnd: 2200,
          bus: 'world',
        });
        break;
      case 'player-damaged':
        this.playOsc({
          type: 'sawtooth',
          freq: 140,
          freqEnd: 70,
          duration: 0.08,
          gain: 0.12,
          bus: 'sfx',
        });
        this.playNoise({
          duration: 0.06,
          gain: 0.05,
          cutoffStart: 1800,
          cutoffEnd: 480,
          bus: 'sfx',
        });
        break;
      case 'enemy-defeated':
        this.playOsc({
          type: 'triangle',
          freq: 330,
          freqEnd: 440,
          duration: 0.06,
          gain: 0.09,
          bus: 'sfx',
        });
        this.playOsc({
          type: 'triangle',
          freq: 495,
          freqEnd: 660,
          duration: 0.07,
          gain: 0.075,
          start: 0.045,
          bus: 'sfx',
        });
        break;
      case 'inventory-open':
        this.playOsc({
          type: 'triangle',
          freq: 510,
          freqEnd: 630,
          duration: 0.04,
          gain: 0.06,
          bus: 'ui',
        });
        break;
      case 'inventory-close':
        this.playOsc({
          type: 'triangle',
          freq: 620,
          freqEnd: 470,
          duration: 0.035,
          gain: 0.055,
          bus: 'ui',
        });
        break;
      case 'action-success':
        this.playOsc({
          type: 'sine',
          freq: 520,
          freqEnd: 620,
          duration: 0.05,
          gain: 0.065,
          bus: 'ui',
        });
        this.playOsc({
          type: 'sine',
          freq: 780,
          freqEnd: 900,
          duration: 0.045,
          gain: 0.05,
          start: 0.05,
          bus: 'ui',
        });
        break;
      case 'action-fail':
        this.playOsc({
          type: 'square',
          freq: 300,
          freqEnd: 210,
          duration: 0.06,
          gain: 0.06,
          bus: 'ui',
        });
        break;
      case 'level-up':
        this.playOsc({
          type: 'triangle',
          freq: 440,
          freqEnd: 520,
          duration: 0.08,
          gain: 0.07,
          bus: 'ui',
        });
        this.playOsc({
          type: 'triangle',
          freq: 660,
          freqEnd: 790,
          duration: 0.08,
          gain: 0.062,
          start: 0.06,
          bus: 'ui',
        });
        this.playOsc({
          type: 'triangle',
          freq: 880,
          freqEnd: 980,
          duration: 0.1,
          gain: 0.058,
          start: 0.12,
          bus: 'ui',
        });
        break;
      case 'mode-changed':
        this.playOsc({
          type: 'sine',
          freq: 350,
          freqEnd: 390,
          duration: 0.03,
          gain: 0.045,
          bus: 'ui',
        });
        break;
      case 'respawn':
        this.playOsc({
          type: 'sine',
          freq: 220,
          freqEnd: 340,
          duration: 0.14,
          gain: 0.08,
          bus: 'ui',
        });
        break;
      case 'crafting-open':
        this.playOsc({
          type: 'triangle',
          freq: 560,
          freqEnd: 680,
          duration: 0.04,
          gain: 0.055,
          bus: 'ui',
        });
        break;
      default:
        this.playOsc({
          type: 'sine',
          freq: 360,
          freqEnd: 320,
          duration: 0.025,
          gain: 0.04,
          bus: 'ui',
        });
        break;
    }
  }
}
