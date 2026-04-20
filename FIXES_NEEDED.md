# ArloCraft — Known Issues & Fix List

## 🔴 Critical Bugs

### 1. Jumping Doesn't Work

- **File:** `src/engine/Physics.js`
- **Root cause:** `getGroundYBelow()` in `src/world/World.js` (line ~118) only returns `this.terrain.getColumnHeight(x, z)` (noise-based terrain height). It completely ignores actual placed blocks in `blockMap`. If the player is standing on a block that isn't exactly at the noise terrain height, `isGrounded()` returns false and the jump buffer never fires.
- **Fix:** Rewrite `getGroundYBelow(x, y, z)` to scan downward through `blockMap` from `y` to find the actual highest solid block, falling back to `getColumnHeight` only if no block is found.
- **Also affects:** Auto-step, auto-jump, floor snapping — all use the same terrain-only ground query.

### 2. Water Appears Over Land Blocks / Z-Fighting

- **File:** `src/blocks/BlockRegistry.js` (water ShaderMaterial ~line 511)
- **Status:** Partially fixed (changed to `depthWrite: true`, `FrontSide`, opacity 0.82) but may still look wrong visually.
- **Remaining issue:** Water geometry (`BoxGeometry(1, 0.9, 1)` translated -0.05) means the water surface sits 0.4 units above the block's Y position, which can look like it floats over adjacent shore terrain.
- **Fix:** Consider making water geometry flush with the top of the block (`translate(0, -0.05, 0)` → `translate(0, -0.5 + 0.875/2, 0)` so top is at y+0.4375 or simply use a flat plane at the top).

### 3. Performance / Framerate

- **Multiple causes:**
  - `frustumCulled = true` was just enabled on InstancedMeshes — if bounding spheres compute incorrectly (group matrix not factored in), entire chunks will vanish. **Revert to `frustumCulled = false` if chunks disappear.**
  - Chunk mesh rebuilds are expensive. The 5×5 dirty-mark on every chunk boundary crossing forces 25 chunk rebuilds. Consider reducing to 3×3 or only marking edge chunks.
  - `ensureCriticalChunks` (runs every 4 frames) and `processDirtyChunkRebuilds` (runs every frame) both call `chunk.update()` — there is overlap causing some chunks to rebuild twice per frame.
  - `getTerrainHeight` is called inside the chunk sort comparator (now fixed to precompute, but verify the fix is working).

---

## 🟠 Visual / Rendering Issues

### 4. Sky Looks Flat

- **File:** `src/engine/Renderer.js` → `setupSky()`
- **Status:** Exponent changed to 1.8, offset to 0. May still look wrong depending on the shader.
- **Shader tweak:** The gradient `factor = clamp(pow(max(h, 0.0), 1.8), 0.0, 1.0)` — when `h < 0` (below horizon), factor = 0 = bottom color. This could make the ground side of sky look weird. Consider clamping `h` more gracefully.

### 5. Player Skin Head Not Showing in HUD Avatar

- **File:** `src/engine/Game.js` → `updatePlayerSkin()`
- **Issue:** The top-left avatar (`#arlo-face-image`) loads from Crafatar only when a username is set. The default (no username) still shows `arlo_real.png`.
- **Fix:** After skin loads, use the skin's head face canvas from `SkinLoader.createMaterials()` and render it to the HUD image element, or always try Crafatar with the stored `skinUsername`.

### 6. 3rd-Person Camera — Front Mode Broken

- **File:** `src/engine/Game.js` → `updateCameraFromPlayer()`
- **Issue:** THIRD_PERSON_FRONT mode positions camera using `distance = 3.8` (in front of player) then calls `lookAt(head)` — this makes the camera look at the back of the player's head, not their face.
- **Fix:** In THIRD_PERSON_FRONT mode, camera should be placed in front and look backward toward the player: position = `head + lookDir * 3.8`, then `lookAt(head - lookDir * 0.5)` or similar.

---

## 🟡 Gameplay Issues

### 7. Block Breaking / Interaction May Fail on Placed Blocks

- **Root cause:** Same as issue #1 — raycasting and interaction use `blockMap` correctly, but ground detection doesn't, so standing on placed blocks puts the player in a "flying" state where physics behaves incorrectly.

### 8. Sprint Double-Tap Consumes W Key Press

- **File:** `src/engine/Physics.js` line ~363
- **Issue:** `input?.consumeKeyPress?.('KeyW')` is called in the sprint double-tap detection. This consumes the W justPressed state, which may interfere with other systems that also check for W key press.
- **Fix:** Instead of consuming the key press, track W-press timing separately without consuming.

### 9. Auto-Jump Fires When Player Doesn't Want It

- **File:** `src/engine/Physics.js` → `shouldAutoJump()`
- **Issue:** Auto-jump triggers unexpectedly when walking into blocks. The `autoJumpCooldown = 0.2s` is too short.
- **Fix:** Increase cooldown to 0.35–0.4s, or add a check that the player is actively pressing W.

---

## 🟡 Missing Features / Incomplete

### 10. WorldPersistenceService — Save/Load May Break

- **File:** `src/world/WorldPersistenceService.js`
- **Issue:** This service was created by Gemini but may reference methods that don't exist or were renamed during the refactor. Not verified working.
- **Fix:** Test save/load and trace any `undefined is not a function` errors.

### 11. Skin Loader Fallback Broken for Local Paths

- **File:** `src/utils/SkinLoader.js`
- **Issue:** `this.defaultSteve = 'Igneous 1.19.4/assets/...'` — this relative path won't resolve correctly in a Vite build. Should be `/assets/steve.png` or imported via `import.meta.glob`.
- **Fix:** Copy steve.png and alex.png to `public/assets/` and use `/assets/steve.png`.

### 12. Block Deco Items Not Deco-Flagged

- **Console warnings:** `"blueberry" has config but deco:true missing`, same for strawberry, tomato, carrot, potato, corn, tube_coral_block, brain_coral_block.
- **File:** `src/data/blocks.js` (or wherever these blocks are defined)
- **Fix:** Add `deco: true` to each of these block configs.

---

## 🟢 Code Quality / Stability

### 13. `WorldVisuals.update()` Was Missing (Fixed)

- Added a no-op `update(_time) {}` to `WorldVisuals`. This was crashing every frame.

### 14. `skinLoader` Was Never Instantiated (Fixed)

- Added `import { SkinLoader }` and `this.skinLoader = new SkinLoader()` to Game constructor.

### 15. `this.playerParts` Was Never Set (Fixed)

- `setupPlayerVisual()` now stores `this.playerParts = { torso, head, armL, armR, legL, legR, face }`.

### 16. Player Facing Backward in 3rd Person (Fixed)

- `playerVisual.rotation.y = viewYaw + Math.PI` so model faces away from camera.

---

## Architecture Notes for Gemini

- **World.js** is a facade over services: `world.terrain` (WorldTerrainService), `world.blocks` (BlockRulesService), `world.mutations` (WorldMutationService), `world.chunkManager` (ChunkManager), `world.state` (WorldState).
- All block data is in `world.state.blockMap` (Map of key→blockId).
- Block keys are computed by `world.getKey(x, y, z)` = `(x+1000000)*2097152*129 + (y+1000)*2097152 + (z+1000000)` (approximate — check WorldCoordinates.js for exact formula).
- `Chunk.js` uses `this.world.state.blockMap` (NOT `this.world.blockMap`).
- `ChunkMeshBuilder.js` uses `chunk.world.state.blockMap`.
- Do NOT add backwards-compat shims — update all callers to use the new service structure.
