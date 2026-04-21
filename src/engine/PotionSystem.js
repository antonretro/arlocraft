/**
 * Potion System for ArloCraft.
 * Defines status effects and manages durations/levels.
 */

export const POTION_EFFECTS = {
  speed: {
    id: 'speed',
    name: 'Speed',
    icon: '⚡',
    description: 'Increases movement speed.',
    color: '#55ffff'
  },
  haste: {
    id: 'haste',
    name: 'Haste',
    icon: '⛏️',
    description: 'Increases mining speed.',
    color: '#ffdd55'
  },
  strength: {
    id: 'strength',
    name: 'Strength',
    icon: '⚔️',
    description: 'Increases attack damage.',
    color: '#ff4444'
  },
  jump_boost: {
    id: 'jump_boost',
    name: 'Jump Boost',
    icon: '🦘',
    description: 'Increases jump height.',
    color: '#88ff88'
  },
  regeneration: {
    id: 'regeneration',
    name: 'Regeneration',
    icon: '❤️',
    description: 'Restores health over time.',
    color: '#ff88aa'
  },
  night_vision: {
    id: 'night_vision',
    name: 'Night Vision',
    icon: '👁️',
    description: 'See clearly in the dark.',
    color: '#3333ff'
  }
};

export class PotionSystem {
  constructor(gameState) {
    this.gameState = gameState;
  }

  addEffect(id, duration, level = 1) {
    const existing = this.gameState.activeEffects.find(e => e.id === id);
    if (existing) {
      existing.duration = Math.max(existing.duration, duration);
      existing.level = Math.max(existing.level, level);
    } else {
      this.gameState.activeEffects.push({ id, duration, level });
    }
    window.dispatchEvent(new CustomEvent('effects-changed'));
  }

  update(delta) {
    if (this.gameState.activeEffects.length === 0) return;

    let changed = false;
    for (let i = this.gameState.activeEffects.length - 1; i >= 0; i--) {
      const effect = this.gameState.activeEffects[i];
      effect.duration -= delta;
      
      if (effect.duration <= 0) {
        this.gameState.activeEffects.splice(i, 1);
        changed = true;
      }
      
      // Handle Tick-based effects (Regeneration)
      if (effect.id === 'regeneration' && Math.floor(effect.duration * 2) !== Math.floor((effect.duration + delta) * 2)) {
         this.gameState.heal(effect.level);
      }
    }

    if (changed) {
      window.dispatchEvent(new CustomEvent('effects-changed'));
    }
  }

  hasEffect(id) {
    return this.gameState.activeEffects.some(e => e.id === id);
  }

  getEffectLevel(id) {
    const effect = this.gameState.activeEffects.find(e => e.id === id);
    return effect ? effect.level : 0;
  }
}
