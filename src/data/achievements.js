/**
 * Achievement Definitions (Medals).
 * Each achievement has a unique ID, visual icon (monogram), and goal.
 */
export const ACHIEVEMENTS = [
    {
        id: 'first_steps',
        name: 'First Steps',
        description: 'Take your first few steps in the world of ArloCraft.',
        icon: '👟',
        check: (stats) => stats.distanceTravelled > 10
    },
    {
        id: 'wood_age',
        name: 'Wood Age',
        description: 'Punch a tree and collect your first log.',
        icon: '🪵',
        check: (stats) => stats.blocksMined.has('oak_log') || stats.blocksMined.has('birch_log') || stats.blocksMined.has('spruce_log')
    },
    {
        id: 'stone_age',
        name: 'Stone Age',
        description: 'Mine a block of stone to enter the tool-making era.',
        icon: '🪨',
        check: (stats) => stats.blocksMined.has('stone') || stats.blocksMined.has('cobblestone')
    },
    {
        id: 'collector',
        name: 'Block Collector',
        description: 'Discover 10 unique types of blocks.',
        icon: '📦',
        check: (stats) => stats.discoveredBlocksCount >= 10
    },
    {
        id: 'master_crafter',
        name: 'Master Crafter',
        description: 'Craft a Crafting Table.',
        icon: '🛠️',
        check: (stats) => stats.blocksCrafted.has('crafting_table')
    },
    {
        id: 'deep_explorer',
        name: 'Deep Explorer',
        description: 'Reach the bedrock layer at the bottom of the world.',
        icon: '💎',
        check: (stats) => stats.lowestY <= -60
    },
    {
        id: 'survivalist',
        name: 'Survivalist',
        description: 'Survive a full day and night cycle.',
        icon: '☀️',
        check: (stats) => stats.daysSurvived >= 1
    },
    {
        id: 'virus_hunter',
        name: 'Virus Hunter',
        description: 'Destroy your first corrupted Virus block.',
        icon: '👾',
        check: (stats) => stats.blocksMined.has('virus')
    }
];
