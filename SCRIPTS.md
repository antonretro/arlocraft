# AntonCraft — Script Reference

## Entry Point

| File          | Purpose                             |
| ------------- | ----------------------------------- |
| `src/main.js` | App entry — creates `Game` instance |

---

## Engine (`src/engine/`)

| File                | Purpose                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Game.js`           | Central game class — wires all systems together, manages game loop, UI events, save/load, pause/resume                         |
| `GameState.js`      | Authoritative runtime state — inventory, HP, hunger, mode (Survival/Creative), crafting grid                                   |
| `Physics.js`        | Rapier-based player physics — movement, jumping, sprinting, swimming, collision                                                |
| `Renderer.js`       | Three.js renderer setup — scene, lights, sun, fog, shadows, resolution scaling                                                 |
| `Camera.js`         | Camera management — first/third person modes, viewmodel group, FOV                                                             |
| `Input.js`          | Keyboard/mouse/pointer-lock input — key bindings, hotbar scroll, right-click consumption; Q=pick block, F=offhand, E=inventory |
| `AudioSystem.js`    | Sound effect and ambient audio — per-category volume, mute, auto-unlock on gesture                                             |
| `ActionSystem.js`   | Tracks crafting and interaction actions with cooldowns and results                                                             |
| `CraftingSystem.js` | Evaluates crafting grid against recipes, returns output item                                                                   |
| `SurvivalSystem.js` | Hunger drain, health regen, starvation damage, food eating (`tryEatFood`) — extracted from Game.js                             |
| `DayNightSystem.js` | Day/night cycle — advances `timeOfDay`, positions sun, updates daylight level and depth lighting                               |
| `Stats.js`          | Player progression — XP, level, attribute points                                                                               |

---

## World (`src/world/`)

| File                                 | Purpose                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `World.js`                           | Chunk lifecycle — load/unload queue, block get/set, raycasting, block interactions, gravity chain-break |
| `Chunk.js`                           | Single 12×12 chunk — procedural generation, mesh building with InstancedMesh, biome/structure placement |
| `ChunkManager.js`                    | Tracks loaded chunk map, handles chunk eviction                                                         |
| `ChunkGenerator.js`                  | Async Web Worker bridge — posts generation requests, resolves promises                                  |
| `NoiseRouter.js`                     | OctavePerlin terrain noise + biome climate blending (temperature/humidity)                              |
| `Noise.js`                           | Classic Perlin noise implementation                                                                     |
| `BetaNoise.js`                       | Alternative noise variant used for some biome features                                                  |
| `ExplosionSystem.js`                 | Sphere-shaped block destruction with particle effects                                                   |
| `naming/SettlementNameGenerator.js`  | Procedural settlement name generator for villages/towns                                                 |
| `restoration/RestorationRegistry.js` | Tracks virus/arlo block influence per chunk for zone meter                                              |
| `structures/StructureRegistry.js`    | All structure blueprints (village_hut, castle, dungeon_chamber, etc.) — voxel placement data            |
| `structures/defs/*.js`               | Individual structure definition files — each exports block layout for one structure type                |

---

## Entities (`src/entities/`)

| File               | Purpose                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `EntityManager.js` | Spawns, updates, and removes all in-world entities each frame        |
| `MobEntity.js`     | Base class for hostile/passive mobs — pathfinding, AI states, damage |
| `VirusEnemy.js`    | Virus mob — spreads corrupted blocks near it while active in a chunk |
| `BirdEntity.js`    | Passive bird — flocking, perch/fly behavior                          |
| `ArloBlock.js`     | Animated Arlo-face block entity used as an interactive world object  |
| `PlayerHand.js`    | First-person arm/tool mesh rendered in the viewmodel group           |

---

## UI (`src/ui/`)

| File               | Purpose                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `HUD.js`           | In-game HUD — hotbar, health/hunger bars, XP bar, face animation, crosshair monogram icons        |
| `HelpPanel.js`     | Collapsible controls panel — changes content based on game state (title/playing/inventory/paused) |
| `MiniMap.js`       | Overhead 2D minimap — renders nearby chunks as colored pixels                                     |
| `MenuManager.js`   | Multi-screen title overlay manager — switches between title/world-select/world-create screens     |
| `TouchControls.js` | Mobile joystick + right-drag look controls — injects into `input.keys`                            |

---

## Rendering (`src/rendering/`)

| File              | Purpose                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `RenderConfig.js` | Quality tier presets (low/balanced/high) — shadow map size, render scale, fog, draw distance |

---

## Blocks & Content (`src/blocks/`, `src/content/`)

| File                                  | Purpose                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `blocks/BlockRegistry.js`             | Loads all block configs and textures; builds the texture atlas and material map |
| `content/items/base.js`               | Base item definitions shared across content packs                               |
| `content/items/packs/example.pack.js` | Example content pack demonstrating how to add custom blocks/items               |

---

## Data (`src/data/`)

| File            | Purpose                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| `blocks.js`     | Block ID → properties (hardness, XP, color, texture)                                    |
| `tools.js`      | Tool definitions — damage, speed multipliers, durability                                |
| `biomes.js`     | Biome definitions — temperature, humidity ranges, surface/fill blocks, tree/grass types |
| `mobs.js`       | Mob spawn tables — which mobs spawn in which biomes                                     |
| `recipes.js`    | Crafting recipes — 3×3 grid patterns → output items                                     |
| `recipeBook.js` | Flat list of all known recipes for the recipe book UI                                   |
| `goalItems.js`  | Progression milestone items used by the stats/achievement system                        |
| `features.js`   | Feature flags — enable/disable minimap, dynamic lighting, directional culling, etc.     |

---

## Workers (`src/workers/`)

| File                     | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `workers/chunkWorker.js` | Web Worker — runs chunk terrain generation off the main thread |

---

---

## Developer Workflow

| Command                | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Start Vite development server                  |
| `npm run build`        | Build for production                           |
| `npm run lint`         | Run ESLint check                               |
| `npm run lint:fix`     | Run ESLint and fix simple issues               |
| `npm run format`       | Run Prettier to format all codes               |
| `npm run format:check` | Check if code is formatted correctly           |
| `npm run validate`     | Run lint and build to ensure project is stable |
| `npm run build:exe`    | Build a portable Windows executable (`.exe`)   |
