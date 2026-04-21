export class SettingsManager {
  constructor(storageKey = 'ArloCraft-settings') {
    this.storageKey = storageKey;
    this.defaults = {
      sensitivity: 0.00145,
      invertY: false,
      fov: 75,
      qualityTierPref: 'balanced',
      preferredMode: 'SURVIVAL',
      autoJump: true,
      autoQuality: true,
      fpsCap: 120,
      renderDistance: 3,
      selectedWorldSlot: 'slot-1',
      shadowsEnabled: false,
      fogDensityScale: 1.0,
      perfPanelVisible: false,
      resolutionScale: 0.75,
      graphicsAPI: 'webgl2',
      audioMuted: false,
      audioMaster: 0.82,
      audioSfx: 0.9,
      audioUi: 0.78,
      audioWorld: 0.85,
      cloudOpacity: 0.85,
      foliageSwaying: true,
      playerName: 'Arlo',
    };

    this.settings = this.load();
  }

  load() {
    const defaults = this.defaults;

    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return { ...defaults };

      const parsed = JSON.parse(raw);
      const fov = Number(parsed.fov);

      return {
        sensitivity: Number.isFinite(parsed.sensitivity)
          ? parsed.sensitivity
          : defaults.sensitivity,
        invertY: Boolean(parsed.invertY),
        fov:
          Number.isFinite(fov) && fov >= 60 && fov <= 110 ? fov : defaults.fov,
        qualityTierPref: ['low', 'balanced', 'high'].includes(
          parsed.qualityTierPref
        )
          ? parsed.qualityTierPref
          : defaults.qualityTierPref,
        preferredMode: [
          'SURVIVAL',
          'CREATIVE',
          'ADVENTURE',
          'SPECTATOR',
        ].includes(parsed.preferredMode)
          ? parsed.preferredMode
          : defaults.preferredMode,
        autoJump:
          parsed.autoJump !== undefined
            ? Boolean(parsed.autoJump)
            : defaults.autoJump,
        autoQuality:
          parsed.autoQuality !== undefined
            ? Boolean(parsed.autoQuality)
            : defaults.autoQuality,
        fpsCap: [30, 60, 90, 120, 144, 999].includes(Number(parsed.fpsCap))
          ? Number(parsed.fpsCap)
          : defaults.fpsCap,
        renderDistance: Number.isFinite(parsed.renderDistance)
          ? Math.max(1, Math.min(6, Math.round(parsed.renderDistance)))
          : defaults.renderDistance,
        selectedWorldSlot:
          typeof parsed.selectedWorldSlot === 'string'
            ? parsed.selectedWorldSlot
            : defaults.selectedWorldSlot,
        shadowsEnabled:
          parsed.shadowsEnabled !== undefined
            ? Boolean(parsed.shadowsEnabled)
            : defaults.shadowsEnabled,
        fogDensityScale: Number.isFinite(parsed.fogDensityScale)
          ? parsed.fogDensityScale
          : defaults.fogDensityScale,
        perfPanelVisible:
          parsed.perfPanelVisible !== undefined
            ? Boolean(parsed.perfPanelVisible)
            : defaults.perfPanelVisible,
        resolutionScale: Number.isFinite(parsed.resolutionScale)
          ? parsed.resolutionScale
          : defaults.resolutionScale,
        graphicsAPI: ['webgl2', 'webgpu'].includes(parsed.graphicsAPI)
          ? parsed.graphicsAPI
          : defaults.graphicsAPI,
        audioMuted:
          parsed.audioMuted !== undefined
            ? Boolean(parsed.audioMuted)
            : defaults.audioMuted,
        audioMaster: Number.isFinite(parsed.audioMaster)
          ? Math.max(0, Math.min(1, parsed.audioMaster))
          : defaults.audioMaster,
        audioSfx: Number.isFinite(parsed.audioSfx)
          ? Math.max(0, Math.min(1, parsed.audioSfx))
          : defaults.audioSfx,
        audioUi: Number.isFinite(parsed.audioUi)
          ? Math.max(0, Math.min(1, parsed.audioUi))
          : defaults.audioUi,
        audioWorld: Number.isFinite(parsed.audioWorld)
          ? Math.max(0, Math.min(1, parsed.audioWorld))
          : defaults.audioWorld,
        cloudOpacity: Number.isFinite(parsed.cloudOpacity)
          ? Math.max(0, Math.min(1, parsed.cloudOpacity))
          : defaults.cloudOpacity,
        foliageSwaying:
          parsed.foliageSwaying !== undefined
            ? Boolean(parsed.foliageSwaying)
            : defaults.foliageSwaying,
      };
    } catch {
      return { ...defaults };
    }
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
  }

  getAll() {
    return this.settings;
  }

  set(key, value) {
    this.settings[key] = value;
    this.save();
  }

  reset() {
    this.settings = { ...this.defaults };
    this.save();
    return this.settings;
  }
}
