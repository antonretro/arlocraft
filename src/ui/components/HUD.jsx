import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Utensils, Zap } from 'lucide-react';

export const HUD = ({ game }) => {
  const [stats, setStats] = useState({ hp: 20, maxHp: 20, hunger: 20, maxHunger: 20, xp: 0, level: 0 });
  const [activeSlot, setActiveSlot] = useState(0);
  const [inventory, setInventory] = useState(Array(9).fill(null));

  useEffect(() => {
    // Listen for engine updates
    const handleHp = (e) => setStats(s => ({ ...s, hp: e.detail }));
    const handleHunger = (e) => setStats(s => ({ ...s, hunger: e.detail }));
    const handleXp = (e) => setStats(s => ({ ...s, xp: e.detail.xp, max: e.detail.max }));
    const handleLevel = (e) => setStats(s => ({ ...s, level: e.detail }));
    
    const handleInventory = () => {
      setInventory(game.gameState.inventory.slice(0, 9));
      setActiveSlot(game.gameState.selectedSlot);
    };

    window.addEventListener('hp-changed', handleHp);
    window.addEventListener('hunger-changed', handleHunger);
    window.addEventListener('xp-changed', handleXp);
    window.addEventListener('level-up', handleLevel);
    window.addEventListener('inventory-changed', handleInventory);

    handleInventory(); // Initial state
    setStats(s => ({ 
      ...s, 
      hp: game.gameState.hp, 
      hunger: game.gameState.hunger,
      level: game.stats.level
    }));

    return () => {
      window.removeEventListener('hp-changed', handleHp);
      window.removeEventListener('hunger-changed', handleHunger);
      window.removeEventListener('xp-changed', handleXp);
      window.removeEventListener('level-up', handleLevel);
      window.removeEventListener('inventory-changed', handleInventory);
    };
  }, [game]);

  return (
    <div className="w-full h-full p-8 flex flex-col justify-end items-center gap-6 pointer-events-none">
      
      {/* Top Left: Status Readout */}
      <div className="absolute top-8 left-8 flex flex-col gap-1 items-start bg-black/20 backdrop-blur-md p-4 rounded-2xl border border-white/5">
        <span className="text-[10px] font-bold text-arlo-blue uppercase tracking-widest">{game.gameState.mode} MODE</span>
        <span className="text-xs opacity-60">Level {stats.level} Voyager</span>
      </div>

      {/* Main Bars */}
      <div className="flex flex-col gap-4 w-full max-w-sm">
        {/* XP Bar */}
        <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden border border-white/5 mb-1">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${(stats.xp / (stats.max || 100)) * 100}%` }}
            className="h-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]"
          />
        </div>

        <div className="flex justify-between items-end">
           <StatusBar icon={<Heart size={14} className="text-red-400"/>} value={stats.hp} max={stats.maxHp} color="bg-red-500" />
           <StatusBar icon={<Utensils size={14} className="text-orange-400"/>} value={stats.hunger} max={stats.maxHunger} color="bg-orange-500" dir="rtl" />
        </div>

        {/* Hotbar */}
        <div className="flex justify-center items-end gap-2 px-6 py-4 glass-card pointer-events-auto">
          {inventory.map((item, i) => (
            <HotbarSlot 
              key={i} 
              item={item} 
              active={i === activeSlot} 
              onClick={() => {
                game.gameState.selectedSlot = i;
                setActiveSlot(i);
                window.dispatchEvent(new CustomEvent('inventory-changed'));
              }}
            />
          ))}
        </div>
      </div>
      
      {/* Centered Crosshair */}
      <div id="crosshair" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 border-2 border-white/40 rounded-full" />
    </div>
  );
};

const StatusBar = ({ icon, value, max, color, dir = 'ltr' }) => {
  const pct = (value / max) * 100;
  return (
    <div className={`flex flex-col gap-1.5 w-40 ${dir === 'rtl' ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-center gap-2 text-white/40 text-[10px] font-bold ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
        {icon} <span>{value} / {max}</span>
      </div>
      <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          className={`h-full ${color} shadow-[0_0_10px_rgba(255,255,255,0.2)]`}
        />
      </div>
    </div>
  );
};

const HotbarSlot = ({ item, active, onClick }) => (
  <motion.button
    whileHover={{ y: -4, scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all border-2 
      ${active ? 'bg-white/20 border-arlo-blue shadow-[0_0_20px_rgba(0,195,227,0.3)]' : 'bg-white/5 border-transparent hover:bg-white/10'}`}
  >
    {item ? (
      <div className="relative group">
        <img 
          src={item.icon || `/assets/blocks/${item.id}.png`} 
          className="w-8 h-8 pixelated" 
          alt={item.id}
          onError={(e) => e.target.src = '/assets/magenta.png'} 
        />
        {item.count > 1 && (
          <span className="absolute -bottom-1 -right-1 text-[10px] font-bold bg-black/60 px-1 rounded">
            {item.count}
          </span>
        )}
      </div>
    ) : (
      <div className="w-1 h-1 bg-white/10 rounded-full" />
    )}
  </motion.button>
);
