import type { WeeklyPlan } from "../schemas/weekly-plan.js";
import type { KitchenMapRepository } from "./types.js";

export interface WeeklyPlanRepository {
  get(userId: string, householdId: string, planId: string): Promise<WeeklyPlan | null>;
  save(userId: string, householdId: string, plan: WeeklyPlan): Promise<WeeklyPlan>;
}

export class MemoryWeeklyPlanRepository implements WeeklyPlanRepository {
  private readonly plans = new Map<string, WeeklyPlan>();

  constructor(private readonly kitchenMaps: KitchenMapRepository) {}

  async get(userId: string, householdId: string, planId: string): Promise<WeeklyPlan | null> {
    await this.kitchenMaps.authorize(userId, householdId);
    const plan = this.plans.get(planId);
    return plan?.householdId === householdId ? structuredClone(plan) : null;
  }

  async save(userId: string, householdId: string, plan: WeeklyPlan): Promise<WeeklyPlan> {
    await this.kitchenMaps.authorize(userId, householdId);
    if (plan.householdId !== householdId) throw new Error("Plan household mismatch");
    this.plans.set(plan.id, structuredClone(plan));
    return structuredClone(plan);
  }
}
