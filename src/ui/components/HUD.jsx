import React, { useState, useEffect } from 'react';
import { getGame } from '../UIManager';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Utensils, Zap } from 'lucide-react';
import { ItemIcon } from './ItemIcon';

export const HUD = () => {
  const game = getGame();
  const [stats, setStats] = useState({ hp: 20, maxHp: 20, hunger: 20, maxHunger: 20, xp: 0, level: 0 });
  const [activeSlot, setActiveSlot] = useState(0);
  const [inventory, setInventory] = useState(Array(9).fill(null));
  const [targetBlock, setTargetBlock] = useState(null);

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

    const handleEffects = () => {
      // Force a re-render when effects change
      setStats(s => ({ ...s, _effectTick: Date.now() }));
    };

    window.addEventListener('hp-changed', handleHp);
    window.addEventListener('hunger-changed', handleHunger);
    window.addEventListener('xp-changed', handleXp);
    window.addEventListener('level-up', handleLevel);
    window.addEventListener('inventory-changed', handleInventory);
    window.addEventListener('effects-changed', handleEffects);

    let targetTimeout;
    const handleTarget = (e) => {
        if (targetTimeout) clearTimeout(targetTimeout);
        setTargetBlock(e.detail);
        
        // Hide name after 2 seconds of no change
        if (e.detail) {
            targetTimeout = setTimeout(() => {
                setTargetBlock(null);
            }, 2000);
        }
    };
    window.addEventListener('target-block-changed', handleTarget);

    handleInventory(); // Initial state
    setStats(s => ({
      ...s,
      hp: game.gameState.hp,
      hunger: game.gameState.hunger,
      level: game.stats?.level?.level ?? game.stats?.level ?? 0
    }));

    return () => {
      window.removeEventListener('hp-changed', handleHp);
      window.removeEventListener('hunger-changed', handleHunger);
      window.removeEventListener('xp-changed', handleXp);
      window.removeEventListener('level-up', handleLevel);
      window.removeEventListener('inventory-changed', handleInventory);
      window.removeEventListener('effects-changed', handleEffects);
      window.removeEventListener('target-block-changed', handleTarget);
      if (targetTimeout) clearTimeout(targetTimeout);
    };
  }, [game]);

  const levelNumber = typeof stats.level === 'object' ? stats.level.level : (stats.level || 0);

  return (
    <div className="w-full h-full p-4 md:p-8 flex flex-col justify-end items-center gap-4 md:gap-6 pointer-events-none">

      {/* Top Left: Status Readout */}
      <div className="absolute top-4 left-4 md:top-8 md:left-8 flex items-center gap-4 glass-card p-3 md:p-4 border-white/5">
        <PlayerAvatar />
        <div className="flex flex-col gap-1 items-start">
          <span className="premium-text text-arlo-blue">{game.gameState.mode} MODE</span>
          <span className="text-[11px] opacity-50 italic font-medium tracking-wide">Level {levelNumber} Voyager</span>
        </div>
      </div>

      {/* Top Right: Status Effects (NEW) */}
      <div className="absolute top-4 right-4 md:top-8 md:right-8 flex flex-col items-end gap-2">
        <AnimatePresence>
          {game.gameState.activeEffects.map(effect => (
            <motion.div
              key={effect.id}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="flex items-center gap-3 glass-card px-4 py-2 border-white/10"
            >
              <div className="text-lg filter drop-shadow-md">{effect.icon || '✨'}</div>
              <div className="flex flex-col">
                <span className="premium-text !text-[9px] !tracking-tighter">
                  {effect.name} {effect.level > 1 && effect.level}
                </span>
                <span className="text-[8px] text-white/30 font-bold uppercase tracking-widest">
                  {Math.floor(effect.duration)}s remaining
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Main HUD Bottom Container */}
      <div className="flex flex-col gap-4 w-full max-w-2xl items-center">
        {/* XP Bar (Voyage) */}
        <div className="w-full max-w-sm h-2 bg-black/40 rounded-full overflow-hidden border border-white/5 mb-1 relative">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(stats.xp / (stats.max || 100)) * 100}%` }}
            className="h-full bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.3)]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Target Block Name (NEW) */}
        <div className="h-6 -mt-2 mb-1 flex items-center justify-center">
            <AnimatePresence>
                {targetBlock && targetBlock.name && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 1.1, y: -5 }}
                        className="premium-text !text-arlo-blue opacity-80"
                    >
                        {targetBlock.name}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        <div className="flex justify-between items-end gap-2 w-full max-w-sm">
          <StatusBar icon={<Heart size={14} className="text-red-400" />} value={stats.hp} max={stats.maxHp} color="bg-red-500" />
          <StatusBar icon={<Utensils size={14} className="text-orange-400" />} value={stats.hunger} max={stats.maxHunger} color="bg-orange-500" dir="rtl" />
        </div>

        {/* Hotbar */}
        <div className="flex justify-center items-center gap-1.5 md:gap-2 px-2 md:px-4 py-2 md:py-3 glass-card pointer-events-auto w-auto overflow-visible">
          {inventory.map((item, i) => (
            <HotbarSlot
              key={i}
              index={i}
              item={item}
              active={i === activeSlot}
            />
          ))}
        </div>
      </div>

      {/* Centered Crosshair */}
      <div id="crosshair" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 border-2 border-white/40 rounded-full" />

      {/* Modern Debug Overlay (F3) */}
      <DebugOverlay />
    </div>
  );
};

const PlayerAvatar = () => {
  const [avatar, setAvatar] = useState(null);
  
  useEffect(() => {
    const handleUpdate = (e) => setAvatar(e.detail.avatarUrl);
    window.addEventListener('skin-updated', handleUpdate);
    
    // Check game for initial
    const game = getGame();
    if (game?.settings?.skinUsername) {
        setAvatar(`https://minotar.net/avatar/${game.settings.skinUsername}/64`);
    } else {
        setAvatar('assets/arlo_real.png');
    }

    return () => window.removeEventListener('skin-updated', handleUpdate);
  }, []);

  return (
    <div className="relative w-10 h-10 md:w-12 md:h-12 rounded-lg overflow-hidden border border-white/20 bg-white/5 flex-shrink-0 shadow-lg shadow-black/20">
        <img 
            src={avatar || 'assets/arlo_real.png'} 
            className="w-full h-full object-cover" 
            style={{ imageRendering: 'pixelated' }}
            onError={(e) => { e.target.src = 'assets/arlo_real.png'; }}
            alt="ArloAvatar"
        />
        <div className="absolute inset-0 border border-white/10 rounded-lg pointer-events-none" />
    </div>
  );
};

const DebugOverlay = () => {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    const handleStatus = (e) => setVisible(e.detail);
    const handleMetrics = (e) => setData(e.detail);

    window.addEventListener('debug-status-changed', handleStatus);
    window.addEventListener('debug-metrics-updated', handleMetrics);
    
    // Check initial state from game
    const game = getGame();
    if (game?.profiler?.visible) setVisible(true);

    return () => {
      window.removeEventListener('debug-status-changed', handleStatus);
      window.removeEventListener('debug-metrics-updated', handleMetrics);
    };
  }, []);

  if (!visible || !data) return null;

  const { metrics, fps, frameTime } = data;

  return (
    <div className="absolute top-4 left-4 md:top-8 md:right-8 md:left-auto flex flex-col gap-1 items-start bg-black/60 backdrop-blur-xl p-6 rounded-2xl border border-white/10 text-white font-mono pointer-events-none select-none z-50 min-w-[300px]">
      <div className="flex justify-between items-center w-full border-b border-white/10 pb-3 mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-[#00E5FF]">ArloCraft Debug</span>
        <span className={`text-xs font-bold ${fps > 55 ? 'text-green-400' : 'text-yellow-400'}`}>{Math.round(fps || 0)} FPS</span>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[11px]">
        <span className="text-white/40">Frame Time:</span> <span className="text-right">{Number(frameTime || 0).toFixed(2)}ms</span>
        <div className="col-span-2 h-px bg-white/5 my-1" />
        
        <span className="text-white/40">Physics:</span> <span className="text-right">{Number(metrics.physicsMs || 0).toFixed(2)}ms</span>
        <span className="text-white/40">World:</span> <span className="text-right">{Number(metrics.worldMs || 0).toFixed(2)}ms</span>
        <span className="text-white/40">Render:</span> <span className="text-right">{Number(metrics.renderMs || 0).toFixed(2)}ms</span>
        
        <div className="col-span-2 h-px bg-white/5 my-1" />
        <span className="text-[#00FF88]/60 uppercase text-[9px] font-black col-span-2 mt-1">GPU Pipeline</span>
        <span className="text-white/40">Draw Calls:</span> <span className="text-right">{metrics.drawCalls || 0}</span>
        <span className="text-white/40">Triangles:</span> <span className="text-right">{Number(metrics.triangles || 0).toLocaleString()}</span>
        <span className="text-white/40">VRAM Tex:</span> <span className="text-right">{metrics.textures || 0}</span>

        <div className="col-span-2 h-px bg-white/5 my-1" />
        <span className="text-[#FFCC00]/60 uppercase text-[9px] font-black col-span-2 mt-1">World State</span>
        <span className="text-white/40">Biome:</span> <span className="text-right text-[#FFCC00]">{metrics.biome || 'Unknown'}</span>
        <span className="text-white/40">Coords:</span> <span className="text-right">
            {Number(metrics.playerPos?.x || 0).toFixed(2)}, {Number(metrics.playerPos?.y || 0).toFixed(2)}, {Number(metrics.playerPos?.z || 0).toFixed(2)}
        </span>
        <span className="text-white/40">Chunk:</span> <span className="text-right">{metrics.chunkPos?.cx || 0}, {metrics.chunkPos?.cz || 0}</span>
        
        <div className="col-span-2 h-px bg-white/5 my-1" />
        <span className="text-white/40">Loaded Chunks:</span> <span className="text-right">{metrics.chunks || 0}</span>
        <span className="text-white/40">Load Queue:</span> <span className="text-right">{metrics.rebuildQueue || 0}</span>
        <span className="text-white/40">Entities:</span> <span className="text-right">{metrics.activeEntities || 0}</span>
      </div>
    </div>
  );
};

const StatusBar = ({ icon, value, max, color, dir = 'ltr' }) => {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  return (
    <div className={`flex flex-col gap-1.5 w-full max-w-[160px] ${dir === 'rtl' ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-center gap-2 text-white/30 premium-text !text-[8px] ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
        {icon} <span>{Math.round(value || 0)} / {Math.round(max || 0)}</span>
      </div>
      <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5 shadow-inner">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', damping: 20, stiffness: 100 }}
          className={`h-full ${color} shadow-[0_0_15px_rgba(255,255,255,0.1)]`}
        />
      </div>
    </div>
  );
};

const HotbarSlot = ({ item, active, index }) => (
  <motion.button
    whileHover={{ y: -4, scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    onClick={() => window.dispatchEvent(new CustomEvent('set-hotbar-index', { detail: index }))}
    className={`relative w-12 h-12 md:w-14 md:h-14 aspect-square flex-none rounded-md flex items-center justify-center transition-all border-2
      ${active
        ? 'bg-arlo-blue/30 border-arlo-blue shadow-[0_0_15px_rgba(0,195,227,0.4)] scale-110 z-10'
        : 'bg-black/40 border-white/10 hover:bg-white/10'
      }`}
  >
    <div className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center">
      {item ? (
        <ItemIcon item={item} className="w-full h-full" />
      ) : (
        <div className="w-1 h-1 bg-white/10 rounded-full" />
      )}
    </div>
  </motion.button>
);
