import React, { useEffect, useMemo, useState } from 'react';
import { getGame } from '../UIManager';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Globe,
  Settings,
  Shirt,
  Package,
  Pencil,
  Trash2,
  Plus,
  Dices,
  Sword,
  Hammer,
  Map as MapIcon,
  Eye,
  CheckCircle2,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { BUILD_LABEL } from '../../data/buildInfo.js';
import { PacksPanel } from './PacksPanel.jsx';
import { SettingsPanel } from './SettingsPanel.jsx';
import { BlockButton, Panel, ScreenHeader, Choice } from './kit.jsx';

const SPLASHES = [
  'Now with redstone!',
  'Code your command blocks!',
  'Punch a tree!',
  '100% voxels!',
  'Mods welcome!',
  'Also try VoxelForge!',
  'Diamonds below y=0!',
  'Runs in your browser!',
  'Watch out for creepers!',
  'Villages with wells!',
  'Bring a friend!',
];

const MODES = [
  { value: 'SURVIVAL', label: 'Survival', icon: <Sword size={18} />, desc: 'Gather, craft and survive the night' },
  { value: 'CREATIVE', label: 'Creative', icon: <Hammer size={18} />, desc: 'Every block, flying, no danger' },
  { value: 'ADVENTURE', label: 'Adventure', icon: <MapIcon size={18} />, desc: 'Explore, but blocks stay put' },
  { value: 'SPECTATOR', label: 'Spectator', icon: <Eye size={18} />, desc: 'Fly through everything and watch' },
];

const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.value, m.label]));

function timeAgo(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'Never played';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString();
}

export const MainMenu = ({ setScreen }) => {
  const game = getGame();
  const [subScreen, setSubScreen] = useState('main');
  const [creating, setCreating] = useState(false);
  const [, refreshSlots] = useState(0);
  const splash = useMemo(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)], []);

  const slots = game.worldSlots.getAll().map((id) => ({
    id,
    summary: game.worldSlots.getSummary(id),
  }));
  const lastPlayed = slots
    .filter((s) => s.summary)
    .sort((a, b) => (Date.parse(b.summary.savedAt) || 0) - (Date.parse(a.summary.savedAt) || 0))[0];

  const playSlot = (slotId) => {
    game.selectedWorldSlot = slotId;
    game.loadWorldLocal(slotId);
    game.startGame({ fromSave: true });
  };

  const startCreate = () => {
    const firstEmpty = slots.find((s) => !s.summary);
    if (!firstEmpty) return false;
    game.selectedWorldSlot = firstEmpty.id;
    setCreating(true);
    return true;
  };

  const back = () => setSubScreen('main');

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="min-h-full w-full max-w-6xl mx-auto px-5 md:px-10 py-10 flex flex-col md:flex-row items-center justify-center gap-10 md:gap-16">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative flex flex-col items-center md:items-start gap-4 shrink-0"
        >
          <div className="relative">
            <h1 className="logo-title">
              ARLO
              <br />
              CRAFT
            </h1>
            <span className="splash-text absolute right-0 -bottom-8 translate-x-1/4">{splash}</span>
          </div>
          <p className="text-white/60 text-sm max-w-xs text-center md:text-left mt-12 leading-relaxed">
            Build, explore and survive in an endless block world. Wire up redstone, script command blocks and
            play with friends, right in your browser.
          </p>
        </motion.div>

        {/* Screens */}
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {subScreen === 'main' && (
              <Panel key="main">
                {lastPlayed && (
                  <BlockButton
                    color="green"
                    big
                    icon={<Play size={20} fill="currentColor" />}
                    onClick={() => playSlot(lastPlayed.id)}
                  >
                    <span className="flex flex-col items-start leading-tight min-w-0">
                      <span>Continue</span>
                      <span className="text-xs font-semibold text-white/75 truncate max-w-[16rem]">
                        {lastPlayed.summary.name} · {timeAgo(lastPlayed.summary.savedAt)}
                      </span>
                    </span>
                  </BlockButton>
                )}
                <BlockButton
                  color={lastPlayed ? undefined : 'green'}
                  big={!lastPlayed}
                  icon={<MapIcon size={18} />}
                  onClick={() => setSubScreen('worlds')}
                >
                  {lastPlayed ? 'All worlds' : 'Play'}
                </BlockButton>
                <BlockButton color="blue" icon={<Globe size={18} />} onClick={() => setSubScreen('multiplayer')}>
                  Play with friends
                </BlockButton>
                <div className="grid grid-cols-2 gap-3">
                  <BlockButton icon={<Shirt size={18} />} onClick={() => setSubScreen('skins')}>
                    Character
                  </BlockButton>
                  <BlockButton icon={<Package size={18} />} onClick={() => setSubScreen('packs')}>
                    Packs & mods
                  </BlockButton>
                </div>
                <BlockButton icon={<Settings size={18} />} onClick={() => setSubScreen('settings')}>
                  Settings
                </BlockButton>
              </Panel>
            )}

            {subScreen === 'worlds' && (
              <WorldsScreen
                key="worlds"
                slots={slots}
                onBack={back}
                onPlay={playSlot}
                onCreate={startCreate}
                onChanged={() => refreshSlots((n) => n + 1)}
              />
            )}

            {subScreen === 'multiplayer' && <MultiplayerScreen key="multi" onBack={back} />}

            {subScreen === 'skins' && <CharacterScreen key="skins" onBack={back} />}

            {subScreen === 'packs' && (
              <Panel key="packs" className="max-h-[80vh]">
                <ScreenHeader title="Packs & mods" subtitle="Changes apply after a reload" onBack={back} />
                <PacksPanel />
              </Panel>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {subScreen === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-3 md:p-8"
          >
            <div className="w-full max-w-4xl">
              <SettingsPanel onBack={back} />
            </div>
          </motion.div>
        )}
        {creating && (
          <CreateWorldModal
            key="create"
            onCancel={() => setCreating(false)}
            onCreate={({ name, seed, mode }) => {
              if (name) game.worldSlots.setSlotName(game.selectedWorldSlot, name);
              if (seed) game.world.setSeed(seed);
              else game.randomizeSeed();
              game.selectedStartMode = mode;
              game.startGame({ skipSeedApply: true });
              setScreen('ingame');
              setCreating(false);
            }}
          />
        )}
      </AnimatePresence>

      <div className="fixed bottom-3 left-4 text-[10px] font-bold tracking-widest uppercase text-white/30 pointer-events-none">
        ArloCraft {game.currentVersionId} · {BUILD_LABEL}
      </div>
    </div>
  );
};

const WorldsScreen = ({ slots, onBack, onPlay, onCreate, onChanged }) => {
  const game = getGame();
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [full, setFull] = useState(false);
  const saved = slots.filter((s) => s.summary);

  const commitRename = (slotId) => {
    if (renameValue.trim()) game.worldSlots.setSlotName(slotId, renameValue.trim().slice(0, 32));
    setRenaming(null);
    onChanged();
  };

  return (
    <Panel className="max-h-[80vh]">
      <ScreenHeader
        title="Your worlds"
        subtitle={`${saved.length} of ${slots.length} save slots used`}
        onBack={onBack}
      />

      <div className="flex flex-col gap-2.5 overflow-y-auto -mx-1 px-1 scrollbar-thin">
        {saved.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-white/10 p-6 text-center text-sm text-white/50">
            No worlds yet. Make your first one below!
          </div>
        )}
        {saved.map(({ id, summary }) => (
          <div
            key={id}
            className="flex items-center gap-3 rounded-xl border-2 border-white/5 bg-white/[0.04] p-3"
          >
            <button
              onClick={() => onPlay(id)}
              title="Play"
              className="w-12 h-12 shrink-0 rounded-lg grid place-items-center bg-[#5fae3c] border-2 border-black/40 shadow-[inset_0_-3px_0_rgba(0,0,0,0.3)] hover:brightness-110"
            >
              <Play size={20} fill="currentColor" />
            </button>
            <div className="flex-1 min-w-0">
              {renaming === id ? (
                <input
                  autoFocus
                  className="field !py-1.5"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(id)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitRename(id);
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <div className="font-bold truncate">{summary.name}</div>
              )}
              <div className="text-xs text-white/50 truncate">
                {MODE_LABEL[summary.mode] ?? summary.mode} · {timeAgo(summary.savedAt)} · seed {summary.seed}
              </div>
            </div>
            {confirmDelete === id ? (
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    game.deleteWorldSlot(id);
                    setConfirmDelete(null);
                    onChanged();
                  }}
                  className="block-btn block-btn-red !px-3 !py-2 text-xs"
                >
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(null)} className="block-btn block-btn-ghost !px-3 !py-2 text-xs">
                  Keep
                </button>
              </div>
            ) : (
              <div className="flex gap-1 shrink-0">
                <button
                  title="Rename"
                  onClick={() => {
                    setRenameValue(summary.name);
                    setRenaming(id);
                  }}
                  className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
                >
                  <Pencil size={16} />
                </button>
                <button
                  title="Delete"
                  onClick={() => setConfirmDelete(id)}
                  className="p-2 rounded-lg text-red-300/70 hover:text-red-300 hover:bg-red-500/15"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {full && (
        <div className="text-sm rounded-xl px-3 py-2 bg-amber-500/15 text-amber-100">
          All save slots are full. Delete a world to make room.
        </div>
      )}
      <BlockButton color="green" className="justify-center" icon={<Plus size={18} />} onClick={() => setFull(!onCreate())}>
        New world
      </BlockButton>
    </Panel>
  );
};

const CreateWorldModal = ({ onCancel, onCreate }) => {
  const [name, setName] = useState('');
  const [seed, setSeed] = useState('');
  const [mode, setMode] = useState('SURVIVAL');

  const submit = () => onCreate({ name: name.trim(), seed: seed.trim(), mode });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        className="glass-card w-full max-w-lg p-6 flex flex-col gap-5 max-h-[92vh] overflow-y-auto"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target.tagName === 'INPUT') submit();
        }}
      >
        <ScreenHeader title="New world" onBack={onCancel} />

        <label className="flex flex-col gap-2">
          <span className="label-caps">Name</span>
          <input
            autoFocus
            maxLength={32}
            className="field"
            placeholder="My World"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="label-caps">Seed</span>
          <div className="flex gap-2">
            <input
              className="field"
              placeholder="Leave empty for a random world"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
            <button
              title="Random seed"
              onClick={() => setSeed(String(Math.floor(Math.random() * 1e9)))}
              className="block-btn block-btn-ghost !px-3 shrink-0"
            >
              <Dices size={18} />
            </button>
          </div>
        </label>

        <div className="flex flex-col gap-2">
          <span className="label-caps">Game mode</span>
          <Choice options={MODES} value={mode} onChange={setMode} columns={2} />
        </div>

        <div className="flex gap-3">
          <BlockButton className="flex-1 justify-center" onClick={onCancel}>
            Cancel
          </BlockButton>
          <BlockButton color="green" className="flex-1 justify-center" icon={<Play size={18} />} onClick={submit}>
            Create world
          </BlockButton>
        </div>
      </motion.div>
    </motion.div>
  );
};

const MultiplayerScreen = ({ onBack }) => {
  const game = getGame();
  const [joinCode, setJoinCode] = useState('');
  const [status, setStatus] = useState(null);
  const [myId, setMyId] = useState(() => game.multiplayer?.peer?.id || null);

  useEffect(() => {
    const mp = game.multiplayer;
    if (!mp) return undefined;
    if (!mp.peer) mp.init();
    else setMyId(mp.peer.id);
    const prev = mp.onConnected;
    mp.onConnected = (id) => {
      setMyId(id);
      prev?.(id);
    };
    return () => {
      mp.onConnected = prev;
    };
  }, [game.multiplayer]);

  const join = async () => {
    if (!joinCode.trim()) {
      setStatus({ type: 'error', text: 'Type the code your friend gave you first.' });
      return;
    }
    setStatus({ type: 'loading', text: 'Connecting…' });
    try {
      await game.multiplayer.connectToPeer(joinCode.trim());
      setStatus({ type: 'success', text: 'Connected! Loading their world…' });
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    }
  };

  return (
    <Panel>
      <ScreenHeader title="Play with friends" onBack={onBack} />

      <div className="flex flex-col gap-2">
        <span className="label-caps">Join a friend</span>
        <div className="flex gap-2">
          <input
            className="field font-mono"
            placeholder="Their join code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <BlockButton color="blue" className="shrink-0" onClick={join} disabled={status?.type === 'loading'}>
            Join
          </BlockButton>
        </div>
      </div>

      {status && (
        <div
          className={`p-3 rounded-xl flex items-center gap-3 text-sm ${
            status.type === 'error'
              ? 'bg-red-500/15 text-red-100'
              : status.type === 'success'
                ? 'bg-green-500/15 text-green-100'
                : 'bg-sky-500/15 text-sky-100'
          }`}
        >
          {status.type === 'error' ? (
            <AlertCircle size={18} />
          ) : status.type === 'success' ? (
            <CheckCircle2 size={18} />
          ) : (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          )}
          {status.text}
        </div>
      )}

      <div className="rounded-xl border-2 border-white/5 bg-white/[0.04] p-4 flex flex-col gap-2">
        <span className="label-caps">Host your own world</span>
        <p className="text-sm text-white/60 leading-relaxed">
          Open any world, then share this code. Friends type it here to join you.
        </p>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-black/40 px-3 py-2">
          <span className="font-mono text-sm text-[#ffe066] truncate">{myId ?? 'Getting your code…'}</span>
          {myId && (
            <button
              title="Copy"
              onClick={() => navigator.clipboard?.writeText(myId)}
              className="p-1.5 rounded-md hover:bg-white/10 text-white/60"
            >
              <Copy size={16} />
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
};

const CharacterScreen = ({ onBack }) => {
  const game = getGame();
  const [name, setName] = useState(() => game.settings?.playerName || 'Arlo');
  const [lookup, setLookup] = useState('');
  const [selected, setSelected] = useState(() => game.skinSystem?.currentSkin || 'classic_steve');

  useEffect(() => {
    const onSkin = (e) => e.detail?.skinId && setSelected(e.detail.skinId);
    window.addEventListener('skin-changed', onSkin);
    return () => window.removeEventListener('skin-changed', onSkin);
  }, []);

  const applyLookup = () => {
    const user = lookup.trim();
    if (!user) return;
    setSelected(`custom_${user.replace(/\s+/g, '_')}`);
    game.skinSystem.applySkinByUsername(user);
    setLookup('');
  };

  const skins = [...game.skinSystem.classicSkins, ...game.skinSystem.randomSkins];

  return (
    <Panel className="max-h-[80vh]">
      <ScreenHeader title="Character" subtitle={`Wearing: ${game.skinSystem.getSkinMeta(selected).name}`} onBack={onBack} />

      <label className="flex flex-col gap-2">
        <span className="label-caps">Your name</span>
        <input
          className="field"
          maxLength={16}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            game.settingsManager.set('playerName', e.target.value);
          }}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="label-caps">Use a Minecraft player's skin</span>
        <div className="flex gap-2">
          <input
            className="field"
            placeholder="Username, e.g. Notch"
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyLookup()}
          />
          <BlockButton color="blue" className="shrink-0" onClick={applyLookup}>
            Use
          </BlockButton>
        </div>
      </div>

      <div className="flex flex-col gap-2 min-h-0">
        <span className="label-caps">Skins</span>
        <div className="grid grid-cols-5 gap-2 overflow-y-auto max-h-48 p-0.5 scrollbar-thin">
          {skins.map((skin) => (
            <button
              key={skin.id}
              title={skin.name}
              onClick={() => {
                setSelected(skin.id);
                game.skinSystem.applySkin(skin.id);
              }}
              className={`aspect-square p-1.5 rounded-lg border-2 transition-colors ${
                selected === skin.id ? 'bg-[#5fae3c]/25 border-[#5fae3c]' : 'bg-white/[0.04] border-white/5 hover:bg-white/10'
              }`}
            >
              <img
                src={skin.faceUrl || skin.url || `${import.meta.env.BASE_URL || '/'}assets/skins/default_face.png`}
                className="w-full h-full object-contain pixelated rounded"
                alt={skin.name}
              />
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
};
