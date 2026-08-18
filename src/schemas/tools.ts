import { z } from "zod";
import { KitchenMapContentSchema } from "./kitchen-map.js";

export const ToolContextSchema = z
  .object({ userId: z.string().uuid(), householdId: z.string().uuid() })
  .strict();
export const GetKitchenMapArgumentsSchema = z.object({}).strict();
export const ProposeKitchenMapUpdateArgumentsSchema = z
  .object({ baseVersion: z.number().int().nonnegative(), proposedMap: KitchenMapContentSchema })
  .strict();
export const ConfirmKitchenMapUpdateArgumentsSchema = z
  .object({
    explicitAdultConfirmation: z.boolean().default(false),
  })
  .strict();

export type ToolContext = z.infer<typeof ToolContextSchema>;

export type ToolResult<T> =
  { ok: true; data: T } | { ok: false; code: string; message: string; retryable: boolean };
