import type { KitchenMap } from "../schemas/kitchen-map.js";
import type { AllergenTag, Recipe } from "../schemas/recipe.js";
import type { VerifiedSnack } from "../schemas/snack.js";
import {
  RecipeValidationRequestSchema,
  SnackValidationRequestSchema,
  type ConstraintViolation,
  type ValidationResult,
} from "../schemas/validation.js";

const ALLERGEN_ALIASES: Record<string, AllergenTag> = {
  peanut: "peanut",
  peanuts: "peanut",
  "tree nut": "tree_nut",
  "tree nuts": "tree_nut",
  dairy: "dairy",
  milk: "dairy",
  egg: "egg",
  eggs: "egg",
  wheat: "wheat",
  gluten: "wheat",
  soy: "soy",
  sesame: "sesame",
  fish: "fish",
  shellfish: "shellfish",
};

function normalized(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "_");
}

function memberFor(map: KitchenMap, memberId: string) {
  return map.members.find((member) => member.id === memberId);
}

function allergensFor(map: KitchenMap, memberId: string): Map<AllergenTag, boolean> {
  const member = memberFor(map, memberId);
  const result = new Map<AllergenTag, boolean>();
  for (const rule of member?.allergens ?? []) {
    const tag =
      ALLERGEN_ALIASES[normalized(rule.allergen).replaceAll("_", " ")] ??
      ALLERGEN_ALIASES[normalized(rule.allergen)];
    if (tag) result.set(tag, rule.crossContactConcern);
  }
  return result;
}

function violation(code: string, path: string, message: string): ConstraintViolation {
  return { code, path, message };
}

function finish(violations: ConstraintViolation[], cautions: string[] = []): ValidationResult {
  return { valid: violations.length === 0, violations, cautions };
}

function activeRecipeAllergens(recipe: Recipe, selectedIds: readonly string[]) {
  const substitutions = recipe.substitutions.filter((item) => selectedIds.includes(item.id));
  const replaced = new Set(substitutions.map((item) => item.originalIngredientId));
  return [
    ...recipe.ingredients
      .filter((item) => !replaced.has(item.id))
      .flatMap((item) => item.allergenTags),
    ...substitutions.flatMap((item) => item.allergenTags),
  ];
}

export function validateRecipeForKitchenMap(
  map: KitchenMap,
  recipe: Recipe,
  requestInput: unknown,
): ValidationResult {
  const request = RecipeValidationRequestSchema.parse(requestInput);
  const violations: ConstraintViolation[] = [];
  const member = memberFor(map, request.memberId);
  if (!member) {
    return finish([violation("MEMBER_NOT_FOUND", "memberId", "Member is not in this household")]);
  }

  const selected = new Set(request.selectedSubstitutionIds);
  for (const id of selected) {
    if (!recipe.substitutions.some((substitution) => substitution.id === id)) {
      violations.push(
        violation("UNKNOWN_SUBSTITUTION", "selectedSubstitutionIds", `Unknown substitution: ${id}`),
      );
    }
  }

  const restrictedAllergens = allergensFor(map, member.id);
  for (const tag of new Set(activeRecipeAllergens(recipe, request.selectedSubstitutionIds))) {
    if (restrictedAllergens.has(tag)) {
      violations.push(
        violation("ALLERGEN_PRESENT", "ingredients", `Recipe contains restricted allergen: ${tag}`),
      );
    }
  }
  for (const tag of recipe.crossContactAllergenTags) {
    if (restrictedAllergens.get(tag)) {
      violations.push(
        violation(
          "CROSS_CONTACT_RISK",
          "crossContactAllergenTags",
          `Cross-contact risk for ${tag}`,
        ),
      );
    }
  }

  const requiredDiets = [...map.householdDiets, ...member.diets].map(normalized);
  const supportedDiets = new Set(recipe.supportedDiets.map(normalized));
  for (const diet of requiredDiets) {
    if (!supportedDiets.has(diet)) {
      violations.push(
        violation("DIET_NOT_SUPPORTED", "supportedDiets", `Recipe does not support diet: ${diet}`),
      );
    }
  }

  const schoolRules = new Set(member.schoolLunch.classroomOrSchoolFoodRules.map(normalized));
  if (member.schoolLunch.nutFreeFacility) schoolRules.add("nut_free_facility");
  for (const rule of recipe.prohibitedSchoolRules.map(normalized)) {
    if (schoolRules.has(rule)) {
      violations.push(
        violation(
          "SCHOOL_RULE_CONFLICT",
          "prohibitedSchoolRules",
          `Recipe conflicts with school rule: ${rule}`,
        ),
      );
    }
  }

  for (const equipment of recipe.equipment) {
    if (!map.equipment.some((available) => normalized(available) === normalized(equipment))) {
      violations.push(
        violation("EQUIPMENT_UNAVAILABLE", "equipment", `Missing equipment: ${equipment}`),
      );
    }
  }
  if (request.storageHours > recipe.makeAhead.maximumRefrigeratedHours) {
    violations.push(
      violation(
        "STORAGE_DURATION_EXCEEDED",
        "storageHours",
        "Requested refrigerated storage exceeds the recipe limit",
      ),
    );
  }
  if (request.storageHours > recipe.makeAhead.maximumQualityHours) {
    violations.push(
      violation(
        "TEXTURE_QUALITY_EXCEEDED",
        "storageHours",
        "Requested refrigerated storage exceeds the recipe's verified texture window",
      ),
    );
  }
  if (request.storageHours > map.batchPlanning.acceptableStorageDays * 24) {
    violations.push(
      violation(
        "HOUSEHOLD_STORAGE_LIMIT_EXCEEDED",
        "storageHours",
        "Requested storage exceeds household configuration",
      ),
    );
  }
  if (
    recipe.packing.refrigerationRequired &&
    !member.schoolLunch.refrigeratorAvailable &&
    !member.schoolLunch.icePackAvailable
  ) {
    violations.push(
      violation(
        "COLD_STORAGE_UNAVAILABLE",
        "packing.refrigerationRequired",
        "Neither school refrigeration nor an ice pack is available",
      ),
    );
  }
  if (recipe.packing.icePackRequired && !member.schoolLunch.icePackAvailable) {
    violations.push(
      violation("ICE_PACK_UNAVAILABLE", "packing.icePackRequired", "Recipe requires an ice pack"),
    );
  }

  if (request.willFreeze) {
    if (!map.batchPlanning.freezerAvailable)
      violations.push(
        violation("FREEZER_UNAVAILABLE", "willFreeze", "Household has no freezer configured"),
      );
    if (!recipe.makeAhead.canFreeze)
      violations.push(
        violation("RECIPE_NOT_FREEZABLE", "willFreeze", "Recipe is not approved for freezing"),
      );
    if (!recipe.makeAhead.freezingPreservesTexture)
      violations.push(
        violation(
          "FREEZING_TEXTURE_UNSUITABLE",
          "willFreeze",
          "Freezing is not approved for this recipe's texture",
        ),
      );
    if (request.frozenDays > recipe.makeAhead.maximumFrozenDays)
      violations.push(
        violation(
          "FROZEN_STORAGE_EXCEEDED",
          "frozenDays",
          "Frozen storage exceeds the recipe limit",
        ),
      );
    if (!request.willThaw)
      violations.push(
        violation(
          "THAWING_PLAN_REQUIRED",
          "willThaw",
          "A frozen lunch requires the verified thawing plan",
        ),
      );
  } else if (request.frozenDays > 0 || request.willThaw) {
    violations.push(
      violation(
        "INVALID_FREEZING_PLAN",
        "willFreeze",
        "Frozen days or thawing cannot be set without freezing",
      ),
    );
  }

  if (recipe.reheating.mode === "microwave" && !member.schoolLunch.microwaveAvailable) {
    violations.push(
      violation("MICROWAVE_UNAVAILABLE", "reheating.mode", "Recipe requires a school microwave"),
    );
  }
  if (recipe.reheating.mode === "thermos") {
    if (!member.schoolLunch.thermosAllowed)
      violations.push(
        violation("THERMOS_NOT_ALLOWED", "reheating.mode", "School does not allow a thermos"),
      );
    if (!member.schoolLunch.childCanOpenThermos)
      violations.push(
        violation(
          "THERMOS_OPENING_UNSAFE",
          "packing.minimumOpeningCapability",
          "Child cannot independently open the thermos",
        ),
      );
  }
  if (
    !recipe.packing.allowedContainerTypes.some(
      (type) => normalized(type) === normalized(request.containerType),
    )
  ) {
    violations.push(
      violation(
        "CONTAINER_INCOMPATIBLE",
        "containerType",
        "Selected container is not approved for this recipe",
      ),
    );
  }
  if (
    !member.schoolLunch.containersAvailable.some(
      (type) => normalized(type) === normalized(request.containerType),
    )
  ) {
    violations.push(
      violation("CONTAINER_UNAVAILABLE", "containerType", "Selected container is not available"),
    );
  }
  if (
    recipe.packing.minimumOpeningCapability === "standard" &&
    !member.schoolLunch.childCanOpenContainers
  ) {
    violations.push(
      violation(
        "CONTAINER_OPENING_UNSAFE",
        "packing.minimumOpeningCapability",
        "Child cannot independently open this container",
      ),
    );
  }
  if (recipe.packing.utensilsRequired && !member.schoolLunch.utensilsAllowed) {
    violations.push(
      violation(
        "UTENSILS_NOT_ALLOWED",
        "packing.utensilsRequired",
        "Recipe requires utensils that school does not allow",
      ),
    );
  }
  if (recipe.packing.assemblyAtSchool && !member.schoolLunch.childCanAssembleAtSchool) {
    violations.push(
      violation(
        "ASSEMBLY_NOT_POSSIBLE",
        "packing.assemblyAtSchool",
        "Child cannot assemble this lunch at school",
      ),
    );
  }
  if (recipe.eatingMinutes > member.schoolLunch.maximumEatingMinutes) {
    violations.push(
      violation(
        "EATING_TIME_EXCEEDED",
        "eatingMinutes",
        "Recipe takes longer to eat than the lunch period",
      ),
    );
  }

  return finish(violations, [
    "Check all packaged ingredient labels and current cross-contact warnings.",
  ]);
}

export function validateRecipeDietarySafety(
  map: KitchenMap,
  recipe: Recipe,
  memberId: string,
): ValidationResult {
  const member = memberFor(map, memberId);
  if (!member) {
    return finish([violation("MEMBER_NOT_FOUND", "memberId", "Member is not in this household")]);
  }
  const violations: ConstraintViolation[] = [];
  const restrictedAllergens = allergensFor(map, memberId);
  for (const tag of new Set(activeRecipeAllergens(recipe, []))) {
    if (restrictedAllergens.has(tag)) {
      violations.push(
        violation("ALLERGEN_PRESENT", "ingredients", `Recipe contains restricted allergen: ${tag}`),
      );
    }
  }
  for (const tag of recipe.crossContactAllergenTags) {
    if (restrictedAllergens.get(tag)) {
      violations.push(
        violation(
          "CROSS_CONTACT_RISK",
          "crossContactAllergenTags",
          `Cross-contact risk for ${tag}`,
        ),
      );
    }
  }
  const requiredDiets = [...map.householdDiets, ...member.diets].map(normalized);
  const supportedDiets = new Set(recipe.supportedDiets.map(normalized));
  for (const diet of requiredDiets) {
    if (!supportedDiets.has(diet)) {
      violations.push(
        violation("DIET_NOT_SUPPORTED", "supportedDiets", `Recipe does not support diet: ${diet}`),
      );
    }
  }
  return finish(violations, [
    "Discovery checks dietary safety only; validate equipment, packing, storage, and school logistics before planning.",
  ]);
}

export function validateSnackForKitchenMap(
  map: KitchenMap,
  snack: VerifiedSnack,
  requestInput: unknown,
): ValidationResult {
  const request = SnackValidationRequestSchema.parse(requestInput);
  const violations: ConstraintViolation[] = [];
  const member = memberFor(map, request.memberId);
  if (!member)
    return finish([violation("MEMBER_NOT_FOUND", "memberId", "Member is not in this household")]);
  const config = member.schoolLunch.breakSnacks;
  const schoolBreak = config.breaks.find((item) => item.period === request.breakPeriod);
  if (!config.enabled || !schoolBreak)
    violations.push(
      violation("BREAK_NOT_CONFIGURED", "breakPeriod", "This snack break is not configured"),
    );

  const restricted = allergensFor(map, member.id);
  for (const tag of snack.allergenTags) {
    if (restricted.has(tag))
      violations.push(
        violation("ALLERGEN_PRESENT", "allergenTags", `Snack contains restricted allergen: ${tag}`),
      );
  }
  for (const tag of snack.crossContactAllergenTags) {
    if (restricted.get(tag))
      violations.push(
        violation(
          "CROSS_CONTACT_RISK",
          "crossContactAllergenTags",
          `Snack has cross-contact risk for ${tag}`,
        ),
      );
  }
  if (
    member.schoolLunch.nutFreeFacility &&
    [...snack.allergenTags, ...snack.crossContactAllergenTags].some(
      (tag) => tag === "peanut" || tag === "tree_nut",
    )
  ) {
    violations.push(
      violation(
        "SCHOOL_RULE_CONFLICT",
        "allergenTags",
        "Nut-containing or cross-contact snack is not eligible in a nut-free facility",
      ),
    );
  }
  if (config.mustBeIndividuallyPackaged && !snack.individuallyPackaged)
    violations.push(
      violation(
        "INDIVIDUAL_PACKAGE_REQUIRED",
        "individuallyPackaged",
        "Break requires individual packaging",
      ),
    );
  if (config.shelfStableRequired && !snack.shelfStable)
    violations.push(
      violation("SHELF_STABLE_REQUIRED", "shelfStable", "Break requires a shelf-stable snack"),
    );
  if (snack.requiresUtensil && !config.utensilsAllowed)
    violations.push(
      violation(
        "UTENSILS_NOT_ALLOWED",
        "requiresUtensil",
        "Utensils are not allowed during this break",
      ),
    );
  if (snack.storage === "ice_pack" && !member.schoolLunch.icePackAvailable)
    violations.push(violation("ICE_PACK_UNAVAILABLE", "storage", "Snack requires an ice pack"));
  if (snack.storage === "refrigerated" && !member.schoolLunch.refrigeratorAvailable)
    violations.push(
      violation("REFRIGERATION_UNAVAILABLE", "storage", "Snack requires school refrigeration"),
    );
  if (schoolBreak && snack.estimatedEatingMinutes > schoolBreak.durationMinutes)
    violations.push(
      violation(
        "BREAK_TIME_EXCEEDED",
        "estimatedEatingMinutes",
        "Snack takes longer to eat than the configured break",
      ),
    );
  if (snack.openingCapability !== "easy" && !member.schoolLunch.childCanOpenContainers)
    violations.push(
      violation(
        "PACKAGE_OPENING_UNSAFE",
        "openingCapability",
        "Child cannot independently open this package",
      ),
    );
  if (snack.brand && !snack.requiresCurrentLabelCheck)
    violations.push(
      violation(
        "CURRENT_LABEL_CHECK_REQUIRED",
        "requiresCurrentLabelCheck",
        "Branded snacks require a current-label check",
      ),
    );

  return finish(
    violations,
    snack.brand
      ? ["An adult must check the current package label before packing this branded snack."]
      : [],
  );
}
