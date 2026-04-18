import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { Game } from './engine/Game.js';
import { validateBlocks } from './utils/BlockValidator.js';
import './style.css';

console.log("[ArloCraft] main.js fully loading...");

// Enable BVH acceleration for compatible raycasts.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

validateBlocks();

// Initialize the Game Engine
console.log("[ArloCraft] Instantiating Game...");
const game = new Game();

// Global for debugging if needed
window.gameInstance = game;

console.log("ArloCraft Engine Initialized. Waiting for user interaction...");
