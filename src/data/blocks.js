import { BLOCKS as BASE_BLOCKS } from '../content/blocks/base.js';

const packModules = import.meta.glob('../content/blocks/packs/*.js', { eager: true });

function toTitleCase(id) {
    return id
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function normalizeBlock(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id ?? '').trim();
    if (!id) return null;

    const normalized = { ...raw };
    normalized.id = id;
    normalized.name = typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : toTitleCase(id);

    const hardness = Number(raw.hardness);
    normalized.hardness = Number.isFinite(hardness) ? hardness : 1;

    const xp = Number(raw.xp);
    normalized.xp = Number.isFinite(xp) ? xp : 0;

    return normalized;
}

function entriesFromModule(mod) {
    if (Array.isArray(mod?.default)) return mod.default;
    if (Array.isArray(mod?.BLOCKS)) return mod.BLOCKS;
    if (Array.isArray(mod?.BLOCK_PACK)) return mod.BLOCK_PACK;
    return [];
}

function mergeBlocks() {
    const merged = new Map();

    for (const entry of BASE_BLOCKS) {
        const block = normalizeBlock(entry);
        if (block) merged.set(block.id, block);
    }

    const sortedPacks = Object.keys(packModules).sort();
    for (const path of sortedPacks) {
        const entries = entriesFromModule(packModules[path]);
        for (const entry of entries) {
            const block = normalizeBlock(entry);
            if (block) merged.set(block.id, block);
        }
    }

    return Array.from(merged.values());
}

export const BLOCKS = mergeBlocks();
