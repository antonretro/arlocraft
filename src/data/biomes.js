// Terrain tuning values used by the fast heightmap pipeline:
// - mcDepth: base elevation shift from sea level.
// - mcScale: broad terrain variation amount.
// - ridgeStrength: extra mountain/ridge amplification.
// - detailStrength: high-frequency surface detail strength.
export const BIOMES = [
    {
        id: 'plains',
        name: 'Plains',
        surfaceBlock: 'grass',
        fillerBlock: 'dirt',
        mcDepth: 2,
        mcScale: 0.07,
        ridgeStrength: 0.08,
        detailStrength: 0.5,
        waterLevelOffset: 0,
        treeDensity: 0.08
    },
    {
        id: 'forest',
        name: 'Forest',
        surfaceBlock: 'grass',
        fillerBlock: 'dirt',
        mcDepth: 5,
        mcScale: 0.2,
        ridgeStrength: 0.16,
        detailStrength: 0.72,
        waterLevelOffset: 0,
        treeDensity: 0.22
    },
    {
        id: 'desert',
        name: 'Desert',
        surfaceBlock: 'sand',
        fillerBlock: 'sand',
        mcDepth: 2,
        mcScale: 0.05,
        ridgeStrength: 0.1,
        detailStrength: 0.45,
        waterLevelOffset: -1,
        treeDensity: 0.01
    },
    {
        id: 'swamp',
        name: 'Swamp',
        surfaceBlock: 'grass',
        fillerBlock: 'dirt',
        mcDepth: -3,
        mcScale: 0.1,
        ridgeStrength: 0.03,
        detailStrength: 0.36,
        waterLevelOffset: 2,
        treeDensity: 0.12
    },
    {
        id: 'highlands',
        name: 'Highlands',
        surfaceBlock: 'stone',
        fillerBlock: 'stone',
        mcDepth: 22,
        mcScale: 0.5,
        ridgeStrength: 0.72,
        detailStrength: 0.82,
        waterLevelOffset: -2,
        treeDensity: 0.04
    },
    {
        id: 'meadow',
        name: 'Meadow',
        surfaceBlock: 'grass',
        fillerBlock: 'dirt',
        mcDepth: 0,
        mcScale: 0.05,
        ridgeStrength: 0.04,
        detailStrength: 0.4,
        waterLevelOffset: 0,
        treeDensity: 0.015
    },
    {
        id: 'badlands',
        name: 'Badlands',
        surfaceBlock: 'sandstone',
        fillerBlock: 'stone',
        mcDepth: 8,
        mcScale: 0.38,
        ridgeStrength: 0.55,
        detailStrength: 0.75,
        waterLevelOffset: -2,
        treeDensity: 0.003
    },
    {
        id: 'canyon',
        name: 'Canyon',
        surfaceBlock: 'sandstone',
        fillerBlock: 'stone',
        mcDepth: 12,
        mcScale: 0.6,
        ridgeStrength: 0.92,
        detailStrength: 0.9,
        waterLevelOffset: -3,
        treeDensity: 0
    },
    {
        id: 'alpine',
        name: 'Alpine',
        surfaceBlock: 'stone',
        fillerBlock: 'stone',
        mcDepth: 40,
        mcScale: 0.75,
        ridgeStrength: 1.1,
        detailStrength: 1,
        waterLevelOffset: -4,
        treeDensity: 0.01
    },
    {
        id: 'tundra',
        name: 'Tundra',
        surfaceBlock: 'snow_block',
        fillerBlock: 'dirt',
        mcDepth: 3,
        mcScale: 0.12,
        ridgeStrength: 0.2,
        detailStrength: 0.58,
        waterLevelOffset: -1,
        treeDensity: 0.02
    }
];

export const BIOME_BY_ID = new Map(BIOMES.map((biome) => [biome.id, biome]));
