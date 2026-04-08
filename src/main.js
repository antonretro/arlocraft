import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { Game } from './engine/Game.js';
import './style.css';

// Enable BVH acceleration for compatible raycasts.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Initialize the Game Engine
const game = new Game();

// Global for debugging if needed
window.gameInstance = game;

console.log("ArloCraft Engine Initialized. Waiting for user interaction...");
