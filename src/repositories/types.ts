import type { KitchenMap } from "../schemas/kitchen-map.js";

export class RepositoryError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "NOT_FOUND" | "STALE_VERSION",
    message: string,
  ) {
    super(message);
  }
}

export interface KitchenMapRepository {
  authorize(userId: string, householdId: string): Promise<void>;
  get(userId: string, householdId: string): Promise<KitchenMap | null>;
  save(
    userId: string,
    householdId: string,
    expectedVersion: number,
    map: KitchenMap,
  ): Promise<KitchenMap>;
}
