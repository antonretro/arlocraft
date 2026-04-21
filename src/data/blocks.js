const configModules = import.meta.glob('./block_configs/*/config.json', {
  eager: true,
});
import { blockIdToDisplayName } from './blockIds.js';

function inferRenderType(block) {
  if (typeof block.renderType === 'string' && block.renderType.trim()) {
    return block.renderType.trim();
  }

  const hasPairId =
    typeof block.pairId === 'string' && block.pairId.trim().length > 0;
  if (hasPairId) return 'paired_plant';
  const id = String(block.id || '');
  if (block.flat) return 'flat';
  if (block.slab || id.includes('_slab')) return 'slab';
  if (id.includes('_stairs')) return 'stairs';
  if (block.deco) return 'plant';
  return 'cube';
}

function inferCategory(id) {
  const lowId = id.toLowerCase();
  if (lowId.includes('redstone') || lowId.includes('piston') || lowId.includes('repeater') || 
      lowId.includes('comparator') || lowId.includes('lever') || lowId.includes('button') || 
      lowId.includes('observer') || lowId.includes('tnt') || lowId.includes('lamp') ||
      lowId.includes('command_block')) return 'Redstone';
  
  if (lowId.includes('log') || lowId.includes('leaves') || lowId.includes('sapling') || 
      lowId.includes('grass') || lowId.includes('dirt') || lowId.includes('sand') || 
      lowId.includes('gravel') || lowId.includes('stone') || lowId.includes('ore') || 
      lowId.includes('mushroom') || lowId.includes('flower') || lowId.includes('coral')) return 'Natural';

  if (lowId.includes('planks') || lowId.includes('brick') || lowId.includes('glass') || 
      lowId.includes('concrete') || lowId.includes('terracotta') || lowId.includes('wool') || 
      lowId.includes('prismarine') || lowId.includes('blackstone')) return 'Construction';

  if (lowId.includes('apple') || lowId.includes('bread') || lowId.includes('cookie') || 
      lowId.includes('berry') || lowId.includes('melon') || lowId.includes('potato') || 
      lowId.includes('carrot') || lowId.includes('wheat')) return 'Consumables';

  return 'Decorative';
}

function normalizeBlock(folderId, raw) {
  if (!raw || typeof raw !== 'object') return null;

  const normalized = { ...raw };
  normalized.id =
    typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : folderId;
  normalized.textureId =
    typeof raw.textureId === 'string' && raw.textureId.trim()
      ? raw.textureId.trim()
      : normalized.id;
  normalized.name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : blockIdToDisplayName(normalized.id);

  normalized.hardness = Number.isFinite(Number(raw.hardness))
    ? Number(raw.hardness)
    : 1;
  normalized.xp = Number.isFinite(Number(raw.xp)) ? Number(raw.xp) : 0;
  normalized.renderType = inferRenderType(normalized);
  normalized.category = raw.category || inferCategory(normalized.id);

  return normalized;
}

function mergeBlocks() {
  const merged = new Map();

  for (const [path, module] of Object.entries(configModules)) {
    const segments = path.split('/');
    const folderId = segments[segments.length - 2];
    const block = normalizeBlock(folderId, module.default || module);
    if (block) merged.set(block.id, block);
  }

  return Array.from(merged.values());
}

export const BLOCKS = mergeBlocks();
