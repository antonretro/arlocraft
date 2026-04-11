export class HelpPanel {
    constructor() {
        this.titleEl = document.getElementById('controls-help-title');
        this.bodyEl = document.getElementById('controls-help-body');
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
                body: '[WASD] Move\n[Mouse] Look\n[LMB Hold] Mine/Attack\n[RMB] Place/Interact\n[E] Inventory\n[F] Equip Offhand\n[Q] Dig Down\n[M] Toggle Minimap\n[F3] Debug  [F5] Camera  [ESC] Pause'
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
}
