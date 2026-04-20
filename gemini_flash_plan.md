# ArloCraft - Handoff & Flash Plan

## Current State

The ArloCraft engine has been stabilized with a major polish pass. Current focus is on **visual fidelity** and **UI professionalism**.

### Key Coordinates

- **Camera Logic**: [Camera.js](file:///c:/Users/Anthony/arlocraft/src/engine/Camera.js). Multipliers tuned for smooth mobility.
- **Physics**: [Physics.js](file:///c:/Users/Anthony/arlocraft/src/engine/Physics.js). Ghost water bug resolved by adding coordinate-aware block checks.
- **Rendering**: [BlockRegistry.js](file:///c:/Users/Anthony/arlocraft/src/blocks/BlockRegistry.js). Centralized material/shader logic.
- **UI**: [style.css](file:///c:/Users/Anthony/arlocraft/src/style.css). Large 1200px layout implemented.

## Pending Items (Next Session)

1. **Tree Logic Polish**: Structure placement clearing (Item burial fix) needs monitoring in various biomes.
2. **Mob AI**: Investigate villager anton spawning and pathfinding in generated structures.
3. **Sound Overhaul**: Integrate `action-success` events into a dedicated audio spatializer.
4. **CSS Refactoring**: Proposal to split `style.css` into `engine.css`, `ui.css`, and `menu.css`.

## Notes for Gemini Flash

- **Block Aliases**: Do NOT re-add `short_grass` alias; it breaks sprite rendering.
- **Water Checks**: Always use `isPositionInWater` which now calls `getBlockAt` to avoid "invisible ocean" physics.
- **Shaders**: Wind shader is now injected into all deco blocks via `id.includes` or `config.deco`.

---

_Antigravity 1.0 (Sonnet 3.7 Optimized)_
