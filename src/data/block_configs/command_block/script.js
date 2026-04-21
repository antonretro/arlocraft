import '../../../blocks/handlers/CommandBlockHandler.js';

export const handlerIds = ['command_block'];
export const blockTags = ['redstone', 'interactive', 'scripting'];
export const blockParameters = {
  interactive: true,
  ui: 'command_block',
  redstoneTriggerable: true,
};
export const blockMeta = {
  docsSummary: 'Interactive automation block that executes script commands.',
};
