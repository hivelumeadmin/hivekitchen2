import { z } from "zod";
import { IngredientSchema } from "./recipe.js";

const text = z.string().trim().min(1);
const date = z.iso.date();

export const PlannedMainLunchSchema = z
  .object({
    date,
    recipeId: text,
    servings: z.number().int().positive(),
    intendedMemberId: z.uuid(),
    whyRecommended: text,
    homemadeComponents: z.array(text).min(1),
    convenienceComponents: z.array(text),
    estimatedMorningMinutes: z.number().int().nonnegative(),
    selectedSubstitutionIds: z.array(text),
    containerType: text,
    storageHours: z.number().nonnegative(),
    frozenDays: z.number().int().nonnegative(),
    willFreeze: z.boolean(),
    willThaw: z.boolean(),
    childParticipation: z
      .object({
        optional: z.literal(true),
        task: text,
        estimatedMinutes: z.number().int().nonnegative(),
        adultSupervisionRequired: z.boolean(),
      })
      .strict()
      .optional(),
    preparation: z
      .object({
        ingredients: z.array(IngredientSchema).min(1),
        equipment: z.array(text),
        numberedSteps: z.array(
          z.object({ order: z.number().int().positive(), instruction: text }).strict(),
        ),
        nightBeforeSteps: z.array(text).min(1),
        morningSteps: z.array(text).min(1),
        packingSteps: z.array(text).min(1),
        storageInstructions: text,
        servingInstructions: z.array(text).min(1),
      })
      .strict(),
  })
  .strict();

export const PlannedBreakSnackSchema = z
  .object({
    period: z.enum(["morning", "afternoon"]),
    productId: text,
    genericDescription: text,
    quantity: z.number().positive(),
    packaged: z.boolean(),
    requiresCurrentLabelCheck: z.literal(true),
    easyToOpen: z.boolean(),
    requiresUtensil: z.boolean(),
    lowMess: z.literal(true),
    storage: z.enum(["room_temperature", "ice_pack", "refrigerated"]),
  })
  .strict();

export const BatchPrepEntrySchema = z
  .object({
    recipeId: text,
    preparationDate: date,
    portionsToPrepare: z.number().int().positive(),
    refrigerationInstructions: text,
    freezingInstructions: text,
    thawingInstructions: text,
    lastAcceptableServingDate: date,
    packFreshComponents: z.array(text),
  })
  .strict();

export const WeeklyPlanSchema = z
  .object({
    id: z.uuid(),
    householdId: z.uuid(),
    kitchenMapVersion: z.number().int().positive(),
    weekOf: date,
    memberId: z.uuid(),
    schoolDays: z
      .array(
        z
          .object({
            date,
            mainLunch: PlannedMainLunchSchema,
            breakSnacks: z.array(PlannedBreakSnackSchema),
          })
          .strict(),
      )
      .length(5),
    batchPrepPlan: z.array(BatchPrepEntrySchema),
    warnings: z.array(text),
    repairAttempts: z.number().int().min(0).max(2),
  })
  .strict();

export const ShoppingListSchema = z
  .array(
    z
      .object({
        name: text,
        unit: text,
        quantity: z.number().positive(),
        recipeIds: z.array(text).min(1),
      })
      .strict(),
  )
  .readonly();

export type WeeklyPlan = z.infer<typeof WeeklyPlanSchema>;
export type PlannedMainLunch = z.infer<typeof PlannedMainLunchSchema>;
export type PlannedBreakSnack = z.infer<typeof PlannedBreakSnackSchema>;
