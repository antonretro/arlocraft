/**
 * MenuManager — handles navigation between the title, world-select,
 * and world-create screens. Instantiated by Game after setupUI().
 */
export class MenuManager {
    constructor(game) {
        this.game = game;
        this.current = 'screen-title';
        this._wire();
    }

    /** Show one of the three overlay sub-screens. */
    show(id) {
        const screens = ['screen-title', 'screen-world-select', 'screen-world-create'];
        for (const sid of screens) {
            const el = document.getElementById(sid);
            if (!el) continue;
            el.classList.toggle('ni-screen-active', sid === id);
        }
        this.current = id;
    }

    _wire() {
        const on = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };

        // Title → World Select
        on('btn-to-worlds', () => {
            this.game.renderWorldList();
            this.show('screen-world-select');
        });

        // Title → Settings (uses existing showSettings)
        on('btn-to-settings', () => this.game.showSettings(true));

        // World Select → Back
        on('btn-worlds-back', () => this.show('screen-title'));

        // World Select → Play
        on('btn-play-world', () => {
            const loaded = this.game.loadWorldLocal(this.game.selectedWorldSlot, { silent: true });
            this.game.startGame({ skipSeedApply: loaded, preserveCurrentMode: loaded });
        });

        // World Select → Create
        on('btn-new-world', () => {
            this._updateSlotLabel();
            this.show('screen-world-create');
        });

        // World Select → Delete
        on('btn-delete-world', () => {
            const slot = this.game.selectedWorldSlot;
            const summary = this.game.readWorldSlotSummary(slot);
            if (!summary?.exists) { this.game.setStatus(`${slot.toUpperCase()} is already empty.`, true); return; }
            if (!confirm(`Delete world in ${slot.toUpperCase()}? This cannot be undone.`)) return;
            localStorage.removeItem(this.game.getWorldSlotStorageKey(slot));
            this.game.renderWorldList();
            this.game.setStatus(`${slot.toUpperCase()} deleted.`);
        });

        // World Create → Back
        on('btn-create-back', () => this.show('screen-world-select'));
    }

    _updateSlotLabel() {
        const el = document.getElementById('create-slot-label');
        if (el) el.textContent = this.game.selectedWorldSlot.toUpperCase();
    }
}
