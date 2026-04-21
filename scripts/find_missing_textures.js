import fs from 'fs';
import path from 'path';

// Define paths
const projectRoot = process.cwd();
const blockConfigsDir = path.join(projectRoot, 'src', 'data', 'block_configs');
const resourcePackDir = path.join(projectRoot, 'public', 'resource_pack', 'assets', 'minecraft', 'textures');
const blockDir = path.join(resourcePackDir, 'block');
const itemDir = path.join(resourcePackDir, 'item');

// Helper to check if file exists
function exists(p) {
    return fs.existsSync(p);
}

function normalizeFlippedId(id) {
    const categories = ['concrete_powder', 'concrete', 'terracotta', 'glazed_terracotta', 'stained_glass', 'wool', 'candle', 'carpet'];
    for (const cat of categories) {
      if (id.startsWith(`${cat}_`)) {
        const color = id.replace(`${cat}_`, '');
        return `${color}_${cat}`;
      }
    }
    return id;
}

// 1. Get all base IDs from folder names
const baseIds = fs.readdirSync(blockConfigsDir).filter(f => fs.statSync(path.join(blockConfigsDir, f)).isDirectory());

// 2. Determine which ones are construction blocks (simplified)
const constructionKeywords = ['planks', 'stone', 'bricks', 'prismarine', 'blackstone', 'quartz', 'purpur', 'copper', 'iron', 'gold', 'diamond', 'emerald', 'lapis', 'coal', 'redstone'];
const constructionIds = baseIds.filter(id => constructionKeywords.some(kw => id.includes(kw)));

// 3. Generate all IDs (base + variants)
const allIds = new Set(baseIds);
constructionIds.forEach(id => {
    allIds.add(`${id}_slab`);
    allIds.add(`${id}_stairs`);
    allIds.add(`${id}_door`);
    allIds.add(`${id}_trapdoor`);
});

console.log(`Total IDs to check: ${allIds.size}`);

const missing = [];
const foundStats = { block: 0, item: 0, missing: 0 };

allIds.forEach(id => {
    const normId = normalizeFlippedId(id);
    
    // Check blockDir candidates
    const blockCandidates = [
        `${normId}.png`,
        `${normId}_front.png`,
        `${normId}_side.png`,
        `${normId}_all.png`,
        `${normId}_top.png`,
        `${normId}_bottom.png`
    ];

    // Special cases for variants
    if (id.endsWith('_slab')) {
        const base = id.replace('_slab', '');
        const normBase = normalizeFlippedId(base);
        blockCandidates.push(`${normBase}_planks.png`, `${normBase}.png`);
    }
    if (id.endsWith('_stairs')) {
        const base = id.replace('_stairs', '');
        const normBase = normalizeFlippedId(base);
        blockCandidates.push(`${normBase}_planks.png`, `${normBase}.png`);
    }
    if (id.endsWith('_door')) {
        const base = id.replace('_door', '');
        const normBase = normalizeFlippedId(base);
        blockCandidates.push(`${normBase}_door_top.png`, `${normBase}_door_bottom.png`, `${normBase}_door.png`);
    }
    if (id.endsWith('_trapdoor')) {
        const base = id.replace('_trapdoor', '');
        const normBase = normalizeFlippedId(base);
        blockCandidates.push(`${normBase}_trapdoor.png`);
    }

    const foundInBlock = blockCandidates.some(c => exists(path.join(blockDir, c)));
    if (foundInBlock) {
        foundStats.block++;
        return;
    }

    // Check itemDir candidates
    const itemCandidates = [
        `${normId}.png`,
        `${normId.replace('_block', '')}.png`
    ];
    
    const foundInItem = itemCandidates.some(c => exists(path.join(itemDir, c)));
    if (foundInItem) {
        foundStats.item++;
        return;
    }

    missing.push(id);
    foundStats.missing++;
});

console.log('\n--- Texture Coverage Summary (With Normalization) ---');
console.log(`Found in Block Dir: ${foundStats.block}`);
console.log(`Found in Item Dir:  ${foundStats.item}`);
console.log(`Missing Textures:   ${foundStats.missing}`);

if (missing.length > 0) {
    console.log('\n--- Remaining Missing IDs (Top 50) ---');
    console.log(missing.slice(0, 50).join('\n'));
}
