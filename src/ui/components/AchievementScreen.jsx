import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, Medal, Footprints, Target, Activity } from 'lucide-react';
import { ACHIEVEMENTS } from '../../data/achievements.js';

export const AchievementScreen = ({ game, onClose }) => {
  const unlocked = game.gameState.unlockedAchievements;
  const stats = game.gameState.stats;

  const getProgressDetails = (ach) => {
    const isUnlocked = unlocked.has(ach.id);
    if (isUnlocked) return { label: 'COMPLETED', color: 'text-green-400' };

    // Custom progress labels for some achievements
    if (ach.id === 'first_steps') return { label: `${Math.floor(stats?.distanceTravelled || 0)}/10m`, color: 'text-white/40' };
    if (ach.id === 'collector') return { label: `${stats?.discoveredBlocksCount || 0}/10 blocks`, color: 'text-white/40' };
    
    return { label: 'LOCKED', color: 'text-white/20' };
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-xl pointer-events-auto">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass-card w-full max-w-4xl p-8 flex flex-col gap-10 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden"
      >
        {/* Background Decorative Element */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-arlo-blue/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />

        <button 
           onClick={onClose}
           className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white z-50"
        >
          <X size={24} />
        </button>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-8">
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4 text-arlo-blue">
                    <Trophy size={32} strokeWidth={2.5} />
                    <h2 className="text-3xl font-black italic tracking-tighter uppercase">Hall of Valor</h2>
                </div>
                <p className="text-white/40 text-sm max-w-md leading-relaxed">
                    Track your progression through the dimensions of ArloCraft. Every milestone represents a new mastery of the world.
                </p>
            </div>

            <div className="flex gap-8">
                <StatWidget icon={Footprints} label="TRAVERSED" value={`${Math.floor(stats?.distanceTravelled || 0)}m`} />
                <StatWidget icon={Target} label="HONORS" value={`${unlocked.size}/${ACHIEVEMENTS.length}`} />
            </div>
        </div>

        {/* Achievement Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar max-h-[50vh]">
            {ACHIEVEMENTS.map(ach => {
                const isUnlocked = unlocked.has(ach.id);
                const progress = getProgressDetails(ach);

                return (
                    <motion.div 
                        key={ach.id}
                        whileHover={{ y: -4, backgroundColor: 'rgba(255,255,255,0.05)' }}
                        className={`p-5 rounded-2xl border transition-all flex flex-col gap-4 relative overflow-hidden group
                            ${isUnlocked ? 'bg-white/5 border-arlo-blue/30' : 'bg-black/20 border-white/5 opacity-60'}`}
                    >
                        {isUnlocked && (
                            <div className="absolute top-0 right-0 p-2 text-[10px] font-black bg-arlo-blue text-white px-3 rounded-bl-xl shadow-lg">
                                AWARDED
                            </div>
                        )}

                        <div className="flex items-start gap-4">
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl shadow-inner
                                ${isUnlocked ? 'bg-arlo-blue/20 text-white shadow-arlo-blue/20' : 'bg-white/5 grayscale text-white/20'}`}>
                                {ach.icon || '🏆'}
                            </div>
                            <div className="flex flex-col gap-1 pr-4">
                                <h3 className={`font-bold leading-tight ${isUnlocked ? 'text-white' : 'text-white/40'}`}>
                                    {ach.name}
                                </h3>
                                <p className="text-[11px] text-white/30 leading-snug">
                                    {ach.description}
                                </p>
                            </div>
                        </div>

                        <div className="mt-auto flex justify-between items-center bg-black/40 rounded-lg px-3 py-2 border border-white/5">
                             <span className="text-[9px] font-black uppercase tracking-widest text-white/20 italic">Status</span>
                             <span className={`text-[10px] font-black uppercase tracking-widest ${progress.color}`}>
                                {progress.label}
                             </span>
                        </div>
                    </motion.div>
                );
            })}
        </div>
      </motion.div>
    </div>
  );
};

const StatWidget = ({ icon: Icon, label, value }) => (
    <div className="flex items-center gap-4 bg-white/5 px-5 py-3 rounded-2xl border border-white/5 group hover:border-arlo-blue/30 transition-colors">
        <Icon className="text-white/20 group-hover:text-arlo-blue transition-colors" size={20} />
        <div className="flex flex-col">
            <span className="text-[9px] font-black text-white/20 tracking-widest leading-none mb-1 uppercase">{label}</span>
            <span className="text-xl font-black text-white leading-none tracking-tighter">{value}</span>
        </div>
    </div>
);
