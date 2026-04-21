import React, { useState, useEffect, useRef } from 'react';
import { getGame } from '../UIManager';
import { motion, AnimatePresence } from 'framer-motion';
import { Type, Save, X } from 'lucide-react';

export const SignEditor = ({ x, y, z, initialText, onClose }) => {
  const game = getGame();
  const [text, setText] = useState(initialText || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
        inputRef.current.focus();
    }
  }, []);

  const handleSave = () => {
    const key = game.world.coords.getKey(x, y, z);
    const data = game.world.state.blockData.get(key) || {};
    data.text = text;
    game.world.state.blockData.set(key, data);

    // Sync to multiplayer
    if (game.multiplayer) {
      game.multiplayer.broadcastBlockUpdate(x, y, z, game.world.getBlockAt(x, y, z), 'add', data);
    }

    onClose();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="glass-card p-8 w-full max-w-md flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Type className="text-arlo-blue" />
            <h2 className="text-xl font-bold">Edit Sign</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="bg-amber-100/10 border border-amber-400/20 p-6 rounded-xl relative min-h-[200px] flex items-center justify-center">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-transparent text-center text-xl font-minecraft border-none focus:ring-0 resize-none text-amber-100 placeholder:text-amber-100/20"
            placeholder="Type your message..."
            maxLength={60}
            rows={4}
          />
        </div>

        <div className="flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-3 bg-arlo-blue/20 hover:bg-arlo-blue/30 border border-arlo-blue/30 rounded-xl text-arlo-blue font-bold flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(0,195,227,0.1)]"
          >
            <Save size={18} />
            Save Sign
          </button>
        </div>
      </div>
    </motion.div>
  );
};
