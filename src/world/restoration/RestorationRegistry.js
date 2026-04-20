const SITE_DEFS = [
  {
    id: 'highway_repair',
    category: 'infrastructure',
    patch: 'highway',
    interactRadius: 8,
    xpReward: 60,
    requirements: [
      { id: 'stone', count: 18 },
      { id: 'oak_log', count: 6 },
    ],
    landmarks: ['Broken Bridge', 'Abandoned Highway', 'Mine Entrance'],
  },
  {
    id: 'market_repair',
    category: 'district',
    patch: 'market',
    interactRadius: 7,
    xpReward: 45,
    requirements: [
      { id: 'oak_log', count: 12 },
      { id: 'path_block', count: 8 },
    ],
    landmarks: ['Market Ruins', 'Lamp Plaza'],
  },
  {
    id: 'housing_repair',
    category: 'housing',
    patch: 'housing',
    interactRadius: 7,
    xpReward: 50,
    requirements: [
      { id: 'oak_log', count: 16 },
      { id: 'glass', count: 4 },
    ],
    landmarks: ['Old Hut', 'Collapsed Bunker'],
  },
  {
    id: 'park_repair',
    category: 'park',
    patch: 'park',
    interactRadius: 7,
    xpReward: 40,
    requirements: [
      { id: 'grass_block', count: 10 },
      { id: 'dirt', count: 8 },
    ],
    landmarks: ['Lost Orchard', 'Abandoned Camp'],
  },
  {
    id: 'utility_repair',
    category: 'utility',
    patch: 'utility',
    interactRadius: 7,
    xpReward: 45,
    requirements: [
      { id: 'stone', count: 12 },
      { id: 'cobblestone', count: 8 },
    ],
    landmarks: [
      'Dry Well',
      "Blacksmith's Forge",
      'Old Windmill',
      'Fishing Dock',
    ],
  },
];

const SITE_BY_LANDMARK = new Map();
for (const site of SITE_DEFS) {
  for (const landmark of site.landmarks) {
    SITE_BY_LANDMARK.set(landmark, site);
  }
}

export function getRestorationSiteByLandmarkName(name) {
  if (!name) return null;
  return SITE_BY_LANDMARK.get(name) ?? null;
}
