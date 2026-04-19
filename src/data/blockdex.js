import { BLOCKS } from './blocks.js';

/**
 * Blocklog (Blockdex) Registry.
 * Assigns a stable #ID to every registered block for the collection catalogue.
 */

// Sorting alphabetically to ensure stable numbering as new blocks are discovered/loaded.
const stableBlocks = [...BLOCKS].sort((a, b) => a.id.localeCompare(b.id));

export const BLOCKDEX = stableBlocks.map((block, index) => ({
    dexId: index + 1,
    id: block.id,
    name: block.name,
    description: block.description || `A rare discovery: ${block.name}.`
}));
