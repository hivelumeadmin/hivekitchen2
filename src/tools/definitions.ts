import type { Responses } from "openai/resources/responses/responses";
import { z } from "zod";
import {
  ConfirmKitchenMapUpdateArgumentsSchema,
  GetKitchenMapArgumentsSchema,
  ProposeKitchenMapUpdateArgumentsSchema,
} from "../schemas/tools.js";

function functionTool(
  name: string,
  description: string,
  schema: z.ZodType,
): Responses.FunctionTool {
  return {
    type: "function",
    name,
    description,
    strict: false,
    parameters: z.toJSONSchema(schema, { target: "draft-7" }),
  };
}

export const KITCHEN_MAP_TOOL_DEFINITIONS: Responses.FunctionTool[] = [
  functionTool(
    "get_kitchen_map",
    "Read the authorized household's current Kitchen Map and onboarding completeness report.",
    GetKitchenMapArgumentsSchema,
  ),
  functionTool(
    "propose_kitchen_map_update",
    "Validate a complete proposed Kitchen Map and return an exact, expiring confirmation-bound diff without writing it.",
    ProposeKitchenMapUpdateArgumentsSchema,
  ),
  functionTool(
    "confirm_kitchen_map_update",
    "Apply the exact proposed diff only after explicit user confirmation. Set explicitAdultConfirmation true only for an explicit adult allergy confirmation.",
    ConfirmKitchenMapUpdateArgumentsSchema,
  ),
];
