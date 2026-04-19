import { TOOLS as BASE_TOOLS } from '../content/items/base.js';
import { BUCKETS } from '../content/items/buckets.js';

const packModules = import.meta.glob('../content/items/packs/*.js', { eager: true });

function toTitleCase(id) {
    return id
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function normalizeTool(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id ?? '').trim();
    if (!id) return null;

    const normalized = { ...raw };
    normalized.id = id;
    normalized.name = typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : toTitleCase(id);
    normalized.type = typeof raw.type === 'string' && raw.type.trim()
        ? raw.type.trim()
        : 'utility';

    const efficiency = Number(raw.efficiency);
    normalized.efficiency = Number.isFinite(efficiency) ? efficiency : 0;

    const damage = Number(raw.damage);
    normalized.damage = Number.isFinite(damage) ? damage : 0;

    const range = Number(raw.range);
    normalized.range = Number.isFinite(range) ? range : 3.2;

    const cooldown = Number(raw.cooldown);
    normalized.cooldown = Number.isFinite(cooldown) ? cooldown : 0.25;

    const knockback = Number(raw.knockback);
    normalized.knockback = Number.isFinite(knockback) ? knockback : 0.2;

    const critChance = Number(raw.critChance);
    normalized.critChance = Number.isFinite(critChance) ? critChance : 0;

    return normalized;
}

function entriesFromModule(mod) {
    if (Array.isArray(mod?.default)) return mod.default;
    if (Array.isArray(mod?.TOOLS)) return mod.TOOLS;
    if (Array.isArray(mod?.TOOL_PACK)) return mod.TOOL_PACK;
    return [];
}

function mergeTools() {
    const merged = new Map();

    for (const entry of BASE_TOOLS) {
        const tool = normalizeTool(entry);
        if (tool) merged.set(tool.id, tool);
    }

    for (const entry of BUCKETS) {
        const tool = normalizeTool(entry);
        if (tool) merged.set(tool.id, tool);
    }

    const sortedPacks = Object.keys(packModules).sort();
    for (const path of sortedPacks) {
        const entries = entriesFromModule(packModules[path]);
        for (const entry of entries) {
            const tool = normalizeTool(entry);
            if (tool) merged.set(tool.id, tool);
        }
    }

    return Array.from(merged.values());
}

export const TOOLS = mergeTools();
