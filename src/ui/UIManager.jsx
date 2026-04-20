import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MainMenu } from './components/MainMenu';
import { HUD } from './components/HUD';
import { PauseMenu } from './components/PauseMenu';
import { MainMenuPanorama } from './components/MainMenuPanorama';
import { motion, AnimatePresence } from 'framer-motion';
import '../css/index.css';

const UIApp = ({ game }) => {
  const [screen, setScreen] = useState('title');
  const [isPaused, setIsPaused] = useState(false);
  const [hudVisible, setHudVisible] = useState(false);
  const panoRef = React.useRef(null);
  const panoInstance = React.useRef(null);

  useEffect(() => {
    // Panorama management
    if (screen === 'title' && panoRef.current && !panoInstance.current) {
        panoInstance.current = new MainMenuPanorama(panoRef.current);
    } else if (screen !== 'title' && panoInstance.current) {
        panoInstance.current.destroy();
        panoInstance.current = null;
    }
  }, [screen]);

  useEffect(() => {
    // Bridge from Game to React
    const handleScreenChange = (e) => setScreen(e.detail);
    const handlePause = (e) => setIsPaused(e.detail);
    const handleHud = (e) => setHudVisible(e.detail);

    window.addEventListener('ui-set-screen', handleScreenChange);
    window.addEventListener('ui-set-pause', handlePause);
    window.addEventListener('ui-set-hud', handleHud);

    return () => {
      window.removeEventListener('ui-set-screen', handleScreenChange);
      window.removeEventListener('ui-set-pause', handlePause);
      window.removeEventListener('ui-set-hud', handleHud);
    };
  }, []);

  return (
    <div className="relative w-full h-screen font-outfit select-none overflow-hidden">
      <AnimatePresence mode="wait">
        {screen === 'title' && (
          <motion.div
            key="title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center"
          >
            <MainMenu game={game} setScreen={setScreen} />
          </motion.div>
        )}

        {hudVisible && screen === 'ingame' && (
          <motion.div
            key="hud"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute inset-0 z-10 pointer-events-none"
          >
            <HUD game={game} />
          </motion.div>
        )}

        {isPaused && (
          <motion.div
            key="pause"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center"
          >
            <PauseMenu game={game} setIsPaused={setIsPaused} />
          </motion.div>
        )}
      </AnimatePresence>

      <div id="notification-root" className="absolute top-4 right-4 z-[100]" />
      
      {/* 3D Panorama Background for Main Menu */}
      <div ref={panoRef} className="absolute inset-0 z-0 pointer-events-none" />
    </div>
  );
};

export const initReactUI = (game) => {
  const rootElement = document.getElementById('ui-root');
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<UIApp game={game} />);
    return root;
  }
};
