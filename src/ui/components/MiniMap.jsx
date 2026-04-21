import React, { useEffect, useRef } from 'react';
import { getGame } from '../UIManager';
import { MiniMap as MiniMapCore } from '../MiniMap';

export const MiniMap = () => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const miniMapRef = useRef(null);
    const game = getGame();

    useEffect(() => {
        if (!canvasRef.current || !game) return;

        // Initialize the core logic
        // We temporarily set the global IDs that MiniMapCore expects
        const originalContainer = containerRef.current.id;
        const originalCanvas = canvasRef.current.id;
        
        containerRef.current.id = 'minimap';
        canvasRef.current.id = 'minimap-canvas';

        miniMapRef.current = new MiniMapCore(game);

        // Animation Loop for the Map
        let frameId;
        const updateMap = () => {
            if (miniMapRef.current && game.player) {
                const pos = game.player.position;
                const yaw = game.camera.instance.rotation.y;
                miniMapRef.current.update(0.016, pos, yaw);
            }
            frameId = requestAnimationFrame(updateMap);
        };

        frameId = requestAnimationFrame(updateMap);

        return () => {
            cancelAnimationFrame(frameId);
            containerRef.current.id = originalContainer;
            canvasRef.current.id = originalCanvas;
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
