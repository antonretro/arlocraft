import React, { useState, useEffect, useRef } from 'react';
import { getGame } from '../UIManager';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Save, X, Play } from 'lucide-react';

export const CommandEditor = ({ x, y, z, initialCommand, onClose }) => {
  const game = getGame();
  const [command, setCommand] = useState(initialCommand || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
        inputRef.current.focus();
    }
  }, []);

  const handleSave = () => {
    const key = game.world.coords.getKey(x, y, z);
    const data = game.world.state.blockData.get(key) || {};
    data.command = command;
    game.world.state.blockData.set(key, data);

    // Sync to multiplayer
    if (game.multiplayer) {
      game.multiplayer.broadcastBlockUpdate(x, y, z, game.world.getBlockAt(x, y, z), 'add', data);
    }

    onClose();
  };

  const handleRun = () => {
    if (!command) return;
    game.commandManager?.execute(command);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="glass-card p-8 w-full max-w-lg flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal className="text-purple-400" />
            <h2 className="text-xl font-bold">Command Block</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="bg-black/40 border border-purple-500/30 p-4 rounded-xl flex flex-col gap-2">
          <label className="text-sm font-bold text-purple-300 uppercase tracking-wider">Console Command</label>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="w-full bg-transparent text-xl font-mono border-none focus:ring-0 text-white placeholder:text-white/10"
            placeholder="/tp 0 100 0"
          />
        </div>

        <div className="text-xs text-white/40 bg-white/5 p-3 rounded-lg">
          Tip: Use commands like /tp, /time, or /weather. Command blocks execute when triggered by redstone or manually.
        </div>

        <div className="flex gap-4">
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
            Test
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-xl text-purple-300 font-bold flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(168,85,247,0.1)]"
          >
            <Save size={18} />
            Done
          </button>
        </div>
      </div>
    </motion.div>
  );
};
