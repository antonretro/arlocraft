const FAMILIES = [
  ['aether', 'Aether'],
  ['chrono', 'Chrono'],
  ['ember', 'Ember'],
  ['frost', 'Frost'],
  ['glitch', 'Glitch'],
  ['lumen', 'Lumen'],
  ['mycel', 'Mycel'],
  ['nova', 'Nova'],
  ['quartz', 'Quartz'],
  ['void', 'Void'],
];

const VARIANTS = [
  ['alpha', 'Alpha'],
  ['beta', 'Beta'],
  ['gamma', 'Gamma'],
  ['delta', 'Delta'],
  ['epsilon', 'Epsilon'],
  ['zeta', 'Zeta'],
  ['eta', 'Eta'],
  ['theta', 'Theta'],
  ['iota', 'Iota'],
  ['kappa', 'Kappa'],
];

export const GOAL_ITEMS = FAMILIES.flatMap(([familyId, familyLabel]) =>
  VARIANTS.map(([variantId, variantLabel]) => ({
    id: `${familyId}_${variantId}_artifact`,
    name: `${familyLabel} ${variantLabel} Artifact`,
    kind: 'artifact',
  }))
);

export const GOAL_ITEM_ID_SET = new Set(GOAL_ITEMS.map((item) => item.id));
