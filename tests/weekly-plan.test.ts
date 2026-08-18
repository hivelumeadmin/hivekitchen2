import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aggregateShoppingList } from "../src/domain/shopping-list.js";
import {
  createDeterministicWeeklyPlan,
  searchEligibleSnacks,
} from "../src/domain/weekly-planner.js";
import { validateWeeklyPlan } from "../src/domain/weekly-plan-validator.js";
import { MAIN_LUNCH_RECIPES } from "../src/fixtures/recipes.js";
import { KitchenMapSchema, type KitchenMap } from "../src/schemas/kitchen-map.js";
import { kitchenMapContent } from "./fixtures.js";

function planningMap(index = 0): KitchenMap {
  const content = kitchenMapContent({
    status: "confirmed",
    equipment: ["mixing bowl", "stove", "refrigerator"],
  });
  const member = content.members[0];
  if (!member) throw new Error("fixture member missing");
  member.displayName = `Student ${index}`;
  return KitchenMapSchema.parse({ ...content, householdId: randomUUID(), version: 1 });
}

describe("five-day weekly planning", () => {
  it("creates the default A-B-A-C-B pattern with separate snacks", () => {
    const map = planningMap();
    const member = map.members[0];
    if (!member) throw new Error("member missing");
    const plan = createDeterministicWeeklyPlan(map, member.id, "2026-08-17");
    const ids = plan.schoolDays.map((day) => day.mainLunch.recipeId);
    expect(plan.schoolDays).toHaveLength(5);
    expect(ids).toEqual([ids[0], ids[1], ids[0], ids[3], ids[1]]);
    expect(new Set(ids).size).toBe(3);
    expect(
      Math.max(...[...new Set(ids)].map((id) => ids.filter((item) => item === id).length)),
    ).toBe(2);
    expect(plan.schoolDays.every((day) => day.breakSnacks.length === 1)).toBe(true);
    expect(plan.schoolDays.every((day) => day.breakSnacks[0]?.productId !== undefined)).toBe(true);
    expect(validateWeeklyPlan(map, plan).valid).toBe(true);
    expect(
      plan.schoolDays.every(
        (day) =>
          day.mainLunch.preparation.ingredients.length > 0 &&
          day.mainLunch.preparation.numberedSteps.length > 0 &&
          day.mainLunch.preparation.nightBeforeSteps.length > 0 &&
          day.mainLunch.preparation.morningSteps.length > 0 &&
          day.mainLunch.preparation.packingSteps.length > 0 &&
          day.mainLunch.preparation.servingInstructions.length > 0,
      ),
    ).toBe(true);
  });

  it("includes complete repeated-main batch preparation and freshness data", () => {
    const map = planningMap();
    const member = map.members[0];
    if (!member) throw new Error("member missing");
    const plan = createDeterministicWeeklyPlan(map, member.id, "2026-08-17");
    expect(plan.batchPrepPlan).toHaveLength(2);
    for (const batch of plan.batchPrepPlan) {
      expect(batch.portionsToPrepare).toBe(2);
      expect(batch.preparationDate).toMatch(/^2026-/);
      expect(batch.refrigerationInstructions).not.toBe("");
      expect(batch.freezingInstructions).not.toBe("");
      expect(batch.thawingInstructions).not.toBe("");
      expect(batch.lastAcceptableServingDate).toMatch(/^2026-/);
      expect(batch.packFreshComponents).toBeInstanceOf(Array);
    }
    expect(plan.schoolDays.some((day) => day.mainLunch.willFreeze && day.mainLunch.willThaw)).toBe(
      true,
    );
  });

  it("respects low child repetition tolerance", () => {
    const map = planningMap();
    const member = map.members[0];
    if (!member) throw new Error("member missing");
    map.lunchRepetition.repeatToleranceByMemberId[member.id] = "low";
    const plan = createDeterministicWeeklyPlan(map, member.id, "2026-08-17");
    expect(new Set(plan.schoolDays.map((day) => day.mainLunch.recipeId)).size).toBe(5);
    expect(plan.batchPrepPlan).toHaveLength(0);
  });

  it("uses only catalog recipe and verified snack IDs", () => {
    const map = planningMap();
    const member = map.members[0];
    if (!member) throw new Error("member missing");
    const plan = createDeterministicWeeklyPlan(map, member.id, "2026-08-17");
    const catalogIds = new Set(MAIN_LUNCH_RECIPES.map((recipe) => recipe.id));
    expect(plan.schoolDays.every((day) => catalogIds.has(day.mainLunch.recipeId))).toBe(true);
    expect(
      plan.schoolDays
        .flatMap((day) => day.breakSnacks)
        .every((snack) => snack.easyToOpen && !snack.requiresUtensil),
    ).toBe(true);
  });

  it("returns zero snacks when break snacks are disabled", () => {
    const map = planningMap();
    const member = map.members[0];
    if (!member) throw new Error("member missing");
    member.schoolLunch.breakSnacks = {
      ...member.schoolLunch.breakSnacks,
      enabled: false,
      breaks: [],
    };
    const plan = createDeterministicWeeklyPlan(map, member.id, "2026-08-17");
    expect(plan.schoolDays.every((day) => day.breakSnacks.length === 0)).toBe(true);
  });

  it("aggregates shopping quantities deterministically", () => {
    const map = planningMap();
    const member = map.members[0];
    if (!member) throw new Error("member missing");
    const plan = createDeterministicWeeklyPlan(map, member.id, "2026-08-17");
    const list = aggregateShoppingList(plan);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((item) => item.quantity > 0 && item.recipeIds.length > 0)).toBe(true);
    expect(list.map((item) => item.name)).toEqual([...list.map((item) => item.name)].sort());
  });

  it("rejects unknown catalog IDs and missing batch data", () => {
    const map = planningMap();
    const member = map.members[0];
    if (!member) throw new Error("member missing");
    const plan = createDeterministicWeeklyPlan(map, member.id, "2026-08-17");
    const firstDay = plan.schoolDays[0];
    if (!firstDay) throw new Error("first day missing");
    firstDay.mainLunch.recipeId = "invented-recipe";
    plan.batchPrepPlan = [];
    const result = validateWeeklyPlan(map, plan);
    expect(result.violations.map((item) => item.code)).toEqual(
      expect.arrayContaining(["UNKNOWN_RECIPE_ID", "BATCH_PLAN_REQUIRED"]),
    );
  });

  it("rejects invented preparation details", () => {
    const map = planningMap();
    const member = map.members[0];
    if (!member) throw new Error("member missing");
    const plan = createDeterministicWeeklyPlan(map, member.id, "2026-08-17");
    const firstDay = plan.schoolDays[0];
    if (!firstDay) throw new Error("first day missing");
    firstDay.mainLunch.preparation.morningSteps = ["Add an invented ingredient."];
    expect(validateWeeklyPlan(map, plan).violations.map((item) => item.code)).toContain(
      "UNGROUNDED_RECIPE_DETAILS",
    );
  });

  it("filters snacks for fast, low-mess, easy-open, utensil-free breaks", () => {
    const map = planningMap();
    const member = map.members[0];
    if (!member) throw new Error("member missing");
    const snacks = searchEligibleSnacks(map, member.id, "morning");
    expect(snacks.length).toBeGreaterThan(0);
    expect(
      snacks.every(
        (snack) => snack.lowMess && snack.openingCapability === "easy" && !snack.requiresUtensil,
      ),
    ).toBe(true);
  });

  it("passes at least thirty household scenarios", () => {
    for (let index = 0; index < 30; index += 1) {
      const map = planningMap(index);
      const member = map.members[0];
      if (!member) throw new Error("member missing");
      map.childParticipationPreference = index % 2 === 0 ? "flexible" : "none";
      map.homemadePreference = index % 3 === 0 ? "mixed" : "mostly_homemade";
      const plan = createDeterministicWeeklyPlan(map, member.id, "2026-08-17");
      expect(validateWeeklyPlan(map, plan).valid, `scenario ${index}`).toBe(true);
    }
  });
});
