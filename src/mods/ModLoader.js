import { BLOCKS, BLOCKS_BY_ID } from '../data/blocks.js';
import { RECIPE_BOOK } from '../data/recipeBook.js';
import { ResourcePackManager } from '../world/ResourcePackManager.js';
import { PackStorage } from './PackStorage.js';

/**
 * Mods are .zip files with a mod.json at the root:
 *
 * {
 *   "id": "lamps", "name": "Fancy Lamps", "version": "1.0",
 *   "blocks": [
 *     { "id": "blue_lamp", "name": "Blue Lamp", "texture": "blue_lamp.png",
 *       "hardness": 1, "emissive": true }
 *     // texture may also be { "top": "a.png", "side": "b.png", "bottom": "c.png" }
 *     // optional: "transparent", "renderType" ("cube" | "plant" | "flat")
 *   ],
 *   "recipes": [ same format as src/data/recipeBook.js ],
 *   "commands": { "hello": "say('Hello', args.join(' '));" }
 * }
 *
 * Textures are looked up inside the zip relative to mod.json. Commands
 * become chat commands (/hello) that run in the command block sandbox
 * centred on the player. Mods load before the game starts, so installing
 * or removing one reloads the page.
 */
const MOD_KEY_PREFIX = 'mod:';
const ID_PATTERN = /^[a-z0-9_]{1,48}$/;
const RENDER_TYPES = new Set(['cube', 'plant', 'flat']);

export const ModLoader = {
  loaded: [], // { id, name, version, blocks: [...ids], commands: [...] }
  commands: new Map(), // name -> { modId, code }

  async listInstalled() {
    const keys = await PackStorage.keys();
    const mods = [];
    for (const key of keys) {
      if (typeof key !== 'string' || !key.startsWith(MOD_KEY_PREFIX)) continue;
      const record = await PackStorage.get(key);
      if (record) mods.push({ key, name: record.name, id: record.id });
    }
    return mods;
  },

  async install(file) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const manifest = await readManifest(zip);
    await PackStorage.set(MOD_KEY_PREFIX + manifest.id, {
      id: manifest.id,
      name: manifest.name ?? manifest.id,
      blob: file,
    });
    return manifest;
  },

  async remove(key) {
    await PackStorage.delete(key);
  },

  /** Loads every installed mod. Call before the game is created. */
  async loadInstalled() {
    let keys = [];
    try {
      keys = await PackStorage.keys();
    } catch {
      return;
    }
    for (const key of keys) {
      if (typeof key !== 'string' || !key.startsWith(MOD_KEY_PREFIX)) continue;
      try {
        const record = await PackStorage.get(key);
        await this.loadMod(record.blob);
      } catch (error) {
        console.error(`[ArloCraft] Mod ${key} failed to load:`, error);
      }
    }
  },

  async loadMod(blob) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(blob);
    const manifest = await readManifest(zip);
    const base = manifest.__base;
    const resources = ResourcePackManager.getInstance();
    await resources.ready();
    const info = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      blocks: [],
      commands: [],
    };

    const textureUrl = async (path) => {
      if (typeof path !== 'string') return null;
      const file = zip.file(base + path.replace(/^\.?\//, ''));
      if (!file) throw new Error(`missing texture ${path}`);
      return URL.createObjectURL(await file.async('blob'));
    };

    for (const block of manifest.blocks ?? []) {
      if (!ID_PATTERN.test(block?.id ?? ''))
        throw new Error(`bad block id ${block?.id}`);
      if (BLOCKS_BY_ID.has(block.id)) {
        console.warn(
          `[ArloCraft] Mod ${manifest.id}: block ${block.id} already exists, skipped`
        );
        continue;
      }
      // Register textures under the names the block registry looks for.
      if (typeof block.texture === 'string') {
        resources.setTextureOverride(
          `${block.id}.png`,
          await textureUrl(block.texture)
        );
      } else if (block.texture && typeof block.texture === 'object') {
        for (const face of ['top', 'side', 'bottom', 'front']) {
          if (block.texture[face]) {
            resources.setTextureOverride(
              `${block.id}_${face}.png`,
              await textureUrl(block.texture[face])
            );
          }
        }
      }
      const renderType = RENDER_TYPES.has(block.renderType)
        ? block.renderType
        : 'cube';
      const definition = {
        id: block.id,
        name: String(block.name ?? block.id).slice(0, 48),
        category: 'Mods',
        hardness: Number.isFinite(block.hardness) ? block.hardness : 1,
        transparent: Boolean(block.transparent) || renderType !== 'cube',
        emissive: Boolean(block.emissive),
        renderType,
        textureId: block.id,
        modId: manifest.id,
      };
      BLOCKS.push(definition);
      BLOCKS_BY_ID.set(definition.id, definition);
      info.blocks.push(block.id);
    }

    for (const recipe of manifest.recipes ?? []) {
      if (
        recipe?.result?.id &&
        (recipe.type === 'shaped' || recipe.type === 'shapeless')
      ) {
        RECIPE_BOOK.push({
          ...recipe,
          id: `${manifest.id}:${recipe.id ?? recipe.result.id}`,
        });
      }
    }

    for (const [name, code] of Object.entries(manifest.commands ?? {})) {
      if (!ID_PATTERN.test(name) || typeof code !== 'string') continue;
      this.commands.set(name, { modId: manifest.id, code });
      info.commands.push(name);
    }

    this.loaded.push(info);
    console.log(
      `[ArloCraft] Loaded mod ${manifest.name ?? manifest.id} (${info.blocks.length} blocks, ${info.commands.length} commands)`
    );
  },

  /** Registers mod chat commands once the command manager exists. */
  registerCommands(commandManager, game) {
    for (const [name, { modId, code }] of this.commands) {
      commandManager.register(name, `From mod ${modId}`, (args) => {
        const p = game.getPlayerPosition();
        game.commandBlocks?.runAt(
          { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) },
          `const args = ${JSON.stringify(args.map(String))};\n${code}`
        );
        return true;
      });
    }
  },
};

async function readManifest(zip) {
  const entry = Object.values(zip.files).find(
    (f) => !f.dir && /(^|\/)mod\.json$/.test(f.name)
  );
  if (!entry) throw new Error('This zip has no mod.json.');
  let manifest;
  try {
    manifest = JSON.parse(await entry.async('string'));
  } catch {
    throw new Error('mod.json is not valid JSON.');
  }
  if (!ID_PATTERN.test(manifest?.id ?? '')) {
    throw new Error(
      'mod.json needs an "id" of lowercase letters, digits and _.'
    );
  }
  manifest.__base = entry.name.slice(0, entry.name.length - 'mod.json'.length);
  return manifest;
}
