import React, { useState } from 'react';
import { Monitor, Volume2, Gamepad2, Sparkles } from 'lucide-react';
import { getGame } from '../UIManager';
import { ScreenHeader, Toggle, Slider } from './kit.jsx';
import { BUILD_LABEL } from '../../data/buildInfo.js';

const TABS = [
  { id: 'graphics', label: 'Graphics', icon: <Monitor size={16} /> },
  { id: 'audio', label: 'Sound', icon: <Volume2 size={16} /> },
  { id: 'controls', label: 'Controls', icon: <Gamepad2 size={16} /> },
  { id: 'game', label: 'Gameplay', icon: <Sparkles size={16} /> },
];

const KEYS = [
  ['W A S D', 'Move'],
  ['Space', 'Jump / swim up'],
  ['Shift', 'Sneak'],
  ['Ctrl or double-tap W', 'Sprint'],
  ['Left click', 'Break / attack'],
  ['Right click', 'Place / use'],
  ['E', 'Inventory'],
  ['1 – 9, scroll', 'Pick hotbar slot'],
  ['F', 'Swap to off hand'],
  ['P', 'Pick block'],
  ['M', 'Minimap'],
  ['F5', 'Camera view'],
  ['T or /', 'Chat and commands'],
  ['F3', 'Debug info'],
  ['Esc', 'Pause / back'],
];

/** Settings screen shared by the title screen and the pause menu. */
export const SettingsPanel = ({ onBack }) => {
  const game = getGame();
  const [tab, setTab] = useState('graphics');
  const [, refresh] = useState(0);
  const s = game.settingsManager.getAll();

  const set = (key, value) => {
    game.settingsManager.set(key, value);
    refresh((n) => n + 1);
  };
  const setAudio = (key, value) => {
    set(key, value);
    game.audio?.applyFromSettings(s);
  };
  const pct = (v) => `${v}%`;

  return (
    <div className="glass-card w-full flex flex-col overflow-hidden h-[min(640px,88vh)]">
      <div className="p-5 border-b-2 border-black/30">
        <ScreenHeader title="Settings" subtitle={BUILD_LABEL} onBack={onBack} />
      </div>
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        <nav className="flex md:flex-col gap-1 md:gap-1.5 p-2 md:p-3 md:w-48 shrink-0 overflow-x-auto bg-black/20 border-b-2 md:border-b-0 md:border-r-2 border-black/30">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 md:gap-2.5 px-2.5 md:px-3.5 py-2 md:py-2.5 rounded-lg text-sm font-bold whitespace-nowrap transition-colors border-2 ${
                tab === t.id
                  ? 'bg-[#5fae3c]/20 border-[#5fae3c]/70 text-white'
                  : 'border-transparent text-white/55 hover:bg-white/5 hover:text-white'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-3 scrollbar-thin">
          {tab === 'graphics' && (
            <>
              <Slider
                label="Render distance"
                desc="How many chunks you can see. Lower is faster."
                value={s.renderDistance || 8}
                min={2}
                max={16}
                format={(v) => `${v} chunks`}
                onChange={(v) => {
                  game.world.setRenderDistance(v);
                  set('renderDistance', v);
                }}
              />
              <Slider
                label="Field of view"
                value={s.fov}
                min={50}
                max={110}
                format={(v) => `${v}°`}
                onChange={(v) => {
                  game.camera.instance.fov = v;
                  game.camera.instance.updateProjectionMatrix();
                  set('fov', v);
                }}
              />
              <Toggle
                label="Automatic quality"
                desc="Lowers the resolution when the frame rate drops."
                active={s.autoQuality}
                onToggle={() => set('autoQuality', !s.autoQuality)}
              />
              <Slider
                label="Resolution"
                desc={s.autoQuality ? 'Set automatically. Turn off automatic quality to change it.' : undefined}
                value={Math.round((s.resolutionScale || 0.75) * 100)}
                min={30}
                max={200}
                step={5}
                disabled={s.autoQuality}
                format={pct}
                onChange={(v) => {
                  game.renderer.setResolutionScale(v / 100);
                  set('resolutionScale', v / 100);
                }}
              />
              <Slider
                label="Frame rate limit"
                value={s.fpsCap > 240 ? 240 : s.fpsCap}
                min={30}
                max={240}
                step={30}
                format={(v) => (v >= 240 ? 'Unlimited' : `${v} FPS`)}
                onChange={(v) => set('fpsCap', v >= 240 ? 999 : v)}
              />
              <Toggle
                label="Shadows"
                desc="Sun shadows. Looks great, costs frame rate."
                active={s.shadowsEnabled}
                onToggle={() => {
                  game.renderer.toggleShadows(!s.shadowsEnabled);
                  set('shadowsEnabled', !s.shadowsEnabled);
                }}
              />
              <Slider
                label="Clouds"
                value={Math.round((s.cloudOpacity ?? 0.85) * 100)}
                min={0}
                max={100}
                format={(v) => (v === 0 ? 'Off' : pct(v))}
                onChange={(v) => {
                  if (game.renderer.cloudMat) game.renderer.cloudMat.uniforms.cloudOpacity.value = v / 100;
                  set('cloudOpacity', v / 100);
                }}
              />
              <Slider
                label="Fog"
                value={Math.round((s.fogDensityScale ?? 1) * 100)}
                min={0}
                max={200}
                step={10}
                format={pct}
                onChange={(v) => {
                  game.renderer.setFogDensityScale?.(v / 100);
                  set('fogDensityScale', v / 100);
                }}
              />
              <Toggle
                label="Swaying plants"
                desc="Leaves and grass move in the wind."
                active={s.foliageSwaying}
                onToggle={() => {
                  game.blockRegistry?.updateSwaying(!s.foliageSwaying);
                  set('foliageSwaying', !s.foliageSwaying);
                }}
              />
              <button
                onClick={() => {
                  set('autoQuality', true);
                  set('renderDistance', 5);
                  set('resolutionScale', 0.65);
                  set('shadowsEnabled', false);
                  game.world.setRenderDistance(5);
                  game.renderer.setResolutionScale(0.65);
                  game.renderer.toggleShadows(false);
                }}
                className="block-btn block-btn-ghost justify-center mt-2"
              >
                Use settings for slower computers
              </button>
            </>
          )}

          {tab === 'audio' && (
            <>
              <Toggle
                label="Mute everything"
                active={s.audioMuted}
                onToggle={() => setAudio('audioMuted', !s.audioMuted)}
              />
              {[
                ['audioMaster', 'Master volume', 0.82],
                ['audioWorld', 'World and mobs', 0.85],
                ['audioSfx', 'Blocks and effects', 0.9],
                ['audioUi', 'Menus', 0.78],
              ].map(([key, label, fallback]) => (
                <Slider
                  key={key}
                  label={label}
                  value={Math.round((s[key] ?? fallback) * 100)}
                  min={0}
                  max={100}
                  format={pct}
                  onChange={(v) => setAudio(key, v / 100)}
                />
              ))}
            </>
          )}

          {tab === 'controls' && (
            <>
              <Slider
                label="Mouse sensitivity"
                value={Math.round((s.sensitivity || 0.00145) * 40000)}
                min={10}
                max={200}
                format={pct}
                onChange={(v) => set('sensitivity', v / 40000)}
              />
              <Toggle
                label="Invert mouse"
                desc="Move the mouse up to look down."
                active={s.invertY}
                onToggle={() => set('invertY', !s.invertY)}
              />
              <Toggle
                label="Auto-jump"
                desc="Step up one block automatically while walking."
                active={s.autoJump}
                onToggle={() => {
                  if (game.physics) game.physics.autoJumpEnabled = !s.autoJump;
                  set('autoJump', !s.autoJump);
                }}
              />
              <div className="rounded-xl border-2 border-white/5 bg-white/[0.04] p-4">
                <div className="label-caps mb-3">Keys</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {KEYS.map(([key, action]) => (
                    <div key={key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-white/60">{action}</span>
                      <kbd className="px-2 py-0.5 rounded-md bg-black/50 border-2 border-white/10 border-b-4 text-xs font-bold whitespace-nowrap">
                        {key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'game' && (
            <>
              <Toggle
                label="Minimap"
                desc="Small map in the corner of the screen."
                active={s.minimapEnabled !== false}
                onToggle={() => {
                  set('minimapEnabled', s.minimapEnabled === false);
                  window.dispatchEvent(
                    new CustomEvent('ui-set-minimap', { detail: s.minimapEnabled })
                  );
                }}
              />
              <Toggle
                label="Debug info"
                desc="Frame rate, position and chunk stats (F3)."
                active={Boolean(game.profiler?.visible)}
                onToggle={() => {
                  game.profiler?.toggle();
                  refresh((n) => n + 1);
                }}
              />
              <Toggle
                label="Run code from other players"
                desc="Let command blocks placed by others in multiplayer run their scripts."
                active={Boolean(s.allowRemoteScripts)}
                onToggle={() => set('allowRemoteScripts', !s.allowRemoteScripts)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
