import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const weekdaySchema = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday"]);

export const AllergenRuleSchema = z
  .object({
    allergen: nonEmptyString,
    severity: z.enum(["intolerance", "allergy"]),
    crossContactConcern: z.boolean(),
    confirmedByAdult: z.boolean(),
  })
  .strict();

export const BreakSnackConstraintsSchema = z
  .object({
    enabled: z.boolean(),
    breaks: z.array(
      z
        .object({
          period: z.enum(["morning", "afternoon"]),
          durationMinutes: z.number().int().positive(),
        })
        .strict(),
    ),
    mustBeIndividuallyPackaged: z.boolean(),
    shelfStableRequired: z.boolean(),
    utensilsAllowed: z.boolean(),
    preferredTypes: z.array(z.enum(["fruit", "sweet", "savory", "mixed"])),
    trustedProductIds: z.array(nonEmptyString),
    weeklyBudget: z.number().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.enabled && value.breaks.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["breaks"],
        message: "Disabled break snacks cannot define break periods",
      });
    }
  });

export const SchoolLunchConstraintsSchema = z
  .object({
    preparationPreference: z.enum(["night_before", "morning", "either"]),
    morningPrepLimitMinutes: z.number().int().min(0),
    childCanAssembleAtSchool: z.boolean(),
    childCanOpenThermos: z.boolean(),
    childCanOpenContainers: z.boolean(),
    microwaveAvailable: z.boolean(),
    refrigeratorAvailable: z.boolean(),
    thermosAllowed: z.boolean(),
    icePackAvailable: z.boolean(),
    utensilsAllowed: z.boolean(),
    nutFreeFacility: z.boolean(),
    maximumEatingMinutes: z.number().int().positive(),
    schoolDays: z.array(weekdaySchema),
    lunchPeriodStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    classroomOrSchoolFoodRules: z.array(nonEmptyString),
    portionPreference: z.enum(["small", "medium", "large"]),
    appetitePattern: z.enum(["light", "variable", "steady"]),
    preferredFoodFormats: z.array(
      z.enum(["whole", "bite_sized", "wrap", "sandwich", "bento", "thermos"]),
    ),
    foodsToKeepSeparate: z.array(nonEmptyString),
    containersAvailable: z.array(nonEmptyString),
    breakSnacks: BreakSnackConstraintsSchema,
  })
  .strict();

export const HouseholdMemberSchema = z
  .object({
    id: z.string().uuid(),
    displayName: nonEmptyString,
    ageGroup: z.enum(["child", "teen", "adult"]),
    allergens: z.array(AllergenRuleSchema),
    diets: z.array(nonEmptyString),
    likedCuisines: z.array(nonEmptyString),
    likedIngredients: z.array(nonEmptyString),
    dislikedIngredients: z.array(nonEmptyString),
    texturePreferences: z.array(nonEmptyString),
    spiceLevel: z.enum(["none", "mild", "medium", "hot"]),
    schoolLunch: SchoolLunchConstraintsSchema,
  })
  .strict();

export const LunchRepetitionSchema = z
  .object({
    maxOccurrencesPerMainItem: z.number().int().min(1).max(5).default(2),
    targetUniqueMainItemsPerWeek: z.number().int().min(1).max(5).default(3),
    allowConsecutiveDays: z.boolean().default(false),
    preferBatchPreparation: z.boolean().default(true),
    repeatMode: z.enum(["exact", "small_variation", "either"]).default("small_variation"),
    repeatToleranceByMemberId: z.record(z.string(), z.enum(["low", "medium", "high"])),
  })
  .strict();

export const KitchenMapContentSchema = z
  .object({
    status: z.enum(["draft", "confirmed"]),
    timezone: nonEmptyString,
    weeklyBudget: z.number().nonnegative().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    weekdayPrepLimitMinutes: z.number().int().positive(),
    cookingSkill: z.enum(["beginner", "intermediate", "advanced"]),
    equipment: z.array(nonEmptyString),
    homemadePreference: z.enum(["mostly_homemade", "mixed", "convenience_first"]),
    batchPrepDay: z.enum(["none", "saturday", "sunday", "other"]),
    childParticipationPreference: z.enum([
      "none",
      "choosing",
      "simple_prep",
      "packing",
      "flexible",
    ]),
    lunchRepetition: LunchRepetitionSchema.default({
      maxOccurrencesPerMainItem: 2,
      targetUniqueMainItemsPerWeek: 3,
      allowConsecutiveDays: false,
      preferBatchPreparation: true,
      repeatMode: "small_variation",
      repeatToleranceByMemberId: {},
    }),
    batchPlanning: z
      .object({
        batchPrepDay: z.enum(["saturday", "sunday", "weekday_evening", "none"]),
        batchPrepMinutes: z.number().int().nonnegative(),
        freezerAvailable: z.boolean(),
        acceptableStorageDays: z.number().int().nonnegative(),
      })
      .strict(),
    householdDiets: z.array(nonEmptyString),
    preferredCuisines: z.array(nonEmptyString),
    dislikedIngredients: z.array(nonEmptyString),
    members: z.array(HouseholdMemberSchema).min(1),
  })
  .strict();

export const KitchenMapSchema = KitchenMapContentSchema.extend({
  householdId: z.string().uuid(),
  version: z.number().int().positive(),
}).strict();

export type AllergenRule = z.infer<typeof AllergenRuleSchema>;
export type KitchenMapContent = z.infer<typeof KitchenMapContentSchema>;
export type KitchenMap = z.infer<typeof KitchenMapSchema>;

export const DEFAULT_LUNCH_REPETITION = LunchRepetitionSchema.parse({
  repeatToleranceByMemberId: {},
});
