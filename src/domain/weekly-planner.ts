import { randomUUID } from "node:crypto";
import { MAIN_LUNCH_RECIPES } from "../fixtures/recipes.js";
import { VERIFIED_SNACKS } from "../fixtures/snacks.js";
import type { KitchenMap } from "../schemas/kitchen-map.js";
import type { Recipe } from "../schemas/recipe.js";
import type { VerifiedSnack } from "../schemas/snack.js";
import {
  WeeklyPlanSchema,
  type PlannedBreakSnack,
  type WeeklyPlan,
} from "../schemas/weekly-plan.js";
import {
  validateRecipeDietarySafety,
  validateRecipeForKitchenMap,
  validateSnackForKitchenMap,
} from "./constraint-validator.js";
import { validateWeeklyPlan } from "./weekly-plan-validator.js";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, count: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return isoDate(date);
}

function dayDistance(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function schoolDates(weekOf: string, configured: readonly string[]): string[] {
  const allowed = new Set(configured);
  const result: string[] = [];
  for (let offset = 0; result.length < 5 && offset < 14; offset += 1) {
    const candidate = addDays(weekOf, offset);
    const weekday = WEEKDAYS[new Date(`${candidate}T00:00:00Z`).getUTCDay()];
    if (weekday && allowed.has(weekday)) result.push(candidate);
  }
  if (result.length !== 5)
    throw new Error("The member schedule cannot produce five school days within two weeks");
  return result;
}

function containerFor(recipe: Recipe, available: readonly string[]): string | undefined {
  return recipe.packing.allowedContainerTypes.find((type) =>
    available.some((candidate) => candidate.toLowerCase() === type.toLowerCase()),
  );
}

export function searchEligibleRecipes(map: KitchenMap, memberId: string): Recipe[] {
  const member = map.members.find((item) => item.id === memberId);
  if (!member) return [];
  return MAIN_LUNCH_RECIPES.filter((recipe) => {
    const containerType = containerFor(recipe, member.schoolLunch.containersAvailable);
    if (!containerType) return false;
    return validateRecipeForKitchenMap(map, recipe, {
      memberId,
      containerType,
      storageHours: 0,
    }).valid;
  }).sort((left, right) => {
    const leftLiked = left.ingredients.some((ingredient) =>
      member.likedIngredients.includes(ingredient.name),
    );
    const rightLiked = right.ingredients.some((ingredient) =>
      member.likedIngredients.includes(ingredient.name),
    );
    return Number(rightLiked) - Number(leftLiked) || left.prepMinutes - right.prepMinutes;
  });
}

export function searchRecipeCandidates(map: KitchenMap, memberId: string): Recipe[] {
  const member = map.members.find((item) => item.id === memberId);
  if (!member) return [];
  return MAIN_LUNCH_RECIPES.filter(
    (recipe) => validateRecipeDietarySafety(map, recipe, memberId).valid,
  ).sort((left, right) => {
    const leftLiked = left.ingredients.some((ingredient) =>
      member.likedIngredients.includes(ingredient.name),
    );
    const rightLiked = right.ingredients.some((ingredient) =>
      member.likedIngredients.includes(ingredient.name),
    );
    return Number(rightLiked) - Number(leftLiked) || left.prepMinutes - right.prepMinutes;
  });
}

export function searchEligibleSnacks(
  map: KitchenMap,
  memberId: string,
  period: "morning" | "afternoon",
): VerifiedSnack[] {
  return VERIFIED_SNACKS.filter(
    (snack) =>
      snack.packaged &&
      snack.lowMess &&
      snack.openingCapability === "easy" &&
      !snack.requiresUtensil &&
      validateSnackForKitchenMap(map, snack, { memberId, breakPeriod: period }).valid,
  );
}

function effectivePattern(map: KitchenMap, memberId: string): number[] {
  const tolerance = map.lunchRepetition.repeatToleranceByMemberId[memberId];
  const max = tolerance === "low" ? 1 : map.lunchRepetition.maxOccurrencesPerMainItem;
  const unique = Math.min(
    5,
    Math.max(map.lunchRepetition.targetUniqueMainItemsPerWeek, Math.ceil(5 / max)),
  );
  if (unique === 3 && max === 2 && !map.lunchRepetition.allowConsecutiveDays)
    return [0, 1, 0, 2, 1];
  const pattern: number[] = [];
  const counts = Array.from({ length: unique }, () => 0);
  for (let day = 0; day < 5; day += 1) {
    const choice = counts.findIndex(
      (count, index) =>
        count < max && (map.lunchRepetition.allowConsecutiveDays || pattern.at(-1) !== index),
    );
    if (choice < 0)
      throw new Error("Repetition settings cannot produce five nonconsecutive school lunches");
    pattern.push(choice);
    counts[choice] = (counts[choice] ?? 0) + 1;
  }
  return pattern;
}

function chooseRecipes(candidates: Recipe[], pattern: number[], dates: string[]): Recipe[] {
  const uniqueCount = Math.max(...pattern) + 1;
  const selected: Recipe[] = [];
  for (let index = 0; index < uniqueCount; index += 1) {
    const positions = pattern.flatMap((value, position) => (value === index ? [position] : []));
    const firstPlanDate = dates[0];
    if (!firstPlanDate) throw new Error("Five school dates are required");
    const gap =
      positions.length > 1
        ? dayDistance(
            dates[positions[0] ?? 0] ?? firstPlanDate,
            dates[positions.at(-1) ?? 0] ?? firstPlanDate,
          )
        : 0;
    const candidate = candidates.find(
      (item) =>
        !selected.includes(item) &&
        (gap * 24 <=
          Math.min(item.makeAhead.maximumRefrigeratedHours, item.makeAhead.maximumQualityHours) ||
          (item.makeAhead.canFreeze && item.makeAhead.freezingPreservesTexture)),
    );
    if (!candidate)
      throw new Error(`No eligible recipe satisfies freshness for preparation ${index + 1}`);
    selected.push(candidate);
  }
  return selected;
}

function plannedSnack(snack: VerifiedSnack, period: "morning" | "afternoon"): PlannedBreakSnack {
  return {
    period,
    productId: snack.id,
    genericDescription: snack.genericName,
    quantity: 1,
    packaged: snack.packaged,
    requiresCurrentLabelCheck: true,
    easyToOpen: snack.openingCapability === "easy",
    requiresUtensil: snack.requiresUtensil,
    lowMess: true,
    storage: snack.storage,
  };
}

function preparationFor(recipe: Recipe) {
  return {
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
}

export function createDeterministicWeeklyPlan(
  map: KitchenMap,
  memberId: string,
  weekOf: string,
): WeeklyPlan {
  const member = map.members.find((item) => item.id === memberId);
  if (!member) throw new Error("Member is not in the Kitchen Map");
  const dates = schoolDates(weekOf, member.schoolLunch.schoolDays);
  const pattern = effectivePattern(map, memberId);
  const candidates = searchEligibleRecipes(map, memberId);
  const selected = chooseRecipes(candidates, pattern, dates);
  const firstDate = new Map<string, string>();
  const lastDate = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const [index, slot] of pattern.entries()) {
    const recipe = selected[slot];
    const date = dates[index];
    if (!recipe || !date) throw new Error("Unable to assign catalog recipe to school day");
    firstDate.set(recipe.id, firstDate.get(recipe.id) ?? date);
    lastDate.set(recipe.id, date);
    counts.set(recipe.id, (counts.get(recipe.id) ?? 0) + 1);
  }

  const plan = WeeklyPlanSchema.parse({
    id: randomUUID(),
    householdId: map.householdId,
    kitchenMapVersion: map.version,
    weekOf,
    memberId,
    schoolDays: dates.map((date, index) => {
      const recipe = selected[pattern[index] ?? 0];
      if (!recipe) throw new Error("Recipe assignment failed");
      const prepared = firstDate.get(recipe.id) ?? date;
      const elapsedDays = dayDistance(prepared, date);
      const mustFreeze =
        elapsedDays * 24 >
        Math.min(recipe.makeAhead.maximumRefrigeratedHours, recipe.makeAhead.maximumQualityHours);
      const snacks = member.schoolLunch.breakSnacks.enabled
        ? member.schoolLunch.breakSnacks.breaks.flatMap((schoolBreak) => {
            const eligible = searchEligibleSnacks(map, memberId, schoolBreak.period);
            return eligible[0] ? [plannedSnack(eligible[0], schoolBreak.period)] : [];
          })
        : [];
      return {
        date,
        mainLunch: {
          date,
          recipeId: recipe.id,
          servings: 1,
          intendedMemberId: memberId,
          whyRecommended:
            "Eligible under the confirmed Kitchen Map and selected for practical variety.",
          homemadeComponents: recipe.ingredients
            .filter((item) => item.role === "main")
            .map((item) => item.name),
          convenienceComponents: recipe.ingredients
            .filter((item) => item.role !== "main")
            .map((item) => item.name),
          estimatedMorningMinutes: Math.min(
            recipe.prepMinutes,
            member.schoolLunch.morningPrepLimitMinutes,
          ),
          selectedSubstitutionIds: [],
          containerType: containerFor(recipe, member.schoolLunch.containersAvailable),
          storageHours: mustFreeze ? 0 : elapsedDays * 24,
          frozenDays: mustFreeze ? elapsedDays : 0,
          willFreeze: mustFreeze,
          willThaw: mustFreeze,
          childParticipation:
            map.childParticipationPreference === "none"
              ? undefined
              : {
                  optional: true,
                  task: "Choose a fresh component or add a note.",
                  estimatedMinutes: 2,
                  adultSupervisionRequired: false,
                },
          preparation: preparationFor(recipe),
        },
        breakSnacks: snacks,
      };
    }),
    batchPrepPlan: selected.flatMap((recipe) => {
      const count = counts.get(recipe.id) ?? 0;
      if (count < 2) return [];
      return [
        {
          recipeId: recipe.id,
          preparationDate: firstDate.get(recipe.id),
          portionsToPrepare: count,
          refrigerationInstructions: recipe.makeAhead.storageInstructions,
          freezingInstructions: recipe.makeAhead.canFreeze
            ? recipe.makeAhead.freezingInstructions
            : "Freezing is not needed within the verified refrigerated storage window.",
          thawingInstructions: recipe.makeAhead.canFreeze
            ? recipe.makeAhead.thawingInstructions
            : "Keep refrigerated; no thawing is needed.",
          lastAcceptableServingDate: lastDate.get(recipe.id),
          packFreshComponents: recipe.ingredients
            .filter(
              (item) => item.role === "topping" || item.role === "garnish" || item.role === "sauce",
            )
            .map((item) => item.name),
        },
      ];
    }),
    warnings: member.schoolLunch.breakSnacks.enabled
      ? ["Check the current package label for every branded snack before packing."]
      : [],
    repairAttempts: 0,
  });
  const validation = validateWeeklyPlan(map, plan);
  if (!validation.valid)
    throw new Error(
      `Generated plan failed deterministic validation: ${validation.violations.map((item) => item.code).join(", ")}`,
    );
  return plan;
}

export function replacePlannedMain(
  map: KitchenMap,
  original: WeeklyPlan,
  date: string,
  recipeId: string,
  repairAttempts: number,
): WeeklyPlan {
  const member = map.members.find((item) => item.id === original.memberId);
  const recipe = MAIN_LUNCH_RECIPES.find((item) => item.id === recipeId);
  if (!member || !recipe) throw new Error("Unknown member or catalog recipe");
  const containerType = containerFor(recipe, member.schoolLunch.containersAvailable);
  if (!containerType) throw new Error("No compatible available container");
  const plan = structuredClone(original);
  const target = plan.schoolDays.find((day) => day.date === date);
  if (!target) throw new Error("Replacement date is not in the plan");
  target.mainLunch = {
    date,
    recipeId,
    servings: 1,
    intendedMemberId: member.id,
    whyRecommended: "Replacement is eligible under the confirmed Kitchen Map.",
    homemadeComponents: recipe.ingredients
      .filter((item) => item.role === "main")
      .map((item) => item.name),
    convenienceComponents: recipe.ingredients
      .filter((item) => item.role !== "main")
      .map((item) => item.name),
    estimatedMorningMinutes: Math.min(
      recipe.prepMinutes,
      member.schoolLunch.morningPrepLimitMinutes,
    ),
    selectedSubstitutionIds: [],
    containerType,
    storageHours: 0,
    frozenDays: 0,
    willFreeze: false,
    willThaw: false,
    ...(map.childParticipationPreference === "none"
      ? {}
      : {
          childParticipation: {
            optional: true as const,
            task: "Choose a fresh component or add a note.",
            estimatedMinutes: 2,
            adultSupervisionRequired: false,
          },
        }),
    preparation: preparationFor(recipe),
  };

  const groups = new Map<string, typeof plan.schoolDays>();
  for (const day of plan.schoolDays) {
    const group = groups.get(day.mainLunch.recipeId) ?? [];
    group.push(day);
    groups.set(day.mainLunch.recipeId, group);
  }
  plan.batchPrepPlan = [];
  for (const [id, days] of groups) {
    const catalogRecipe = MAIN_LUNCH_RECIPES.find((item) => item.id === id);
    if (!catalogRecipe) throw new Error(`Unknown recipe: ${id}`);
    days.sort((left, right) => left.date.localeCompare(right.date));
    const preparationDate = days[0]?.date;
    const lastServingDate = days.at(-1)?.date;
    if (!preparationDate || !lastServingDate) continue;
    for (const day of days) {
      const elapsed = dayDistance(preparationDate, day.date);
      const freeze =
        elapsed * 24 >
        Math.min(
          catalogRecipe.makeAhead.maximumRefrigeratedHours,
          catalogRecipe.makeAhead.maximumQualityHours,
        );
      day.mainLunch.storageHours = freeze ? 0 : elapsed * 24;
      day.mainLunch.frozenDays = freeze ? elapsed : 0;
      day.mainLunch.willFreeze = freeze;
      day.mainLunch.willThaw = freeze;
    }
    if (days.length > 1) {
      plan.batchPrepPlan.push({
        recipeId: id,
        preparationDate,
        portionsToPrepare: days.length,
        refrigerationInstructions: catalogRecipe.makeAhead.storageInstructions,
        freezingInstructions: catalogRecipe.makeAhead.canFreeze
          ? (catalogRecipe.makeAhead.freezingInstructions ??
            "Follow verified freezing instructions.")
          : "Freezing is not needed within the verified refrigerated storage window.",
        thawingInstructions: catalogRecipe.makeAhead.canFreeze
          ? (catalogRecipe.makeAhead.thawingInstructions ?? "Thaw safely in the refrigerator.")
          : "Keep refrigerated; no thawing is needed.",
        lastAcceptableServingDate: lastServingDate,
        packFreshComponents: catalogRecipe.ingredients
          .filter((item) => ["topping", "garnish", "sauce"].includes(item.role))
          .map((item) => item.name),
      });
    }
  }
  plan.repairAttempts = repairAttempts;
  return WeeklyPlanSchema.parse(plan);
}
