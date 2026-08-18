import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryKitchenMapRepository } from "../src/repositories/memory-repository.js";
import { MemoryWeeklyPlanRepository } from "../src/repositories/plan-repository.js";
import { KitchenMapSchema, type KitchenMap } from "../src/schemas/kitchen-map.js";
import { PlanningTools, dispatchPlanningTool } from "../src/tools/planning-tools.js";
import { kitchenMapContent } from "./fixtures.js";

describe("Layer 3 planning tools", () => {
  let userId: string;
  let householdId: string;
  let map: KitchenMap;
  let repository: MemoryKitchenMapRepository;
  let tools: PlanningTools;
  let context: { userId: string; householdId: string };

  function member() {
    const found = map.members[0];
    if (!found) throw new Error("fixture member missing");
    return found;
  }

  function dayAt(plan: { schoolDays: Array<{ date: string }> }, index: number) {
    const found = plan.schoolDays[index];
    if (!found) throw new Error(`plan day missing: ${index}`);
    return found;
  }

  beforeEach(async () => {
    userId = randomUUID();
    householdId = randomUUID();
    repository = new MemoryKitchenMapRepository();
    repository.addMembership(userId, householdId);
    const content = kitchenMapContent({
      status: "confirmed",
      equipment: ["mixing bowl", "stove", "refrigerator"],
    });
    map = KitchenMapSchema.parse({ ...content, householdId, version: 1 });
    await repository.save(userId, householdId, 0, map);
    tools = new PlanningTools(repository, new MemoryWeeklyPlanRepository(repository));
    context = { userId, householdId };
  });

  it("searches recipes and verified snacks", async () => {
    const child = member();
    const recipes = await tools.searchRecipes(context, { memberId: child.id });
    const snacks = await tools.searchVerifiedSnacks(context, {
      memberId: child.id,
      period: "morning",
    });
    expect(recipes.data.length).toBeGreaterThan(3);
    expect(snacks.data.every((snack) => snack.requiresCurrentLabelCheck)).toBe(true);
  });

  it("does not use equipment, containers, or ice packs to narrow recipe discovery", async () => {
    const child = member();
    child.schoolLunch.containersAvailable = [];
    child.schoolLunch.icePackAvailable = false;
    map.equipment = [];
    await repository.save(userId, householdId, 1, { ...map, version: 2 });
    const recipes = await tools.searchRecipes(context, { memberId: child.id });
    expect(recipes.data.length).toBeGreaterThan(10);
  });

  it("creates, validates, replaces, and aggregates a saved plan", async () => {
    const child = member();
    const created = await tools.createWeeklyPlan(context, {
      memberId: child.id,
      weekOf: "2026-08-17",
    });
    expect(created.data.validation.valid).toBe(true);
    const plan = created.data.plan;
    const validation = await tools.validateWeeklyPlan(context, { planId: plan.id });
    expect(validation.data.valid).toBe(true);
    const replacementId = (await tools.searchRecipes(context, { memberId: child.id })).data.find(
      (recipe) => !plan.schoolDays.some((day) => day.mainLunch.recipeId === recipe.id),
    )?.id;
    expect(replacementId).toBeDefined();
    const replaced = await tools.replaceMeal(context, {
      planId: plan.id,
      date: dayAt(plan, 3).date,
      recipeId: replacementId,
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) throw new Error(replaced.message);
    expect(replaced.data.validation.valid).toBe(true);
    expect(replaced.data.plan.repairAttempts).toBeLessThanOrEqual(2);
    const shopping = await tools.getShoppingList(context, { planId: plan.id });
    expect(shopping.data.length).toBeGreaterThan(0);
  });

  it("returns structured invalid-argument errors at the dispatcher boundary", async () => {
    const result = await dispatchPlanningTool({
      tools,
      context,
      name: "create_weekly_plan",
      argumentsJson: JSON.stringify({ memberId: "not-a-uuid", weekOf: "bad-date" }),
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
  });

  it("caps failed replacement repair at two automatic attempts", async () => {
    const child = member();
    const created = await tools.createWeeklyPlan(context, {
      memberId: child.id,
      weekOf: "2026-08-17",
    });
    map.lunchRepetition.maxOccurrencesPerMainItem = 1;
    map.lunchRepetition.targetUniqueMainItemsPerWeek = 5;
    await repository.save(userId, householdId, 1, { ...map, version: 2 });
    const result = await tools.replaceMeal(context, {
      planId: created.data.plan.id,
      date: dayAt(created.data.plan, 0).date,
      recipeId: "not-in-catalog",
    });
    expect(result).toMatchObject({ ok: false, code: "REPAIR_LIMIT_EXCEEDED" });
  });
});
