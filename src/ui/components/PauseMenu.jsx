import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Settings, LogOut, Copy, Check, Sun, Compass, Sword, Hammer, Map as MapIcon, Eye } from 'lucide-react';
import { getGame } from '../UIManager';
import { BUILD_LABEL } from '../../data/buildInfo.js';
import { SettingsPanel } from './SettingsPanel.jsx';
import { BlockButton, Panel, Choice } from './kit.jsx';

const MODES = [
  { value: 'SURVIVAL', label: 'Survival', icon: <Sword size={16} /> },
  { value: 'CREATIVE', label: 'Creative', icon: <Hammer size={16} /> },
  { value: 'ADVENTURE', label: 'Adventure', icon: <MapIcon size={16} /> },
  { value: 'SPECTATOR', label: 'Spectator', icon: <Eye size={16} /> },
];

export const PauseMenu = () => {
  const game = getGame();
  const [subScreen, setSubScreen] = useState('main');
  const [mode, setMode] = useState(() => game?.gameState?.mode || 'SURVIVAL');
  const [copied, setCopied] = useState(false);
  if (!game) return null;

  const day = game.dayNight?.getDayNumber?.() || 1;
  const time = game.dayNight?.getTimeString?.() || '12:00';
  const p = game.lastKnownPosition;
  const pos = p ? `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}` : '—';
  const joinCode = game.multiplayer?.peer?.id;
  const worldName = game.worldSlots?.getSummary(game.selectedWorldSlot)?.name;

  const changeMode = (m) => {
    game.gameState.setMode(m);
    game.physics.setMode(m);
    game.settings.preferredMode = m;
    setMode(m);
    window.dispatchEvent(new CustomEvent('ui-refresh'));
  };

  const quit = () => {
    game.saveWorldLocal(game.selectedWorldSlot);
    game.returnToTitle();
  };

  return (
    <div className="w-full max-w-4xl p-4 md:p-8">
      <AnimatePresence mode="wait">
        {subScreen === 'main' ? (
          <Panel key="main" className="max-w-md mx-auto">
            <div className="text-center">
              <h2 className="font-pixel text-xl md:text-2xl" style={{ textShadow: '0 3px 0 #3a3e45' }}>
                Paused
              </h2>
              {worldName && <p className="text-sm text-white/50 mt-2 truncate">{worldName}</p>}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat icon={<Sun size={16} />} label="Day" value={day} />
              <Stat icon={<Sun size={16} />} label="Time" value={time} />
              <Stat icon={<Compass size={16} />} label="Position" value={pos} small />
            </div>

            <BlockButton color="green" big className="justify-center" icon={<Play size={18} fill="currentColor" />} onClick={() => game.resumeGame()}>
              Back to game
            </BlockButton>
            <BlockButton className="justify-center" icon={<Settings size={18} />} onClick={() => setSubScreen('settings')}>
              Settings
            </BlockButton>

            <div className="flex flex-col gap-2">
              <span className="label-caps">Game mode</span>
              <Choice options={MODES} value={mode} onChange={changeMode} />
            </div>

            {joinCode && (
              <div className="flex flex-col gap-2">
                <span className="label-caps">Invite friends with this code</span>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(joinCode);
                    setCopied(true);
                  }}
                  className="flex items-center justify-between gap-2 rounded-xl bg-black/40 border-2 border-white/5 px-3 py-2.5 hover:bg-black/55"
                >
                  <span className="font-mono text-sm text-[#ffe066] truncate">{joinCode}</span>
                  {copied ? <Check size={16} className="text-green-300" /> : <Copy size={16} className="text-white/50" />}
                </button>
              </div>
            )}

            <BlockButton color="red" className="justify-center" icon={<LogOut size={18} />} onClick={quit}>
              Save and quit to title
            </BlockButton>
            <div className="text-center text-[10px] font-bold tracking-widest uppercase text-white/25">{BUILD_LABEL}</div>
          </Panel>
        ) : (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SettingsPanel onBack={() => setSubScreen('main')} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Stat = ({ icon, label, value, small }) => (
  <div className="rounded-xl bg-white/[0.04] border-2 border-white/5 px-2 py-2.5 flex flex-col items-center gap-1 min-w-0">
    <span className="text-white/40">{icon}</span>
    <span className={`font-bold truncate max-w-full ${small ? 'text-xs' : 'text-sm'}`}>{value}</span>
    <span className="text-[10px] uppercase tracking-widest text-white/40">{label}</span>
  </div>
);
