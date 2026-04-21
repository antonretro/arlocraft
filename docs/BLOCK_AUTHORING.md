# Block Authoring

ArloCraft block definitions now live in `src/data/block_configs/<block-id>/`.

## Folder contract

Each block folder can contain:

- `config.json`
  - Required for runtime registration.
  - Holds identity and gameplay/render parameters.
- `script.js`
  - Optional.
  - Used for block-specific behavior, handler registration, and metadata overrides.
- `README.md`
  - Optional.
  - Human-facing documentation for the block.

## Minimal example

```text
src/data/block_configs/example_block/
  config.json
  script.js
  README.md
```

```json
{
  "name": "Example Block",
  "textureId": "example_block",
  "hardness": 2,
  "xp": 4,
  "transparent": false
}
```

```js
export const handlerIds = ['example_block'];
export const blockTags = ['utility', 'interactive'];
export const blockParameters = {
  interactive: true,
  ui: 'example_block',
};
```

## Notes

- `src/data/blocks.js` loads all `config.json` files eagerly.
- If a block folder contains `script.js`, it is also loaded eagerly.
- Handler modules can self-register from `script.js`.
- If `README.md` is missing, the loader generates fallback documentation from the config.
- If `script.js` is missing, the loader still creates generated script metadata so every block has a predictable shape in the catalog.
