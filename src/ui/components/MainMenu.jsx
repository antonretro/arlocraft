import React, { useState } from 'react';
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

export const MainMenu = ({ game, setScreen }) => {
  const [subScreen, setSubScreen] = useState('main'); // main, multiplayer, worlds, settings, skins
  const [settingTab, setSettingTab] = useState('video'); // video, audio, controls, social
  const [joinCode, setJoinCode] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: '' });

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
          Embark on a modular journey through infinite voxel horizons. Built with the Arlo Vanguard Engine.
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
                <IconButton onClick={() => window.alert('Resource Packs coming soon in Vanguard v1.2')} icon={<Library/>} label="Packs" color="orange" />
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
                            game.startGame();
                          }
                        }}
                        className="w-full flex flex-col gap-1 p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all text-left"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm tracking-wide">{slotId.toUpperCase().replace('-', ' ')}</span>
                          {summary && <span className="text-[10px] text-arlo-blue font-bold px-2 py-0.5 bg-arlo-blue/10 rounded tracking-widest uppercase">{summary.mode}</span>}
                        </div>
                        <span className="text-[10px] opacity-40">
                          {summary ? `Saves: ${new Date(summary.savedAt).toLocaleDateString()} • Seed: ${summary.seed}` : 'New Uncharted Territory'}
                        </span>
                      </button>
                      
                      {summary && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (game.deleteWorldSlot(slotId)) setSubScreen('main'); // Refreshing by going back
                          }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 rounded-lg"
                        >
                          <Trash2 size={16}/>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={() => {
                  game.randomizeSeed();
                  game.startGame();
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
                <h2 className="text-xl font-bold">Skin Library</h2>
              </div>

              <div className="grid grid-cols-4 gap-3 overflow-y-auto max-h-72 p-2">
                {[...game.skinSystem.classicSkins, ...game.skinSystem.randomSkins].map(skin => {
                  const isActive = game.skinSystem.currentSkin === skin.id;
                  return (
                    <button
                      key={skin.id}
                      onClick={() => {
                        game.skinSystem.applySkin(skin.id);
                        if (skin.url) {
                            game.skinLoader.loadSkinFromUrl(skin.url).then(({ materials }) => {
                                game._applyLoadedSkin(materials, skin.url);
                            }).catch(err => {
                                console.error("[SkinLoader] Error applying skin:", err);
                                // Fallback to default if load fails
                                game.updatePlayerSkin('Steve');
                            });
                        } else if (skin.isProcedural) {
                            // Handle procedural if needed
                        }
                      }}
                      className={`aspect-square p-2 rounded-xl border transition-all 
                        ${isActive ? 'bg-arlo-blue/20 border-arlo-blue shadow-[0_0_15px_rgba(0,195,227,0.2)]' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                    >
                      <img 
                        src={skin.faceUrl || skin.url || '/assets/skins/default_face.png'} 
                        className="w-full h-full object-contain pixelated rounded-md"
                        alt={skin.name}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="mt-auto px-2">
                <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Active Voyager</span>
                <p className="text-sm font-bold text-arlo-blue leading-none">{game.skinSystem.currentSkin.toUpperCase()}</p>
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
                        <h2 className="text-xl font-bold tracking-tight">Vanguard Configuration</h2>
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
                          active={game.settings.shadowsEnabled}
                          onToggle={() => {
                            game.settings.shadowsEnabled = !game.settings.shadowsEnabled;
                            game.renderer.toggleShadows(game.settings.shadowsEnabled);
                            game.saveSettings();
                          }}
                        />
                        <RangeSetting 
                          label="Field of View" 
                          value={game.settings.fov} 
                          min={50} max={110} 
                          onChange={(v) => {
                            game.settings.fov = v;
                            game.camera.instance.fov = v;
                            game.camera.instance.updateProjectionMatrix();
                            game.saveSettings();
                          }}
                        />
                        <RangeSetting 
                          label="Render Distance" 
                          value={game.settings.renderDistance || 8} 
                          min={2} max={16} 
                          onChange={(v) => {
                            game.settings.renderDistance = v;
                            game.world.setRenderDistance(v);
                            game.saveSettings();
                          }}
                        />
                      </motion.div>
                    )}

                    {settingTab === 'audio' && (
                      <motion.div key="audio" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8">
                        <RangeSetting 
                          label="Master Volume" 
                          value={Math.round(game.settings.volume * 100)} 
                          min={0} max={100} 
                          onChange={(v) => {
                            game.settings.volume = v / 100;
                            game.audio.applyFromSettings(game.settings);
                            game.saveSettings();
                          }}
                        />
                      </motion.div>
                    )}

                    {settingTab === 'controls' && (
                      <motion.div key="controls" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8 text-center text-white/40 py-12">
                        <Gamepad size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-sm">Neural link sensitivity and remapping available in the next vanguard patch.</p>
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

              <div className="flex flex-col gap-2 mt-auto">
                 <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Your Identity</label>
                 <div className="bg-white/5 p-4 rounded-xl flex items-center justify-between">
                    <span className="text-xs font-mono opacity-60">
                      {game.multiplayer?.peer?.id || 'Connecting to network...'}
                    </span>
                    <button 
                      onClick={() => navigator.clipboard.writeText(game.multiplayer?.peer?.id)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <Clipboard size={16}/>
                    </button>
                 </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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

const IconButton = ({ icon, label, color, onClick }) => (
  <motion.button 
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="glass-card p-4 flex flex-col items-center justify-center gap-3 hover:bg-white/10 transition-all border-white/5"
  >
    <div className={`text-${color}-400`}>{icon}</div>
    <span className="text-xs font-bold uppercase tracking-widest opacity-60 text-white">{label}</span>
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

const RangeSetting = ({ label, value, min, max, onChange }) => {
  const [val, setVal] = useState(value);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-bold opacity-70 tracking-wide">{label}</span>
        <span className="text-xs font-mono text-arlo-blue">{val}</span>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        value={val}
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

