import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getGame } from '../UIManager';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, RefreshCw, Box, Hammer, Leaf, Cpu, Carrot, Palette, Trophy, Warehouse, Zap } from 'lucide-react';
import { ItemIcon } from './ItemIcon';
import { RECIPE_BOOK } from '../../data/recipeBook';
import { BLOCKS } from '../../data/blocks';
import { AchievementScreen } from './AchievementScreen';

const MAX_STACK = 99;
const CATEGORIES = [
  { id: 'Building', icon: Hammer, label: 'Construction' },
  { id: 'Natural', icon: Leaf, label: 'Natural' },
  { id: 'Redstone', icon: Cpu, label: 'Redstone' },
  { id: 'Consumables', icon: Carrot, label: 'Consumables' },
  { id: 'Decorative', icon: Palette, label: 'Applied' }
];

export const Inventory = ({ onClose, initialMode = 'PLAYER' }) => {
  const game = getGame();
  const [inventory, setInventory] = useState(() => game?.gameState?.inventory ?? []);
  const [craftingGrid, setCraftingGrid] = useState(() => game?.gameState?.craftingGrid ?? []);
  const [carryItem, setCarryItem] = useState(null);
  const [activeTab, setActiveTab] = useState('STORAGE'); // STORAGE | ACHIEVEMENTS
  const [activeCategory, setActiveCategory] = useState('Building');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Container Mode: PLAYER | WORKSHOP | DISPENSARY | MAGIC
  const [uiMode, setUiMode] = useState(initialMode);

  // Sync state
  useEffect(() => {
    const handleUpdate = () => {
      setInventory([...game.gameState.inventory]);
      setCraftingGrid([...game.gameState.craftingGrid]);
    };
    window.addEventListener('inventory-changed', handleUpdate);
    return () => window.removeEventListener('inventory-changed', handleUpdate);
  }, [game]);


  const sameItem = (a, b) => a && b && a.id === b.id && a.kind === b.kind;

  // Creative Filtering
  const filteredBlocks = useMemo(() => {
    return BLOCKS.filter(b => {
      const matchCat = b.category === activeCategory || (activeCategory === 'Building' && b.category === 'Construction');
      const matchSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          b.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [activeCategory, searchQuery]);

  // Crafting Logic (Enhanced for 3x3)
  const craftingResult = useMemo(() => {
    const isCreative = game.gameState.mode === 'CREATIVE';
    const isWorkshop = uiMode === 'WORKSHOP';
    
    // In PLAYER mode, only indices [0, 1, 3, 4] are active (2x2)
    const grid = isWorkshop 
        ? craftingGrid 
        : [0, 1, 3, 4].map(idx => craftingGrid[idx]);

    const hasAny = grid.some(Boolean);
    if (!hasAny) return null;

    // Check recipes (CraftingSystem matches 3x3 logic)
    for (const recipe of RECIPE_BOOK) {
      if (recipe.type === 'shaped') {
         // Pattern matching logic... (Simplified for now, CraftingSystem handles advanced)
         // In a real impl, we'd use CraftingSystem.match(craftingGrid)
      }
    }
    // Fallback to simplified 2x2 if in player mode and no 3x3 match
    return null; 
  }, [craftingGrid, uiMode]);

  const handleSlotClick = (idx, type, isRightClick = false) => {
    const target = type === 'inventory' ? game.gameState.inventory : game.gameState.craftingGrid;
    const slotItem = target[idx];

    if (!carryItem) {
      if (!slotItem) return;
      if (isRightClick && slotItem.count > 1) {
        const take = Math.ceil(slotItem.count / 2);
        setCarryItem({ ...slotItem, count: take });
        slotItem.count -= take;
      } else {
        setCarryItem({ ...slotItem });
        target[idx] = null;
      }
    } else {
      if (isRightClick) {
        if (!slotItem) {
          target[idx] = { ...carryItem, count: 1 };
          carryItem.count--;
        } else if (sameItem(slotItem, carryItem) && slotItem.count < MAX_STACK) {
          slotItem.count++;
          carryItem.count--;
        }
        if (carryItem.count <= 0) setCarryItem(null);
        else setCarryItem({ ...carryItem });
      } else {
        if (!slotItem) {
          target[idx] = { ...carryItem };
          setCarryItem(null);
        } else if (sameItem(slotItem, carryItem) && slotItem.count < MAX_STACK) {
          const space = MAX_STACK - slotItem.count;
          const moved = Math.min(space, carryItem.count);
          slotItem.count += moved;
          carryItem.count -= moved;
          if (carryItem.count <= 0) setCarryItem(null);
          else setCarryItem({ ...carryItem });
        } else {
          const temp = { ...slotItem };
          target[idx] = { ...carryItem };
          setCarryItem(temp);
        }
      }
    }
    window.dispatchEvent(new CustomEvent('inventory-changed'));
  };

  const handleCreativePick = (blockId) => {
      setCarryItem({ id: blockId, kind: 'block', count: 64 });
  };

  const returnCarry = () => {
    if (!carryItem) return;
    game.gameState.addItemToInventory(carryItem.id, carryItem.count, carryItem.kind);
    setCarryItem(null);
  };

  const renderSlot = (idx, type) => {
    const item = type === 'inventory' ? inventory[idx] : craftingGrid[idx];
    const isActive = type === 'inventory' && idx === game.gameState.selectedSlot;

    return (
      <div 
        key={`${type}-${idx}`}
        onClick={() => handleSlotClick(idx, type, false)}
        onContextMenu={(e) => { e.preventDefault(); handleSlotClick(idx, type, true); }}
        className={`w-12 h-12 md:w-14 md:h-14 aspect-square flex-none rounded-sm flex items-center justify-center transition-all cursor-pointer relative
          ${isActive ? 'bg-white/20 border-2 border-arlo-blue shadow-[0_0_15px_rgba(0,195,227,0.2)]' : 'bg-black/40 border border-white/10 hover:bg-white/5'}
          ${item ? '' : 'hover:border-white/20'}`}
      >
        {item && <ItemIcon item={item} className="w-8 h-8 md:w-10 md:h-10" />}
      </div>
    );
  };

  if (activeTab === 'ACHIEVEMENTS') {
      return <AchievementScreen game={game} onClose={() => setActiveTab('STORAGE')} />;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass-card p-4 md:p-8 flex flex-col gap-6 max-w-[95vw] max-h-[95vh] shadow-2xl relative overflow-hidden"
      >
        <button 
           onClick={() => { returnCarry(); onClose(); }}
           className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white z-50"
        >
          <X size={20} />
        </button>

        <div className="flex gap-8 h-full">
            {/* Header Tabs (Vertical Sidebar) */}
            <div className="flex flex-col gap-3 border-r border-white/5 pr-4">
                <TabButton active={activeTab === 'STORAGE'} onClick={() => setActiveTab('STORAGE')} icon={Warehouse} label="Cargo" />
                <TabButton active={activeTab === 'ACHIEVEMENTS'} onClick={() => setActiveTab('ACHIEVEMENTS')} icon={Trophy} label="Honors" />
                
                <div className="h-px bg-white/5 my-2" />
                
                {game.gameState.mode === 'CREATIVE' && CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`p-3 rounded-xl transition-all flex flex-col items-center gap-1 group
                            ${activeCategory === cat.id ? 'bg-arlo-blue text-white shadow-lg' : 'text-white/20 hover:text-white/40 hover:bg-white/5'}`}
                        title={cat.label}
                    >
                        <cat.icon size={20} />
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-6 flex-1 min-w-0">
                {/* Search / Context Header */}
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black italic tracking-tighter uppercase flex items-center gap-3">
                        {uiMode === 'WORKSHOP' ? <Hammer className="text-arlo-blue" /> : <Warehouse className="text-arlo-blue" />}
                        {uiMode === 'WORKSHOP' ? 'Advanced Fabrication' : 'Mobile Storage Unit'}
                    </h2>
                    
                    {game.gameState.mode === 'CREATIVE' && (
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                            <input 
                                type="text"
                                placeholder="Search archives..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs"
                            />
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row gap-8">
                    {/* Left: Creative Grid or Specialized UI */}
                    {game.gameState.mode === 'CREATIVE' ? (
                        <div className="flex flex-col gap-3 flex-1">
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">System Catalog</span>
                            <div className="grid grid-cols-6 md:grid-cols-8 gap-2 max-h-[35vh] overflow-y-auto p-1 custom-scrollbar">
                                {filteredBlocks.map(block => (
                                    <div 
                                        key={block.id}
                                        onClick={() => handleCreativePick(block.id)}
                                        className="w-10 h-10 bg-black/40 border border-white/10 rounded-sm flex items-center justify-center hover:border-arlo-blue transition-all cursor-pointer group"
                                    >
                                        <ItemIcon item={{ id: block.id, kind: 'block' }} className="w-7 h-7 group-hover:scale-110 transition-transform" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center items-center p-8 bg-white/5 rounded-3xl border border-dashed border-white/5">
                            <Zap className="text-white/5 mb-4" size={48} />
                            <p className="text-[10px] font-bold text-white/10 uppercase tracking-[0.2em] text-center">
                                Resource processing units active.<br/>Standby for fabrication.
                            </p>
                        </div>
                    )}

                    {/* Right: Crafting Table Area */}
                    <div className="flex flex-col gap-3 items-center">
                        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                            {uiMode === 'WORKSHOP' ? '3x3 Matrix' : '2x2 Field'}
                        </span>
                        <div className={`grid gap-2 ${uiMode === 'WORKSHOP' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                            {uiMode === 'WORKSHOP' 
                                ? Array.from({ length: 9 }, (_, i) => renderSlot(i, 'crafting'))
                                : [0, 1, 3, 4].map(i => renderSlot(i, 'crafting'))
                            }
                        </div>
                        <div className="w-14 h-14 mt-4 bg-white/5 border border-arlo-blue/20 rounded-xl flex items-center justify-center shadow-lg relative">
                             {craftingResult && <ItemIcon item={craftingResult} className="w-10 h-10" />}
                             <div className="absolute -top-1 -right-1 w-3 h-3 bg-arlo-blue rounded-full animate-pulse" />
                        </div>
                    </div>
                </div>

                <hr className="border-white/5" />

                {/* Bottom: Player Inventory */}
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Cargo Bay</span>
                        <div className="grid grid-cols-9 gap-2">
                            {Array.from({ length: 27 }, (_, i) => renderSlot(i + 9, 'inventory'))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-arlo-blue/60 uppercase tracking-widest">Hotbar Link</span>
                        <div className="grid grid-cols-9 gap-2">
                            {Array.from({ length: 9 }, (_, i) => renderSlot(i, 'inventory'))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </motion.div>

       {/* Carry Item Ghost */}
       <CarryGhost carryItem={carryItem} />
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

const TabButton = ({ active, onClick, icon: Icon, label }) => (
    <button
        onClick={onClick}
        className={`p-3 rounded-2xl transition-all flex flex-col items-center gap-1 group
            ${active ? 'bg-arlo-blue text-white shadow-lg' : 'text-white/20 hover:text-white/40 hover:bg-white/5'}`}
    >
        <Icon size={20} />
        <span className="text-[8px] font-black uppercase tracking-tighter">{label}</span>
    </button>
);
