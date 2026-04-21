import '../../../blocks/handlers/ChestHandler.js';

export const handlerIds = ['starter_chest'];
export const blockTags = ['storage', 'interactive', 'starter-loot'];
export const blockParameters = {
  interactive: true,
  ui: 'chest',
  inventorySlots: 27,
  seededLoot: true,
};
export const blockMeta = {
  docsSummary: 'Structure chest variant used for starter loot and onboarding.',
};
