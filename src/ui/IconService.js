import { BLOCKS } from '../data/blocks.js';
import { TOOLS } from '../data/tools.js';
import { normalizeBlockVariantId } from '../data/blockIds.js';

const itemTextureModules = import.meta.glob(
  '../Igneous 1.19.4/assets/minecraft/textures/item/*.png',
  { eager: true, query: '?url' }
);
const blockTextureModules = import.meta.glob(
  '../Igneous 1.19.4/assets/minecraft/textures/block/*.png',
  { eager: true, query: '?url' }
);

const GRASS_PREVIEW_TINT_CLASS = 'tint-grass-face';

export class IconService {
  constructor() {
    this.blockById = new Map(BLOCKS.map((block) => [block.id, block]));
    this.toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));
    this.generatedIconCache = new Map();
    this._abbrevMap = null;

    this.itemTextures = {};
    for (const [path, module] of Object.entries(itemTextureModules)) {
      const fileName = path.split('/').pop().replace('.png', '');
      this.itemTextures[fileName] = module.default || module;
    }

    const igneousFaceSuffixes = [
      '_side_overlay',
      '_top',
      '_bottom',
      '_side',
      '_front',
      '_back',
      '_end',
    ];

    const compoundIds = new Set([
      'tall_grass_bottom',
      'tall_grass_top',
      'grass_block_snow',
      'large_fern_bottom',
      'large_fern_top',
      'rose_bush_bottom',
      'rose_bush_top',
      'peony_bottom',
      'peony_top',
      'lilac_bottom',
      'lilac_top',
      'sunflower_bottom',
      'sunflower_top',
    ]);

    const globalAliases = {
      copper: 'copper_block',
      gold: 'gold_block',
      lapis: 'lapis_block',
      diamond: 'diamond_block',
      emerald: 'emerald_block',
      redstone: 'redstone_block',
      path_block: 'dirt_path',
      short_grass: 'grass',
      dripstone: 'dripstone_block',
      cherry_leaves: 'flowering_azalea_leaves',
      nuke: 'tnt_side',
      coal_ore: 'coal_ore',
      iron_ore: 'iron_ore',
      gold_ore: 'gold_ore',
      diamond_ore: 'diamond_ore',
      emerald_ore: 'emerald_ore',
      lapis_ore: 'lapis_ore',
      copper_ore: 'copper_ore',
      redstone_ore: 'redstone_ore',
      deepslate_coal_ore: 'deepslate_coal_ore',
      deepslate_iron_ore: 'deepslate_iron_ore',
      deepslate_gold_ore: 'deepslate_gold_ore',
      deepslate_diamond_ore: 'deepslate_diamond_ore',
      deepslate_emerald_ore: 'deepslate_emerald_ore',
    };

    this.blockTextures = {};
    for (const [path, module] of Object.entries(blockTextureModules)) {
      const fileName = path.split('/').pop();
      const baseName = fileName.replace('.png', '');
      const url = module.default || module;

      let blockId = baseName;
      let faceKey = 'all.png';

      for (const suffix of igneousFaceSuffixes) {
        if (baseName.endsWith(suffix) && !compoundIds.has(baseName)) {
          blockId = baseName.substring(0, baseName.length - suffix.length);
          faceKey = suffix.substring(1) + '.png'; 
          break;
        }
      }

      const store = (id, face, assetUrl) => {
        if (face === 'all.png') {
          this.blockTextures[id] = assetUrl;
        } else {
          this.blockTextures[`${id}_${face.replace('.png', '')}`] = assetUrl;
        }
      };

      store(blockId, faceKey, url);

      for (const [alias, target] of Object.entries(globalAliases)) {
        if (blockId === target) {
          store(alias, faceKey, url);
        }
      }
    }

    this.iconAliasById = {
      cobblestone: 'stone',
      brick: 'bricks',
      path_block: 'dirt_path',
      nuke: 'tnt_side',
      obsidian: 'obsidian',
      wood: 'oak_log',
      leaves: 'oak_leaves',
      bedrock: 'stone',
      sandstone: 'sand',
      snow_block: 'stone',
      ice: 'water',
      cloud_block: 'water',
      lava: 'water',
      coal_ore: 'coal_ore',
      iron_ore: 'iron_ore',
      gold_ore: 'gold_ore',
      diamond_ore: 'diamond_ore',
      emerald_ore: 'emerald_ore',
      deepslate_coal_ore: 'deepslate_coal_ore',
      deepslate_iron_ore: 'deepslate_iron_ore',
      deepslate_gold_ore: 'deepslate_gold_ore',
      deepslate_diamond_ore: 'deepslate_diamond_ore',
      deepslate_emerald_ore: 'deepslate_emerald_ore',
      blueberry: 'sweet_berries',
      cooked_fish: 'water',
      byte_axe: 'power_blade',
      echo_dagger: 'glitch_saber',
      arc_spear: 'sledge_iron',
      plasma_hammer: 'sledge_iron',
      pulse_pistol: 'static_bow',
      rail_rifle: 'static_bow',
      scatter_blaster: 'static_bow',
    };
  }

  resolveAsset(path) {
    const base = import.meta.env.BASE_URL || '/';
    const normalized = String(path || '').replace(/^\/+/, '');
    return `${base}${normalized}`;
  }

  createItemElement(item) {
    const element = document.createElement('div');
    element.className = 'item-icon';
    const normalizedId = normalizeBlockVariantId(item.id);
    const block = this.blockById.get(normalizedId);
    const textureKey = this.getDisplayTextureKey(normalizedId);
    const isDeco = Boolean(block?.deco);
    const shouldTintGrassFace = normalizedId === 'grass_block';
    const shouldTintFoliageIcon =
      (isDeco &&
        (textureKey === 'grass' ||
          textureKey.includes('grass') ||
          textureKey === 'fern')) ||
      textureKey.includes('leaves');
    const shouldUseGrassSpriteTint =
      isDeco &&
      (textureKey === 'grass' ||
        normalizedId === 'short_grass' ||
        normalizedId === 'tall_grass');
    const isBlockItem =
      (block && !block.deco) ||
      normalizedId === 'wood' ||
      normalizedId === 'leaves' ||
      normalizedId.startsWith('wood_') ||
      normalizedId.startsWith('leaves_') ||
      normalizedId.includes('_stairs') ||
      normalizedId.includes('_slab');

    if (isBlockItem) {
      const set = this.getBlockTextureSet(normalizedId);
      if (set && (set.top || set.all || set.side || set.front || set.bottom)) {
        const topTex =
          set.top || set.all || set.side || set.front || set.bottom;
        const leftTex =
          set.front || set.side || set.all || set.top || set.bottom;
        const rightTex =
          set.side || set.front || set.all || set.top || set.bottom;

        const isoContainer = document.createElement('div');
        isoContainer.className = 'iso-icon';

        const topFace = document.createElement('div');
        topFace.className = 'iso-face top';
        topFace.style.backgroundImage = `url('${topTex}')`;
        if (shouldTintGrassFace) {
          topFace.classList.add(GRASS_PREVIEW_TINT_CLASS);
        }

        const leftFace = document.createElement('div');
        leftFace.className = 'iso-face left';
        leftFace.style.backgroundImage = `url('${leftTex}')`;

        const rightFace = document.createElement('div');
        rightFace.className = 'iso-face right';
        rightFace.style.backgroundImage = `url('${rightTex}')`;

        isoContainer.appendChild(topFace);
        isoContainer.appendChild(leftFace);
        isoContainer.appendChild(rightFace);

        if (shouldTintFoliageIcon) {
          isoContainer.classList.add('tint-grass');
        }

        element.appendChild(isoContainer);
      } else {
        element.textContent = String(normalizedId).slice(0, 2).toUpperCase();
      }
    } else {
      const icon = this.getIconPath(normalizedId);
      if (icon) {
        element.style.backgroundImage = `url('${icon}')`;
        if (shouldUseGrassSpriteTint) {
          element.classList.add('tint-grass-sprite');
        } else if (shouldTintFoliageIcon) {
          element.classList.add('tint-grass');
        }
        if (icon && icon.startsWith('data:image/svg+xml')) {
          element.classList.add('generated');
        }
      } else {
        element.textContent = String(normalizedId).slice(0, 2).toUpperCase();
      }
    }

    if ((item.count ?? 1) > 1) {
      const count = document.createElement('div');
      count.className = 'item-count';
      count.textContent = String(item.count);
      element.appendChild(count);
    }

    return element;
  }

  getBlockTextureSet(id) {
    const legacyMap = {
      wood: 'oak_log',
      leaves: 'oak_leaves',
      wood_birch: 'birch_log',
      leaves_birch: 'birch_leaves',
      wood_pine: 'spruce_log',
      leaves_pine: 'spruce_leaves',
      gravel: 'gravel',
      glass: 'glass',
      snow: 'snow',
      ice: 'ice',
      obsidian: 'obsidian',
      bedrock: 'bedrock',
      water: 'water_still',
      lava: 'lava_still',
      sand: 'sand',
      cobblestone: 'cobblestone',
      oak_plank: 'oak_planks',
      sandstone: 'sandstone',
      dirt: 'dirt',
      stone: 'stone',
      tnt: 'tnt',
      crafting_table: 'crafting_table',
      lantern: 'lantern',
      path_block: 'dirt_path',
      clay: 'clay',
      brick: 'bricks',
    };

    let alias = this.getBlockTextureKey(id);
    if (legacyMap[alias]) alias = legacyMap[alias];

    const all = this.blockTextures[alias] || this.blockTextures[`${alias}_all`];
    return {
      all: all,
      top: this.blockTextures[`${alias}_top`] || all,
      side: this.blockTextures[`${alias}_side`] || all,
      front:
        this.blockTextures[`${alias}_front`] ||
        this.blockTextures[`${alias}_side`] ||
        all,
      bottom: this.blockTextures[`${alias}_bottom`] || all,
    };
  }

  getIconPath(itemId) {
    if (!itemId) return this.getGeneratedIconPath('item');

    const normalizedId = normalizeBlockVariantId(itemId);
    const block = this.blockById.get(normalizedId);
    if (block?.deco) {
      const textureKey = this.getDisplayTextureKey(normalizedId);
      return (
        this.blockTextures?.[textureKey] ||
        this.blockTextures?.[`${textureKey}_front`] ||
        this.blockTextures?.[`${textureKey}_top`] ||
        this.blockTextures?.[`${textureKey}_bottom`] ||
        this.getGeneratedIconPath(normalizedId)
      );
    }

    const toolMap = {
      pick_wood: 'wooden_pickaxe',
      sledge_iron: 'iron_pickaxe',
      data_drill: 'netherite_pickaxe',
      sword_wood: 'wooden_sword',
      power_blade: 'iron_sword',
      glitch_saber: 'diamond_sword',
      axe_wood: 'wooden_axe',
      byte_axe: 'diamond_axe',
      echo_dagger: 'stone_sword',
      arc_spear: 'trident',
      plasma_hammer: 'iron_axe',
      static_bow: 'bow',
      pulse_pistol: 'crossbow',
      rail_rifle: 'crossbow',
      scatter_blaster: 'crossbow',
      decoder_wand: 'stick',
      magnet_glove: 'iron_ingot',
      rocket_boots: 'iron_boots',
      grappler: 'fishing_rod',
      scanner: 'compass_16',
      master_key: 'gold_ingot',
      apple: 'apple',
      bread: 'bread',
      steak: 'cooked_beef',
      carrot: 'carrot',
      potato: 'baked_potato',
      corn: 'wheat',
      blueberry: 'sweet_berries',
      strawberry: 'sweet_berries',
      melon_slice: 'melon_slice',
      pumpkin_pie: 'pumpkin_pie',
      cookie: 'cookie',
      cooked_fish: 'cooked_cod',
      honey_bottle: 'honey_bottle',
      mushroom_brown: 'brown_mushroom',
      mushroom_red: 'red_mushroom',
    };
    const directToolTexture = toolMap[normalizedId];
    const alias = directToolTexture
      ? normalizedId
      : this.resolveIconAlias(normalizedId) || normalizedId;
    const mcId = directToolTexture || toolMap[alias] || alias;

    if (this.itemTextures && this.itemTextures[mcId])
      return this.itemTextures[mcId];
    if (this.blockTextures && this.blockTextures[mcId])
      return this.blockTextures[mcId];

    return this.getGeneratedIconPath(normalizedId);
  }

  getGeneratedIconPath(itemId) {
    const id = String(itemId || 'item').toLowerCase();
    if (this.generatedIconCache.has(id)) return this.generatedIconCache.get(id);

    const isMedal = id === 'medal';
    const monogram = isMedal ? '' : this.getIconMonogram(id);
    const accent = isMedal ? '#ffd700' : this.getIconAccentColor(id);

    let svg = '';
    if (isMedal) {
      svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="#151f35"/>
<stop offset="100%" stop-color="#09101d"/>
</linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="#fff59d"/>
<stop offset="100%" stop-color="#fbc02d"/>
</linearGradient>
</defs>
<circle cx="32" cy="32" r="28" fill="url(#bg)" stroke="#fbc02d" stroke-width="2.5"/>
<circle cx="32" cy="32" r="22" fill="none" stroke="rgba(251,192,45,0.2)" stroke-width="1" stroke-dasharray="4 4"/>
<path d="M32 18 L36 28 L47 28 L38 35 L41 46 L32 39 L23 46 L26 35 L17 28 L28 28 Z" fill="url(#gold)"/>
</svg>`;
    } else {
      svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="#151f35"/>
<stop offset="100%" stop-color="#09101d"/>
</linearGradient>
<linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${accent}"/>
<stop offset="100%" stop-color="#ffffff"/>
</linearGradient>
</defs>
<rect x="4" y="4" width="56" height="56" rx="12" fill="url(#bg)" stroke="${accent}" stroke-width="2.5"/>
<rect x="10" y="10" width="44" height="44" rx="8" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
<circle cx="16" cy="16" r="2.2" fill="${accent}" />
<text x="32" y="39" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="23" font-weight="700" fill="url(#accent)">${monogram}</text>
</svg>`;
    }

    const data = `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
    this.generatedIconCache.set(id, data);
    return data;
  }

  getIconMonogram(itemId) {
    if (!this._abbrevMap) this._abbrevMap = this._buildAbbrevMap();
    const id = String(itemId || 'it').toLowerCase();
    return this._abbrevMap.get(id) || id.slice(0, 2).toUpperCase();
  }

  _buildAbbrevMap() {
    const allIds = [
      ...Array.from(this.blockById.keys()),
      ...Array.from(this.toolById.keys()),
    ];
    const map = new Map();
    const used = new Set();
    const candidate = (id) => {
      const parts = id.split(/[_-]+/).filter(Boolean);
      const initials = parts.map((p) => p[0].toUpperCase());
      const two =
        parts.length >= 2
          ? initials.slice(0, 2).join('')
          : parts[0].slice(0, 2).toUpperCase();
      if (!used.has(two)) return two;
      const three =
        parts.length >= 3
          ? initials.slice(0, 3).join('')
          : parts.length === 2
            ? initials[0] + parts[1].slice(0, 2).toUpperCase()
            : parts[0].slice(0, 3).toUpperCase();
      if (!used.has(three)) return three;
      const alt = (
        parts[0][0] + (parts[0][2] || parts[0][1] || 'X')
      ).toUpperCase();
      if (!used.has(alt)) return alt;
      for (let i = 1; i <= 9; i++) {
        const indexed = parts[0][0].toUpperCase() + i;
        if (!used.has(indexed)) return indexed;
      }
      return parts[0][0].toUpperCase() + '?';
    };
    for (const id of allIds) {
      const abbrev = candidate(id);
      map.set(id, abbrev);
      used.add(abbrev);
    }
    return map;
  }

  getIconAccentColor(itemId) {
    const alias = this.resolveIconAlias(itemId) ?? itemId;
    const palette = {
      stone: '#7bc8ff',
      dirt: '#f0a56d',
      grass: '#76f59f',
      wood: '#ffc176',
      leaves: '#8de86b',
      sand: '#ffe384',
      water: '#7bd2ff',
      iron: '#b8c8ff',
      gold: '#ffe36a',
      diamond: '#6bffe6',
      static_bow: '#8ad7ff',
      power_blade: '#ff8fb2',
      pick_wood: '#ffcf8d',
      magnet_glove: '#ffd28f',
      virus: '#d08bff',
      arlo: '#ffb0d7',
    };
    if (palette[alias]) return palette[alias];
    let hash = 0;
    const value = String(itemId ?? '');
    for (let i = 0; i < value.length; i++)
      hash = (hash << 5) - hash + value.charCodeAt(i);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 82% 66%)`;
  }

  resolveIconAlias(itemId) {
    const id = String(itemId);
    const legacyMap = {
      wood: 'oak_log',
      leaves: 'oak_leaves',
      wood_birch: 'birch_log',
      leaves_birch: 'birch_leaves',
      wood_pine: 'spruce_log',
      leaves_pine: 'spruce_leaves',
      wood_cherry: 'cherry_log',
      leaves_cherry: 'cherry_leaves',
      wood_crystal: 'crystal_log',
      leaves_crystal: 'crystal_leaves',
      wood_palm: 'jungle_log',
      leaves_palm: 'jungle_leaves',
      wood_willow: 'mangrove_log',
      leaves_willow: 'mangrove_leaves',
    };
    if (legacyMap[id]) return legacyMap[id];
    const explicit = this.iconAliasById[id];
    if (explicit) return explicit;
    if (id.startsWith('wool_')) return 'grass';
    const block = this.blockById.get(id);
    if (block?.name?.includes('Ore')) return 'stone';
    const tool = this.toolById.get(id);
    if (tool) {
      if (tool.type === 'gun' || tool.type === 'ranged') return 'static_bow';
      if (tool.type === 'pick') return 'pick_wood';
      if (tool.type === 'utility') return 'magnet_glove';
      return 'power_blade';
    }
    return null;
  }

  getBlockTextureKey(itemId) {
    const block = this.blockById.get(itemId);
    if (block?.textureId) return block.textureId;
    return this.resolveIconAlias(itemId) || itemId;
  }

  getDisplayTextureKey(itemId) {
    const block = this.blockById.get(itemId);
    if (
      block?.pairId &&
      typeof block.textureId === 'string' &&
      block.textureId.endsWith('_bottom')
    ) {
      const pairTexture = this.blockById.get(block.pairId)?.textureId;
      if (pairTexture) return pairTexture;
    }
    return this.getBlockTextureKey(itemId);
  }
}

export const iconService = new IconService();
