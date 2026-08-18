import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  validateRecipeForKitchenMap,
  validateSnackForKitchenMap,
} from "../src/domain/constraint-validator.js";
import { MAIN_LUNCH_RECIPES } from "../src/fixtures/recipes.js";
import { VERIFIED_SNACKS } from "../src/fixtures/snacks.js";
import { KitchenMapSchema, type KitchenMap } from "../src/schemas/kitchen-map.js";
import { RecipeSchema, type AllergenTag, type Recipe } from "../src/schemas/recipe.js";
import { VerifiedSnackSchema } from "../src/schemas/snack.js";
import { kitchenMapContent } from "./fixtures.js";

function mapFor(
  options: {
    allergen?: AllergenTag;
    crossContact?: boolean;
    mutate?: (map: KitchenMap) => void;
  } = {},
) {
  const householdId = randomUUID();
  const map = KitchenMapSchema.parse({ ...kitchenMapContent(), householdId, version: 1 });
  const member = map.members[0];
  if (!member) throw new Error("fixture member missing");
  if (options.allergen) {
    member.allergens.push({
      allergen: options.allergen,
      severity: "allergy",
      crossContactConcern: options.crossContact ?? false,
      confirmedByAdult: true,
    });
  }
  options.mutate?.(map);
  return { map, member };
}

function recipe(id: string): Recipe {
  const found = MAIN_LUNCH_RECIPES.find((item) => item.id === id);
  if (!found) throw new Error(`recipe missing: ${id}`);
  return found;
}

function snack(index: number) {
  const found = VERIFIED_SNACKS[index];
  if (!found) throw new Error(`snack fixture missing: ${index}`);
  return found;
}

function validate(
  map: KitchenMap,
  memberId: string,
  recipeId: string,
  overrides: Record<string, unknown> = {},
) {
  return validateRecipeForKitchenMap(map, recipe(recipeId), {
    memberId,
    containerType: "bento box",
    storageHours: 12,
    ...overrides,
  });
}

function codes(result: ReturnType<typeof validateRecipeForKitchenMap>) {
  return result.violations.map((item) => item.code);
}

describe("Layer 2 fixture catalogs", () => {
  it("contains twenty complete, valid main-lunch recipes", () => {
    expect(MAIN_LUNCH_RECIPES).toHaveLength(20);
    for (const item of MAIN_LUNCH_RECIPES) {
      expect(RecipeSchema.safeParse(item).success).toBe(true);
      expect(item.steps.length).toBeGreaterThan(0);
      expect(item.makeAhead.nightBeforeSteps.length).toBeGreaterThan(0);
      expect(item.makeAhead.morningSteps.length).toBeGreaterThan(0);
      expect(item.packing.steps.length).toBeGreaterThan(0);
      expect(item.packing.servingInstructions.length).toBeGreaterThan(0);
    }
  });

  it("contains only catalog-verified snack fixtures with label checks for brands", () => {
    expect(VERIFIED_SNACKS.length).toBeGreaterThanOrEqual(8);
    expect(VERIFIED_SNACKS.every((snack) => snack.catalogSource.length > 0)).toBe(true);
    expect(
      VERIFIED_SNACKS.filter((snack) => snack.brand).every(
        (snack) => snack.requiresCurrentLabelCheck,
      ),
    ).toBe(true);
  });

  it("rejects a branded snack fixture without a current-label check", () => {
    expect(() =>
      VerifiedSnackSchema.parse({ ...snack(0), requiresCurrentLabelCheck: false }),
    ).toThrow();
  });
});

describe("deterministic recipe validation", () => {
  it.each([
    ["peanut", "peanut-soba"],
    ["tree_nut", "almond-chicken"],
    ["dairy", "cheese-quesadilla"],
    ["egg", "egg-salad-wrap"],
    ["wheat", "chicken-pita"],
    ["soy", "tofu-rice-bowl"],
    ["sesame", "hummus-bento"],
    ["fish", "salmon-rice"],
    ["shellfish", "shrimp-quinoa"],
  ] as const)("rejects %s in ingredients, sauces, or toppings", (allergen, recipeId) => {
    const { map, member } = mapFor({ allergen });
    expect(codes(validate(map, member.id, recipeId))).toContain("ALLERGEN_PRESENT");
  });

  it("validates selected substitution allergens and removes the replaced ingredient", () => {
    const { map, member } = mapFor({ allergen: "soy" });
    expect(
      codes(
        validate(map, member.id, "bean-rice-bento", {
          selectedSubstitutionIds: ["bean-rice-bento-soy-substitution"],
        }),
      ),
    ).toContain("ALLERGEN_PRESENT");
    expect(
      codes(validate(map, member.id, "bean-rice-bento", { selectedSubstitutionIds: ["not-real"] })),
    ).toContain("UNKNOWN_SUBSTITUTION");
  });

  it("enforces cross-contact and nut-free school rules", () => {
    const { map, member } = mapFor({ allergen: "peanut", crossContact: true });
    expect(codes(validate(map, member.id, "sunflower-rollups"))).toContain("CROSS_CONTACT_RISK");
    expect(codes(validate(map, member.id, "peanut-soba"))).toContain("SCHOOL_RULE_CONFLICT");
  });

  it("enforces equipment, storage duration, refrigeration, and ice packs", () => {
    const { map, member } = mapFor({
      mutate: (value) => {
        value.equipment = [];
        value.batchPlanning.acceptableStorageDays = 1;
        const child = value.members[0];
        if (child) {
          child.schoolLunch.icePackAvailable = false;
          child.schoolLunch.refrigeratorAvailable = false;
        }
      },
    });
    const result = validate(map, member.id, "bean-rice-bento", { storageHours: 72 });
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "EQUIPMENT_UNAVAILABLE",
        "STORAGE_DURATION_EXCEEDED",
        "HOUSEHOLD_STORAGE_LIMIT_EXCEEDED",
        "COLD_STORAGE_UNAVAILABLE",
        "ICE_PACK_UNAVAILABLE",
      ]),
    );
  });

  it("enforces freezing duration and thawing instructions", () => {
    const { map, member } = mapFor();
    expect(
      codes(
        validate(map, member.id, "bean-rice-bento", {
          willFreeze: true,
          frozenDays: 31,
          willThaw: false,
        }),
      ),
    ).toEqual(expect.arrayContaining(["FROZEN_STORAGE_EXCEEDED", "THAWING_PLAN_REQUIRED"]));
    expect(
      codes(validate(map, member.id, "chickpea-salad", { willFreeze: true, willThaw: true })),
    ).toContain("RECIPE_NOT_FREEZABLE");
  });

  it("enforces verified refrigerated and frozen texture windows", () => {
    const { map, member } = mapFor();
    expect(codes(validate(map, member.id, "bean-rice-bento", { storageHours: 49 }))).toContain(
      "TEXTURE_QUALITY_EXCEEDED",
    );
    const altered = structuredClone(recipe("bean-rice-bento"));
    altered.makeAhead.freezingPreservesTexture = false;
    expect(
      codes(
        validateRecipeForKitchenMap(map, altered, {
          memberId: member.id,
          containerType: "bento box",
          willFreeze: true,
          willThaw: true,
        }),
      ),
    ).toContain("FREEZING_TEXTURE_UNSUITABLE");
  });

  it("enforces thermos reheating and opening constraints", () => {
    const { map, member } = mapFor();
    const result = validate(map, member.id, "lentil-soup", { containerType: "thermos" });
    expect(codes(result)).toContain("THERMOS_OPENING_UNSAFE");
    member.schoolLunch.thermosAllowed = false;
    expect(codes(validate(map, member.id, "lentil-soup", { containerType: "thermos" }))).toContain(
      "THERMOS_NOT_ALLOWED",
    );
  });

  it("enforces microwave reheating availability", () => {
    const { map, member } = mapFor();
    expect(codes(validate(map, member.id, "chicken-noodle-soup"))).toContain(
      "MICROWAVE_UNAVAILABLE",
    );
  });

  it("enforces container availability, opening, utensils, and eating time", () => {
    const { map, member } = mapFor({
      mutate: (value) => {
        const child = value.members[0];
        if (child) {
          child.schoolLunch.childCanOpenContainers = false;
          child.schoolLunch.utensilsAllowed = false;
          child.schoolLunch.maximumEatingMinutes = 5;
        }
      },
    });
    const result = validate(map, member.id, "chickpea-salad", { containerType: "unknown jar" });
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "CONTAINER_INCOMPATIBLE",
        "CONTAINER_UNAVAILABLE",
        "CONTAINER_OPENING_UNSAFE",
        "UTENSILS_NOT_ALLOWED",
        "EATING_TIME_EXCEEDED",
      ]),
    );
  });
});

describe("deterministic snack validation", () => {
  it("requires label caution for every eligible branded snack", () => {
    const { map, member } = mapFor();
    const result = validateSnackForKitchenMap(map, snack(1), {
      memberId: member.id,
      breakPeriod: "morning",
    });
    expect(result.cautions.join(" ")).toMatch(/current package label/i);
  });

  it("enforces allergens, nut-free rules, and cross-contact", () => {
    const { map, member } = mapFor({ allergen: "tree_nut", crossContact: true });
    const result = validateSnackForKitchenMap(map, snack(6), {
      memberId: member.id,
      breakPeriod: "morning",
    });
    expect(codes(result)).toEqual(
      expect.arrayContaining(["CROSS_CONTACT_RISK", "SCHOOL_RULE_CONFLICT"]),
    );
  });

  it("enforces short-break storage, utensils, eating time, and package opening", () => {
    const { map, member } = mapFor({
      mutate: (value) => {
        const child = value.members[0];
        if (child) {
          child.schoolLunch.childCanOpenContainers = false;
          child.schoolLunch.breakSnacks.breaks = [{ period: "morning", durationMinutes: 3 }];
        }
      },
    });
    const result = validateSnackForKitchenMap(map, snack(5), {
      memberId: member.id,
      breakPeriod: "morning",
    });
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "SHELF_STABLE_REQUIRED",
        "UTENSILS_NOT_ALLOWED",
        "BREAK_TIME_EXCEEDED",
        "PACKAGE_OPENING_UNSAFE",
      ]),
    );
  });
});
