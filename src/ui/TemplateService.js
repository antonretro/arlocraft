/**
 * TemplateService
 * Orchestrates the loading and injection of modular HTML fragments.
 * Eliminates the need for a monolithic index.html.
 */
export class TemplateService {
  constructor(game) {
    this.game = game;
    this.container = document.getElementById('ui-root') || document.body;
  }

  /**
   * Injects a fragment into the root container.
   * @param {string} html - The raw HTML string.
   */
  inject(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    this.container.appendChild(template.content);
  }

  /**
   * Initializes the UI by clearing placeholders and loading all core fragments.
   * Fragments are passed as an object mapping name -> html.
   */
  init(fragments) {
    console.log('[ArloCraft] Hydrating modular UI architecture...');

    // Core HUD
    if (fragments.hud) this.inject(fragments.hud);

    // Screens (Title, World Select, etc.)
    if (fragments.screens) this.inject(fragments.screens);

    // Overlays (Inventory, Chests, etc.)
    if (fragments.overlays) this.inject(fragments.overlays);

    // System (Console, Help)
    if (fragments.system) this.inject(fragments.system);

    console.log('[ArloCraft] UI Hydration complete.');
  }
}
