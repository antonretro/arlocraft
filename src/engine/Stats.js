export class Stats {
    constructor() {
        this.level = 1;
        this.xp = 0;
        this.xpToNextLevel = 100;
        
        this.attributes = {
            strength: 1, // Damage / Mining Speed
            agility: 1,  // Speed / Jump
            spirit: 1    // Mana / Action Command Window
        };
    }

    addXP(amount) {
        this.xp += Math.max(0, amount);
        while (this.xp >= this.xpToNextLevel) {
            this.levelUp();
        }
        window.dispatchEvent(new CustomEvent('xp-changed', { detail: { xp: this.xp, max: this.xpToNextLevel } }));
        return this.xp;
    }

    levelUp() {
        this.level++;
        this.xp -= this.xpToNextLevel;
        this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5);
        
        // Auto-allocate or wait for user? (User said automatic)
        this.attributes.strength += 1;
        this.attributes.agility += 1;
        this.attributes.spirit += 1;
        
        // Emit event for UI
        window.dispatchEvent(new CustomEvent('level-up', { detail: { level: this.level } }));
    }

    getMiningSpeedMultiplier() {
        return 1 + (this.attributes.strength * 0.1);
    }

    getDamageMultiplier() {
        return 1 + (this.attributes.strength * 0.2);
    }
}
