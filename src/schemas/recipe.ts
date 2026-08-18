import { z } from "zod";

const text = z.string().trim().min(1);
export const AllergenTagSchema = z.enum([
  "peanut",
  "tree_nut",
  "dairy",
  "egg",
  "wheat",
  "soy",
  "sesame",
  "fish",
  "shellfish",
]);

export const IngredientSchema = z
  .object({
    id: text,
    name: text,
    quantity: z.number().positive(),
    unit: text,
    preparationNote: text.optional(),
    optional: z.boolean(),
    role: z.enum(["main", "sauce", "topping", "garnish", "packing_component"]),
    allergenTags: z.array(AllergenTagSchema),
  })
  .strict();

export const SubstitutionSchema = z
  .object({
    id: text,
    originalIngredientId: text,
    replacement: text,
    reason: text,
    allergenTags: z.array(AllergenTagSchema),
  })
  .strict();

export const RecipeSchema = z
  .object({
    id: text,
    title: text,
    servings: z.number().int().positive(),
    ingredients: z.array(IngredientSchema).min(1),
    equipment: z.array(text),
    prepMinutes: z.number().int().nonnegative(),
    cookMinutes: z.number().int().nonnegative(),
    eatingMinutes: z.number().int().positive(),
    supportedDiets: z.array(text),
    steps: z
      .array(
        z
          .object({
            order: z.number().int().positive(),
            instruction: text,
            durationMinutes: z.number().nonnegative().optional(),
            adultRequired: z.boolean(),
            foodSafetyNote: text.optional(),
          })
          .strict(),
      )
      .min(1),
    makeAhead: z
      .object({
        canPrepareNightBefore: z.boolean(),
        nightBeforeSteps: z.array(text).min(1),
        morningSteps: z.array(text).min(1),
        storageInstructions: text,
        maximumRefrigeratedHours: z.number().nonnegative(),
        maximumQualityHours: z.number().nonnegative(),
        canFreeze: z.boolean(),
        freezingPreservesTexture: z.boolean(),
        maximumFrozenDays: z.number().int().nonnegative(),
        freezingInstructions: text.optional(),
        thawingInstructions: text.optional(),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.canFreeze && (!value.freezingInstructions || !value.thawingInstructions)) {
          context.addIssue({
            code: "custom",
            message: "Freezable recipes require freezing and thawing instructions",
          });
        }
      }),
    packing: z
      .object({
        allowedContainerTypes: z.array(text).min(1),
        thermosRequired: z.boolean(),
        icePackRequired: z.boolean(),
        refrigerationRequired: z.boolean(),
        assemblyAtSchool: z.boolean(),
        utensilsRequired: z.boolean(),
        minimumOpeningCapability: z.enum(["easy", "standard", "thermos"]),
        steps: z.array(text).min(1),
        servingInstructions: z.array(text).min(1),
      })
      .strict(),
    reheating: z
      .object({
        mode: z.enum(["none", "microwave", "thermos"]),
        instructions: z.array(text),
      })
      .strict(),
    substitutions: z.array(SubstitutionSchema),
    crossContactAllergenTags: z.array(AllergenTagSchema),
    prohibitedSchoolRules: z.array(text),
  })
  .strict();

export type AllergenTag = z.infer<typeof AllergenTagSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
