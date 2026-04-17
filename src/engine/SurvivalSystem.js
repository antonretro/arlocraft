const FOOD_VALUES = {
    apple: 4, tomato: 4, carrot: 3, potato: 3, corn: 3,
    blueberry: 2, strawberry: 2, melon_slice: 2, honey_bottle: 3,
    bread: 5, pumpkin_pie: 6, cookie: 2,
    mushroom_brown: 2,
    steak: 8, cooked_fish: 6,
};

export { FOOD_VALUES };

export class SurvivalSystem {
    constructor(gameState, hud) {
        this.gameState = gameState;
        this.hud = hud;
        this.timers = { hunger: 0, regen: 0, starve: 0 };
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
        if (this.gameState.mode !== 'SURVIVAL') return;

        this.timers.hunger += delta;
        if (this.timers.hunger >= 10) {
            this.timers.hunger = 0;
            this.gameState.modifyHunger(-1);
        }

        if (this.gameState.hunger >= 16 && this.gameState.hp < this.gameState.maxHp) {
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
                this.gameState.takeDamage(1);
            }
        } else {
            this.timers.starve = 0;
        }
    }
}
