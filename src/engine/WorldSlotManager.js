export class WorldSlotManager {
    constructor(saveSystem) {
        this.saveSystem = saveSystem;
        this.slotIds = ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5'];
    }

    getAll() {
        return this.slotIds;
    }

    exists(slotId) {
        return Boolean(localStorage.getItem(this.saveSystem.getSlotKey(slotId)));
    }

    getSummary(slotId) {
        try {
            const raw = localStorage.getItem(this.saveSystem.getSlotKey(slotId));
            if (!raw) return null;

            const data = this.saveSystem.decode(raw);

            return {
                exists: true,
                seed: String(data?.world?.seed ?? 'unknown'),
                savedAt: String(data?.savedAt ?? ''),
                mode: String(data?.player?.mode ?? 'SURVIVAL')
            };
        } catch {
            return null;
        }
    }

    delete(slotId) {
        localStorage.removeItem(this.saveSystem.getSlotKey(slotId));
    }
}
