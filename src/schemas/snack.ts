import { z } from "zod";
import { AllergenTagSchema } from "./recipe.js";

const text = z.string().trim().min(1);

export const VerifiedSnackSchema = z
  .object({
    id: text,
    genericName: text,
    brand: text.optional(),
    catalogVerified: z.literal(true),
    catalogSource: text,
    verifiedAt: z.iso.datetime(),
    allergenTags: z.array(AllergenTagSchema),
    crossContactAllergenTags: z.array(AllergenTagSchema),
    packaged: z.boolean(),
    individuallyPackaged: z.boolean(),
    requiresCurrentLabelCheck: z.boolean(),
    shelfStable: z.boolean(),
    requiresUtensil: z.boolean(),
    lowMess: z.boolean(),
    openingCapability: z.enum(["easy", "standard", "adult_help"]),
    estimatedEatingMinutes: z.number().int().positive(),
    storage: z.enum(["room_temperature", "ice_pack", "refrigerated"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.brand && !value.requiresCurrentLabelCheck) {
      context.addIssue({
        code: "custom",
        path: ["requiresCurrentLabelCheck"],
        message: "Every branded snack requires a current package-label check",
      });
    }
  });

export type VerifiedSnack = z.infer<typeof VerifiedSnackSchema>;
