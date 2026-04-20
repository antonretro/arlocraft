export const SETTLEMENT_FIRST_PARTS = [
  'Anton',
  'Arlo',
  'Ger',
  'Stone',
  'Oak',
  'River',
  'Iron',
  'Silver',
  'Gold',
  'Pine',
  'Willow',
  'Maple',
  'Cedar',
  'Ash',
  'North',
  'South',
  'East',
  'West',
  'High',
  'Low',
  'Bright',
  'Dus',
  'Sun',
  'Moon',
  'Star',
  'Mist',
  'Frost',
  'Wild',
  'Wolf',
  'Fox',
  'Bear',
  'Hart',
  'Eagle',
  'Falcon',
  'Raven',
  'Crown',
  'Kings',
  'Queens',
  'Forge',
  'Bridge',
  'Vale',
  'Glen',
  'Elm',
  'Birch',
  'Red',
  'Blue',
  'Green',
  'White',
  'Black',
  'Amber',
  'Crystal',
  'Copper',
  'Tin',
  'Ruby',
  'Sapphire',
  'Moss',
  'Thorn',
  'Marsh',
  'Lake',
  'Harbor',
];

export const SETTLEMENT_SECOND_PARTS = [
  'berg',
  'burg',
  'shire',
  'ford',
  'fell',
  'field',
  'haven',
  'port',
  'point',
  'view',
  'crest',
  'ridge',
  'moor',
  'dale',
  'keep',
  'march',
  'stead',
  'holm',
  'gate',
  'watch',
  'cross',
  'run',
  'brook',
  'well',
  'grove',
  'plain',
  'hearth',
  'rest',
  'ward',
  'reach',
  'cliff',
  'hollow',
  'bay',
  'mill',
  'circle',
  'market',
  'yard',
  'heights',
  'springs',
  'pass',
  'trail',
  'crossing',
  'works',
  'gardens',
  'district',
];

export const SETTLEMENT_LIBRARY_SIZE =
  SETTLEMENT_FIRST_PARTS.length * SETTLEMENT_SECOND_PARTS.length;

function fract(value) {
  return value - Math.floor(value);
}

function hash(seed, x, z, ox, oz) {
  const value =
    Math.sin(x * 127.1 + z * 311.7 + seed * 0.173 + ox + oz) * 43758.5453;
  return fract(value);
}

export function generateSettlementName(seed, x, z) {
  const sx = Math.round(Number(x) || 0);
  const sz = Math.round(Number(z) || 0);
  const s = Number(seed) || 1;

  const firstIndex =
    Math.floor(hash(s, sx, sz, 17.0, -29.0) * SETTLEMENT_FIRST_PARTS.length) %
    SETTLEMENT_FIRST_PARTS.length;
  const secondIndex =
    Math.floor(hash(s, sx, sz, -43.0, 71.0) * SETTLEMENT_SECOND_PARTS.length) %
    SETTLEMENT_SECOND_PARTS.length;
  return `${SETTLEMENT_FIRST_PARTS[firstIndex]}${SETTLEMENT_SECOND_PARTS[secondIndex]}`;
}
