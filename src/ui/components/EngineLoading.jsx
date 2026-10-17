import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const EngineLoading = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [currentAsset, setCurrentAsset] = useState('Starting up…');

  useEffect(() => {
    const handleProgress = (e) => {
      const { progress, currentAsset } = e.detail;
      setProgress(progress);
      setCurrentAsset(`Loading ${currentAsset}`);
      
      if (progress >= 100) {
        setTimeout(onComplete, 400);
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
          className="w-20 h-20 rounded-xl flex items-center justify-center border-4 border-black/50 shadow-[inset_0_-10px_0_rgba(0,0,0,0.25)]" style={{ background: "linear-gradient(180deg,#5fae3c 0 30%,#866043 30% 100%)" }}
        >
          <div className="w-10 h-10 border border-arlo-blue/60 rounded-lg flex items-center justify-center">
            <div className="w-4 h-4 bg-arlo-blue rounded-sm animate-pulse" />
          </div>
        </motion.div>

        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex flex-col items-center gap-1">
             <h2 className="logo-title !text-3xl">ARLOCRAFT</h2>
             <span className="text-xs font-bold text-white/50 mt-3">Getting the world ready…</span>
          </div>
          
          {/* Progress Bar Container */}
          <div className="w-full h-3 bg-black/60 rounded-md overflow-hidden border-2 border-black relative">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="absolute top-0 left-0 h-full bg-[#5fae3c]"
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

      </div>

    </motion.div>
  );
};
