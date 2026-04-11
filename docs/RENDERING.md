# ArloCraft Rendering

Rendering behavior is now centralized for easier tuning:

- Core render constants: `src/rendering/RenderConfig.js`
- Main renderer: `src/engine/Renderer.js`
- Chunk mesh layering/order: `src/world/Chunk.js`
- Block material creation: `src/blocks/BlockRegistry.js`

## Quick Tweaks

- Fog density/day-night/underwater: edit `FOG_SETTINGS` in `RenderConfig.js`
- Cloud amount/speed/size: edit `CLOUD_SETTINGS` in `RenderConfig.js`
- Transparent layer ordering: edit `RENDER_LAYERS` in `RenderConfig.js`

## Stability Notes

- Transparent materials now disable `depthWrite` by default.
- Underwater state now updates every frame and correctly affects fog via renderer state.
