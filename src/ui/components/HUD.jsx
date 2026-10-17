import React, { useState, useEffect } from 'react';
import { getGame } from '../UIManager';
import { motion, AnimatePresence } from 'framer-motion';

import { ItemIcon } from './ItemIcon';
import { MiniMap } from './MiniMap';

export const HUD = () => {
  const game = getGame();
  const [stats, setStats] = useState({ hp: 20, maxHp: 20, hunger: 20, maxHunger: 20, xp: 0, level: 0 });
  const [activeSlot, setActiveSlot] = useState(0);
  const [inventory, setInventory] = useState(Array(9).fill(null));
  const [targetBlock, setTargetBlock] = useState(null);
  const [mode, setMode] = useState(() => game.gameState.mode);

  useEffect(() => {
    // Listen for engine updates
    const handleHp = (e) => setStats(s => ({ ...s, hp: e.detail }));
    const handleHunger = (e) => setStats(s => ({ ...s, hunger: e.detail }));
    const handleXp = (e) => setStats(s => ({ ...s, xp: e.detail.xp, max: e.detail.max }));
    const handleLevel = (e) => setStats(s => ({ ...s, level: e.detail }));

    const handleInventory = () => {
      setInventory(game.gameState.inventory.slice(0, 9));
    };

    const handleSlot = (e) => setActiveSlot(e.detail);

    const handleEffects = () => {
      // Force a re-render when effects change
      setStats(s => ({ ...s, _effectTick: Date.now() }));
    };

    window.addEventListener('hp-changed', handleHp);
    window.addEventListener('hunger-changed', handleHunger);
    window.addEventListener('xp-changed', handleXp);
    window.addEventListener('level-up', handleLevel);
    window.addEventListener('inventory-changed', handleInventory);
    window.addEventListener('slot-changed', handleSlot);
    window.addEventListener('effects-changed', handleEffects);
    const handleMode = (e) => setMode(e.detail);
    window.addEventListener('mode-changed', handleMode);

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
      window.removeEventListener('slot-changed', handleSlot);
      window.removeEventListener('effects-changed', handleEffects);
      window.removeEventListener('mode-changed', handleMode);
      window.removeEventListener('target-block-changed', handleTarget);
      if (targetTimeout) clearTimeout(targetTimeout);
    };
  }, [game]);

  const levelNumber = typeof stats.level === 'object' ? stats.level.level : (stats.level || 0);

  return (
    <div className="w-full h-full p-4 md:p-8 flex flex-col justify-end items-center gap-4 md:gap-6 pointer-events-none">

      {/* Top Right: MiniMap */}
      <div className="absolute top-4 right-4 md:top-8 md:right-8 z-20">
        <MiniMap />
      </div>

      {/* Top Right: Status Effects (NEW) */}
      <div className="absolute top-40 right-4 md:top-48 md:right-8 flex flex-col items-end gap-2">
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
        {/* Target Block & Active Item (NEW) */}
        <div className="h-6 -mt-2 mb-1 flex items-center justify-center relative">
            <AnimatePresence mode="wait">
                {targetBlock && targetBlock.name ? (
                    <motion.div
                        key="target"
                        initial={{ opacity: 0, scale: 0.9, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 1.1, y: -5 }}
                        className="text-sm font-bold text-white px-2.5 py-0.5 rounded-md bg-black/45"
                    >
                        {targetBlock.name}
                    </motion.div>
                ) : (
                    inventory[activeSlot] && (
                        <motion.div
                            key="held"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 0.6, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="text-sm font-bold text-white px-2.5 py-0.5 rounded-md bg-black/45"
                        >
                            {inventory[activeSlot].name || inventory[activeSlot].id.replace(/_/g, ' ')}
                        </motion.div>
                    )
                )}
            </AnimatePresence>
        </div>

        {(mode === 'SURVIVAL' || mode === 'ADVENTURE') && (
          <div className="flex flex-col gap-1.5 items-stretch">
            <div className="flex justify-between gap-6">
              <IconRow value={stats.hp} max={game.gameState.maxHp ?? 20} kind="heart" />
              <IconRow value={stats.hunger} max={20} kind="food" reverse />
            </div>
            <XpBar xp={stats.xp} max={stats.max} level={levelNumber} />
          </div>
        )}

        {/* Hotbar */}
        <div className="flex justify-center items-center gap-1 p-1.5 rounded-xl bg-black/55 border-2 border-black/60 shadow-[inset_0_2px_0_rgba(255,255,255,0.08)] pointer-events-auto w-auto overflow-visible">
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

      {/* Chat Interface (NEW) */}
      <ChatBox game={game} />

      {/* Centered Crosshair */}
      <div id="crosshair" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 mix-blend-difference">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-0.5 h-full bg-white" />
        <div className="absolute top-1/2 left-0 -translate-y-1/2 h-0.5 w-full bg-white" />
      </div>

      {/* Modern Debug Overlay (F3) */}
      <DebugOverlay />
    </div>
  );
};

const ChatBox = ({ game }) => {
  const [messages, setMessages] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const chatRef = React.useRef();
  const inputRef = React.useRef();

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      game.chat.visible = true;
      if (document.pointerLockElement) document.exitPointerLock();
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleUpdate = (e) => setMessages([...e.detail]);

    window.addEventListener('chat-open', handleOpen);
    window.addEventListener('chat-updated', handleUpdate);

    return () => {
      window.removeEventListener('chat-open', handleOpen);
      window.removeEventListener('chat-updated', handleUpdate);
    };
  }, [game]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      game.chat.sendMessage(inputValue);
      setInputValue('');
    }
    setIsOpen(false);
    game.chat.visible = false;
    // Re-lock pointer if possible
    if (game.hasStarted && !game.isPaused && !game.gameState.isInventoryOpen) {
        game.input?.setPointerLock();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      game.chat.visible = false;
      if (game.hasStarted && !game.isPaused && !game.gameState.isInventoryOpen) {
          game.input?.setPointerLock();
      }
    }
  };

  return (
    <div className={`absolute bottom-40 left-4 md:bottom-48 md:left-8 w-full max-w-sm flex flex-col gap-2 transition-all duration-300 ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      {/* Message List */}
      <div className="flex flex-col gap-1 overflow-hidden h-48 justify-end">
        <AnimatePresence initial={false}>
          {messages.slice(-8).map((msg, i) => (
            <motion.div
              key={msg.id}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`px-3 py-1.5 rounded text-[11px] font-medium max-w-fit shadow-lg shadow-black/20
                ${msg.type === 'system' ? 'bg-arlo-blue/20 text-arlo-blue border border-arlo-blue/30 italic' : 
                  msg.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                  'bg-black/40 text-white border border-white/5 backdrop-blur-sm'}`}
            >
              <span className={msg.type === 'user' ? 'text-arlo-blue/80 mr-2 font-bold' : ''}>
                {msg.type === 'user' ? `<${msg.sender}>` : ''}
              </span>
              <span className="leading-relaxed tracking-wide">{msg.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Input Field */}
      {isOpen && (
        <motion.form
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onSubmit={handleSubmit}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-black/60 backdrop-blur-2xl border border-arlo-blue/50 rounded-lg px-4 py-3 text-xs text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-arlo-blue/30 shadow-2xl"
            placeholder="Say something, or type / for commands"
          />
          <button type="submit" className="hidden">Send</button>
        </motion.form>
      )}
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
        <span className="text-white/40">Dirty Chunks:</span> <span className="text-right">{metrics.dirtyChunks || 0}</span>
        <span className="text-white/40">Load Queue:</span> <span className="text-right">{metrics.rebuildQueue || 0}</span>
        <span className="text-white/40">Mesh Build:</span> <span className="text-right">{Number(metrics.meshMs || 0).toFixed(2)}ms</span>
        <span className="text-white/40">Entities:</span> <span className="text-right">{metrics.activeEntities || 0}</span>
      </div>
    </div>
  );
};

const HEART_PATH =
  'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z';
const FOOD_PATH =
  'M15 3c3.3 0 6 2.7 6 6 0 2.6-1.7 4.9-4.1 5.7L11 20.6a2 2 0 0 1-2.8 0l-.4-.4-2.6 1.6a1.5 1.5 0 0 1-2-2l1.6-2.6-.4-.4a2 2 0 0 1 0-2.8l5.9-5.9C11.1 4.7 12.9 3 15 3z';

/** Ten hearts or drumsticks, each worth 2 points, with half icons. */
const IconRow = ({ value, max, kind, reverse }) => {
  const path = kind === 'heart' ? HEART_PATH : FOOD_PATH;
  const fill = kind === 'heart' ? '#e8312f' : '#c98a3b';
  const icons = Math.ceil((max || 20) / 2);
  const v = Math.max(0, Math.round(value || 0));
  const low = kind === 'heart' && v <= 4;
  return (
    <div className={`flex gap-px ${reverse ? 'flex-row-reverse' : ''} ${low ? 'animate-pulse' : ''}`}>
      {Array.from({ length: icons }, (_, i) => {
        const part = Math.max(0, Math.min(2, v - i * 2)); // 0 empty, 1 half, 2 full
        return (
          <svg key={i} viewBox="0 0 24 24" className="w-4 h-4 md:w-[18px] md:h-[18px] drop-shadow-[0_1px_0_rgba(0,0,0,0.9)]">
            <path d={path} fill="rgba(0,0,0,0.55)" stroke="#111" strokeWidth="2" />
            {part > 0 && (
              <>
                <clipPath id={`${kind}-${i}`}>
                  <rect x={reverse ? (part === 1 ? 12 : 0) : 0} y="0" width={part === 2 ? 24 : 12} height="24" />
                </clipPath>
                <path d={path} fill={fill} clipPath={`url(#${kind}-${i})`} />
              </>
            )}
          </svg>
        );
      })}
    </div>
  );
};

const XpBar = ({ xp, max, level }) => {
  const pct = Math.max(0, Math.min(100, ((xp || 0) / (max || 100)) * 100));
  return (
    <div className="relative h-2 rounded-sm bg-black/70 border border-black">
      <div className="h-full bg-[#7fdc3c] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      {level > 0 && (
        <span className="absolute left-1/2 -translate-x-1/2 -top-4 font-pixel text-[10px] text-[#80ff20]" style={{ textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}>
          {level}
        </span>
      )}
    </div>
  );
};

const HotbarSlot = ({ item, active, index }) => (
  <motion.button
    whileTap={{ scale: 0.95 }}
    onClick={() => window.dispatchEvent(new CustomEvent('set-hotbar-index', { detail: index }))}
    className={`relative w-11 h-11 md:w-[52px] md:h-[52px] aspect-square flex-none rounded-lg flex items-center justify-center transition-colors border-2 group
      ${active
        ? 'bg-white/15 border-[#ffe066] shadow-[0_0_0_2px_rgba(0,0,0,0.6)] z-10'
        : 'bg-white/[0.06] border-white/5 hover:bg-white/10'
      }`}
  >
    <div className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center">
      {item ? (
        <>
          <ItemIcon item={item} className="w-full h-full" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-black/80 backdrop-blur-md rounded text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-white/10 shadow-xl">
            {item.name || item.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </div>
        </>
      ) : (
        <span className="text-[10px] font-bold text-white/15">{index + 1}</span>
      )}
    </div>
  </motion.button>
);
