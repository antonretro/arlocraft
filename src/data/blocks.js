const configModules = import.meta.glob('../content/blocks/*/config.json', { eager: true });
import { blockIdToDisplayName } from './blockIds.js';

function inferRenderType(block) {
    if (typeof block.renderType === 'string' && block.renderType.trim()) {
        return block.renderType.trim();
    }

    const hasPairId = typeof block.pairId === 'string' && block.pairId.trim().length > 0;
    if (hasPairId) return 'paired_plant';
    if (block.flat) return 'flat';
    if (block.slab || block.id.includes('_slab')) return 'slab';
    if (block.id.includes('_stairs')) return 'stairs';
    if (block.deco) return 'plant';
    return 'cube';
}

function normalizeBlock(folderId, raw) {
    if (!raw || typeof raw !== 'object') return null;

    const normalized = { ...raw };
    normalized.id = typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : folderId;
    normalized.textureId = typeof raw.textureId === 'string' && raw.textureId.trim()
        ? raw.textureId.trim()
        : normalized.id;
    normalized.name = typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : blockIdToDisplayName(normalized.id);

    normalized.hardness = Number.isFinite(Number(raw.hardness)) ? Number(raw.hardness) : 1;
    normalized.xp = Number.isFinite(Number(raw.xp)) ? Number(raw.xp) : 0;
    normalized.renderType = inferRenderType(normalized);

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
