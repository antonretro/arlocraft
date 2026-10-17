import { TOOLS } from './tools.js';
import { ARMOR } from './items/armor.js';
import { getBlockDefinition } from './blocks.js';

// Inventory slots group items by `kind`: tools and armor never stack, blocks
// can be placed, everything else (coal, sticks, ingots, raw food…) is a plain
// item. Resolving the kind from the id keeps stacks consistent no matter
// which system (mining, crafting, loot, mobs) added the item.

export const MAX_STACK = 64;

let toolIds = null;
let armorById = null;

function getToolIds() {
  if (!toolIds) toolIds = new Set(TOOLS.map((tool) => tool.id));
  return toolIds;
}

export function getArmorDefinition(id) {
  if (!armorById) armorById = new Map(ARMOR.map((piece) => [piece.id, piece]));
  return armorById.get(id) ?? null;
}

export function resolveItemKind(id, fallback = 'item') {
  if (!id) return fallback;
  if (getToolIds().has(id)) return 'tool';
  if (getArmorDefinition(id)) return 'armor';
  if (getBlockDefinition(id)) return 'block';
  // Unknown ids: trust an explicit non-block kind (mods), else a plain item.
  return fallback && fallback !== 'block' ? fallback : 'item';
}

export function getMaxStackSize(itemOrId) {
  const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
  const kind =
    typeof itemOrId === 'object' && itemOrId?.kind
      ? itemOrId.kind
      : resolveItemKind(id);
  return kind === 'tool' || kind === 'armor' ? 1 : MAX_STACK;
}

/** Two stacks can merge when they are the same item without per-item state. */
export function canStackTogether(a, b) {
  if (!a || !b || a.id !== b.id) return false;
  if (resolveItemKind(a.id, a.kind) !== resolveItemKind(b.id, b.kind))
    return false;
  return getMaxStackSize(a) > 1;
}
