export class HelpPanel {
    constructor() {
        this.rootEl = document.getElementById('controls-help');
        this.titleEl = document.getElementById('controls-help-title');
        this.bodyEl = document.getElementById('controls-help-body');
        this.toggleBtn = document.getElementById('controls-help-toggle');
        this.collapsed = false;

        this.toggleBtn?.addEventListener('click', () => this.toggleCollapsed());
        this.setCollapsed(false, false);
        this.restoreCollapsedPreference();
    }

    setState(state) {
        if (!this.titleEl || !this.bodyEl) return;

        const presets = {
            title: {
                title: 'Welcome',
                body: 'Pick a seed and press Start Game.\nUse Settings/Save for sensitivity, save, load, export, and import.'
            },
            playing: {
                title: 'Controls',
                body: '[WASD] Move\n[Mouse] Look\n[LMB Hold] Mine/Attack\n[RMB] Place/Interact\n[Ctrl+W] or [WW] Sprint\n[Shift] Crouch/Sneak\n[Space] Jump\n[E] Inventory\n[F] Equip Offhand\n[Q] Pick Block\n[I] Toggle Help Panel\n[M] Toggle Minimap\n[F3] Debug  [F5] Camera  [ESC] Pause'
            },
            inventory: {
                title: 'Inventory',
                body: 'Click a slot to pick up an item, click another slot to place it.\nPut ingredients in the 3x3 grid, then click output to craft.\nPress [E] to return to game.'
            },
            paused: {
                title: 'Paused',
                body: 'Game simulation is paused.\nPress [ESC] or Resume to continue.'
            }
        };

        const preset = presets[state] ?? presets.playing;
        this.titleEl.textContent = preset.title;
        this.bodyEl.textContent = preset.body;
    }

    setCollapsed(next, persist = true) {
        this.collapsed = Boolean(next);
        if (this.rootEl) this.rootEl.classList.toggle('collapsed', this.collapsed);
        if (this.toggleBtn) {
            this.toggleBtn.textContent = this.collapsed ? 'I' : '-';
            this.toggleBtn.setAttribute('aria-expanded', this.collapsed ? 'false' : 'true');
        }
        if (persist) {
            try {
                window.localStorage.setItem('antoncraft_help_collapsed', this.collapsed ? '1' : '0');
            } catch {}
        }
    }

    toggleCollapsed() {
        this.setCollapsed(!this.collapsed);
    }

    restoreCollapsedPreference() {
        try {
            const value = window.localStorage.getItem('antoncraft_help_collapsed');
            if (value === '1') this.setCollapsed(true, false);
            else if (value === '0') this.setCollapsed(false, false);
        } catch {}
    }
}
