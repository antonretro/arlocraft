import React, { useState, useEffect } from 'react';
import { getGame } from '../UIManager';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Settings, 
  LogOut, 
  Users, 
  Map as MapIcon, 
  Clock, 
  Activity,
  Copy,
  User,
  ChevronLeft,
  Volume2,
  Monitor,
  Gamepad
} from 'lucide-react';

export const PauseMenu = ({ setIsPaused }) => {
  const game = getGame();
  const [subScreen, setSubScreen] = useState('main'); // main, settings
  const [settingTab, setSettingTab] = useState('video'); // video, audio, controls, social
  const [settings, setSettings] = useState(() => game?.settingsManager?.getAll() ?? {});

  const updateSetting = (key, value) => {
    game.settingsManager.set(key, value);
    setSettings({ ...game.settingsManager.getAll() });
  };

  const applyPerformancePreset = () => {
    // MAX STABILITY PRESET
    updateSetting('renderDistance', 2);
    updateSetting('resolutionScale', 0.65);
    updateSetting('autoQuality', true);
    updateSetting('stabilityMode', true);
    updateSetting('chunkRebuildBudget', 1);
    updateSetting('lowSpecPresetApplied', true);

    game.world.setRenderDistance(2);
    game.renderer.setResolutionScale(0.65);
  };
  
  const worldSummary = {
    mode: game.gameState?.mode || 'SURVIVAL',
    day: game.dayNight?.getDayNumber?.() || 1,
    time: game.dayNight?.getTimeString?.() || '12:00',
    pos: game.lastKnownPosition ? 
      `${Math.floor(game.lastKnownPosition.x)}, ${Math.floor(game.lastKnownPosition.y)}, ${Math.floor(game.lastKnownPosition.z)}` : 
      '???, ???, ???'
  };

  const handleQuit = () => {
    game.saveWorldLocal(game.selectedWorldSlot);
    game.returnToTitle();
    // Dispatch is handled by Game.js -> UIManager bridge
  };

  return (
    <div className="w-full max-w-4xl p-8">
      <AnimatePresence mode="wait">
        {subScreen === 'main' ? (
          <motion.div 
            key="main"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 md:grid-cols-12 gap-6"
          >
            {/* Sidebar: Primary Actions */}
            <div className="md:col-span-4 flex flex-col gap-3">
              <div className="glass-card p-6 flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-full bg-arlo-blue/20 flex items-center justify-center text-arlo-blue">
                      <User />
                  </div>
                  <div className="flex flex-col">
                      <span className="text-sm font-bold uppercase tracking-widest">{game.settings?.playerName || 'Voyager'}</span>
                      <span className="text-[10px] opacity-40 italic">Active Mission</span>
                  </div>
              </div>

              <PauseButton 
                  onClick={() => game.resumeGame()}
                  icon={<Play size={18}/>} 
                  label="Resume Mission" 
                  primary 
              />
              <PauseButton 
                  onClick={() => setSubScreen('settings')}
                  icon={<Settings size={18}/>} 
                  label="Adjust Options" 
              />
              <PauseButton 
                  onClick={handleQuit}
                  icon={<LogOut size={18}/>} 
                  label="Save & Exit" 
                  danger 
              />
            </div>

            {/* Main Dashboard */}
            <div className="md:col-span-8 flex flex-col gap-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <StatCard icon={<Activity />} label="Game Mode" value={worldSummary.mode} />
                  <StatCard icon={<Clock />} label="World Time" value={worldSummary.time} />
                  <StatCard icon={<MapIcon />} label="Current Day" value={`Day ${worldSummary.day}`} />
              </div>

              <div className="glass-card p-6 flex flex-col gap-4">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Simulation Mode</span>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      {['SURVIVAL', 'CREATIVE', 'ADVENTURE', 'SPECTATOR'].map(m => (
                        <button 
                          key={m}
                          onClick={() => {
                            game.gameState.setMode(m);
                            game.physics.setMode(m);
                            game.settings.preferredMode = m;
                            // Update local state if needed via worldSummary sync
                            window.dispatchEvent(new CustomEvent('ui-refresh'));
                          }}
                          className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all border
                            ${worldSummary.mode === m 
                              ? 'bg-arlo-blue/20 border-arlo-blue text-arlo-blue shadow-[0_0_10px_rgba(0,195,227,0.2)]' 
                              : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'}`}
                        >
                          {m}
                        </button>
                      ))}
                  </div>
              </div>

              <div className="glass-card p-6 flex flex-col gap-4">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Deployment Identity</span>
                  <div className="flex items-center justify-between bg-black/40 p-4 rounded-xl border border-white/5 group">
                      <div className="flex flex-col">
                          <span className="text-[10px] opacity-40 mb-1">JOIN CODE (PEER-TO-PEER)</span>
                          <span className="font-mono text-sm tracking-widest text-arlo-blue">
                              {game.multiplayer?.peer?.id || 'OFFLINE'}
                          </span>
                      </div>
                      <button 
                        onClick={() => navigator.clipboard.writeText(game.multiplayer?.peer?.id)}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-all active:scale-90"
                      >
                          <Copy size={16} className="opacity-40 group-hover:opacity-100" />
                      </button>
                  </div>
                  <p className="text-[10px] opacity-30">Share this code with other voyagers to allow them into your secure world session.</p>
              </div>

              <div className="mt-auto flex justify-between items-center px-4">
                  <span className="text-[10px] opacity-20 uppercase tracking-widest">Build 2026.04.19.EX</span>
                  <div className="flex gap-4 opacity-40 hover:opacity-100 transition-opacity">
                      <span className="text-[10px] font-bold py-1 px-2 bg-white/10 rounded tracking-tighter cursor-help" title={worldSummary.pos}>
                          GPS: {worldSummary.pos}
                      </span>
                  </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="settings"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="glass-card w-full h-[85vh] md:h-[520px] flex flex-col md:flex-row overflow-hidden"
          >
            {/* Settings Header (Mobile) */}
            <div className="flex md:hidden items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
                <button onClick={() => setSubScreen('main')} className="p-2 hover:bg-white/10 rounded-lg">
                  <ChevronLeft size={24} />
                </button>
                <h2 className="text-lg font-bold">Options</h2>
                <div className="w-8" />
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              {/* Settings Sidebar */}
              <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/5 flex flex-row md:flex-col p-2 md:p-4 gap-1 md:gap-2 bg-black/20 overflow-x-auto md:overflow-x-visible">
                <TabButton id="video" label="Visuals" icon={<Monitor size={16}/>} active={settingTab === 'video'} onClick={setSettingTab} />
                <TabButton id="audio" label="Audio" icon={<Volume2 size={16}/>} active={settingTab === 'audio'} onClick={setSettingTab} />
                <TabButton id="controls" label="Controls" icon={<Gamepad size={16}/>} active={settingTab === 'controls'} onClick={setSettingTab} />
                <TabButton id="social" label="Social" icon={<Users size={16}/>} active={settingTab === 'social'} onClick={setSettingTab} />
              </div>

              {/* Settings Content */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Desktop Header */}
                <div className="hidden md:flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/5">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setSubScreen('main')} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                      <ChevronLeft size={24} />
                    </button>
                    <h2 className="text-xl font-bold tracking-tight">Voyage Configuration</h2>
                  </div>
                  <span className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em]">Build: {game.currentVersionId}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-thin">
                <AnimatePresence mode="wait">
                  {settingTab === 'video' && (
                    <motion.div key="video" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8">
                      <ToggleSetting 
                        label="Diagnostic Engine HUD" 
                        desc="Display real-time performance and world state data (F3)" 
                        active={game.profiler?.visible}
                        onToggle={() => {
                          game.profiler?.toggle();
                          // Force re-render of menu
                          setSettings({ ...settings });
                        }}
                      />
                      <ToggleSetting 
                        label="Atmospheric Shadows" 
                        desc="Dynamic block-level voxel shadowing" 
                        active={settings.shadowsEnabled}
                        onToggle={() => {
                          const val = !settings.shadowsEnabled;
                          game.renderer.toggleShadows(val);
                          updateSetting('shadowsEnabled', val);
                        }}
                      />
                       <RangeSetting 
                        label="Field of View" 
                        value={settings.fov} 
                        min={50} max={110} 
                        onChange={(v) => {
                          game.camera.instance.fov = v;
                          game.camera.instance.updateProjectionMatrix();
                          updateSetting('fov', v);
                        }}
                      />
                      <RangeSetting 
                        label="Performance Governor"
                        value={settings.fpsCap}
                        min={30}
                        max={240}
                        step={30}
                        onChange={(val) => {
                          const cap = val > 200 ? 999 : val;
                          updateSetting('fpsCap', cap);
                        }}
                        formatDisplay={(v) => v > 200 ? 'Uncapped' : `${v} FPS`}
                      />
                      <ToggleSetting 
                        label="Auto Performance Scaling" 
                        desc="Adjusts render resolution automatically to hold your FPS target." 
                        active={settings.autoQuality}
                        onToggle={() => {
                          updateSetting('autoQuality', !settings.autoQuality);
                        }}
                      />
                      <RangeSetting 
                        label="Resolution Quality" 
                        value={Math.round((settings.resolutionScale || 0.65) * 100)} 
                        min={20} max={200} 
                        disabled={settings.autoQuality}
                        onChange={(v) => {
                          const scale = v / 100;
                          game.renderer.setResolutionScale(scale);
                          game.settings.autoQuality = false;
                          updateSetting('resolutionScale', scale);
                        }}
                      />
                      <RangeSetting 
                        label="Render Distance" 
                        value={settings.renderDistance || 4} 
                        min={2} max={16} 
                        disabled={settings.autoQuality}
                        onChange={(v) => {
                          game.world.setRenderDistance(v);
                          game.settings.autoQuality = false;
                          updateSetting('renderDistance', v);
                        }}
                      />
                      <ToggleSetting 
                        label="Foliage Swaying" 
                        desc="Simulate atmospheric wind on vegetation" 
                        active={settings.foliageSwaying}
                        onToggle={() => {
                          const val = !settings.foliageSwaying;
                          game.blockRegistry.updateSwaying(val);
                          updateSetting('foliageSwaying', val);
                        }}
                      />

                      <div className="border-t border-white/5 pt-6 flex flex-col gap-4">
                        <span className="text-[10px] font-bold text-arlo-blue uppercase tracking-[0.2em] px-1">Engine Stability Controls</span>
                        <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[11px] leading-relaxed text-white/45">
                          Auto Performance Scaling keeps average FPS up by reducing resolution when needed.
                          Smooth Chunk Streaming is about reducing chunk rebuild spikes and pop-in hitches while exploring.
                        </div>
                        <ToggleSetting 
                          label="Smooth Chunk Streaming" 
                          desc="Rebuilds terrain more gently so exploration feels steadier." 
                          active={settings.stabilityMode}
                          onToggle={() => updateSetting('stabilityMode', !settings.stabilityMode)}
                        />
                        <RangeSetting 
                          label="Chunk Rebuild Budget" 
                          desc="Max chunk geometry updates per frame"
                          value={settings.chunkRebuildBudget} 
                          min={1} max={16} 
                          onChange={(v) => updateSetting('chunkRebuildBudget', v)}
                        />
                        <button 
                          onClick={applyPerformancePreset}
                          className="w-full py-4 bg-arlo-blue/10 hover:bg-arlo-blue/20 border border-arlo-blue/20 rounded-xl text-arlo-blue text-xs font-bold uppercase tracking-widest transition-all"
                        >
                          Apply Safe Performance Preset
                        </button>
                      </div>
                    </motion.div>
                  )}
 
                  {settingTab === 'audio' && (
                    <motion.div key="audio" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8">
                      <RangeSetting 
                        label="Master Volume" 
                        value={Math.round((settings.audioMaster || 0.8) * 100)} 
                        min={0} max={100} 
                        onChange={(v) => {
                          updateSetting('audioMaster', v / 100);
                          game.audio.applyFromSettings(game.settingsManager.getAll());
                        }}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <RangeSetting 
                          label="SFX" 
                          value={Math.round((settings.audioSfx || 1) * 100)} 
                          min={0} max={100} 
                          onChange={(v) => {
                            updateSetting('audioSfx', v / 100);
                            game.audio.applyFromSettings(game.settingsManager.getAll());
                          }}
                        />
                        <RangeSetting 
                          label="UI" 
                          value={Math.round((settings.audioUi || 1) * 100)} 
                          min={0} max={100} 
                          onChange={(v) => {
                            updateSetting('audioUi', v / 100);
                            game.audio.applyFromSettings(game.settingsManager.getAll());
                          }}
                        />
                        <RangeSetting 
                          label="World" 
                          value={Math.round((settings.audioWorld || 1) * 100)} 
                          min={0} max={100} 
                          onChange={(v) => {
                            updateSetting('audioWorld', v / 100);
                            game.audio.applyFromSettings(game.settingsManager.getAll());
                          }}
                        />
                      </div>
                    </motion.div>
                  )}

                  {settingTab === 'controls' && (
                    <motion.div key="controls" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8">
                       <RangeSetting 
                        label="Mouse Sensitivity" 
                        value={Math.round((settings.sensitivity || 0.00145) * 40000)} 
                        min={10} max={200} 
                        onChange={(v) => {
                          const sens = v / 40000;
                          updateSetting('sensitivity', sens);
                        }}
                        formatDisplay={(v) => `${v}%`}
                      />
                      <ToggleSetting 
                        label="Invert Y Axis" 
                        desc="Flip the vertical mouse movement" 
                        active={settings.invertY}
                        onToggle={() => {
                          updateSetting('invertY', !settings.invertY);
                        }}
                      />
                    </motion.div>
                  )}

                  {settingTab === 'social' && (
                    <motion.div key="social" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8 text-center text-white/40 py-12">
                      <Users size={48} className="mx-auto mb-4 opacity-20" />
                      <p className="text-sm">Multiplayer visibility and peer permissions.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const TabButton = ({ id, label, icon, active, onClick }) => (
  <button 
    onClick={() => onClick(id)}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-arlo-blue/20 text-arlo-blue border border-arlo-blue/20' : 'hover:bg-white/5 text-white/60'}`}
  >
    {icon}
    <span className="text-sm font-bold tracking-tight">{label}</span>
  </button>
);

const RangeSetting = ({ label, value, min, max, step = 1, onChange, disabled, formatDisplay }) => {
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);

  return (
    <div className={`flex flex-col gap-2 transition-opacity duration-300 ${disabled ? 'opacity-30 pointer-events-none' : ''}`}>
      <div className="flex justify-between items-center px-1">
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</span>
        <span className="text-xs font-bold text-arlo-blue">
          {formatDisplay ? formatDisplay(val) : `${val}${label.includes('Quality') || label.includes('Density') ? '%' : ''}`}
        </span>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step}
        value={val > 240 ? 240 : val}
        disabled={disabled}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          setVal(v);
          onChange(v);
        }}
        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-arlo-blue outline-none"
      />
    </div>
  );
};

const ToggleSetting = ({ label, desc, active, onToggle }) => (
  <button 
    onClick={onToggle}
    className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5"
  >
    <div className="flex flex-col text-left">
      <span className="text-sm font-bold tracking-wide">{label}</span>
      <span className="text-[10px] opacity-40">{desc}</span>
    </div>
    <div className={`w-10 h-5 rounded-full transition-all relative ${active ? 'bg-arlo-blue' : 'bg-white/10'}`}>
      <motion.div 
        animate={{ x: active ? 20 : 2 }}
        initial={false}
        className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-lg"
      />
    </div>
  </button>
);

const SettingsPanel = ({ icon, label, desc }) => (
  <button className="glass-card p-6 flex flex-col gap-3 hover:bg-white/10 hover:border-arlo-blue/30 transition-all text-left">
    <div className="text-arlo-blue">{icon}</div>
    <div>
      <div className="text-sm font-bold">{label}</div>
      <div className="text-[10px] opacity-40">{desc}</div>
    </div>
  </button>
);

const PauseButton = ({ icon, label, onClick, primary, danger }) => (
  <button 
    onClick={onClick}
    className={`w-full group flex items-center gap-4 p-5 rounded-2xl border transition-all duration-300
      ${primary ? 'bg-arlo-blue/20 border-arlo-blue/30 hover:bg-arlo-blue/30 text-arlo-blue' : 
        danger ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20 text-red-400' : 
        'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}`}
  >
    <div className="transition-transform group-hover:scale-110 group-hover:rotate-6">
        {icon}
    </div>
    <span className="font-bold tracking-wide text-sm">{label}</span>
  </button>
);

const StatCard = ({ icon, label, value }) => (
  <div className="glass-card p-5 flex flex-col gap-3">
    <div className="opacity-40">{icon}</div>
    <div className="flex flex-col">
        <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest">{label}</span>
        <span className="text-sm font-bold tracking-wide">{value}</span>
    </div>
  </div>
);
