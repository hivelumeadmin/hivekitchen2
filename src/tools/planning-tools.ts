import { z } from "zod";
import { aggregateShoppingList } from "../domain/shopping-list.js";
import {
  createDeterministicWeeklyPlan,
  replacePlannedMain,
  searchEligibleRecipes,
  searchEligibleSnacks,
  searchRecipeCandidates,
} from "../domain/weekly-planner.js";
import { validateWeeklyPlan } from "../domain/weekly-plan-validator.js";
import { MAIN_LUNCH_RECIPES } from "../fixtures/recipes.js";
import type { KitchenMapRepository } from "../repositories/types.js";
import type { WeeklyPlanRepository } from "../repositories/plan-repository.js";
import { ToolContextSchema } from "../schemas/tools.js";

export const SearchRecipesArgumentsSchema = z.object({ memberId: z.uuid() }).strict();
export const SearchVerifiedSnacksArgumentsSchema = z
  .object({ memberId: z.uuid(), period: z.enum(["morning", "afternoon"]) })
  .strict();
export const CreateWeeklyPlanArgumentsSchema = z
  .object({ memberId: z.uuid(), weekOf: z.iso.date() })
  .strict();
export const ValidateWeeklyPlanArgumentsSchema = z.object({ planId: z.uuid() }).strict();
export const ReplaceMealArgumentsSchema = z
  .object({ planId: z.uuid(), date: z.iso.date(), recipeId: z.string().min(1) })
  .strict();
export const ShoppingListArgumentsSchema = z.object({ planId: z.uuid() }).strict();

export class PlanningTools {
  constructor(
    private readonly kitchenMaps: KitchenMapRepository,
    private readonly plans: WeeklyPlanRepository,
  ) {}

  private async map(contextInput: unknown) {
    const context = ToolContextSchema.parse(contextInput);
    const map = await this.kitchenMaps.get(context.userId, context.householdId);
    if (!map || map.status !== "confirmed") throw new Error("A confirmed Kitchen Map is required");
    return { context, map };
  }

  async searchRecipes(contextInput: unknown, argsInput: unknown) {
    const { map } = await this.map(contextInput);
    const args = SearchRecipesArgumentsSchema.parse(argsInput);
    return { ok: true as const, data: searchRecipeCandidates(map, args.memberId) };
  }

  async searchVerifiedSnacks(contextInput: unknown, argsInput: unknown) {
    const { map } = await this.map(contextInput);
    const args = SearchVerifiedSnacksArgumentsSchema.parse(argsInput);
    return { ok: true as const, data: searchEligibleSnacks(map, args.memberId, args.period) };
  }

  async createWeeklyPlan(contextInput: unknown, argsInput: unknown) {
    const { context, map } = await this.map(contextInput);
    const args = CreateWeeklyPlanArgumentsSchema.parse(argsInput);
    const plan = createDeterministicWeeklyPlan(map, args.memberId, args.weekOf);
    await this.plans.save(context.userId, context.householdId, plan);
    return { ok: true as const, data: { plan, validation: validateWeeklyPlan(map, plan) } };
  }

  async validateWeeklyPlan(contextInput: unknown, argsInput: unknown) {
    const { context, map } = await this.map(contextInput);
    const args = ValidateWeeklyPlanArgumentsSchema.parse(argsInput);
    const plan = await this.plans.get(context.userId, context.householdId, args.planId);
    if (!plan) throw new Error("Plan not found");
    return { ok: true as const, data: validateWeeklyPlan(map, plan) };
  }

  async replaceMeal(contextInput: unknown, argsInput: unknown) {
    const { context, map } = await this.map(contextInput);
    const args = ReplaceMealArgumentsSchema.parse(argsInput);
    const original = await this.plans.get(context.userId, context.householdId, args.planId);
    if (!original) throw new Error("Plan not found");
    const alternatives = searchEligibleRecipes(map, original.memberId)
      .map((item) => item.id)
      .filter(
        (id) =>
          id !== args.recipeId &&
          id !== original.schoolDays.find((day) => day.date === args.date)?.mainLunch.recipeId,
      );
    const attempts = [args.recipeId, ...alternatives.slice(0, 2)];
    let lastValidation = validateWeeklyPlan(map, original);
    for (const [index, recipeId] of attempts.entries()) {
      let candidate;
      try {
        candidate = replacePlannedMain(map, original, args.date, recipeId, index);
      } catch {
        continue;
      }
      lastValidation = validateWeeklyPlan(map, candidate);
      if (lastValidation.valid) {
        await this.plans.save(context.userId, context.householdId, candidate);
        return { ok: true as const, data: { plan: candidate, validation: lastValidation } };
      }
    }
    return {
      ok: false as const,
      code: "REPAIR_LIMIT_EXCEEDED",
      message: `Replacement remained invalid after two automatic repair attempts: ${lastValidation.violations.map((item) => item.code).join(", ")}`,
      retryable: false,
    };
  }

  async getShoppingList(contextInput: unknown, argsInput: unknown) {
    const { context } = await this.map(contextInput);
    const args = ShoppingListArgumentsSchema.parse(argsInput);
    const plan = await this.plans.get(context.userId, context.householdId, args.planId);
    if (!plan) throw new Error("Plan not found");
    return { ok: true as const, data: aggregateShoppingList(plan) };
  }
}

export const CATALOG_RECIPE_IDS = Object.freeze(MAIN_LUNCH_RECIPES.map((item) => item.id));

export async function dispatchPlanningTool(input: {
  tools: PlanningTools;
  context: unknown;
  name: string;
  argumentsJson: string;
}) {
  try {
    const args: unknown = JSON.parse(input.argumentsJson);
    switch (input.name) {
      case "search_recipes":
        return await input.tools.searchRecipes(input.context, args);
      case "search_verified_snacks":
        return await input.tools.searchVerifiedSnacks(input.context, args);
      case "create_weekly_plan":
        return await input.tools.createWeeklyPlan(input.context, args);
      case "validate_weekly_plan":
        return await input.tools.validateWeeklyPlan(input.context, args);
      case "replace_meal":
        return await input.tools.replaceMeal(input.context, args);
      case "get_shopping_list":
        return await input.tools.getShoppingList(input.context, args);
      default:
        return {
          ok: false as const,
          code: "UNKNOWN_TOOL",
          message: "Unknown planning tool",
          retryable: false,
        };
    }
  } catch (error) {
    return {
      ok: false as const,
      code: error instanceof z.ZodError ? "INVALID_ARGUMENTS" : "PLANNING_ERROR",
      message: error instanceof Error ? error.message : "Unexpected planning failure",
      retryable: false,
    };
  }
}
