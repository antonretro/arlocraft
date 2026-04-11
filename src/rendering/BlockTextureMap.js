// Atlas-driven block texture mapping.
// Coordinates are tile-space (x, y) in a 16x16 grid on terrain.png.
// Update this map when you add/replace atlas tiles.
export const BLOCK_TEXTURE_ATLAS = {
    src: '/assets/terrain.png',
    columns: 16,
    rows: 16
};

export const BLOCK_ATLAS_MAP = {
    grass: { top: [0, 0], side: [3, 0], bottom: [2, 0] },
    stone: { all: [1, 0] },
    dirt: { all: [2, 0] },
    cobblestone: { all: [0, 1] },
    wood_planks: { all: [4, 0] },
    sand: { all: [2, 1] },
    wood: { all: [4, 1] },
    leaves: { all: [4, 3] },
    glass: { all: [1, 3] },
    crafting_table: { top: [11, 3], side: [12, 3], bottom: [4, 0] },
    starter_chest: { top: [9, 1], side: [10, 1], bottom: [4, 0] },
    path_block: { all: [0, 5] },
    brick: { all: [7, 0] },
    clay: { all: [8, 4] },
    obsidian: { all: [5, 2] }
};

export function getAtlasFacesForBlock(blockId) {
    return BLOCK_ATLAS_MAP[blockId] ?? null;
}
