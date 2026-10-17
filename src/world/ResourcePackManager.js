import { PackStorage } from '../mods/PackStorage.js';

const ACTIVE_PACK_KEY = 'texture-pack';
const BLOCK_TEXTURE_DIR = 'assets/minecraft/textures/block/';

/**
 * ResourcePackManager - block texture lookup.
 *
 * The built-in pack lives in public/resource_pack. A user texture pack
 * (a Minecraft-format .zip stored in IndexedDB) and mods can override or
 * add textures; overrides are object URLs layered over the built-in set.
 */
export class ResourcePackManager {
  static instance = null;

  static getInstance() {
    if (!ResourcePackManager.instance) {
      ResourcePackManager.instance = new ResourcePackManager();
    }
    return ResourcePackManager.instance;
  }

  constructor() {
    this.manifest = new Set();
    // Use relative paths or BASE_URL for GitHub Pages compatibility
    const base = import.meta.env.BASE_URL || '/';
    this.baseAssetPath = base.endsWith('/') ? base : base + '/';
    this.baseUrl = `${this.baseAssetPath}resource_pack/assets/minecraft/textures/block/`;
    this.isLoaded = false;
    this.overrides = new Map(); // fileName -> object URL
    this.textureSize = 16;
    this.activePackName = null;
    this.loadPromise = this.init();
  }

  async init() {
    try {
      const response = await fetch(
        `${this.baseAssetPath}resource_pack/manifest.txt`
      );
      const text = await response.text();
      // Split by line and filter out empty strings
      const files = text
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
      this.manifest = new Set(files);
      await this.loadActivePack();
      this.isLoaded = true;
      console.log(
        `[ArloCraft] ResourcePackManager: Indexed ${this.manifest.size} textures.`
      );
    } catch (err) {
      console.error(
        '[ArloCraft] ResourcePackManager: Failed to load manifest:',
        err
      );
    }
  }

  /**
   * Checks if a texture exists in the current pack.
   * @param {string} fileName
   * @returns {boolean}
   */
  hasTexture(fileName) {
    // Ensure extension
    const name = fileName.endsWith('.png') ? fileName : fileName + '.png';
    return this.manifest.has(name) || this.overrides.has(name);
  }

  /** Adds or replaces a block texture (used by texture packs and mods). */
  setTextureOverride(fileName, url) {
    const name = fileName.endsWith('.png') ? fileName : fileName + '.png';
    this.overrides.set(name, url);
    this.manifest.add(name);
  }

  async loadActivePack() {
    const pack = await PackStorage.get(ACTIVE_PACK_KEY);
    if (!pack?.blob) return;
    try {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(pack.blob);
      let largest = 16;
      const entries = Object.values(zip.files).filter(
        (f) =>
          !f.dir &&
          f.name.includes(BLOCK_TEXTURE_DIR) &&
          f.name.toLowerCase().endsWith('.png')
      );
      for (const file of entries) {
        const blob = await file.async('blob');
        const fileName = file.name.slice(
          file.name.indexOf(BLOCK_TEXTURE_DIR) + BLOCK_TEXTURE_DIR.length
        );
        if (fileName.includes('/')) continue;
        this.setTextureOverride(fileName, URL.createObjectURL(blob));
        if (largest === 16 && typeof createImageBitmap === 'function') {
          const bitmap = await createImageBitmap(blob).catch(() => null);
          if (bitmap) {
            largest = Math.min(
              64,
              Math.max(16, Math.min(bitmap.width, bitmap.height))
            );
            bitmap.close?.();
          }
        }
      }
      this.textureSize = largest;
      this.activePackName = pack.name;
      console.log(
        `[ArloCraft] Texture pack "${pack.name}": ${entries.length} block textures (${largest}px).`
      );
    } catch (err) {
      console.error('[ArloCraft] Could not load texture pack:', err);
    }
  }

  static async installPack(file) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const hasBlocks = Object.keys(zip.files).some((n) =>
      n.includes(BLOCK_TEXTURE_DIR)
    );
    if (!hasBlocks) {
      throw new Error(
        'No assets/minecraft/textures/block/ folder in this zip.'
      );
    }
    const name = file.name.replace(/\.zip$/i, '');
    await PackStorage.set(ACTIVE_PACK_KEY, { name, blob: file });
    return name;
  }

  static async removePack() {
    await PackStorage.delete(ACTIVE_PACK_KEY);
  }

  static async getInstalledPackName() {
    return (await PackStorage.get(ACTIVE_PACK_KEY))?.name ?? null;
  }

  /**
   * Gets the full URL for a texture.
   * @param {string} fileName
   * @returns {string|null}
   */
  getTextureUrl(fileName) {
    if (!this.hasTexture(fileName)) return null;
    const name = fileName.endsWith('.png') ? fileName : fileName + '.png';
    return this.overrides.get(name) ?? `${this.baseUrl}${name}`;
  }

  /**
   * Utility to wait for manifest loading if needed.
   */
  async ready() {
    return this.loadPromise;
  }
}
