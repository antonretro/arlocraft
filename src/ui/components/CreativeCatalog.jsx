import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ItemIcon } from './ItemIcon';
import { BLOCKS } from '../../data/blocks';
import { TOOLS } from '../../data/tools';
import { ARMOR } from '../../data/items/armor';
import { RECIPE_BOOK } from '../../data/recipeBook';
import { SMELTING_RECIPES } from '../../data/smelting';
import { resolveItemKind } from '../../data/itemKinds';
import { blockIdToDisplayName } from '../../data/blockIds';

const SHAPE = /_(stairs|slab|wall|fence|fence_gate)$/;

const TABS = [
  { id: 'building', label: 'Building' },
  { id: 'nature', label: 'Nature' },
  { id: 'shapes', label: 'Stairs, slabs & doors' },
  { id: 'decor', label: 'Decor' },
  { id: 'redstone', label: 'Redstone' },
  { id: 'gear', label: 'Tools & armor' },
  { id: 'items', label: 'Items & food' },
  { id: 'eggs', label: 'Spawn eggs' },
];

function tabForBlock(block) {
  if (block.creativeHidden) return null;
  // Crop growth stages are placed by planting seeds, not picked directly.
  if (/_stage\d+$/.test(block.id)) return null;
  if (block.id.startsWith('spawn_egg_')) return 'eggs';
  // Every building block gets an auto-generated door and trapdoor; only the
  // wooden (and iron) ones make sense to build with.
  if (block.id.endsWith('_door_top')) return null;
  if (/_(door|trapdoor)$/.test(block.id)) {
    return /planks|iron/.test(block.id) ? 'shapes' : null;
  }
  if (SHAPE.test(block.id)) return 'shapes';
  switch (block.category) {
    case 'Construction':
    case 'Building':
      return 'building';
    case 'Natural':
      return 'nature';
    case 'Redstone':
      return 'redstone';
    case 'Consumables':
      return 'items';
    case 'Tools':
      return 'gear';
    default:
      return 'decor';
  }
}

/** Every pickable entry, grouped by tab, built once. */
function buildCatalog() {
  const byTab = Object.fromEntries(TABS.map((t) => [t.id, []]));
  const seen = new Set();
  const add = (tab, id, name, kind) => {
    if (!tab || seen.has(id)) return;
    seen.add(id);
    byTab[tab].push({ id, name, kind });
  };
  for (const block of BLOCKS)
    add(tabForBlock(block), block.id, block.name, 'block');
  for (const tool of TOOLS) add('gear', tool.id, tool.name, 'tool');
  for (const piece of ARMOR) add('gear', piece.id, piece.name, 'armor');
  // Plain items (coal, ingots, sticks, food…) come from the recipes.
  const smelted = Object.entries(SMELTING_RECIPES).flatMap(([input, out]) => [
    input,
    typeof out === 'string' ? out : out?.id,
  ]);
  for (const recipe of [...RECIPE_BOOK, { ingredients: smelted }]) {
    const ids = [
      recipe.result?.id,
      ...(recipe.ingredients ?? []).flat(),
      ...Object.values(recipe.key ?? {}),
    ];
    for (const id of ids) {
      if (typeof id !== 'string' || id.startsWith('#') || seen.has(id))
        continue;
      if (resolveItemKind(id) === 'item')
        add('items', id, blockIdToDisplayName(id), 'item');
    }
  }
  // Full blocks first, then their variants, keeping related blocks together.
  byTab.shapes.sort((a, b) => a.id.localeCompare(b.id));
  return byTab;
}

let catalogCache = null;

export const CreativeCatalog = ({ onPick }) => {
  const catalog = useMemo(() => (catalogCache ??= buildCatalog()), []);
  const [tab, setTab] = useState('building');
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState(null);

  const q = query.trim().toLowerCase();
  const entries = q
    ? Object.values(catalog)
        .flat()
        .filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.id.includes(q.replace(/\s+/g, '_'))
        )
    : catalog[tab];

  return (
    <div className="flex flex-col gap-3 min-h-0 min-w-0 flex-1">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          size={16}
        />
        <input
          type="text"
          placeholder="Search blocks and items"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className="field !py-2.5 !pl-9"
        />
      </div>
      {!q && (
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-colors ${
                tab === t.id
                  ? 'bg-[#5fae3c]/25 border-[#5fae3c] text-white'
                  : 'bg-white/[0.04] border-white/5 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div
        className="grid gap-1.5 overflow-y-auto content-start p-0.5 min-h-[180px] flex-1 scrollbar-thin"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}
      >
        {entries.map((e) => (
          <button
            key={e.id}
            onClick={(ev) => onPick(e, ev.shiftKey)}
            onMouseEnter={() => setHover(e)}
            onMouseLeave={() => setHover((h) => (h === e ? null : h))}
            className="aspect-square rounded-md bg-black/35 border-2 border-white/5 hover:border-[#ffe066] hover:bg-white/10 flex items-center justify-center"
          >
            <ItemIcon item={{ id: e.id, kind: e.kind }} className="w-8 h-8" />
          </button>
        ))}
        {entries.length === 0 && (
          <div className="col-span-full text-sm text-white/45 py-6 text-center">
            Nothing matches “{query}”.
          </div>
        )}
      </div>
      <div className="h-5 text-sm font-bold text-white/80 truncate">
        {hover ? (
          hover.name
        ) : (
          <span className="text-white/35 font-normal">
            Click to pick up a stack. Shift-click puts it straight in your
            inventory.
          </span>
        )}
      </div>
    </div>
  );
};
