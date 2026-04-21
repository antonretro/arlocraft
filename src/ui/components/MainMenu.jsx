import React, { useEffect, useState } from 'react';
import { getGame } from '../UIManager';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Gamepad2, 
  Settings, 
  Palette, 
  Library, 
  Globe, 
  ChevronRight,
  Clipboard,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  Monitor,
  Volume2,
  Gamepad
} from 'lucide-react';

export const MainMenu = ({ setScreen }) => {
  const game = getGame();
  const [subScreen, setSubScreen] = useState('main'); // main, multiplayer, worlds, settings, skins
  const [settingTab, setSettingTab] = useState('video'); // video, audio, controls, social
  const [joinCode, setJoinCode] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorldData, setNewWorldData] = useState({ name: '', seed: '', mode: 'SURVIVAL' });
  const [isRenaming, setIsRenaming] = useState(null); // slotId
  const [renameValue, setRenameValue] = useState('');
  const [skinSearchQuery, setSkinSearchQuery] = useState('');
  const [localPlayerName, setLocalPlayerName] = useState(() => game?.settings?.playerName || 'Arlo');
  const [settings, setSettings] = useState(() => game?.settingsManager?.getAll() ?? {});
  const [selectedSkinId, setSelectedSkinId] = useState(
    () => game?.skinSystem?.currentSkin || 'classic_steve'
  );
  const [multiplayerId, setMultiplayerId] = useState(() => game?.multiplayer?.peer?.id || null);

  useEffect(() => {
    const handleSkinChange = (e) => {
      if (e.detail?.skinId) setSelectedSkinId(e.detail.skinId);
    };
    window.addEventListener('skin-changed', handleSkinChange);
    return () => window.removeEventListener('skin-changed', handleSkinChange);
  }, []);

  useEffect(() => {
    if (subScreen === 'multiplayer' && game.multiplayer) {
      if (!game.multiplayer.peer) {
        game.multiplayer.init();
      } else {
        setMultiplayerId(game.multiplayer.peer.id);
      }
      
      const prevOnConnected = game.multiplayer.onConnected;
      game.multiplayer.onConnected = (id) => {
        setMultiplayerId(id);
        if (prevOnConnected) prevOnConnected(id);
      };

      return () => {
        game.multiplayer.onConnected = prevOnConnected;
      };
    }
  }, [subScreen, game.multiplayer]);

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

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setStatus({ type: 'error', message: 'Please enter a valid Join Code.' });
      return;
    }
    
    setStatus({ type: 'loading', message: 'Connecting to host...' });
    
    try {
      await game.multiplayer.connectToPeer(joinCode.trim());
      setStatus({ type: 'success', message: 'Connected! Syncing world...' });
      // The MultiplayerManager will trigger the game start via events
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 }
  };

  return (
    <div className="w-full max-w-6xl px-8 flex flex-col md:flex-row items-center justify-between gap-12">
      {/* Brand Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-2"
      >
        <span className="text-arlo-blue font-bold tracking-widest text-sm uppercase">The Voyage of Discovery</span>
        <h1 className="ni-title text-shadow-glow">ARLOCRAFT</h1>
        <p className="text-white/40 max-w-xs text-sm mt-4 leading-relaxed">
          Embark on a modular journey through infinite voxel horizons. Built with THREE.JS.
        </p>
      </motion.div>

      {/* Action Panel */}
      <div className="w-full max-w-md h-[480px] relative">
        <AnimatePresence mode="wait">
          {subScreen === 'main' && (
            <motion.div
              key="main"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="flex flex-col gap-3"
            >
              <MenuButton 
                onClick={() => setSubScreen('worlds')}
                icon={<Gamepad2 size={20}/>}
                label="Singleplayer" 
                desc="Continue your solo adventure"
                color="blue"
              />
              <MenuButton 
                onClick={() => setSubScreen('multiplayer')}
                icon={<Globe size={20}/>}
                label="Multiplayer" 
                desc="Join friends across the P2P bridge"
                color="purple"
              />
              <div className="grid grid-cols-2 gap-3 mt-4">
                <IconButton onClick={() => setSubScreen('skins')} icon={<Palette/>} label="Skins" color="green" />
                <IconButton
                  onClick={() => window.alert('Resource Packs coming soon in Voyage v1.2')}
                  icon={<Library/>}
                  label="Packs"
                  color="orange"
                  badge="Voyage v1.2"
                  caption="Resource Packs coming soon"
                />
              </div>
              <div className="rounded-2xl border border-orange-400/20 bg-orange-500/10 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-200/80">
                  Voyage v1.2 Preview
                </div>
                <div className="mt-1 text-sm text-white/70">
                  Resource Packs coming soon in Voyage v1.2.
                </div>
              </div>
              <MenuButton 
                onClick={() => setSubScreen('settings')}
                icon={<Settings size={20}/>}
                label="Options" 
                desc="Gameplay & Graphics"
              />
            </motion.div>
          )}

          {subScreen === 'worlds' && (
            <motion.div
              key="worlds"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="glass-card p-6 flex flex-col gap-6"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setSubScreen('main')} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <ChevronRight className="rotate-180" />
                </button>
                <h2 className="text-xl font-bold">World Selection</h2>
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto max-h-72 pr-2 scrollbar-thin">
                {game.worldSlots.getAll().map(slotId => {
                  const summary = game.worldSlots.getSummary(slotId);
                  return (
                    <div key={slotId} className="group relative">
                      <button 
                        onClick={() => {
                          game.selectedWorldSlot = slotId;
                          if (summary) {
                            game.loadWorldLocal(slotId);
                            game.startGame({ skipSeedApply: true, preserveCurrentMode: true });
                          } else {
                            setShowCreateModal(true);
                          }
                        }}
                        className={`w-full flex flex-col gap-1 p-4 border rounded-xl transition-all text-left
                          ${summary ? 'bg-white/5 border-white/5 hover:bg-white/10' : 'bg-white/[0.02] border-dashed border-white/10 hover:border-arlo-blue/40'}`}
                      >
                        <div className="flex items-center justify-between">
                          {isRenaming === slotId ? (
                            <input 
                              autoFocus
                              className="bg-black/40 border border-arlo-blue/50 rounded px-2 py-0.5 text-sm outline-none"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => {
                                if (renameValue.trim()) game.worldSlots.setSlotName(slotId, renameValue.trim());
                                setIsRenaming(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                   if (renameValue.trim()) game.worldSlots.setSlotName(slotId, renameValue.trim());
                                   setIsRenaming(null);
                                }
                              }}
                            />
                          ) : (
                            <span className="font-bold text-sm tracking-wide">{summary ? summary.name : 'Empty Slot'}</span>
                          )}
                          {summary && <span className="text-[10px] text-arlo-blue font-bold px-2 py-0.5 bg-arlo-blue/10 rounded tracking-widest uppercase">{summary.mode}</span>}
                        </div>
                        <span className="text-[10px] opacity-40">
                          {summary ? `Saves: ${new Date(summary.savedAt).toLocaleDateString()} • Seed: ${summary.seed}` : 'Forge a new horizon here'}
                        </span>
                      </button>
                      
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {summary && (
                          <>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameValue(summary.name);
                                setIsRenaming(slotId);
                              }}
                              className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg"
                            >
                              <Palette size={14}/>
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Are you sure you want to delete this world?')) {
                                  game.deleteWorldSlot(slotId);
                                  setSubScreen('main');
                                }
                              }}
                              className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                            >
                              <Trash2 size={14}/>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={() => {
                  const firstEmpty = game.worldSlots.getAll().find(s => !game.worldSlots.exists(s));
                  if (firstEmpty) {
                    game.selectedWorldSlot = firstEmpty;
                    setShowCreateModal(true);
                  } else {
                    alert('All world slots are full! Delete one to forge anew.');
                  }
                }}
                className="glass-btn glass-btn-blue flex items-center justify-center gap-3 mt-auto"
              >
                <Plus size={18}/>
                <span className="font-bold text-sm tracking-widest uppercase">Forge New World</span>
              </button>
            </motion.div>
          )}

          {subScreen === 'skins' && (
            <motion.div
              key="skins"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="glass-card p-6 flex flex-col gap-6"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setSubScreen('main')} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <ChevronRight className="rotate-180" />
                </button>
                <h2 className="text-xl font-bold">Identity & Skin</h2>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Voyage Signature (Display Name)</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Enter identity..."
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-arlo-blue/50 transition-colors text-sm"
                      value={localPlayerName}
                      onChange={(e) => {
                        setLocalPlayerName(e.target.value);
                        game.settingsManager.set('playerName', e.target.value);
                      }}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Identity Recall (Skin Lookup)</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Username (e.g. Grian, Notch)..."
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-arlo-blue/50 transition-colors text-sm"
                      value={skinSearchQuery}
                      onChange={(e) => setSkinSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                        if (e.key === 'Enter' && skinSearchQuery.trim()) {
                           setSelectedSkinId(`custom_${skinSearchQuery.trim().replace(/\s+/g, '_')}`);
                           game.skinSystem.applySkinByUsername(skinSearchQuery);
                           setSkinSearchQuery('');
                        }
                      }}
                    />
                    <button 
                      onClick={() => {
                        if (skinSearchQuery.trim()) {
                          setSelectedSkinId(`custom_${skinSearchQuery.trim().replace(/\s+/g, '_')}`);
                          game.skinSystem.applySkinByUsername(skinSearchQuery);
                          setSkinSearchQuery('');
                        }
                      }}
                      className="glass-btn glass-btn-blue !px-4"
                    >
                      Recall
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 overflow-hidden">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Standard Replicas</label>
                <div className="grid grid-cols-5 gap-2 overflow-y-auto max-h-40 p-1 scrollbar-thin">
                  {[...game.skinSystem.classicSkins, ...game.skinSystem.randomSkins].map(skin => {
                    const isActive = selectedSkinId === skin.id;
                    return (
                      <button
                        key={skin.id}
                        onClick={() => {
                          setSelectedSkinId(skin.id);
                          game.skinSystem.applySkin(skin.id);
                        }}
                        className={`aspect-square p-2 rounded-xl border transition-all 
                          ${isActive ? 'bg-arlo-blue/20 border-arlo-blue' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                      >
                        <img 
                          src={skin.faceUrl || skin.url || `${import.meta.env.BASE_URL || '/'}assets/skins/default_face.png`} 
                          className="w-full h-full object-contain pixelated rounded-md"
                          alt={skin.name}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-auto px-2">
                <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Active Voyager</span>
                <p className="text-sm font-bold text-arlo-blue leading-none">
                  {game.skinSystem.getSkinMeta(selectedSkinId).name}
                </p>
              </div>
            </motion.div>
          )}

          {subScreen === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="glass-card w-[95%] max-w-4xl h-[85vh] md:h-[520px] fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col md:flex-row overflow-hidden z-[100]"
            >
              {/* Settings Header (Mobile) */}
              <div className="flex md:hidden items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
                  <button onClick={() => setSubScreen('main')} className="p-2 hover:bg-white/10 rounded-lg">
                    <ChevronRight className="rotate-180" />
                  </button>
                  <h2 className="text-lg font-bold">Options</h2>
                  <div className="w-8" /> 
              </div>

              {/* Sidebar / Tabs Container */}
              <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                {/* Settings Sidebar */}
                <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/5 flex flex-row md:flex-col p-2 md:p-4 gap-1 md:gap-2 bg-black/20 overflow-x-auto md:overflow-x-visible">
                  <TabButton id="video" label="Visuals" icon={<Monitor size={16}/>} active={settingTab === 'video'} onClick={setSettingTab} />
                  <TabButton id="audio" label="Audio" icon={<Volume2 size={16}/>} active={settingTab === 'audio'} onClick={setSettingTab} />
                  <TabButton id="controls" label="Controls" icon={<Gamepad size={16}/>} active={settingTab === 'controls'} onClick={setSettingTab} />
                  <TabButton id="social" label="Social" icon={<Users size={16}/>} active={settingTab === 'social'} onClick={setSettingTab} />
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Desktop Header */}
                    <div className="hidden md:flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/5">
                        <div className="flex items-center gap-4">
                        <button onClick={() => setSubScreen('main')} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <ChevronRight className="rotate-180" />
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
                        <ToggleSetting 
                          label="Auto Performance Scaling" 
                          desc="Adjusts render resolution automatically to hold your FPS target." 
                          active={settings.autoQuality}
                          onToggle={() => {
                            updateSetting('autoQuality', !settings.autoQuality);
                          }}
                        />
                        <RangeSetting 
                          id="setting-fps"
                          label="Performance Governor"
                          value={settings.fpsCap}
                          min={30}
                          max={240}
                          step={30}
                          unit="FPS"
                          onChange={(val) => {
                            const cap = val > 200 ? 999 : val;
                            updateSetting('fpsCap', cap);
                          }}
                          formatDisplay={(v) => v > 200 ? 'Uncapped' : `${v} FPS`}
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
                          value={settings.renderDistance || 8} 
                          min={2} max={16} 
                          disabled={settings.autoQuality}
                          onChange={(v) => {
                            game.world.setRenderDistance(v);
                            game.settings.autoQuality = false;
                            updateSetting('renderDistance', v);
                          }}
                        />
                         <RangeSetting 
                          label="Cloud Density" 
                          value={Math.round((settings.cloudOpacity || 0.85) * 100)} 
                          min={0} max={100} 
                          onChange={(v) => {
                            const op = v / 100;
                            if (game.renderer.cloudMat) {
                                game.renderer.cloudMat.uniforms.cloudOpacity.value = op;
                            }
                            updateSetting('cloudOpacity', op);
                          }}
                        />

                        <div className="border-t border-white/5 pt-6 flex flex-col gap-6">
                          <span className="text-[10px] font-bold text-arlo-blue uppercase tracking-[0.2em] px-1">Engine Stability Controls</span>
                          <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[11px] leading-relaxed text-white/45">
                            Auto Performance Scaling helps average FPS by lowering resolution when needed.
                            Smooth Chunk Streaming reduces the size of chunk-mesh spikes while you move through the world.
                          </div>
                          <ToggleSetting 
                            label="Smooth Chunk Streaming" 
                            desc="Cuts chunk-pop stutters by rebuilding terrain more gently." 
                            active={settings.stabilityMode}
                            onToggle={() => updateSetting('stabilityMode', !settings.stabilityMode)}
                          />
                          <RangeSetting 
                            label="Chunk Rebuild Budget" 
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
                          value={Math.round((settings.audioMaster || 0.82) * 100)} 
                          min={0} max={100} 
                          onChange={(v) => {
                            updateSetting('audioMaster', v / 100);
                            game.audio.applyFromSettings(game.settingsManager.getAll());
                          }}
                        />
                      </motion.div>
                    )}

                    {settingTab === 'controls' && (
                      <motion.div key="controls" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8 text-center text-white/40 py-12">
                        <Gamepad size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-sm">Neural link sensitivity and remapping available in the next arlo patch.</p>
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

          {subScreen === 'multiplayer' && (
            <motion.div
              key="multi"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="glass-card p-6 flex flex-col gap-6"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setSubScreen('main')} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <ChevronRight className="rotate-180" />
                </button>
                <h2 className="text-xl font-bold">Multiplayer Tunnel</h2>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Join Remote World</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="Enter Join Code..."
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-arlo-blue/50 transition-colors text-sm"
                  />
                  <button 
                    onClick={handleJoin}
                    disabled={status.type === 'loading'}
                    className="glass-btn glass-btn-blue !px-4"
                  >
                    Connect
                  </button>
                </div>
              </div>

              {status.message && (
                <div className={`p-4 rounded-xl flex items-center gap-3 text-sm ${
                  status.type === 'error' ? 'bg-red-500/10 text-red-200 border border-red-500/20' : 
                  status.type === 'success' ? 'bg-green-500/10 text-green-200 border border-green-500/20' :
                  'bg-blue-500/10 text-blue-200 border border-blue-500/20'
                }`}>
                  {status.type === 'error' ? <AlertCircle size={18}/> : 
                   status.type === 'success' ? <CheckCircle2 size={18}/> : 
                   <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                  {status.message}
                </div>
              )}

              <div className="mt-auto p-4 rounded-xl bg-arlo-blue/5 border border-arlo-blue/10">
                <p className="text-[10px] text-white/40 leading-relaxed italic">
                  To host a world and get a Join Code, simply start a Singleplayer world. Your friends can then use your code to join you.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal extracted to solve wait-mode child conflicts */}
        <AnimatePresence>
          {showCreateModal && (
            <motion.div 
              key="create-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="glass-card max-w-sm w-full p-8 flex flex-col gap-6 border-arlo-blue/20"
              >
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-bold text-arlo-blue tracking-tight">Forge New World</h3>
                  <p className="text-[10px] opacity-40 uppercase tracking-widest font-bold">Slot: {game.selectedWorldSlot?.toUpperCase()}</p>
                </div>

                <div className="flex flex-col gap-5">
                   <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">World Name</label>
                      <input 
                        type="text" 
                        placeholder="Arlo's Odyssey..."
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-arlo-blue/50 transition-colors"
                        value={newWorldData.name}
                        onChange={(e) => setNewWorldData({...newWorldData, name: e.target.value})}
                      />
                   </div>
                   <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">World Seed (Optional)</label>
                      <input 
                        type="text" 
                        placeholder="Random"
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-arlo-blue/50 transition-colors"
                        value={newWorldData.seed}
                        onChange={(e) => setNewWorldData({...newWorldData, seed: e.target.value})}
                      />
                   </div>
                   <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Simulation Mode</label>
                      <div className="grid grid-cols-2 gap-2">
                         {['SURVIVAL', 'CREATIVE', 'ADVENTURE', 'SPECTATOR'].map(m => (
                           <button
                             key={m}
                             onClick={() => setNewWorldData({...newWorldData, mode: m})}
                             className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all border
                               ${newWorldData.mode === m 
                                 ? 'bg-arlo-blue/20 border-arlo-blue text-arlo-blue shadow-[0_0_10px_rgba(0,195,227,0.2)]' 
                                 : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
                           >
                             {m}
                           </button>
                         ))}
                      </div>
                   </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button 
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (newWorldData.name.trim()) {
                        game.worldSlots.setSlotName(game.selectedWorldSlot, newWorldData.name.trim());
                      }
                      if (newWorldData.seed.trim()) {
                         game.world.setSeed(newWorldData.seed.trim());
                      } else {
                         game.randomizeSeed();
                      }
                      
                      game.selectedStartMode = newWorldData.mode;
                      game.startGame({ skipSeedApply: true });
                      setScreen('ingame');
                      setShowCreateModal(false);
                    }}
                    className="flex-1 glass-btn glass-btn-blue !px-4"
                  >
                    Forge
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Version Footer */}
      <div className="absolute bottom-8 left-8 flex flex-col gap-0.5 opacity-20 hover:opacity-100 transition-opacity pointer-events-none">
          <span className="text-[10px] font-bold tracking-[0.3em] uppercase">ArloCraft {game.currentVersionId}</span>
          <span className="text-[8px] font-medium opacity-60 uppercase tracking-widest">© 2026 Anton Retro • All Rights Reserved</span>
      </div>

    </div>
  );
};

const MenuButton = ({ label, desc, icon, onClick, color = 'default' }) => {
  const colorClasses = {
    default: 'border-white/10 hover:bg-white/10',
    blue: 'border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-100',
    purple: 'border-purple-500/20 bg-purple-500/10 hover:bg-purple-500/20 text-purple-100',
  };

  return (
    <motion.button
      variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
      whileHover={{ x: 4 }}
      onClick={onClick}
      className={`w-full group glass-card p-4 flex items-center gap-4 text-left transition-all ${colorClasses[color]}`}
    >
      <div className={`p-3 rounded-xl bg-white/5 group-hover:scale-110 transition-transform ${color === 'default' ? '' : 'bg-transparent'}`}>
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="font-bold tracking-wide">{label}</span>
        <span className="text-xs opacity-40 group-hover:opacity-60 transition-opacity">{desc}</span>
      </div>
      <ChevronRight className="ml-auto opacity-20 group-hover:opacity-100 transition-opacity" size={18} />
    </motion.button>
  );
};

const IconButton = ({ icon, label, color, onClick, badge = null, caption = null }) => (
  <motion.button 
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="glass-card p-4 flex flex-col items-center justify-center gap-3 hover:bg-white/10 transition-all border-white/5"
  >
    <div className={`text-${color}-400`}>{icon}</div>
    <span className="text-xs font-bold uppercase tracking-widest opacity-60 text-white">{label}</span>
    {badge ? (
      <span className="rounded-full border border-orange-400/25 bg-orange-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-orange-200">
        {badge}
      </span>
    ) : null}
    {caption ? (
      <span className="text-center text-[10px] leading-relaxed text-white/45">
        {caption}
      </span>
    ) : null}
  </motion.button>
);

const TabButton = ({ id, label, icon, active, onClick }) => (
  <button 
    onClick={() => onClick(id)}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-arlo-blue/20 text-arlo-blue border border-arlo-blue/20' : 'hover:bg-white/5 text-white/60'}`}
  >
    {icon}
    <span className="text-sm font-bold tracking-tight">{label}</span>
  </button>
);

const RangeSetting = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  formatDisplay,
}) => {
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);

  return (
    <div
      className={`flex flex-col gap-2 transition-opacity duration-300 ${
        disabled ? 'opacity-30 pointer-events-none' : ''
      }`}
    >
      <div className="flex justify-between items-center">
        <span className="text-sm font-bold opacity-70 tracking-wide">{label}</span>
        <span className="text-xs font-mono text-arlo-blue">
          {formatDisplay ? formatDisplay(val) : val}
        </span>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step}
        value={val}
        disabled={disabled}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          setVal(v);
          onChange(v);
        }}
        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-arlo-blue"
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
