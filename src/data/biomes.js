export const BIOMES = [
    {
        id: 'plains',
        name: 'Plains',
        surfaceBlock: 'grass',
        fillerBlock: 'dirt',
        terrainBias: 2,
        terrainRoughness: 0.85,
        waterLevelOffset: 0,
        treeDensity: 0.08
    },
    {
        id: 'forest',
        name: 'Forest',
        surfaceBlock: 'grass',
        fillerBlock: 'dirt',
        terrainBias: 5,
        terrainRoughness: 1.1,
        waterLevelOffset: 0,
        treeDensity: 0.2
    },
    {
        id: 'desert',
        name: 'Desert',
        surfaceBlock: 'sand',
        fillerBlock: 'sand',
        terrainBias: 1,
        terrainRoughness: 0.6,
        waterLevelOffset: -1,
        treeDensity: 0.01
    },
    {
        id: 'swamp',
        name: 'Swamp',
        surfaceBlock: 'grass',
        fillerBlock: 'dirt',
        terrainBias: -4,
        terrainRoughness: 0.55,
        waterLevelOffset: 2,
        treeDensity: 0.12
    },
    {
        id: 'highlands',
        name: 'Highlands',
        surfaceBlock: 'stone',
        fillerBlock: 'stone',
        terrainBias: 20,
        terrainRoughness: 2.0,
        waterLevelOffset: -2,
        treeDensity: 0.04
    },
    {
        id: 'meadow',
        name: 'Meadow',
        surfaceBlock: 'grass',
        fillerBlock: 'dirt',
        terrainBias: 1,
        terrainRoughness: 0.55,
        waterLevelOffset: 0,
        treeDensity: 0.015
    },
    {
        id: 'badlands',
        name: 'Badlands',
        surfaceBlock: 'sandstone',
        fillerBlock: 'stone',
        terrainBias: 7,
        terrainRoughness: 1.55,
        waterLevelOffset: -2,
        treeDensity: 0.003
    },
    {
        id: 'canyon',
        name: 'Canyon',
        surfaceBlock: 'sandstone',
        fillerBlock: 'stone',
        terrainBias: 10,
        terrainRoughness: 2.2,
        waterLevelOffset: -3,
        treeDensity: 0
    },
    {
        id: 'alpine',
        name: 'Alpine',
        surfaceBlock: 'stone',
        fillerBlock: 'stone',
        terrainBias: 34,
        terrainRoughness: 3.2,
        waterLevelOffset: -4,
        treeDensity: 0.01
    },
    {
        id: 'tundra',
        name: 'Tundra',
        surfaceBlock: 'snow_block',
        fillerBlock: 'dirt',
        terrainBias: 3,
        terrainRoughness: 0.95,
        waterLevelOffset: -1,
        treeDensity: 0.02
    }
];

export const BIOME_BY_ID = new Map(BIOMES.map((biome) => [biome.id, biome]));
