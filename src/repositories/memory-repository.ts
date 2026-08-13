import { KitchenMapSchema, type KitchenMap } from "../schemas/kitchen-map.js";
import { RepositoryError, type KitchenMapRepository } from "./types.js";

export class MemoryKitchenMapRepository implements KitchenMapRepository {
  private readonly memberships = new Map<string, Set<string>>();
  private readonly current = new Map<string, KitchenMap>();
  private readonly history = new Map<string, KitchenMap[]>();

  addMembership(userId: string, householdId: string): void {
    const households = this.memberships.get(userId) ?? new Set<string>();
    households.add(householdId);
    this.memberships.set(userId, households);
  }

  async authorize(userId: string, householdId: string): Promise<void> {
    if (!this.memberships.get(userId)?.has(householdId)) {
      throw new RepositoryError("FORBIDDEN", "User is not a member of this household");
    }
  }

  async get(userId: string, householdId: string): Promise<KitchenMap | null> {
    await this.authorize(userId, householdId);
    const map = this.current.get(householdId);
    return map ? structuredClone(map) : null;
  }

  async save(
    userId: string,
    householdId: string,
    expectedVersion: number,
    map: KitchenMap,
  ): Promise<KitchenMap> {
    await this.authorize(userId, householdId);
    const current = this.current.get(householdId);
    const actualVersion = current?.version ?? 0;
    if (actualVersion !== expectedVersion) {
      throw new RepositoryError(
        "STALE_VERSION",
        `Expected Kitchen Map version ${expectedVersion}, found ${actualVersion}`,
      );
    }
    if (map.householdId !== householdId || map.version !== expectedVersion + 1) {
      throw new RepositoryError("FORBIDDEN", "Kitchen Map identity or next version is invalid");
    }
    const validated = KitchenMapSchema.parse(map);
    this.current.set(householdId, structuredClone(validated));
    const versions = this.history.get(householdId) ?? [];
    versions.push(structuredClone(validated));
    this.history.set(householdId, versions);
    return structuredClone(validated);
  }

  getHistoryForTest(householdId: string): KitchenMap[] {
    return structuredClone(this.history.get(householdId) ?? []);
  }
}
