import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ConfirmationTokenService } from "../src/domain/confirmation-token.js";
import { MemoryKitchenMapRepository } from "../src/repositories/memory-repository.js";
import { KitchenMapTools } from "../src/tools/kitchen-map-tools.js";
import { kitchenMapContent } from "./fixtures.js";

function setup(now: () => number = () => Date.now(), ttlMs = 600_000) {
  const userId = randomUUID();
  const householdId = randomUUID();
  const repository = new MemoryKitchenMapRepository();
  repository.addMembership(userId, householdId);
  const tools = new KitchenMapTools(
    repository,
    new ConfirmationTokenService("a-test-secret-that-is-longer-than-thirty-two", ttlMs, now),
  );
  return { userId, householdId, repository, tools, context: { userId, householdId } };
}

async function propose(tools: KitchenMapTools, context: object, proposedMap = kitchenMapContent()) {
  const result = await tools.proposeKitchenMapUpdate(context, { baseVersion: 0, proposedMap });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

describe("Kitchen Map tools", () => {
  it("onboards a new household and applies repetition defaults", async () => {
    const fixture = setup();
    const proposal = await propose(fixture.tools, fixture.context);
    const result = await fixture.tools.confirmKitchenMapUpdate(fixture.context, {
      confirmationToken: proposal.token,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map.version).toBe(1);
      expect(result.data.map.lunchRepetition.maxOccurrencesPerMainItem).toBe(2);
      expect(result.data.map.lunchRepetition.targetUniqueMainItemsPerWeek).toBe(3);
    }
  });

  it("keeps dislikes separate from allergies", async () => {
    const fixture = setup();
    const map = kitchenMapContent({ dislikedIngredients: ["peanuts"] });
    const proposal = await propose(fixture.tools, fixture.context, map);
    expect(proposal.requiresAdultConfirmation).toBe(false);
    expect(map.members[0]?.allergens).toEqual([]);
  });

  it("requires explicit adult confirmation for allergy changes", async () => {
    const fixture = setup();
    const map = kitchenMapContent();
    const member = map.members[0];
    if (!member) throw new Error("fixture member missing");
    member.allergens.push({
      allergen: "peanuts",
      severity: "allergy",
      crossContactConcern: true,
      confirmedByAdult: true,
    });
    const proposal = await propose(fixture.tools, fixture.context, map);
    expect(proposal.requiresAdultConfirmation).toBe(true);
    const denied = await fixture.tools.confirmKitchenMapUpdate(fixture.context, {
      confirmationToken: proposal.token,
      explicitAdultConfirmation: false,
    });
    expect(denied).toMatchObject({ ok: false, code: "ADULT_CONFIRMATION_REQUIRED" });
    expect(await fixture.repository.get(fixture.userId, fixture.householdId)).toBeNull();
    const accepted = await fixture.tools.confirmKitchenMapUpdate(fixture.context, {
      confirmationToken: proposal.token,
      explicitAdultConfirmation: true,
    });
    expect(accepted.ok).toBe(true);
  });

  it("rejects expired confirmation tokens", async () => {
    let time = 1_000;
    const fixture = setup(() => time, 10);
    const proposal = await propose(fixture.tools, fixture.context);
    time = 1_011;
    const result = await fixture.tools.confirmKitchenMapUpdate(fixture.context, {
      confirmationToken: proposal.token,
    });
    expect(result).toMatchObject({ ok: false, code: "CONFIRMATION_EXPIRED" });
  });

  it("rejects stale profile versions", async () => {
    const fixture = setup();
    const first = await propose(fixture.tools, fixture.context);
    const second = await propose(
      fixture.tools,
      fixture.context,
      kitchenMapContent({ cookingSkill: "advanced" }),
    );
    expect(
      (
        await fixture.tools.confirmKitchenMapUpdate(fixture.context, {
          confirmationToken: first.token,
        })
      ).ok,
    ).toBe(true);
    const stale = await fixture.tools.confirmKitchenMapUpdate(fixture.context, {
      confirmationToken: second.token,
    });
    expect(stale).toMatchObject({ ok: false, code: "STALE_VERSION" });
  });

  it("binds confirmations to the exact user and household", async () => {
    const fixture = setup();
    const proposal = await propose(fixture.tools, fixture.context);
    const result = await fixture.tools.confirmKitchenMapUpdate(
      { userId: randomUUID(), householdId: fixture.householdId },
      { confirmationToken: proposal.token },
    );
    expect(result).toMatchObject({ ok: false, code: "CONFIRMATION_SCOPE_MISMATCH" });
  });

  it("preserves a separate short-break snack configuration", async () => {
    const fixture = setup();
    const proposal = await propose(fixture.tools, fixture.context);
    const result = await fixture.tools.confirmKitchenMapUpdate(fixture.context, {
      confirmationToken: proposal.token,
    });
    expect(result.ok && result.data.map.members[0]?.schoolLunch.breakSnacks).toMatchObject({
      enabled: true,
      mustBeIndividuallyPackaged: true,
      shelfStableRequired: true,
      utensilsAllowed: false,
      breaks: [{ period: "morning", durationMinutes: 8 }],
    });
  });

  it("rejects invalid arguments", async () => {
    const fixture = setup();
    const result = await fixture.tools.proposeKitchenMapUpdate(fixture.context, {
      baseVersion: "zero",
      proposedMap: {},
      unexpected: true,
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_ARGUMENTS" });
  });

  it("enforces household read isolation", async () => {
    const fixture = setup();
    const result = await fixture.tools.getKitchenMap(
      { userId: fixture.userId, householdId: randomUUID() },
      {},
    );
    expect(result).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});
