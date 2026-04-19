import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { Game } from './engine/Game.js';
import { validateBlocks } from './utils/BlockValidator.js';
import './style.css';

// Block handler modules — each self-registers on import
import './content/blocks/crafting_table/CraftingTableHandler.js';
import './content/blocks/chest/ChestHandler.js';
import './content/blocks/furnace/FurnaceHandler.js';
import './content/blocks/command_block/CommandBlockHandler.js';

console.log("[ArloCraft] main.js fully loading...");

// Enable BVH acceleration for compatible raycasts.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

validateBlocks();

// Initialize the Game Engine
console.log('%c ArloCraft ', 'background: #2563eb; color: #fff; font-size: 20px; font-weight: bold; border-radius: 4px; padding: 4px;');
console.log('%c THE VOYAGE OF DISCOVERY %c Build: 2026.04.19.EX ', 'color: #3b82f6; font-style: italic;', 'color: #94a3b8; font-size: 10px;');

// Global for debugging if needed
window.gameInstance = game;

console.log("ArloCraft Engine Initialized. Waiting for user interaction...");
