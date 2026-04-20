import { RECIPE_BOOK } from '../data/recipeBook.js';
import { CraftingSystem } from '../engine/CraftingSystem.js';

export class CraftingController {
  constructor(world, gameState) {
    this.world = world;
    this.gameState = gameState;
    this.craftingSystem = new CraftingSystem();
  }

  getMatch() {
    return this.craftingSystem.match(this.gameState.craftingGrid);
  }

  getCraftingResult() {
    return this.getMatch()?.result ?? null;
  }

  getRecipeName() {
    return this.getMatch()?.recipeName ?? 'Unknown';
  }

  executeCraft() {
    const recipe = this.getCraftingResult();
    if (!recipe) return false;

    const result = {
      id: recipe.result.id,
      count: recipe.result.count,
      kind: recipe.result.kind || 'block',
    };

    // Try to add and return if successful
    const added = this.gameState.addItemToInventory(result);
    if (!added) {
      window.dispatchEvent(new CustomEvent('action-fail'));
      return false;
    }

    // Consume ingredients
    const grid = this.gameState.craftingGrid;
    const indices = [0, 1, 3, 4];
    for (const i of indices) {
      if (grid[i]) {
        grid[i].count -= 1;
        if (grid[i].count <= 0) grid[i] = null;
      }
    }

    window.dispatchEvent(new CustomEvent('inventory-changed'));
    window.dispatchEvent(new CustomEvent('action-success'));
    return true;
  }

  init() {
    window.addEventListener('check-recipes', () => this.checkRecipeDiscovery());
  }

  checkRecipeDiscovery() {
    const discoveredBlocks = this.gameState.discoveredBlocks || new Set();
    const discoveredRecipes = this.gameState.discoveredRecipes || new Set();

    RECIPE_BOOK.forEach((recipe) => {
      if (discoveredRecipes.has(recipe.id)) return;

      // Simple check: do we know all the ingredients?
      const ingredients = recipe.ingredients || [];
      const canMake = ingredients.every((ingId) => discoveredBlocks.has(ingId));

      if (canMake && ingredients.length > 0) {
        this.gameState.discoverRecipe(recipe.id);
      }
    });
  }
}
