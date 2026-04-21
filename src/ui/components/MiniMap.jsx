import React, { useEffect, useRef } from 'react';
import { getGame } from '../UIManager';

export const MiniMap = () => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const game = getGame();

    useEffect(() => {
        if (!canvasRef.current || !containerRef.current || !game) return;

        const isTouchDevice =
          'ontouchstart' in window || navigator.maxTouchPoints > 0;

        containerRef.current.id = 'minimap';
        canvasRef.current.id = 'minimap-canvas';
        canvasRef.current.width = isTouchDevice ? 192 : 256;
        canvasRef.current.height = isTouchDevice ? 192 : 256;

        if (game.minimap) {
            game.minimap.attachDom(containerRef.current, canvasRef.current);
            game.minimap.visible = game.settings?.minimapEnabled !== false;
            containerRef.current.style.display =
              game.minimap.visible ? 'block' : 'none';
        }

        const handleMinimapVisibility = (e) => {
            const visible = Boolean(e.detail);
            if (!game.minimap || !containerRef.current) return;
            game.minimap.visible = visible;
            containerRef.current.style.display = visible ? 'block' : 'none';
        };

        window.addEventListener('ui-set-minimap', handleMinimapVisibility);

        return () => {
            window.removeEventListener('ui-set-minimap', handleMinimapVisibility);
            if (containerRef.current) containerRef.current.id = '';
            if (canvasRef.current) canvasRef.current.id = '';
        };
    }, [game]);

    return (
        <div 
            ref={containerRef}
            className="w-32 h-32 md:w-36 md:h-36 glass-card p-1 border-white/10 overflow-hidden shadow-2xl pointer-events-none"
        >
            <canvas 
                ref={canvasRef}
                width={256}
                height={256}
                className="w-full h-full rounded-lg bg-black/40"
                style={{ imageRendering: 'pixelated' }}
            />
            
            {/* Subtle SCANLINE overlay for that techy feel */}
            <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
            
            {/* Glass shine */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
        </div>
    );
};
