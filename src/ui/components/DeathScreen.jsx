import React from 'react';
import { motion } from 'framer-motion';
import { Skull } from 'lucide-react';

const CAUSE_TEXT = {
  fall: 'You hit the ground too hard',
  starve: 'You starved to death',
  damage: 'You were slain',
};

export const DeathScreen = ({ cause = 'damage', onRespawn, onTitle }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="absolute inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-red-900/50 backdrop-blur-sm pointer-events-auto"
  >
    <Skull className="text-white/80" size={56} />
    <h1 className="text-5xl font-black tracking-tight text-white drop-shadow-lg">
      You Died!
    </h1>
    <p className="text-sm font-bold text-white/70">
      {CAUSE_TEXT[cause] ?? CAUSE_TEXT.damage}
    </p>
    <div className="flex flex-col gap-3 w-64">
      <button
        id="btn-respawn"
        onClick={onRespawn}
        className="py-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white font-black uppercase tracking-widest transition-colors"
      >
        Respawn
      </button>
      <button
        onClick={onTitle}
        className="py-3 rounded-xl bg-black/30 hover:bg-black/40 border border-white/10 text-white/70 font-bold uppercase tracking-widest text-xs transition-colors"
      >
        Title Screen
      </button>
    </div>
  </motion.div>
);
