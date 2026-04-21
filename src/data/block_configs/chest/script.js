import '../../../blocks/handlers/ChestHandler.js';

export const handlerIds = ['chest'];
export const blockTags = ['storage', 'interactive', 'loot'];
export const blockParameters = {
  interactive: true,
  ui: 'chest',
  inventorySlots: 27,
};
export const blockMeta = {
  docsSummary: 'Primary storage block with chest inventory UI.',
};
