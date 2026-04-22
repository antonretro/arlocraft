import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const EngineLoading = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [currentAsset, setCurrentAsset] = useState('Initializing Engine...');
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    const handleProgress = (e) => {
      const { progress, currentAsset } = e.detail;
      setProgress(progress);
      setCurrentAsset(`Loading texture: ${currentAsset}`);
      
      if (progress >= 100) {
        setTimeout(() => {
          setIsFinished(true);
          setTimeout(onComplete, 800);
        }, 500);
      }
    };

    window.addEventListener('engine-loading-progress', handleProgress);
    return () => window.removeEventListener('engine-loading-progress', handleProgress);
  }, [onComplete]);

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1000] bg-[#0a0a0c] flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-arlo-blue/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-12 w-full max-w-md px-8">
        {/* Animated 3D-ish Block Placeholder */}
        <motion.div
          animate={{ 
            rotateY: [0, 360],
            y: [0, -10, 0]
          }}
          transition={{ 
            rotateY: { duration: 4, repeat: Infinity, ease: "linear" },
            y: { duration: 2, repeat: Infinity, ease: "easeInOut" }
          }}
          className="w-20 h-20 bg-arlo-blue/20 border-2 border-arlo-blue/40 rounded-2xl flex items-center justify-center shadow-[0_0_40px_rgba(0,195,227,0.2)]"
        >
          <div className="w-10 h-10 border border-arlo-blue/60 rounded-lg flex items-center justify-center">
            <div className="w-4 h-4 bg-arlo-blue rounded-sm animate-pulse" />
          </div>
        </motion.div>

        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex flex-col items-center gap-1">
             <h2 className="text-2xl font-bold tracking-[0.2em] text-white uppercase ni-title">ArloCraft</h2>
             <span className="text-[10px] font-bold text-arlo-blue tracking-[0.4em] uppercase opacity-60">Engine Warm-up</span>
          </div>
          
          {/* Progress Bar Container */}
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-arlo-blue to-purple-500 shadow-[0_0_15px_rgba(0,195,227,0.5)]"
            />
          </div>

          <div className="flex justify-between w-full px-1">
            <AnimatePresence mode="wait">
              <motion.span 
                key={currentAsset}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-[10px] font-medium text-white/30 uppercase tracking-widest truncate max-w-[250px]"
              >
                {currentAsset}
              </motion.span>
            </AnimatePresence>
            <span className="text-[10px] font-bold text-white/50">{progress}%</span>
          </div>
        </div>

        {/* Loading Details List (Waterfall effect) */}
        <div className="flex flex-col gap-1 w-full opacity-20">
            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="text-[8px] text-center uppercase tracking-widest text-white/40 py-2">
                Initializing Voxel Buffer • Calibrating Shaders • Indexing Resource Pack
            </div>
            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
      </div>

      {/* Finishing Animation Overlay */}
      <AnimatePresence>
        {isFinished && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-[1100] bg-white flex items-center justify-center"
          >
             <motion.h1 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="text-black font-black text-4xl tracking-[0.5em] uppercase"
             >
                Ready
             </motion.h1>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
