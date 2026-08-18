import { MAIN_LUNCH_RECIPES } from "../fixtures/recipes.js";
import { VERIFIED_SNACKS } from "../fixtures/snacks.js";
import type { KitchenMap } from "../schemas/kitchen-map.js";
import type { ConstraintViolation, ValidationResult } from "../schemas/validation.js";
import { WeeklyPlanSchema } from "../schemas/weekly-plan.js";
import { canonicalJson } from "./json.js";
import { validateRecipeForKitchenMap, validateSnackForKitchenMap } from "./constraint-validator.js";

function issue(code: string, path: string, message: string): ConstraintViolation {
  return { code, path, message };
}

function dateDistance(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function validateWeeklyPlan(map: KitchenMap, input: unknown): ValidationResult {
  const parsed = WeeklyPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      cautions: [],
      violations: parsed.error.issues.map((item) =>
        issue("INVALID_PLAN_SCHEMA", item.path.join(".") || "plan", item.message),
      ),
    };
  }
  const plan = parsed.data;
  const violations: ConstraintViolation[] = [];
  const cautions = new Set<string>();
  if (plan.householdId !== map.householdId)
    violations.push(
      issue("HOUSEHOLD_MISMATCH", "householdId", "Plan belongs to another household"),
    );
  if (plan.kitchenMapVersion !== map.version)
    violations.push(issue("STALE_KITCHEN_MAP", "kitchenMapVersion", "Kitchen Map version changed"));
  if (new Set(plan.schoolDays.map((day) => day.date)).size !== 5)
    violations.push(issue("DUPLICATE_SCHOOL_DAY", "schoolDays", "School-day dates must be unique"));

  const counts = new Map<string, number>();
  for (const [dayIndex, day] of plan.schoolDays.entries()) {
    const recipe = MAIN_LUNCH_RECIPES.find((item) => item.id === day.mainLunch.recipeId);
    if (!recipe) {
      violations.push(
        issue(
          "UNKNOWN_RECIPE_ID",
          `schoolDays.${dayIndex}.mainLunch.recipeId`,
          "Recipe is not in the catalog",
        ),
      );
    } else {
      const authoritativePreparation = {
        ingredients: recipe.ingredients,
        equipment: recipe.equipment,
        numberedSteps: recipe.steps.map((step) => ({
          order: step.order,
          instruction: step.instruction,
        })),
        nightBeforeSteps: recipe.makeAhead.nightBeforeSteps,
        morningSteps: recipe.makeAhead.morningSteps,
        packingSteps: recipe.packing.steps,
        storageInstructions: recipe.makeAhead.storageInstructions,
        servingInstructions: recipe.packing.servingInstructions,
      };
      if (canonicalJson(day.mainLunch.preparation) !== canonicalJson(authoritativePreparation)) {
        violations.push(
          issue(
            "UNGROUNDED_RECIPE_DETAILS",
            `schoolDays.${dayIndex}.mainLunch.preparation`,
            "Preparation and packing details must exactly match the catalog recipe",
          ),
        );
      }
      counts.set(recipe.id, (counts.get(recipe.id) ?? 0) + 1);
      const result = validateRecipeForKitchenMap(map, recipe, {
        memberId: day.mainLunch.intendedMemberId,
        selectedSubstitutionIds: day.mainLunch.selectedSubstitutionIds,
        storageHours: day.mainLunch.storageHours,
        frozenDays: day.mainLunch.frozenDays,
        willFreeze: day.mainLunch.willFreeze,
        willThaw: day.mainLunch.willThaw,
        containerType: day.mainLunch.containerType,
      });
      violations.push(
        ...result.violations.map((item) => ({
          ...item,
          path: `schoolDays.${dayIndex}.mainLunch.${item.path}`,
        })),
      );
      result.cautions.forEach((item) => cautions.add(item));
    }
    for (const [snackIndex, planned] of day.breakSnacks.entries()) {
      const snack = VERIFIED_SNACKS.find((item) => item.id === planned.productId);
      if (!snack) {
        violations.push(
          issue(
            "UNKNOWN_SNACK_ID",
            `schoolDays.${dayIndex}.breakSnacks.${snackIndex}.productId`,
            "Snack is not in the verified catalog",
          ),
        );
      } else {
        const result = validateSnackForKitchenMap(map, snack, {
          memberId: plan.memberId,
          breakPeriod: planned.period,
        });
        violations.push(
          ...result.violations.map((item) => ({
            ...item,
            path: `schoolDays.${dayIndex}.breakSnacks.${snackIndex}.${item.path}`,
          })),
        );
        result.cautions.forEach((item) => cautions.add(item));
      }
    }
  }

  const configuredMax = map.lunchRepetition.maxOccurrencesPerMainItem;
  const tolerance = map.lunchRepetition.repeatToleranceByMemberId[plan.memberId];
  const effectiveMax = tolerance === "low" ? 1 : configuredMax;
  for (const [recipeId, count] of counts) {
    if (count > effectiveMax)
      violations.push(
        issue(
          "REPETITION_LIMIT_EXCEEDED",
          "schoolDays",
          `${recipeId} occurs ${count} times; maximum is ${effectiveMax}`,
        ),
      );
  }
  const minimumUnique = Math.min(
    5,
    Math.max(map.lunchRepetition.targetUniqueMainItemsPerWeek, Math.ceil(5 / effectiveMax)),
  );
  if (counts.size < minimumUnique)
    violations.push(
      issue(
        "UNIQUE_MAIN_TARGET_MISSED",
        "schoolDays",
        `At least ${minimumUnique} unique mains are required`,
      ),
    );
  if (!map.lunchRepetition.allowConsecutiveDays) {
    for (let index = 1; index < plan.schoolDays.length; index += 1) {
      if (
        plan.schoolDays[index]?.mainLunch.recipeId ===
        plan.schoolDays[index - 1]?.mainLunch.recipeId
      )
        violations.push(
          issue(
            "CONSECUTIVE_REPEAT",
            `schoolDays.${index}.mainLunch.recipeId`,
            "Consecutive repeats are disabled",
          ),
        );
    }
  }

  for (const [recipeId, count] of counts) {
    if (count < 2) continue;
    const batch = plan.batchPrepPlan.find((item) => item.recipeId === recipeId);
    if (!batch) {
      violations.push(
        issue("BATCH_PLAN_REQUIRED", "batchPrepPlan", `${recipeId} requires batch-prep details`),
      );
      continue;
    }
    if (batch.portionsToPrepare < count)
      violations.push(
        issue(
          "BATCH_PORTIONS_INSUFFICIENT",
          "batchPrepPlan.portionsToPrepare",
          `${recipeId} needs ${count} portions`,
        ),
      );
    const dates = plan.schoolDays
      .filter((day) => day.mainLunch.recipeId === recipeId)
      .map((day) => day.date)
      .sort();
    const lastDate = dates.at(-1);
    if (lastDate && batch.lastAcceptableServingDate < lastDate)
      violations.push(
        issue(
          "BATCH_FRESHNESS_EXCEEDED",
          "batchPrepPlan.lastAcceptableServingDate",
          `Batch expires before ${lastDate}`,
        ),
      );
    if (dates.some((date) => dateDistance(batch.preparationDate, date) < 0))
      violations.push(
        issue(
          "BATCH_PREP_AFTER_SERVING",
          "batchPrepPlan.preparationDate",
          "Preparation follows a serving date",
        ),
      );
  }
  return { valid: violations.length === 0, violations, cautions: [...cautions] };
}
