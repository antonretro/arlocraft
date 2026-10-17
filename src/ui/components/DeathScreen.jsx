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
        className="block-btn block-btn-green justify-center"
      >
        Respawn
      </button>
      <button
        onClick={onTitle}
        className="block-btn justify-center"
      >
        Title Screen
      </button>
    </div>
  </motion.div>
);
