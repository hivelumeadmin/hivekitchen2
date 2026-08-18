import { MAIN_LUNCH_RECIPES } from "../fixtures/recipes.js";
import { ShoppingListSchema, type WeeklyPlan } from "../schemas/weekly-plan.js";

export function aggregateShoppingList(plan: WeeklyPlan) {
  const totals = new Map<
    string,
    { name: string; unit: string; quantity: number; recipeIds: Set<string> }
  >();
  for (const day of plan.schoolDays) {
    const recipe = MAIN_LUNCH_RECIPES.find((item) => item.id === day.mainLunch.recipeId);
    if (!recipe) throw new Error(`Unknown catalog recipe: ${day.mainLunch.recipeId}`);
    for (const ingredient of recipe.ingredients) {
      const quantity = (ingredient.quantity / recipe.servings) * day.mainLunch.servings;
      const key = `${ingredient.name.toLowerCase()}|${ingredient.unit.toLowerCase()}`;
      const existing = totals.get(key) ?? {
        name: ingredient.name,
        unit: ingredient.unit,
        quantity: 0,
        recipeIds: new Set<string>(),
      };
      existing.quantity += quantity;
      existing.recipeIds.add(recipe.id);
      totals.set(key, existing);
    }
  }
  return ShoppingListSchema.parse(
    [...totals.values()]
      .map((item) => ({ ...item, recipeIds: [...item.recipeIds].sort() }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
}
