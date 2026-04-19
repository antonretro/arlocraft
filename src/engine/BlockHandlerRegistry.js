// Registry mapping block IDs to their handler modules.
// Each handler module self-registers on import.
const handlers = new Map();

export function registerBlockHandler(id, handler) {
    handlers.set(id, handler);
}

export function getBlockHandler(id) {
    return handlers.get(id) ?? null;
}
