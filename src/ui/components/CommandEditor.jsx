import React, { useState, useEffect, useRef } from 'react';
import { getGame } from '../UIManager';
import { motion } from 'framer-motion';
import { Terminal, Save, X, Play, BookOpen } from 'lucide-react';

const EXAMPLES = {
  'Say hello': `say('Hello from the command block at', block.x, block.y, block.z);`,
  'Build a tower': `// A 10-block gold tower next to this command block
for (let i = 1; i <= 10; i++) {
  await world.setBlock(block.x + 2, block.y + i, block.z, 'gold_block');
  await sleep(100);
}
say('Tower built!');`,
  'Teleport player': `const p = await player.position();
await player.teleport(p.x, p.y + 20, p.z);
say('Up you go!');`,
  'Random flowers': `const flowers = ['poppy', 'dandelion', 'cornflower', 'allium'];
for (let i = 0; i < 20; i++) {
  const x = block.x + Math.floor(random(-6, 7));
  const z = block.z + Math.floor(random(-6, 7));
  if (await world.getBlock(x, block.y, z) === 'grass_block') {
    await world.setBlock(x, block.y + 1, z, flowers[i % flowers.length]);
  }
}`,
  'Night time': `await world.setTime(0.9);
say('Good night!');`,
  'Slash command': `/time set day`,
};

const API_HELP = `block            this command block's {x, y, z}
power            redstone power that triggered it (0-15)
here(dx, dy, dz) position relative to the block
say(...text)     message in chat
await sleep(ms)
random(min, max)

await world.getBlock(x, y, z)          → id or null
await world.setBlock(x, y, z, id)      id null = air
await world.fill(x1,y1,z1, x2,y2,z2, id)
await world.time() / world.setTime(0-1)

await player.position()
await player.teleport(x, y, z)
await player.give(id, count)
await player.heal(amount)
await spawn(mobId, x, y, z)

Limits: 64 blocks from the command block, 8192 changes
and 8 seconds per run. A single line starting with "/"
runs as a classic command instead.`;

export const CommandEditor = ({ x, y, z, initialCommand, onClose }) => {
  const game = getGame();
  const [code, setCode] = useState(initialCommand || '');
  const [log, setLog] = useState([]);
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const save = () => {
    const key = game.world.coords.getKey(x, y, z);
    const data = { ...(game.world.state.blockData.get(key) || {}) };
    data.command = code;
    delete data.remote; // Saved by you, so it is yours to run.
    game.world.state.blockData.set(key, data);
    if (game.multiplayer) {
      game.multiplayer.broadcastBlockUpdate(
        x,
        y,
        z,
        game.world.getBlockAt(x, y, z),
        'add',
        data
      );
    }
  };

  const handleSave = () => {
    save();
    onClose();
  };

  const handleRun = () => {
    if (!code.trim()) return;
    setLog([{ text: 'Running…', error: false }]);
    const started = game.commandBlocks?.run(x, y, z, 15, {
      code,
      onLog: (text, error) =>
        setLog((lines) => [...lines.slice(-40), { text, error }]),
    });
    if (!started) setLog([{ text: 'Already running.', error: true }]);
  };

  // Keep keyboard input inside the editor (no walking while typing).
  const stopKeys = (e) => {
    e.stopPropagation();
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.target;
      const { selectionStart: s, selectionEnd: t } = el;
      setCode(code.slice(0, s) + '  ' + code.slice(t));
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleRun();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onKeyDown={stopKeys}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div className="glass-card p-6 w-full max-w-3xl flex flex-col gap-4 max-h-[92vh]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Terminal className="text-purple-400" />
            <div>
              <h2 className="text-xl font-bold">Command Block</h2>
              <p className="text-xs text-white/40">
                ({x}, {y}, {z}) · runs when powered by redstone
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
              value=""
              onChange={(e) => e.target.value && setCode(EXAMPLES[e.target.value])}
            >
              <option value="">Examples…</option>
              {Object.keys(EXAMPLES).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className={`p-2 rounded-lg transition-colors ${showHelp ? 'bg-purple-500/30' : 'hover:bg-white/10'}`}
              title="API reference"
            >
              <BookOpen size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex gap-4 min-h-0 flex-1">
          <textarea
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="flex-1 min-h-[280px] bg-black/50 border border-purple-500/30 rounded-xl p-4 font-mono text-sm text-green-200 leading-relaxed resize-none focus:outline-none focus:border-purple-400"
            placeholder={"say('hello!');\n// or a classic command: /time set day"}
          />
          {showHelp && (
            <pre className="w-80 shrink-0 overflow-auto bg-white/5 rounded-xl p-3 text-[11px] leading-relaxed text-white/70 whitespace-pre-wrap">
              {API_HELP}
            </pre>
          )}
        </div>

        <div className="bg-black/40 rounded-xl p-3 h-24 overflow-auto font-mono text-xs">
          {log.length === 0 ? (
            <span className="text-white/30">
              Output appears here. Ctrl+Enter runs the script.
            </span>
          ) : (
            log.map((line, i) => (
              <div key={i} className={line.error ? 'text-red-300' : 'text-white/80'}>
                {line.text}
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
          >
            <Play size={18} />
            Run
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-xl text-purple-300 font-bold flex items-center justify-center gap-2 transition-all"
          >
            <Save size={18} />
            Save
          </button>
        </div>
      </div>
    </motion.div>
  );
};
