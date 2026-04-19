# AntonCraft — GPT Reference Documentation

> A concise technical overview intended for AI assistants (ChatGPT, Claude, etc.) helping with this codebase. Keep it updated when major systems change.

---

## What is AntonCraft?

AntonCraft is a browser-based, Minecraft-inspired voxel survival/restoration game built with:

- **Vite** (bundler + dev server)
- **Three.js** (3D rendering)
- **Rapier3D** (physics via WASM)
- **Electron** (optional desktop build)

Theme: *The world has been corrupted by a viral blight. The player mines, builds, and places Arlo blocks to cleanse corruption and restore the land.*

---

## Project Structure

```
antoncraft/
├── index.html                  # All HUD/UI markup lives here
├── src/
│   ├── main.js                 # Entry point — creates Game instance
│   ├── style.css               # All styles (790+ lines, CSS variables at top)
│   ├── assets/                 # Bundled textures (grass, stone PNGs)
│   ├── blocks/
│   │   └── BlockRegistry.js    # Material/texture factory + atlas support
│   ├── content/                # Content pack system (loaded via import.meta.glob)
│   │   ├── blocks/
│   │   │   ├── base.js         # Empty — all blocks are in packs/
│   │   │   └── packs/
│   │   │       ├── core.pack.js    # All built-in blocks (100+ entries)
│   │   │       └── example.pack.js # Template for custom blocks
│   │   └── items/
│   │       ├── base.js         # All built-in tools/weapons
│   │       └── packs/
│   │           └── example.pack.js # Template for custom tools
│   ├── data/
│   │   ├── blocks.js           # Merges base + packs → exports BLOCKS array
│   │   ├── tools.js            # Merges base + packs → exports TOOLS array
│   │   ├── biomes.js           # BIOMES array (plains, forest, desert, swamp, highlands)
│   │   ├── mobs.js             # MOBS array
│   │   ├── recipeBook.js       # Crafting recipes
│   │   └── goalItems.js        # Progression goals
│   ├── engine/
│   │   ├── Game.js             # Main game loop (~44KB). Init, animate, all UI bindings
│   │   ├── Renderer.js         # Three.js scene, fog, clouds, screen filters
│   │   ├── Camera.js           # PerspectiveCamera (default FOV 75)
│   │   ├── Input.js            # Keyboard/mouse/pointer lock
│   │   ├── Physics.js          # Rapier3D integration (player capsule + collision)
│   │   ├── GameState.js        # Inventory, hotbar, health, food, XP
│   │   ├── CraftingSystem.js   # Recipe matching
│   │   └── ActionSystem.js     # Block/entity interaction handler
│   ├── rendering/
│   │   ├── RenderConfig.js     # Constants: CLOUD_SETTINGS, RENDER_LAYERS, FOG_SETTINGS, computeFogDensity(), materialIsTransparent()
│   │   └── BlockTextureMap.js  # Atlas config → BLOCK_ATLAS_MAP (tile coords per block face)
│   ├── ui/
│   │   ├── HUD.js              # Hotbar, inventory, health/food bars, crafting UI (~26KB)
│   │   ├── MiniMap.js          # Canvas minimap + landmark labels
│   │   └── HelpPanel.js        # Context-sensitive controls overlay
│   ├── world/
│   │   ├── World.js            # Chunk management, block map, world gen coordination (~54KB)
│   │   ├── Chunk.js            # Per-chunk terrain gen + InstancedMesh building
│   │   ├── ChunkGenerator.js   # (Worker-based gen — currently disabled)
│   │   └── structures/
│   │       └── StructureRegistry.js  # 25+ named landmark structures
│   ├── entities/               # Mob spawning, AI, entity rendering
│   └── workers/                # Web worker stubs
└── docs/
    ├── ANTONCRAFT_GPT.md        # This file
    ├── EXTENDING_ANTONCRAFT.md  # How to add blocks/tools via content packs
    ├── CONTENT_PACKS.md        # Content pack format spec
    ├── FEATURE_BACKLOG.md      # Planned features
    └── RENDERING.md            # Rendering pipeline notes
```

---

## Core Systems

### Block System

**Data shape** (in `core.pack.js`):
```js
{ id: 'stone', name: 'Stone', hardness: 2, xp: 5 }
// Optional flags:
{ transparent: true }   // renders with alpha, depthWrite: false
{ emissive: true }      // glows (emissive material)
{ deco: true }          // thin vertical decoration (grass_tall, flowers)
{ foodVal: 4 }          // edible, restores hunger
```

**Adding a block:**
1. Add entry to `src/content/blocks/packs/core.pack.js` (or a new pack file)
2. Optionally add atlas tile coordinates to `src/rendering/BlockTextureMap.js`
3. Optionally add an icon to `public/icons/items/`

**Material resolution order in `BlockRegistry.getMaterial(id)`:**
1. Check `BLOCK_ATLAS_MAP` → atlas tile slice (terrain.png at `/assets/terrain.png`, 16×16 grid)
2. Grass / stone → bundled PNG textures (fallback if not in atlas)
3. All others → procedural color from palette, or emissive shader (virus/arlo/uranium/amethyst/mythril)

### Tool System

**Data shape** (in `src/content/items/base.js`):
```js
{
  id: 'pick_wood', name: 'Wooden Pickaxe',
  type: 'pick',       // pick | sword | axe | dagger | spear | hammer | gun | ranged | magic | utility
  efficiency: 1,      // mining speed multiplier
  damage: 2,          // attack damage
  range: 3.6,         // reach in world units
  cooldown: 0.28,     // seconds between swings
  knockback: 0.4,
  critChance: 0.02
}
```

### World / Chunks

- **Chunk size:** 12×∞×12 blocks per chunk
- **Render distance:** 1 (low) / 2 (balanced) / 3 (high) chunks
- **Chunk building:** `Chunk.buildMesh()` creates `InstancedMesh` per block type with `frustumCulled = true`
- **Block storage:** `World.blockMap: Map<key, id>` where key = `"x|y|z"` string
- **Dirty rebuild:** ~1–4 chunks rebuilt per frame depending on quality tier
- **Priority rebuilds:** block place/break flushes up to 20 priority rebuilds immediately
- **Terrain height range:** `minTerrainY = -4` to `maxTerrainY = 52` — dramatic mountains up to 52 blocks, snow caps above y=30
- **Cliff filling:** exposed cliff faces are filled with stone down to the neighbor height (up to 50 blocks) so mountains look solid

### Biomes

Defined in `src/data/biomes.js`. Each biome has:
```js
{ id: 'forest', surfaceBlock: 'grass', fillerBlock: 'dirt', treeDensity: 0.2,
  terrainBias: 5, terrainRoughness: 1.1, waterLevelOffset: 0 }
```

Biome is selected per (x, z) using a 3-noise (temperature, moisture, continental) function in `World.getBiomeAt()`.

| Biome | Character | Heights |
|-------|-----------|---------|
| plains | rolling grassland | ~2–20 |
| forest | hilly, dense trees | ~5–25 |
| desert | flat sandy dunes | ~1–14 |
| swamp | low, waterlogged | ~−4–6 |
| highlands | dramatic mountains, snow caps | ~5–52 |

**Terrain generation** uses 4-octave noise: continental (±9, scale 240), regional (±5, scale 80), detail (±3×roughness, scale 32), fine (±1.25×roughness, scale 14) — all summed with `biome.terrainBias`.

### Structures / Landmarks

Defined in `src/world/structures/StructureRegistry.js`. Each structure:
```js
{
  name: 'Ruined Tower',         // shown on minimap
  biomes: ['plains', 'forest'], // optional biome filter; omit or use 'any' for all
  width, height, depth,         // bounding box (informational)
  blueprints: (x, y, z) => [   // returns array of { x, y, z, id } blocks
    { x, y, z, id: 'stone' }, ...
  ]
}
```

Structures are placed at ~0.35% probability per terrain column. When placed, they register a landmark in `World.landmarks` which the minimap reads and labels with a yellow dot + name.

**Adding a structure:** Add a new key to `STRUCTURES` in `StructureRegistry.js`. It will be picked up automatically.

### Corruption / Restoration System

| Block | Role |
|-------|------|
| `virus` | Corruption — dims + desaturates the screen, shows red vignette, slows the player |
| `arlo`  | Restoration — subtle brightness and saturation boost |

**Area influence:**
- Sampled every 10 frames via `World.getAreaInfluence(playerPos)` 
- Returns `{ virus: 0–1, arlo: 0–1 }`
- Drives `Renderer.applyScreenFilter()` (CSS filter on canvas) and `#zone-meter` HUD

**Zone HUD states:** CORRUPTED → TAINTED → NEUTRAL → CLEANSING → RESTORED

---

## Rendering Pipeline

```
Game.animate()
  → World.update()          chunk load/unload, dirty rebuilds
  → Physics.update()        player movement
  → Renderer.setAreaInfluence()   screen filter
  → Renderer.render()
      → updateClouds()
      → scene.render(camera)
```

**Fog:** `THREE.FogExp2`. Density computed by `computeFogDensity(daylight, submerged)` from `RenderConfig.js`.

**Render layers (renderOrder):**
- `0` — opaque blocks
- `20` — transparent blocks (glass, ice, leaves)
- `30` — water surface planes

**Screen filters (CSS on canvas):**
- Underwater: subtle saturation + hue shift
- Virus zone: brightness↓, saturation↓, hue→red
- Arlo zone: brightness↑, saturation↑

---

## Settings (persisted in localStorage `antoncraft-settings`)

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `sensitivity` | float | 0.00145 | Mouse look speed |
| `invertY` | bool | false | Invert vertical look |
| `fov` | int | 75 | Camera FOV (60–110) |
| `qualityTierPref` | string | `'low'` | `low` / `balanced` / `high` |
| `preferredMode` | string | `'SURVIVAL'` | `SURVIVAL` / `CREATIVE` |

---

## Key HTML Element IDs (for UI work)

| ID | Purpose |
|----|---------|
| `#hud` | Bottom HUD container |
| `#hotbar` | 9-slot item bar |
| `#hp-bar`, `#food-bar` | Stat bar containers |
| `#xp-bar` | XP progress bar fill |
| `#minimap-canvas` | 180×180 canvas |
| `#zone-meter` | Corruption/restoration meter |
| `#zone-fill-virus`, `#zone-fill-arlo` | Bar fill elements |
| `#zone-status` | Text: CORRUPTED / NEUTRAL / RESTORED etc. |
| `#corruption-overlay` | Red vignette overlay (opacity driven by JS) |
| `#underwater-light` | Blue overlay when submerged |
| `#settings-panel` | Settings panel (hidden by default) |
| `#setting-fov`, `#setting-sensitivity` | Range inputs |
| `#btn-quality-low/balanced/high` | Quality tier buttons |
| `#debug-overlay` | F3 debug text (hidden by default) |
| `#coords-display` | Live XYZ readout |
| `#overlay` | Title screen |
| `#pause-overlay` | Pause screen |

---

## CSS Variables

```css
:root {
  --panel:          rgba(7, 10, 16, 0.8)
  --panel-strong:   rgba(8, 12, 20, 0.96)
  --panel-border:   rgba(255, 255, 255, 0.11)
  --slot:           rgba(16, 22, 32, 0.92)
  --slot-border:    #3a4a5a
  --slot-active:    #f7e47a
  --ink:            #eef4ff
  --muted:          #8fa4bc
  --accent:         #ff7f4b   /* orange */
  --accent-2:       #ffcf65   /* gold */
  --accent-glow:    rgba(255, 127, 75, 0.35)
  --danger:         #ff5a6e
  --ok:             #7ef5a0
  --glass:          rgba(255, 255, 255, 0.04)
}
```

---

## Performance Notes

- **Pixel ratio:** 0.35 / 0.48 / 0.6 × devicePixelRatio (kept below 1 intentionally)
- **Frustum culling:** enabled on all InstancedMeshes (bounding spheres computed post-build)
- **Aura sampling:** every 10 frames (not every frame)
- **Screen filter:** skipped when virus/arlo values change < 0.5%
- **Zone meter DOM:** cached element refs, skipped when values unchanged
- **Chunk rebuilds:** 1 / 2 / 4 per frame on low / balanced / high quality
- **Dynamic quality:** auto-adjusts tier if FPS drops below 40 or rises above 58

---

## Content Pack Format

Drop a `.js` file in `src/content/blocks/packs/` or `src/content/items/packs/`. Export one of:

```js
// Blocks:
export const BLOCK_PACK = [ { id, name, hardness, xp, ...flags } ];

// Tools:
export const TOOL_PACK = [ { id, name, type, efficiency, damage, range, cooldown, knockback, critChance } ];
```

IDs that match existing entries override them. Packs are merged in alphabetical filename order after `core.pack.js`.

---

## Common Tasks

| Goal | Where to look |
|------|--------------|
| Add a block | `src/content/blocks/packs/core.pack.js` + `BlockTextureMap.js` |
| Add a tool | `src/content/items/base.js` |
| Add a structure/landmark | `src/world/structures/StructureRegistry.js` |
| Add a biome | `src/data/biomes.js` |
| Add a crafting recipe | `src/data/recipeBook.js` |
| Change world gen | `src/world/Chunk.js` → `generateTerrainColumn()` |
| Change fog/lighting | `src/rendering/RenderConfig.js` + `src/engine/Renderer.js` |
| Add a HUD element | `index.html` + `src/style.css` + wire up in `Game.js` |
| Add a setting | `Game.loadSettings()` defaults + `setupUIBindings()` + `index.html` |
| Add a mob | `src/data/mobs.js` + `src/entities/` |
