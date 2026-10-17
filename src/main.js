import * as THREE from 'three';
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from 'three-mesh-bvh';
import { Game } from './engine/Game.js';
import { ModLoader } from './mods/ModLoader.js';
import { validateBlocks } from './utils/BlockValidator.js';
import { BUILD_LABEL, VERSION_LABEL } from './data/buildInfo.js';

console.log('[ArloCraft] main.js fully loading...');

// Enable BVH acceleration for compatible raycasts.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

validateBlocks();

// Initialize the Game Engine
console.log(
  '%c ArloCraft ',
  'background: #2563eb; color: #fff; font-size: 20px; font-weight: bold; border-radius: 4px; padding: 4px;'
);
console.log(
  `%c THE VOYAGE OF DISCOVERY %c ${VERSION_LABEL} · ${BUILD_LABEL} `,
  'color: #3b82f6; font-style: italic;',
  'color: #94a3b8; font-size: 10px;'
);

// Mods add blocks and textures, so they must load before the game starts.
ModLoader.loadInstalled()
  .catch((error) => console.error('[ArloCraft] Mods failed to load:', error))
  .finally(() => {
    const game = new Game();
    // Global for debugging if needed
    window.gameInstance = game;
  });

console.log('ArloCraft Engine Initialized. Waiting for user interaction...');
