export const BIOMES = [
    {
        id: 'plains',
        name: 'Plains',
        surfaceBlock: 'grass',
        fillerBlock: 'dirt',
        terrainBias: 0,
        terrainRoughness: 1,
        waterLevelOffset: 0,
        treeDensity: 0.08
    },
    {
        id: 'forest',
        name: 'Forest',
        surfaceBlock: 'grass',
        fillerBlock: 'dirt',
        terrainBias: 0.3,
        terrainRoughness: 1.12,
        waterLevelOffset: 0,
        treeDensity: 0.18
    },
    {
        id: 'desert',
        name: 'Desert',
        surfaceBlock: 'sand',
        fillerBlock: 'sand',
        terrainBias: -0.25,
        terrainRoughness: 0.9,
        waterLevelOffset: -1,
        treeDensity: 0.01
    },
    {
        id: 'swamp',
        name: 'Swamp',
        surfaceBlock: 'grass',
        fillerBlock: 'dirt',
        terrainBias: -0.6,
        terrainRoughness: 0.8,
        waterLevelOffset: 1,
        treeDensity: 0.1
    },
    {
        id: 'highlands',
        name: 'Highlands',
        surfaceBlock: 'stone',
        fillerBlock: 'stone',
        terrainBias: 1.1,
        terrainRoughness: 1.35,
        waterLevelOffset: -1,
        treeDensity: 0.03
    }
];

export const BIOME_BY_ID = new Map(BIOMES.map((biome) => [biome.id, biome]));
