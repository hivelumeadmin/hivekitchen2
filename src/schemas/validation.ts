import { z } from "zod";

export const RecipeValidationRequestSchema = z
  .object({
    memberId: z.uuid(),
    selectedSubstitutionIds: z.array(z.string().min(1)).default([]),
    storageHours: z.number().nonnegative().default(0),
    frozenDays: z.number().int().nonnegative().default(0),
    willFreeze: z.boolean().default(false),
    willThaw: z.boolean().default(false),
    containerType: z.string().min(1),
  })
  .strict();

export const SnackValidationRequestSchema = z
  .object({
    memberId: z.uuid(),
    breakPeriod: z.enum(["morning", "afternoon"]),
  })
  .strict();

export const ConstraintViolationSchema = z
  .object({
    code: z.string().min(1),
    path: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export type ConstraintViolation = z.infer<typeof ConstraintViolationSchema>;
export type ValidationResult = {
  valid: boolean;
  violations: ConstraintViolation[];
  cautions: string[];
};
