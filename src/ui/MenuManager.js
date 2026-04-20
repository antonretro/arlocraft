import packIcon from '../Igneous 1.19.4/pack.png?url';

/**
 * MenuManager — handles navigation between the title, world-select,
 * and world-create screens. Instantiated by Game after setupUI().
 */
export class MenuManager {
  constructor(game) {
    this.game = game;
    this.current = 'screen-title';
    this._wire();
    this._initPackDisplay();
  }

  _initPackDisplay() {
    const el = document.getElementById('selected-pack-icon');
    if (el) el.src = packIcon;
  }

  /** Show one of the three overlay sub-screens. */
  show(id) {
    const screens = [
      'screen-title',
      'screen-world-select',
      'screen-world-create',
      'screen-multiplayer',
      'screen-skins',
      'screen-texture-packs',
    ];
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

    // Title → Multiplayer
    on('btn-to-multiplayer', () => {
      this.show('screen-multiplayer');
      this.game.multiplayer?.init();
    });

    // Title → Skins
    on('btn-to-skins', () => {
      this.game.ui.renderSkinLibrary();
      this.show('screen-skins');
    });

    // Title → Texture Packs
    on('btn-to-packs', () => {
      this.show('screen-texture-packs');
    });

    // World Select → Back
    on('btn-worlds-back', () => this.show('screen-title'));

    // World Select → Play
    on('btn-play-world', () => {
      const loaded = this.game.loadWorldLocal(this.game.selectedWorldSlot, {
        silent: true,
      });
      this.game.startGame({
        skipSeedApply: loaded,
        preserveCurrentMode: loaded,
      });
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
      if (!summary?.exists) {
        this.game.setStatus(`${slot.toUpperCase()} is already empty.`, true);
        return;
      }
      if (
        !confirm(
          `Delete world in ${slot.toUpperCase()}? This cannot be undone.`
        )
      )
        return;
      localStorage.removeItem(this.game.getWorldSlotStorageKey(slot));
      this.game.renderWorldList();
      this.game.setStatus(`${slot.toUpperCase()} deleted.`);
    });

    // World Create → Back
    on('btn-create-back', () => this.show('screen-world-select'));

    // Multiplayer → Back
    on('btn-multi-back-top', () => this.show('screen-title'));
    on('btn-multi-back', () => this.show('screen-title'));

    // Skins → Back
    on('btn-skins-back-top', () => this.show('screen-title'));
    on('btn-skins-back', () => this.show('screen-title'));

    // Texture Packs → Back
    on('btn-packs-back-top', () => this.show('screen-title'));
    on('btn-packs-back', () => this.show('screen-title'));
    on('btn-apply-pack', () => {
      this.game.setStatus('Assets Applied Successfully', false);
      this.show('screen-title');
    });
  }

  _updateSlotLabel() {
    const el = document.getElementById('create-slot-label');
    if (el) el.textContent = this.game.selectedWorldSlot.toUpperCase();
  }
}
