import { blockIdToDisplayName, normalizeBlockVariantId } from './blockIds.js';

const configModules = import.meta.glob('./block_configs/*/config.json', {
  eager: true,
});
const docModules = import.meta.glob('./block_configs/*/README.md', {
  eager: true,
  import: 'default',
  query: '?raw',
});
export const scriptModules = import.meta.glob('./block_configs/*/script.js', {
  eager: true,
});

const NON_PARAMETER_FIELDS = new Set([
  'id',
  'name',
  'category',
  'documentation',
  'docs',
  'docsSummary',
  'tags',
  'script',
  'scriptPath',
  'documentationPath',
  'documentationSource',
  'parameters',
  'folderId',
]);

function getFolderIdFromPath(path) {
  const segments = path.split('/');
  return segments[segments.length - 2];
}

function inferRenderType(block) {
  if (typeof block.renderType === 'string' && block.renderType.trim()) {
    return block.renderType.trim();
  }

  const hasPairId =
    typeof block.pairId === 'string' && block.pairId.trim().length > 0;
  if (hasPairId) return 'paired_plant';
  const id = String(block.id || '');
  if (block.flat) return 'flat';
  if (id === 'iron_bars' || id.includes('_pane')) return 'pane';
  if (block.slab || id.includes('_slab')) return 'slab';
  if (id.includes('_stairs')) return 'stairs';
  if (block.deco) return 'plant';
  return 'cube';
}

function inferCategory(id) {
  const lowId = id.toLowerCase();
  if (
    lowId.includes('redstone') ||
    lowId.includes('piston') ||
    lowId.includes('repeater') ||
    lowId.includes('comparator') ||
    lowId.includes('lever') ||
    lowId.includes('button') ||
    lowId.includes('observer') ||
    lowId.includes('tnt') ||
    lowId.includes('lamp') ||
    lowId.includes('command_block')
  ) {
    return 'Redstone';
  }

  if (
    lowId.includes('log') ||
    lowId.includes('leaves') ||
    lowId.includes('sapling') ||
    lowId.includes('grass') ||
    lowId.includes('dirt') ||
    lowId.includes('sand') ||
    lowId.includes('gravel') ||
    lowId.includes('stone') ||
    lowId.includes('ore') ||
    lowId.includes('mushroom') ||
    lowId.includes('flower') ||
    lowId.includes('coral')
  ) {
    return 'Natural';
  }

  if (
    lowId.includes('planks') ||
    lowId.includes('brick') ||
    lowId.includes('glass') ||
    lowId.includes('concrete') ||
    lowId.includes('terracotta') ||
    lowId.includes('wool') ||
    lowId.includes('prismarine') ||
    lowId.includes('blackstone')
  ) {
    return 'Construction';
  }

  if (
    lowId.includes('apple') ||
    lowId.includes('bread') ||
    lowId.includes('cookie') ||
    lowId.includes('berry') ||
    lowId.includes('melon') ||
    lowId.includes('potato') ||
    lowId.includes('carrot') ||
    lowId.includes('wheat')
  ) {
    return 'Consumables';
  }

  return 'Decorative';
}

function toSortedParameterEntries(block) {
  return Object.entries(block.parameters || {}).sort(([left], [right]) =>
    left.localeCompare(right)
  );
}

function formatParameterValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function buildGeneratedDocumentation(block) {
  const parameterEntries = toSortedParameterEntries(block);
  const parameterSection =
    parameterEntries.length > 0
      ? parameterEntries
          .map(([key, value]) => `- \`${key}\`: ${formatParameterValue(value)}`)
          .join('\n')
      : '- No custom parameters declared yet.';

  const tagText =
    Array.isArray(block.tags) && block.tags.length > 0
      ? block.tags.join(', ')
      : 'general';
  const handlerText =
    block.script.handlerIds.length > 0
      ? block.script.handlerIds.join(', ')
      : 'none';

  return [
    `# ${block.name}`,
    '',
    `Auto-generated documentation for \`${block.id}\`.`,
    '',
    '## Summary',
    `- Category: ${block.category}`,
    `- Render type: ${block.renderType}`,
    `- Texture ID: ${block.textureId}`,
    `- Script mode: ${block.script.mode}`,
    `- Handlers: ${handlerText}`,
    `- Tags: ${tagText}`,
    '',
    '## Parameters',
    parameterSection,
  ].join('\n');
}

function buildParameters(raw, scriptModule) {
  const parameters = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (NON_PARAMETER_FIELDS.has(key) || value === undefined) continue;
    parameters[key] = value;
  }

  const scriptParameters = scriptModule?.blockParameters;
  if (scriptParameters && typeof scriptParameters === 'object') {
    for (const [key, value] of Object.entries(scriptParameters)) {
      parameters[key] = value;
    }
  }

  return parameters;
}

function buildTags(raw, scriptModule) {
  const tags = [];
  if (Array.isArray(raw?.tags)) tags.push(...raw.tags);
  if (Array.isArray(scriptModule?.blockTags)) tags.push(...scriptModule.blockTags);
  return Array.from(new Set(tags.filter(Boolean)));
}

function buildScriptInfo(folderId, blockId, scriptModule) {
  const handlerIds = Array.isArray(scriptModule?.handlerIds)
    ? scriptModule.handlerIds.filter(Boolean)
    : [];

  return {
    mode: scriptModule ? 'custom' : 'generated',
    folderId,
    blockId,
    path: scriptModule ? `src/data/block_configs/${folderId}/script.js` : null,
    handlerIds,
  };
}

function normalizeBlock(folderId, raw, scriptModule, readmeContent) {
  if (!raw || typeof raw !== 'object') return null;

  const meta = scriptModule?.blockMeta;
  const merged = meta && typeof meta === 'object' ? { ...raw, ...meta } : { ...raw };

  merged.id =
    typeof merged.id === 'string' && merged.id.trim() ? merged.id.trim() : folderId;
  
  // Handle naming mismatch for Minecraft-style blocks (e.g. concrete_black -> black_concrete)
  let tid = merged.textureId || merged.id;
  if (typeof tid === 'string') {
    const swapTypes = ['concrete', 'terracotta', 'wool', 'glazed_terracotta', 'concrete_powder', 'stained_glass', 'candle'];
    for (const type of swapTypes) {
      if (tid.startsWith(type + '_')) {
        const color = tid.replace(type + '_', '');
        tid = color + '_' + type;
        break;
      }
    }
  }

  merged.textureId = tid;
  merged.name =
    typeof merged.name === 'string' && merged.name.trim()
      ? merged.name.trim()
      : blockIdToDisplayName(merged.id);

  merged.hardness = Number.isFinite(Number(merged.hardness))
    ? Number(merged.hardness)
    : 1;
  merged.xp = Number.isFinite(Number(merged.xp)) ? Number(merged.xp) : 0;
  merged.renderType = inferRenderType(merged);
  merged.category = merged.category || inferCategory(merged.id);
  merged.folderId = folderId;
  merged.script = buildScriptInfo(folderId, merged.id, scriptModule);
  merged.parameters = buildParameters(merged, scriptModule);
  merged.tags = buildTags(merged, scriptModule);
  merged.scriptPath = merged.script.path;
  merged.documentationPath = readmeContent
    ? `src/data/block_configs/${folderId}/README.md`
    : null;
  merged.documentationSource = readmeContent ? 'readme' : 'generated';
  merged.documentation =
    typeof readmeContent === 'string' && readmeContent.trim()
      ? readmeContent.trim()
      : buildGeneratedDocumentation(merged);

  return merged;
}

function mergeBlocks() {
  const merged = new Map();

  for (const [path, module] of Object.entries(configModules)) {
    const folderId = getFolderIdFromPath(path);
    const scriptModule = scriptModules[`./block_configs/${folderId}/script.js`];
    const readmeContent = docModules[`./block_configs/${folderId}/README.md`];
    const block = normalizeBlock(
      folderId,
      module.default || module,
      scriptModule,
      readmeContent
    );
    if (block) {
      merged.set(block.id, block);

      // --- AUTO-GEN VARIANT LOGIC ---
      // For Construction blocks (like Concrete, Wool, Planks), auto-generate slabs and stairs
      const isConstruction = block.category === 'Construction';
      const isFullBlock = block.renderType === 'cube' || !block.renderType;
      
      if (isConstruction && isFullBlock && !block.id.includes('_slab') && !block.id.includes('_stairs')) {
        // Slab Variant
        const slabId = `${block.id}_slab`;
        merged.set(slabId, {
          ...block,
          id: slabId,
          name: `${block.name} Slab`,
          renderType: 'slab',
          slab: true
        });

        // Stair Variant
        const stairId = `${block.id}_stairs`;
        merged.set(stairId, {
          ...block,
          id: stairId,
          name: `${block.name} Stairs`,
          renderType: 'stairs',
          stairs: true
        });

        // Trapdoor Variant
        const trapdoorId = `${block.id}_trapdoor`;
        merged.set(trapdoorId, {
          ...block,
          id: trapdoorId,
          name: `${block.name} Trapdoor`,
          renderType: 'trapdoor',
          transparent: true
        });

        // Door Variant
        const doorId = `${block.id}_door`;
        merged.set(doorId, {
          ...block,
          id: doorId,
          name: `${block.name} Door`,
          renderType: 'door',
          transparent: true
        });
      }
    }
  }

  // Auto-generate spawn eggs for every mob
  MOBS.forEach(mob => {
    const eggId = `spawn_egg_${mob.id}`;
    if (!merged.has(eggId)) {
        merged.set(eggId, {
            id: eggId,
            name: `${mob.name} Spawn Egg`,
            category: 'Tools',
            renderType: 'flat',
            textureId: 'spawn_egg',
            spawnMobId: mob.id,
            description: `Right-click to spawn a ${mob.name}.`
        });
    }
  });

  return Array.from(merged.values()).sort((left, right) =>
    left.id.localeCompare(right.id)
  );
}

export const BLOCKS = mergeBlocks();
export const BLOCKS_BY_ID = new Map(BLOCKS.map((block) => [block.id, block]));

export function getBlockDefinition(id) {
  if (!id) return null;
  return BLOCKS_BY_ID.get(normalizeBlockVariantId(id)) ?? null;
}

export function getBlockParameters(id) {
  return getBlockDefinition(id)?.parameters ?? null;
}

export function getBlockDocumentation(id) {
  return getBlockDefinition(id)?.documentation ?? null;
}
