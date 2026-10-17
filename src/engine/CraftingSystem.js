import { RECIPE_BOOK, ITEM_TAGS } from '../data/recipeBook.js';

const tagSets = new Map(
  Object.entries(ITEM_TAGS).map(([tag, ids]) => [tag, new Set(ids)])
);

// A recipe ingredient is an item id or '#tag' (see ITEM_TAGS).
function ingredientMatches(required, id) {
  if (!required || !id) return false;
  if (required.startsWith('#'))
    return tagSets.get(required.slice(1))?.has(id) ?? false;
  return required === id;
}

function cloneResult(result) {
  return { ...result };
}

function gridToIds(gridItems) {
  return gridItems.map((item) => item?.id ?? null);
}

function normalizePatternGrid(patternRows) {
  const rows = patternRows.map((row) => row.split(''));
  let minRow = rows.length;
  let maxRow = -1;
  let minCol = rows[0]?.length ?? 0;
  let maxCol = -1;

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === ' ') continue;
      minRow = Math.min(minRow, r);
      maxRow = Math.max(maxRow, r);
      minCol = Math.min(minCol, c);
      maxCol = Math.max(maxCol, c);
    }
  }

  if (maxRow === -1) return [''];
  const output = [];
  for (let r = minRow; r <= maxRow; r++) {
    output.push(rows[r].slice(minCol, maxCol + 1).join(''));
  }
  return output;
}

function normalizeIdGrid(ids) {
  const rows = [ids.slice(0, 3), ids.slice(3, 6), ids.slice(6, 9)];

  let minRow = 3;
  let maxRow = -1;
  let minCol = 3;
  let maxCol = -1;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (!rows[r][c]) continue;
      minRow = Math.min(minRow, r);
      maxRow = Math.max(maxRow, r);
      minCol = Math.min(minCol, c);
      maxCol = Math.max(maxCol, c);
    }
  }
  if (maxRow === -1) return [[]];

  const output = [];
  for (let r = minRow; r <= maxRow; r++) {
    output.push(rows[r].slice(minCol, maxCol + 1));
  }
  return output;
}

function mirrorRows(rows) {
  return rows.map((row) => row.split('').reverse().join(''));
}

function countIds(ids) {
  const counts = new Map();
  for (const id of ids) {
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function mapsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, value] of a.entries()) {
    if ((b.get(key) ?? 0) !== value) return false;
  }
  return true;
}

export class CraftingSystem {
  constructor(recipeBook = RECIPE_BOOK) {
    this.recipeBook = recipeBook;
    this.compile();
  }

  compile() {
    this.recipes = this.recipeBook.map((recipe) => this.compileRecipe(recipe));
    this.compiledCount = this.recipeBook.length;
  }

  compileRecipe(recipe) {
    if (recipe.type === 'shapeless') {
      const idCounts = countIds(recipe.ingredients);
      return {
        ...recipe,
        ingredientCounts: idCounts,
        hasTags: recipe.ingredients.some((id) => id?.startsWith('#')),
      };
    }

    const normalized = normalizePatternGrid(recipe.pattern);
    return {
      ...recipe,
      normalizedPattern: normalized,
      mirroredPattern: mirrorRows(normalized),
    };
  }

  match(craftingGrid) {
    // Mods can push recipes after this system was built.
    if (this.recipeBook.length !== this.compiledCount) this.compile();
    const ids = gridToIds(craftingGrid);
    const normalizedGrid = normalizeIdGrid(ids);

    for (const recipe of this.recipes) {
      if (recipe.type === 'shapeless') {
        const matched = recipe.hasTags
          ? this.matchesShapelessTags(ids, recipe.ingredients)
          : mapsEqual(countIds(ids), recipe.ingredientCounts);
        if (!matched) continue;
        return {
          recipeId: recipe.id,
          recipeName: recipe.name,
          result: cloneResult(recipe.result),
        };
      }

      const matchedNormal = this.matchesShaped(
        normalizedGrid,
        recipe.normalizedPattern,
        recipe.key
      );
      const matchedMirror =
        !matchedNormal &&
        this.matchesShaped(normalizedGrid, recipe.mirroredPattern, recipe.key);
      if (!matchedNormal && !matchedMirror) continue;

      return {
        recipeId: recipe.id,
        recipeName: recipe.name,
        result: cloneResult(recipe.result),
      };
    }

    return null;
  }

  matchesShaped(normalizedGrid, patternRows, keyMap) {
    if (normalizedGrid.length !== patternRows.length) return false;
    if ((normalizedGrid[0]?.length ?? 0) !== (patternRows[0]?.length ?? 0))
      return false;

    for (let r = 0; r < patternRows.length; r++) {
      for (let c = 0; c < patternRows[r].length; c++) {
        const symbol = patternRows[r][c];
        const gridId = normalizedGrid[r][c] ?? null;
        if (symbol === ' ') {
          if (gridId !== null) return false;
          continue;
        }
        const requiredId = keyMap[symbol] ?? null;
        if (!ingredientMatches(requiredId, gridId)) return false;
      }
    }
    return true;
  }

  matchesShapelessTags(ids, ingredients) {
    const remaining = ids.filter(Boolean);
    if (remaining.length !== ingredients.length) return false;
    // Exact ids first so tags do not steal items a later exact id needs.
    const ordered = [...ingredients].sort(
      (a, b) => Number(a.startsWith('#')) - Number(b.startsWith('#'))
    );
    for (const required of ordered) {
      const idx = remaining.findIndex((id) => ingredientMatches(required, id));
      if (idx === -1) return false;
      remaining.splice(idx, 1);
    }
    return true;
  }
}
