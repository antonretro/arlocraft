import '../../../blocks/handlers/FurnaceHandler.js';

export const handlerIds = ['furnace', 'furnace_active'];
export const blockTags = ['utility', 'interactive', 'smelting'];
export const blockParameters = {
  interactive: true,
  ui: 'furnace',
  activeVariantId: 'furnace_active',
  fuelConsumer: true,
};
export const blockMeta = {
  docsSummary: 'Smelting block with furnace UI and active-state variant.',
};
