# ArloCraft — Texture System Redesign & Bug Fix Guide

## What Was Broken (and Why)

The game has two competing texture sources that never agreed on naming:

| Source | Location | Format |
|--------|----------|--------|
| Content Blocks | `src/content/blocks/<name>/<face>.png` | Folder = blockId, file = face name |
| Igneous Pack | `src/Igneous_Pack/.../block/<name>.png` | Flat files, name = `blockId_face` |

**Root bugs fixed in this session:**
1. Igneous parser treated `grass_block_side.png` as blockId=`grass_block_side` instead of blockId=`grass_block`, face=`side`
2. `loadFace()` returned the magenta missingTexture object (truthy) instead of `null` on a miss — causing `singleTextureOnly=true` and ALL faces to use the broken fallback
3. Content block folder name `grass` had textureId `grass_block` — no alias existed
4. Entity texture files in `public/resource_pack/` were stub files (1KB) — replaced with real Igneous textures

---

## How to Make Any Texture Pack Work (Minecraft-Style)

### Current Architecture Problem
The engine loads textures via `import.meta.glob` at **build time** (Vite). This means textures are baked in — you can't swap them without a code change.

### Proposed Fix: Runtime Resource Pack Loader

Move ALL textures to `public/resource_pack/` (already exists for entities). Load blocks at runtime via `fetch()` or `THREE.TextureLoader`.

**Target folder structure:**
```
public/
  resource_pack/
    assets/minecraft/textures/
      block/
        grass_block_side.png
        grass_block_top.png
        stone.png
        ...
      entity/
        sheep/sheep.png
        cow/cow.png
        ...
```

**How to implement:**
1. Copy all Igneous block PNGs to `public/resource_pack/assets/minecraft/textures/block/`
2. Replace `import.meta.glob` in `BlockRegistry.js` with a runtime fetch of a `manifest.json` listing all textures
3. Load textures on-demand using `THREE.TextureLoader.load('/resource_pack/...')`
4. To switch packs: change the base URL prefix — everything else works automatically

### Resource Pack Selector UI
Add a "Resource Packs" tab in Settings that:
- Lists available packs in `public/resource_packs/`
- Shows pack name, icon (`pack.png`), and description (`pack.mcmeta`)
- On select: reload `BlockRegistry` with new base URL and rebuild all chunks

---

## Remaining Missing Textures (Next To Fix)

Run the game and look for `[ArloCraft] Missing texture for block:` warnings. Common ones:

| Block ID | Fix |
|----------|-----|
| `tall_grass_bottom` | Add to `IGNEOUS_COMPOUND_IDS` ✅ (done) |
| `rose_bush_top` | Add to `IGNEOUS_COMPOUND_IDS` ✅ (done) |
| `peony_top` | Add to `IGNEOUS_COMPOUND_IDS` ✅ (done) |
| `lilac_top` | Add to `IGNEOUS_COMPOUND_IDS` ✅ (done) |
| Any new ones | Add blockId to `IGNEOUS_COMPOUND_IDS` in `BlockRegistry.js` or add `idAliases` entry |

---

## Optimization Recommendations

### 1. Texture Loading (High Priority)
- **Current:** All 874 Igneous textures processed at build time via `import.meta.glob`
- **Better:** Load on-demand from `public/resource_pack/` — only fetch textures when a chunk containing that block is built
- **Benefit:** Faster startup, supports runtime texture pack switching

### 2. Chunk Texture Caching
- Already uses `materialCache` — good. Keep it.
- Ensure `materialCache.get(id)` is checked before any work is done (it is).

### 3. Entity Textures
- Already loaded on-demand when mobs spawn ✅
- Textures are cached in `billboardTextureCache` ✅

### 4. Simplify Block Naming
- Long-term: rename content block folders to match their `id` (e.g. rename folder `grass` → `grass_block`)
- Then remove the textureId aliasing hack
- Makes the system predictable: folder = blockId, always.

---

## Quick Reference: Adding a New Block

1. Create `src/content/blocks/<blockId>/` folder
2. Add `all.png` (or `top.png`, `side.png`, `bottom.png` for multi-face)
3. Add `config.json`:
   ```json
   { "id": "<blockId>", "name": "Block Name", "hardness": 1 }
   ```
4. Register in `src/data/blocks.js`
5. Done — no changes to BlockRegistry needed

## Quick Reference: Adding a New Mob

1. Add entry to `src/data/mobs.js` with `textureKey: 'folder/filename'`
2. Ensure PNG exists at `public/resource_pack/assets/minecraft/textures/entity/<folder>/<filename>.png`
3. Done
