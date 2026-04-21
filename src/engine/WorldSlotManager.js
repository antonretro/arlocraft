export class WorldSlotManager {
  constructor(saveSystem) {
    this.saveSystem = saveSystem;
    this.slotIds = ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'slot-6'];
    this.namesKey = 'arlo_world_names';
  }

  getAll() {
    return this.slotIds;
  }

  exists(slotId) {
    return Boolean(localStorage.getItem(this.saveSystem.getSlotKey(slotId)));
  }

  getNamesMap() {
    try {
      return JSON.parse(localStorage.getItem(this.namesKey)) || {};
    } catch {
      return {};
    }
  }

  setSlotName(slotId, name) {
    const names = this.getNamesMap();
    names[slotId] = name;
    localStorage.setItem(this.namesKey, JSON.stringify(names));
  }

  getSlotName(slotId) {
    return this.getNamesMap()[slotId] || null;
  }

  getSummary(slotId) {
    try {
      const raw = localStorage.getItem(this.saveSystem.getSlotKey(slotId));
      if (!raw) return null;

      const data = this.saveSystem.decode(raw);
      const customName = this.getSlotName(slotId);

      return {
        exists: true,
        name: customName || slotId.toUpperCase().replace('-', ' '),
        seed: String(data?.world?.seed ?? 'unknown'),
        savedAt: String(data?.savedAt ?? ''),
        mode: String(data?.player?.mode ?? 'SURVIVAL'),
      };
    } catch {
      return null;
    }
  }

  delete(slotId) {
    localStorage.removeItem(this.saveSystem.getSlotKey(slotId));
    const names = this.getNamesMap();
    delete names[slotId];
    localStorage.setItem(this.namesKey, JSON.stringify(names));
  }
}
