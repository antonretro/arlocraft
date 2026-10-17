import React, { useEffect, useRef, useState } from 'react';
import { Package, Puzzle, Trash2, Upload } from 'lucide-react';
import { ResourcePackManager } from '../../world/ResourcePackManager.js';
import { ModLoader } from '../../mods/ModLoader.js';

const MOD_EXAMPLE = `{
  "id": "my_mod",
  "name": "My Mod",
  "blocks": [
    { "id": "ruby_block", "name": "Ruby Block",
      "texture": "ruby_block.png", "hardness": 3 }
  ],
  "recipes": [
    { "type": "shapeless", "ingredients": ["redstone", "diamond"],
      "result": { "id": "ruby_block", "count": 1, "kind": "block" } }
  ],
  "commands": { "hello": "say('Hello', args.join(' '));" }
}`;

/** Texture pack and mod manager. Changes apply after a reload. */
export const PacksPanel = () => {
  const [packName, setPackName] = useState(null);
  const [mods, setMods] = useState([]);
  const [status, setStatus] = useState(null);
  const [needsReload, setNeedsReload] = useState(false);
  const packInput = useRef(null);
  const modInput = useRef(null);

  const refresh = async () => {
    setPackName(await ResourcePackManager.getInstalledPackName());
    setMods(await ModLoader.listInstalled());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handle = async (action, success) => {
    try {
      const result = await action();
      setStatus({ ok: true, text: success(result) });
      setNeedsReload(true);
      await refresh();
    } catch (error) {
      setStatus({ ok: false, text: error.message });
    }
  };

  return (
    <div className="flex flex-col gap-4 min-h-0 overflow-y-auto -mx-1 px-1 scrollbar-thin">
      <section className="rounded-xl border-2 border-white/5 bg-white/[0.04] p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Package className="text-orange-300" size={20} />
          <div className="flex-1">
            <div className="font-bold">Texture Pack</div>
            <div className="text-xs text-white/50">
              Any Minecraft Java resource pack (.zip). Block textures are
              replaced; HD packs up to 64px work.
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 bg-black/30 rounded-xl px-3 py-2">
          <span className="text-sm truncate">
            {packName ?? 'Default (built-in)'}
          </span>
          {packName && (
            <button
              title="Remove texture pack"
              onClick={() =>
                handle(ResourcePackManager.removePack, () => 'Texture pack removed.')
              }
              className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-300"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
        <input
          ref={packInput}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file)
              handle(
                () => ResourcePackManager.installPack(file),
                (name) => `Installed "${name}".`
              );
          }}
        />
        <button
          onClick={() => packInput.current?.click()}
          className="block-btn block-btn-gold justify-center"
        >
          <Upload size={16} /> Choose texture pack…
        </button>
      </section>

      <section className="rounded-xl border-2 border-white/5 bg-white/[0.04] p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Puzzle className="text-sky-300" size={20} />
          <div className="flex-1">
            <div className="font-bold">Mods</div>
            <div className="text-xs text-white/50">
              A .zip with a mod.json adds blocks, recipes and chat commands.
              Commands run in the same sandbox as command blocks.
            </div>
          </div>
        </div>
        {mods.length === 0 ? (
          <div className="text-sm text-white/40 bg-black/30 rounded-xl px-3 py-2">
            No mods installed.
          </div>
        ) : (
          mods.map((mod) => (
            <div
              key={mod.key}
              className="flex items-center justify-between gap-3 bg-black/30 rounded-xl px-3 py-2"
            >
              <span className="text-sm truncate">{mod.name}</span>
              <button
                title="Remove mod"
                onClick={() =>
                  handle(() => ModLoader.remove(mod.key), () => `Removed "${mod.name}".`)
                }
                className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-300"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
        <input
          ref={modInput}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file)
              handle(
                () => ModLoader.install(file),
                (manifest) => `Installed mod "${manifest.name ?? manifest.id}".`
              );
          }}
        />
        <button
          onClick={() => modInput.current?.click()}
          className="block-btn block-btn-blue justify-center"
        >
          <Upload size={16} /> Install mod…
        </button>
        <details className="text-xs text-white/50">
          <summary className="cursor-pointer">mod.json example</summary>
          <pre className="mt-2 bg-black/40 rounded-lg p-2 overflow-x-auto text-[10px] leading-relaxed">
            {MOD_EXAMPLE}
          </pre>
        </details>
      </section>

      {status && (
        <div
          className={`text-sm rounded-xl px-3 py-2 ${status.ok ? 'bg-green-500/15 text-green-200' : 'bg-red-500/15 text-red-200'}`}
        >
          {status.text}
        </div>
      )}
      {needsReload && (
        <button
          onClick={() => window.location.reload()}
          className="block-btn block-btn-green justify-center"
        >
          Reload to apply
        </button>
      )}
    </div>
  );
};
