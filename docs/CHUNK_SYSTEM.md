# ArloCraft Chunk & Rendering System

This document provides a technical overview of how ArloCraft manages large procedural worlds while maintaining a high frame rate.

## 1. Architectural Overview

ArloCraft uses a **Voxel-based Instancing** approach. Instead of building one massive mesh for the entire world (which is slow to update), the world is divided into smaller **Chunks**.

### Core Components
- **BlockMap**: A global registry (`Map`) that stores every block's ID by a unique 53-bit integer key. This allows for extremely fast lookups (`O(1)`).
- **Chunks**: Logical boundaries (default 12x12xY) that manage the rendering of a specific sub-section of the world.
- **Instanced Meshes**: Each chunk uses `THREE.InstancedMesh` for every block type. This allows drawing thousands of blocks in a single draw call.

---

## 2. The Lifecycle of a Chunk

### Phase 1: Discovery & Loading
As the player moves, `World.js` identifies which chunks should exist within the `renderDistance`.
1. Chunks that don't exist are added to a **Load Queue**.
2. Chunks are loaded sequentially (maximum 1-2 per frame) to prevent stuttering.

### Phase 2: Generation
When a chunk loads, it runs its `generate()` method:
1. **Procedural Noise**: Samples 3D density noise to determine where terrain is.
2. **Biomes**: Interpolates biome data for surface color and foliage types.
3. **Chunk Mapping**: Blocks are written to the global `BlockMap`.
4. **Player Changes**: Persisted modifications (breaks/places) are overlaid on top of generated terrain.

### Phase 3: Emergency & Budgeted Meshing
Once a chunk has data, it must create its 3D mesh. This is the most performance-heavy part.
- **Emergency Meshing**: The 9 chunks immediately touching the player (3x3 grid) are rebuilt **instantly** the moment they become dirty. This prevents "holes" where you are standing.
- **Budgeted Meshing**: Chunks further away are processed via a budget (8-24 chunks per frame). This distributes the CPU load of building meshes over several frames.

---

## 3. Rendering Optimizations

### Occlusion Culling (Manual)
Inside `Chunk.rebuildMeshes`, the system checks if a block is completely enclosed by other solid blocks on all 6 sides. If it is, the block is **not rendered**. This drastically reduces the number of triangles sent to the GPU.

### Water Surface Culling
Water only renders its top face if there is "air" (non-water) above it. Submerged water blocks are never drawn.

### Frustum & Visibility
Three.js default frustum culling is **disabled** on chunks because their bounding boxes change frequently. Instead:
- **Distance Culling**: `World.js` unloads chunks entirely when they are too far away.
- **Visibility Audit**: A persistent loop forces all chunks in range to `visible = true` every 10 frames to ensure no "legacy culls" remain.

---

## 4. Troubleshooting Rendering Issues

- **Flickering**: Usually caused by the `rebuildBudget` being overwhelmed during rapid movement (e.g., flight).
- **Empty Voids**: Occurs if `ensureChunksAround` hasn't triggered yet. Crossing a chunk boundary now resets the refresh timer to fix this.
- **Z-Fighting**: Handled by precision offsets in `RenderConfig.js` and `Chunk.js`.
