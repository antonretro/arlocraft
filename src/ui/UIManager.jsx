import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MainMenu } from './components/MainMenu';
import { HUD } from './components/HUD';
import { PauseMenu } from './components/PauseMenu';
import { Inventory } from './components/Inventory';
import { SignEditor } from './components/SignEditor';
import { CommandEditor } from './components/CommandEditor';
import { MainMenuPanorama } from './components/MainMenuPanorama';
import { EngineLoading } from './components/EngineLoading';
import { motion, AnimatePresence } from 'framer-motion';
import '../css/index.css';

// Module-level singleton — the game engine never enters React's prop/context system,
// permanently preventing the "Cannot convert object to primitive value" DevTools crash.
let _game = null;
export const getGame = () => _game;

const UIApp = () => {
  const game = _game;
  const [screen, setScreen] = useState('engine-loading');
  const [isPaused, setIsPaused] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [hudVisible, setHudVisible] = useState(false);
  const [uiMode, setUiMode] = useState('PLAYER');
  const [signData, setSignData] = useState(null);
  const [commandBlockData, setCommandBlockData] = useState(null);
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
    const handleScreenChange = (e) => {
        const nextScreen =
          e.detail === 'pause' || e.detail === 'settings'
            ? game?.hasStarted
              ? 'ingame'
              : 'title'
            : e.detail;
        setScreen(nextScreen);
        if (e.detail === 'pause') {
            setIsPaused(true);
        }
        if (e.detail === 'title') {
            setHudVisible(false);
            setIsPaused(false);
            setIsInventoryOpen(false);
        }
    };
    const handlePause = (e) => setIsPaused(e.detail);
    const handleHud = (e) => setHudVisible(e.detail);
    const handleInventory = (e) => {
        const isOpen = typeof e.detail === 'boolean' ? e.detail : e.detail.detail;
        const mode = e.detail.mode || 'PLAYER';
        
        setIsInventoryOpen(isOpen);
        setUiMode(mode);
        
        if (isOpen) {
            document.exitPointerLock?.();
        }
    };

    const handleOpenSignEditor = (e) => {
        setSignData(e.detail);
        document.exitPointerLock?.();
    };

    const handleOpenCommandEditor = (e) => {
        setCommandBlockData(e.detail);
        document.exitPointerLock?.();
    };

    const handleKeyDown = (e) => {
        if (e.code === 'KeyE' && screen === 'ingame' && !isPaused) {
            game.gameState.toggleInventory();
        }
        if (e.code === 'Escape' && isInventoryOpen) {
            game.gameState.toggleInventory();
            e.stopImmediatePropagation();
        }
    }

    window.addEventListener('ui-set-screen', handleScreenChange);
    window.addEventListener('ui-set-pause', handlePause);
    window.addEventListener('ui-set-hud', handleHud);
    window.addEventListener('inventory-toggle', handleInventory);
    window.addEventListener('open-sign-editor', handleOpenSignEditor);
    window.addEventListener('open-command-editor', handleOpenCommandEditor);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('ui-set-screen', handleScreenChange);
      window.removeEventListener('ui-set-pause', handlePause);
      window.removeEventListener('ui-set-hud', handleHud);
      window.removeEventListener('inventory-toggle', handleInventory);
      window.removeEventListener('open-sign-editor', handleOpenSignEditor);
      window.removeEventListener('open-command-editor', handleOpenCommandEditor);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  return (
    <div className="relative w-full h-screen font-outfit select-none overflow-hidden">
      {/* Core Screen Transitions */}
      <AnimatePresence mode="wait">
        {screen === 'engine-loading' && (
          <EngineLoading onComplete={() => setScreen('title')} />
        )}

        {screen === 'title' && (
          <motion.div
            key="title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center"
          >
            <MainMenu setScreen={setScreen} />
          </motion.div>
        )}

        {screen === 'ingame' && (
          <motion.div
            key="ingame"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-0"
          >
             {/* The world is rendered behind this */}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay Layers */}
      <AnimatePresence>
        {hudVisible && screen === 'ingame' && (
          <motion.div
            key="hud"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute inset-0 z-10 pointer-events-none"
          >
            <HUD />
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
            <PauseMenu setIsPaused={setIsPaused} />
          </motion.div>
        )}

        {isInventoryOpen && (
          <motion.div
            key="inventory"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 z-[70]"
          >
            <Inventory 
              initialMode={uiMode}
              onClose={() => game.gameState.toggleInventory()} 
            />
          </motion.div>
        )}

        {signData && (
          <SignEditor 
            x={signData.x}
            y={signData.y}
            z={signData.z}
            initialText={signData.text}
            onClose={() => setSignData(null)}
          />
        )}

        {commandBlockData && (
          <CommandEditor 
            x={commandBlockData.x}
            y={commandBlockData.y}
            z={commandBlockData.z}
            initialCommand={commandBlockData.command}
            onClose={() => setCommandBlockData(null)}
          />
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
    _game = game; // store before rendering — never passed as a prop
    const root = createRoot(rootElement);
    root.render(<UIApp />);
    return root;
  }
};
