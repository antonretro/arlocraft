import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { Game } from './engine/Game.js';
import { validateBlocks } from './utils/BlockValidator.js';
import './style.css';

// Block handler modules — each self-registers on import
import './content/blocks/crafting_table/CraftingTableHandler.js';
import './content/blocks/chest/ChestHandler.js';
import './content/blocks/furnace/FurnaceHandler.js';

console.log("[AntonCraft] main.js fully loading...");

// Enable BVH acceleration for compatible raycasts.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

validateBlocks();

// Initialize the Game Engine
console.log("[AntonCraft] Instantiating Game...");
const game = new Game();

// Global for debugging if needed
window.gameInstance = game;

console.log("AntonCraft Engine Initialized. Waiting for user interaction...");
