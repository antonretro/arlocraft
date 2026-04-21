/**
 * ResourcePackManager - Handles runtime loading of texture packs.
 * Optimized for 'World Class' performance and low memory footprint.
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
        this.baseUrl = '/resource_pack/assets/minecraft/textures/block/';
        this.isLoaded = false;
        this.loadPromise = this.init();
    }

    async init() {
        try {
            const response = await fetch('/resource_pack/manifest.txt');
            const text = await response.text();
            // Split by line and filter out empty strings
            const files = text.split(/\r?\n/).map(f => f.trim()).filter(f => f.length > 0);
            this.manifest = new Set(files);
            this.isLoaded = true;
            console.log(`[ArloCraft] ResourcePackManager: Indexed ${this.manifest.size} textures.`);
        } catch (err) {
            console.error('[ArloCraft] ResourcePackManager: Failed to load manifest:', err);
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
        return this.manifest.has(name);
    }

    /**
     * Gets the full URL for a texture.
     * @param {string} fileName 
     * @returns {string|null}
     */
    getTextureUrl(fileName) {
        if (!this.hasTexture(fileName)) return null;
        const name = fileName.endsWith('.png') ? fileName : fileName + '.png';
        return `${this.baseUrl}${name}`;
    }

    /**
     * Utility to wait for manifest loading if needed.
     */
    async ready() {
        return this.loadPromise;
    }
}
