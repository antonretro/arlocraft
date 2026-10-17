const FOOD_VALUES = {
  apple: 4,
  tomato: 4,
  carrot: 3,
  potato: 3,
  corn: 3,
  blueberry: 2,
  strawberry: 2,
  melon_slice: 2,
  honey_bottle: 3,
  bread: 5,
  pumpkin_pie: 6,
  cookie: 2,
  mushroom_brown: 2,
  steak: 8,
  cooked_fish: 6,
  beef: 3,
  porkchop: 3,
  cooked_porkchop: 8,
  chicken: 2,
  cooked_chicken: 6,
  mutton: 2,
  cooked_mutton: 6,
  cod: 2,
  cooked_cod: 5,
  salmon: 2,
  cooked_salmon: 6,
  rabbit: 3,
  cooked_rabbit: 5,
  baked_potato: 5,
  dried_kelp: 1,
  beetroot: 1,
  rotten_flesh: 4,
  golden_apple: 4,
};

import { PotionSystem } from './PotionSystem.js';

export { FOOD_VALUES };

export class SurvivalSystem {
  constructor(gameState, hud) {
    this.gameState = gameState;
    this.hud = hud;
    this.timers = { hunger: 0, regen: 0, starve: 0 };
    this.potionSystem = new PotionSystem(gameState);
  }

  tryEatFood(selectedSlot) {
    const selected = this.gameState.getSelectedItem();
    if (!selected) return false;
    const foodValue = FOOD_VALUES[selected.id];
    if (!foodValue) return false;
    if (this.gameState.hunger >= 20) return false;

    this.gameState.modifyHunger(foodValue);
    selected.count = Math.max(0, (selected.count ?? 1) - 1);
    if (selected.count === 0) this.gameState.inventory[selectedSlot] = null;
    window.dispatchEvent(new CustomEvent('inventory-changed'));
    this.hud?.setFace('happy', 800);
    this.hud?.flashPrompt?.(`+${foodValue} FOOD`, '#aaff88');
    return true;
  }

  isFoodItem(itemId) {
    return Boolean(FOOD_VALUES[itemId]);
  }

  update(delta) {
    if (this.gameState.mode !== 'SURVIVAL' || this.gameState.isDead) return;

    this.potionSystem.update(delta);

    this.timers.hunger += delta;
    if (this.timers.hunger >= 10) {
      this.timers.hunger = 0;
      this.gameState.modifyHunger(-1);
    }

    if (
      this.gameState.hunger >= 16 &&
      this.gameState.hp < this.gameState.maxHp
    ) {
      this.timers.regen += delta;
      if (this.timers.regen >= 4) {
        this.timers.regen = 0;
        this.gameState.heal(1);
        this.gameState.modifyHunger(-1);
      }
    } else {
      this.timers.regen = 0;
    }

    if (this.gameState.hunger === 0) {
      this.timers.starve += delta;
      if (this.timers.starve >= 3) {
        this.timers.starve = 0;
        this.gameState.takeDamage(1, { bypassArmor: true, cause: 'starve' });
      }
    } else {
      this.timers.starve = 0;
    }
  }
}
