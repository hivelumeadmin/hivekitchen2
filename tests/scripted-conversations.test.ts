import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConfirmationTokenService } from "../src/domain/confirmation-token.js";
import { KitchenMapSchema } from "../src/schemas/kitchen-map.js";
import { MemoryKitchenMapRepository } from "../src/repositories/memory-repository.js";
import { KitchenMapTools } from "../src/tools/kitchen-map-tools.js";
import { kitchenMapContent } from "./fixtures.js";

describe("scripted onboarding regressions", () => {
  it("produces ten valid Kitchen Maps", async () => {
    for (let index = 0; index < 10; index += 1) {
      const userId = randomUUID();
      const householdId = randomUUID();
      const repository = new MemoryKitchenMapRepository();
      repository.addMembership(userId, householdId);
      const tools = new KitchenMapTools(
        repository,
        new ConfirmationTokenService("a-test-secret-that-is-longer-than-thirty-two"),
      );
      const proposed = await tools.proposeKitchenMapUpdate(
        { userId, householdId },
        {
          baseVersion: 0,
          proposedMap: kitchenMapContent({
            cookingSkill: index % 2 === 0 ? "beginner" : "intermediate",
            homemadePreference: index % 3 === 0 ? "mixed" : "mostly_homemade",
          }),
        },
      );
      expect(proposed.ok).toBe(true);
      if (!proposed.ok) continue;
      const confirmed = await tools.confirmKitchenMapUpdate(
        { userId, householdId },
        { explicitAdultConfirmation: false },
      );
      expect(confirmed.ok).toBe(true);
      if (confirmed.ok) expect(KitchenMapSchema.safeParse(confirmed.data.map).success).toBe(true);
    }
  });
});
