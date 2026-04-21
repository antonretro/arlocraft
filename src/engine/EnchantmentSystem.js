/**
 * Enchantment System for ArloCraft.
 * Defines available enchantments and provides logic for calculating tool modifiers.
 */

export const ENCHANTMENTS = {
  efficiency: {
    id: 'efficiency',
    name: 'Efficiency',
    maxLevel: 5,
    description: 'Increases mining speed.',
    calculateMultiplier: (level) => 1 + level * 0.3
  },
  sharpness: {
    id: 'sharpness',
    name: 'Sharpness',
    maxLevel: 5,
    description: 'Increases melee damage.',
    calculateMultiplier: (level) => 1 + level * 0.25
  },
  unbreaking: {
    id: 'unbreaking',
    name: 'Unbreaking',
    maxLevel: 3,
    description: 'Reduces durability consumption.',
    calculateChance: (level) => 1 / (level + 1)
  },
  knockback: {
    id: 'knockback',
    name: 'Knockback',
    maxLevel: 2,
    description: 'Increases entity knockback force.',
    calculateMultiplier: (level) => 1 + level * 0.5
  },
  fortune: {
    id: 'fortune',
    name: 'Fortune',
    maxLevel: 3,
    description: 'Increases drop rare-rates or quantities.',
    calculateMultiplier: (level) => 1 + level * 0.5
  }
};

export class EnchantmentSystem {
  static getEnchantment(id) {
    return ENCHANTMENTS[id];
  }

  /**
   * Calculates the mining speed multiplier for a tool based on its Efficiency enchantment.
   */
  static getMiningSpeedMultiplier(item) {
    if (!item || !item.enchantments) return 1;
    const eff = item.enchantments.find(e => e.id === 'efficiency');
    if (!eff) return 1;
    return ENCHANTMENTS.efficiency.calculateMultiplier(eff.level);
  }

  /**
   * Calculates the damage multiplier for a tool based on its Sharpness enchantment.
   */
  static getDamageMultiplier(item) {
    if (!item || !item.enchantments) return 1;
    const sharp = item.enchantments.find(e => e.id === 'sharpness');
    if (!sharp) return 1;
    return ENCHANTMENTS.sharpness.calculateMultiplier(sharp.level);
  }

  /**
   * Determines if durability loss should be ignored based on Unbreaking level.
   */
  static shouldConsumeDurability(item) {
    if (!item || !item.enchantments) return true;
    const unb = item.enchantments.find(e => e.id === 'unbreaking');
    if (!unb) return true;
    const chance = ENCHANTMENTS.unbreaking.calculateChance(unb.level);
    return Math.random() < chance;
  }
}
