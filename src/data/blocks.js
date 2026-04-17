const configModules = import.meta.glob('../content/blocks/*/config.json', { eager: true });
import { blockIdToDisplayName } from './blockIds.js';

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
