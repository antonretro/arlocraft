const configModules = import.meta.glob('../content/blocks/*/config.json', { eager: true });

function toTitleCase(id) {
    return id
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function normalizeBlock(id, raw) {
    if (!raw || typeof raw !== 'object') return null;

    const normalized = { ...raw };
    normalized.id = id;
    normalized.name = typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : toTitleCase(id);

    normalized.hardness = Number.isFinite(Number(raw.hardness)) ? Number(raw.hardness) : 1;
    normalized.xp = Number.isFinite(Number(raw.xp)) ? Number(raw.xp) : 0;

    return normalized;
}

function mergeBlocks() {
    const merged = new Map();

    for (const [path, module] of Object.entries(configModules)) {
        const segments = path.split('/');
        const id = segments[segments.length - 2]; // id is folder name
        const block = normalizeBlock(id, module.default || module);
        if (block) merged.set(id, block);
    }

    return Array.from(merged.values());
}

export const BLOCKS = mergeBlocks();
