import React, { useState, useEffect, useRef } from 'react';
import { getGame } from '../UIManager';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Hammer,
  Trophy,
  Warehouse,
  Shield,
  Flame,
  Package,
  ArrowRight,
} from 'lucide-react';
import { ItemIcon } from './ItemIcon';
import { CreativeCatalog } from './CreativeCatalog';
import { RECIPE_BOOK } from '../../data/recipeBook';
import { AchievementScreen } from './AchievementScreen';
import { CraftingSystem } from '../../engine/CraftingSystem';
import { TOOLS } from '../../data/tools';
import { blockIdToDisplayName } from '../../data/blockIds';
import {
  getMaxStackSize,
  canStackTogether,
  getArmorDefinition,
} from '../../data/itemKinds';
import { isFuel, isSmeltable, SMELT_SECONDS } from '../../data/smelting';
import {
  getFurnaceState,
  tickAllFurnaces,
} from '../../blocks/handlers/FurnaceHandler';
import {
  getChestInventory,
  CHEST_SLOTS,
} from '../../blocks/handlers/ChestHandler';

const craftingSystem = new CraftingSystem(RECIPE_BOOK);
const PLAYER_GRID = [0, 1, 3, 4];
const WORKSHOP_GRID = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const FURNACE_FIELDS = ['input', 'fuel', 'output'];
const TOOL_NAMES = new Map(TOOLS.map((tool) => [tool.id, tool.name]));

const getItemName = (item) =>
  item.name ||
  TOOL_NAMES.get(item.id) ||
  getArmorDefinition(item.id)?.name ||
  blockIdToDisplayName(item.id);

/** Moves as much of `item` as fits into `slots` (indices of `arr`): merge first, then empty slots. */
function moveIntoSlots(arr, indices, item, maxPer = getMaxStackSize(item)) {
  if (maxPer > 1) {
    for (const i of indices) {
      const slot = arr[i];
      if (!slot || !canStackTogether(slot, item)) continue;
      const moved = Math.min(maxPer - slot.count, item.count);
      if (moved <= 0) continue;
      slot.count += moved;
      item.count -= moved;
      if (item.count <= 0) return;
    }
  }
  for (const i of indices) {
    if (arr[i]) continue;
    const moved = Math.min(maxPer, item.count);
    arr[i] = { ...item, count: moved };
    item.count -= moved;
    if (item.count <= 0) return;
  }
}

const range = (from, to) =>
  Array.from({ length: to - from }, (_, i) => from + i);

export const Inventory = ({
  onClose,
  initialMode = 'PLAYER',
  blockKey = null,
}) => {
  const game = getGame();
  const gameState = game.gameState;
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  const [carryItem, setCarryItemState] = useState(null);
  const carryRef = useRef(null);
  const [activeTab, setActiveTab] = useState('STORAGE'); // STORAGE | ACHIEVEMENTS

  // Container Mode: PLAYER | WORKSHOP (crafting table) | FURNACE | CHEST
  const uiMode = initialMode;
  const isWorkshop = uiMode === 'WORKSHOP';
  const gridIndices = isWorkshop ? WORKSHOP_GRID : PLAYER_GRID;
  const furnace =
    uiMode === 'FURNACE' ? getFurnaceState(game.world, blockKey) : null;
  const chest =
    uiMode === 'CHEST' ? getChestInventory(game.world, blockKey) : null;

  const setCarryItem = (item) => {
    const next = item && item.count > 0 ? { ...item } : null;
    carryRef.current = next;
    setCarryItemState(next);
  };

  // Re-render whenever the game changes a stack in place.
  useEffect(() => {
    window.addEventListener('inventory-changed', refresh);
    return () => window.removeEventListener('inventory-changed', refresh);
  }, [game]);

  // The furnace keeps burning while its screen is open (the game loop is paused).
  useEffect(() => {
    if (uiMode !== 'FURNACE') return undefined;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      tickAllFurnaces(game.world, Math.min(1, (now - last) / 1000));
      last = now;
      refresh();
    }, 100);
    return () => clearInterval(timer);
  }, [uiMode, game]);

  // Closing the screen hands the carried stack and crafting grid back, like Minecraft.
  useEffect(
    () => () => {
      const gs = game.gameState;
      if (carryRef.current) gs.addItemStack({ ...carryRef.current });
      carryRef.current = null;
      for (let i = 0; i < gs.craftingGrid.length; i++) {
        if (gs.craftingGrid[i]) gs.addItemStack({ ...gs.craftingGrid[i] });
        gs.craftingGrid[i] = null;
      }
      window.dispatchEvent(new CustomEvent('inventory-changed'));
    },
    [game]
  );

  // Crafting: the 2x2 player grid uses slots 0,1,3,4 of the 3x3 grid.
  const getActiveGrid = () => {
    const grid = new Array(9).fill(null);
    for (const i of gridIndices) grid[i] = gameState.craftingGrid[i];
    return grid;
  };
  const craftingMatch = craftingSystem.match(getActiveGrid());
  const craftingResult = craftingMatch ? craftingMatch.result : null;

  // --- Slot access -------------------------------------------------------
  const getSlot = (type, idx) => {
    if (type === 'inventory') return gameState.inventory[idx];
    if (type === 'crafting') return gameState.craftingGrid[idx];
    if (type === 'armor') return gameState.armor[idx];
    if (type === 'chest') return chest?.[idx] ?? null;
    if (type === 'furnace') return furnace?.[FURNACE_FIELDS[idx]] ?? null;
    return null;
  };
  const setSlot = (type, idx, item) => {
    const value = item && item.count > 0 ? item : null;
    if (type === 'inventory') gameState.inventory[idx] = value;
    else if (type === 'crafting') gameState.craftingGrid[idx] = value;
    else if (type === 'armor') gameState.armor[idx] = value;
    else if (type === 'chest' && chest) chest[idx] = value;
    else if (type === 'furnace' && furnace)
      furnace[FURNACE_FIELDS[idx]] = value;
  };
  const canPlace = (type, idx, item) => {
    if (type === 'armor') return getArmorDefinition(item.id)?.slot === idx;
    if (type === 'furnace') return idx === 0 || (idx === 1 && isFuel(item.id));
    return true;
  };
  const slotLimit = (type, item) =>
    type === 'armor' ? 1 : getMaxStackSize(item);

  const changed = () => {
    window.dispatchEvent(new CustomEvent('inventory-changed'));
    refresh();
  };

  // Shift-click: send the stack to the other side of the screen.
  const quickMove = (type, idx) => {
    const item = getSlot(type, idx);
    if (!item) return;
    const stack = { ...item };
    if (type === 'inventory') {
      const armorSlot = getArmorDefinition(stack.id)?.slot;
      if (chest) {
        moveIntoSlots(chest, range(0, CHEST_SLOTS), stack);
      } else if (
        furnace &&
        isSmeltable(stack.id) &&
        canFurnaceTake('input', stack)
      ) {
        moveIntoFurnace('input', stack);
      } else if (furnace && isFuel(stack.id) && canFurnaceTake('fuel', stack)) {
        moveIntoFurnace('fuel', stack);
      } else if (armorSlot !== undefined && !gameState.armor[armorSlot]) {
        gameState.armor[armorSlot] = { ...stack, count: 1 };
        stack.count -= 1;
      } else {
        // Hotbar <-> main inventory.
        moveIntoSlots(
          gameState.inventory,
          idx < 9 ? range(9, 36) : range(0, 9),
          stack
        );
      }
    } else {
      gameState.addItemStack(stack);
    }
    if (stack.count > 0) setSlot(type, idx, { ...item, count: stack.count });
    else setSlot(type, idx, null);
    changed();
  };
  const canFurnaceTake = (field, stack) =>
    !furnace[field] || canStackTogether(furnace[field], stack);
  const moveIntoFurnace = (field, stack) => {
    const current = furnace[field];
    const max = getMaxStackSize(stack);
    const moved = Math.min(stack.count, max - (current?.count ?? 0));
    if (moved <= 0) return;
    furnace[field] = current
      ? { ...current, count: current.count + moved }
      : { ...stack, count: moved };
    stack.count -= moved;
  };

  const handleSlotClick = (
    idx,
    type,
    isRightClick = false,
    isShift = false
  ) => {
    if (isShift && !carryItem) {
      quickMove(type, idx);
      return;
    }
    const slotItem = getSlot(type, idx);
    let carry = carryItem ? { ...carryItem } : null;

    if (!carry) {
      if (!slotItem) return;
      if (isRightClick && slotItem.count > 1) {
        const take = Math.ceil(slotItem.count / 2);
        carry = { ...slotItem, count: take };
        slotItem.count -= take;
      } else {
        carry = slotItem;
        setSlot(type, idx, null);
      }
    } else if (!canPlace(type, idx, carry)) {
      // Output slots only give: pick more of the same item onto the cursor.
      if (type === 'furnace' && slotItem && canStackTogether(slotItem, carry)) {
        const moved = Math.min(
          slotItem.count,
          getMaxStackSize(carry) - carry.count
        );
        carry.count += moved;
        slotItem.count -= moved;
        if (slotItem.count <= 0) setSlot(type, idx, null);
      } else {
        return;
      }
    } else {
      const max = slotLimit(type, carry);
      if (!slotItem) {
        const moved = isRightClick ? 1 : Math.min(max, carry.count);
        setSlot(type, idx, { ...carry, count: moved });
        carry.count -= moved;
      } else if (canStackTogether(slotItem, carry)) {
        const space = max - slotItem.count;
        if (space <= 0) return;
        const moved = isRightClick ? 1 : Math.min(space, carry.count);
        slotItem.count += moved;
        carry.count -= moved;
      } else if (carry.count <= max) {
        setSlot(type, idx, carry);
        carry = slotItem;
      } else {
        return;
      }
    }
    setCarryItem(carry);
    changed();
  };

  const consumeIngredients = () => {
    for (const i of gridIndices) {
      const slot = gameState.craftingGrid[i];
      if (!slot) continue;
      slot.count -= 1;
      if (slot.count <= 0) gameState.craftingGrid[i] = null;
    }
  };

  const makeResultStack = (result) =>
    gameState.createItemStack(
      result.id,
      result.count ?? 1,
      result.kind ?? 'block'
    );

  const handleCraftingResultClick = (isShift = false) => {
    if (!craftingMatch) return;
    if (isShift) {
      // Craft as many as the grid and inventory allow.
      let crafted = 0;
      while (crafted < 64) {
        const match = craftingSystem.match(getActiveGrid());
        if (!match || match.recipeId !== craftingMatch.recipeId) break;
        const stack = makeResultStack(match.result);
        if (!gameState.canAccept(stack)) break;
        gameState.addItemStack(stack);
        consumeIngredients();
        gameState.recordCraft?.(stack.id, match.result.count ?? 1);
        crafted++;
      }
      if (crafted > 0) changed();
      return;
    }
    const stack = makeResultStack(craftingResult);
    if (carryItem && !canStackTogether(carryItem, stack)) return;
    if (carryItem && carryItem.count + stack.count > getMaxStackSize(stack))
      return;
    setCarryItem(
      carryItem ? { ...carryItem, count: carryItem.count + stack.count } : stack
    );
    consumeIngredients();
    gameState.recordCraft?.(stack.id, stack.count);
    changed();
  };

  const handleCreativePick = (entry, toInventory) => {
    const stack = gameState.createItemStack(
      entry.id,
      entry.kind === 'tool' || entry.kind === 'armor' ? 1 : 64,
      entry.kind
    );
    if (toInventory) {
      gameState.addItemStack(stack);
      changed();
    } else {
      setCarryItem(stack);
    }
  };

  const returnCarry = () => {
    if (!carryItem) return;
    gameState.addItemStack({ ...carryItem });
    setCarryItem(null);
  };

  const renderSlot = (idx, type) => {
    const item = getSlot(type, idx);
    const isActive = type === 'inventory' && idx === gameState.selectedSlot;

    return (
      <div
        key={`${type}-${idx}`}
        onClick={(e) => handleSlotClick(idx, type, false, e.shiftKey)}
        onContextMenu={(e) => {
          e.preventDefault();
          handleSlotClick(idx, type, true, false);
        }}
        className={`w-11 h-11 md:w-12 md:h-12 flex-none rounded-md flex items-center justify-center cursor-pointer relative group border-2
          ${isActive ? 'bg-white/15 border-[#ffe066]' : 'bg-black/40 border-black/40 hover:bg-white/10 hover:border-white/20'}`}
      >
        {!item && type === 'armor' && (
          <Shield className="text-white/10" size={18} />
        )}
        {item && <ItemIcon item={item} className="w-8 h-8 md:w-9 md:h-9" />}
        {item && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 rounded-md text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[100] border border-white/10">
            {getItemName(item)}
            {item.count > 1 ? ` ×${item.count}` : ''}
          </div>
        )}
      </div>
    );
  };

  if (activeTab === 'ACHIEVEMENTS') {
    return (
      <AchievementScreen game={game} onClose={() => setActiveTab('STORAGE')} />
    );
  }

  const isCreative = gameState.mode === 'CREATIVE';
  const showCatalog = isCreative && !chest && !furnace;
  const close = () => {
    returnCarry();
    onClose();
  };

  const craftingPanel = (
    <div className="flex items-center gap-3">
      <div
        className={`grid gap-1.5 ${isWorkshop ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        {(isWorkshop ? WORKSHOP_GRID : PLAYER_GRID).map((i) =>
          renderSlot(i, 'crafting')
        )}
      </div>
      <ArrowRight
        className={craftingResult ? 'text-white' : 'text-white/20'}
        size={24}
      />
      <div
        onClick={(e) => handleCraftingResultClick(e.shiftKey)}
        title={
          craftingMatch
            ? `${craftingMatch.recipeName} (shift-click to craft as many as you can)`
            : 'Result'
        }
        className={`w-14 h-14 rounded-lg flex items-center justify-center border-2 relative
          ${craftingResult ? 'border-[#5fae3c] bg-[#5fae3c]/15 cursor-pointer hover:bg-[#5fae3c]/25' : 'border-black/40 bg-black/40'}`}
      >
        {craftingResult && (
          <ItemIcon item={craftingResult} className="w-10 h-10" />
        )}
        {craftingResult?.count > 1 && (
          <span className="absolute bottom-0.5 right-1 text-xs font-bold">
            {craftingResult.count}
          </span>
        )}
      </div>
    </div>
  );

  const topSection = chest ? (
    <Section label="Chest">
      <div className="grid grid-cols-9 gap-1.5">
        {range(0, CHEST_SLOTS).map((i) => renderSlot(i, 'chest'))}
      </div>
    </Section>
  ) : furnace ? (
    <FurnacePanel furnace={furnace} renderSlot={renderSlot} />
  ) : (
    <div className="flex flex-wrap items-start gap-6">
      <Section label="Armor">
        <div className="grid grid-cols-2 gap-1.5">
          {range(0, 4).map((i) => renderSlot(i, 'armor'))}
        </div>
      </Section>
      <Section label={isWorkshop ? 'Crafting table' : 'Crafting'}>
        {craftingPanel}
      </Section>
    </div>
  );

  const playerSlots = (
    <div className="flex flex-col gap-3">
      {topSection}
      <Section label="Inventory">
        <div className="grid grid-cols-9 gap-1.5">
          {range(9, 36).map((i) => renderSlot(i, 'inventory'))}
        </div>
      </Section>
      <div className="grid grid-cols-9 gap-1.5 pt-1.5 border-t-2 border-black/30">
        {range(0, 9).map((i) => renderSlot(i, 'inventory'))}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 pointer-events-auto p-2 md:p-6"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`glass-card p-4 md:p-6 flex flex-col gap-4 max-h-full overflow-hidden ${showCatalog ? 'w-full max-w-6xl h-full max-h-[760px]' : 'max-w-full'}`}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold flex items-center gap-2.5 mr-auto">
            {uiMode === 'WORKSHOP' ? (
              <Hammer className="text-[#ffe066]" size={20} />
            ) : uiMode === 'FURNACE' ? (
              <Flame className="text-[#ffe066]" size={20} />
            ) : uiMode === 'CHEST' ? (
              <Package className="text-[#ffe066]" size={20} />
            ) : (
              <Warehouse className="text-[#ffe066]" size={20} />
            )}
            {MODE_TITLES[uiMode] ?? MODE_TITLES.PLAYER}
          </h2>
          <button
            onClick={() => setActiveTab('ACHIEVEMENTS')}
            className="block-btn block-btn-ghost !py-1.5 !px-3 text-xs"
          >
            <Trophy size={14} /> Goals
          </button>
          <button
            onClick={close}
            title="Close (E or Esc)"
            className="block-btn block-btn-ghost !p-2"
          >
            <X size={18} />
          </button>
        </div>

        {showCatalog ? (
          <div className="flex flex-col lg:flex-row gap-6 min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
            <CreativeCatalog onPick={handleCreativePick} />
            <div className="shrink-0">{playerSlots}</div>
          </div>
        ) : (
          <div className="overflow-y-auto">{playerSlots}</div>
        )}
      </motion.div>

      <CarryGhost carryItem={carryItem} />
    </div>
  );
};

const Section = ({ label, children }) => (
  <div className="flex flex-col gap-2">
    <span className="label-caps">{label}</span>
    {children}
  </div>
);

const MODE_TITLES = {
  PLAYER: 'Inventory',
  WORKSHOP: 'Crafting Table',
  FURNACE: 'Furnace',
  CHEST: 'Chest',
};

const FurnacePanel = ({ furnace, renderSlot }) => {
  const smeltPct = Math.min(100, (furnace.progress / SMELT_SECONDS) * 100);
  const burnPct =
    furnace.burnTotal > 0
      ? Math.min(100, (furnace.burnRemaining / furnace.burnTotal) * 100)
      : 0;
  return (
    <div className="flex flex-col gap-3 items-center">
      <span className="label-caps">Smelting</span>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-2">
          {renderSlot(0, 'furnace')}
          <div
            className="relative w-6 h-6"
            title={furnace.burnRemaining > 0 ? 'Burning' : 'Out of fuel'}
          >
            <Flame className="absolute inset-0 text-white/10" size={24} />
            <div
              className="absolute inset-x-0 bottom-0 overflow-hidden"
              style={{ height: `${burnPct}%` }}
            >
              <Flame className="absolute bottom-0 text-orange-400" size={24} />
            </div>
          </div>
          {renderSlot(1, 'furnace')}
        </div>
        <div className="flex flex-col items-center gap-1 w-14">
          <ArrowRight
            className={smeltPct > 0 ? 'text-white' : 'text-white/20'}
            size={28}
          />
          <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-white"
              style={{ width: `${smeltPct}%` }}
            />
          </div>
        </div>
        {renderSlot(2, 'furnace')}
      </div>
      <span className="text-[9px] text-white/30 text-center max-w-[12rem]">
        Top: item to smelt · Bottom: fuel (coal, charcoal, wood, sticks)
      </span>
    </div>
  );
};

const CarryGhost = ({ carryItem }) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!carryItem) return;
    const handleMove = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [carryItem]);

  return (
    <AnimatePresence>
      {carryItem && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, x: pos.x, y: pos.y }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="fixed top-0 left-0 w-12 h-12 pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-[200]"
        >
          <ItemIcon item={carryItem} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
