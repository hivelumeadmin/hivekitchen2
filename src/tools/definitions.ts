import type { Responses } from "openai/resources/responses/responses";
import { z } from "zod";
import {
  ConfirmKitchenMapUpdateArgumentsSchema,
  GetKitchenMapArgumentsSchema,
  ProposeKitchenMapUpdateArgumentsSchema,
} from "../schemas/tools.js";
import {
  CreateWeeklyPlanArgumentsSchema,
  ReplaceMealArgumentsSchema,
  SearchRecipesArgumentsSchema,
  SearchVerifiedSnacksArgumentsSchema,
  ShoppingListArgumentsSchema,
  ValidateWeeklyPlanArgumentsSchema,
} from "./planning-tools.js";

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
    "Read the authorized household's source-of-truth Kitchen Map. Returns data.map (a map or null) and data.completeness { complete, missing }; failures return code, message, and retryable.",
    GetKitchenMapArgumentsSchema,
  ),
  functionTool(
    "propose_kitchen_map_update",
    "Validate a complete proposed Kitchen Map without writing it. Returns the normalized proposedMap, exact diff, expiry, and whether explicit adult allergy confirmation is required; failures return code, message, and retryable.",
    ProposeKitchenMapUpdateArgumentsSchema,
  ),
  functionTool(
    "confirm_kitchen_map_update",
    "Apply the authorized session's latest pending exact diff after explicit user confirmation. The application resolves its server-side token. Returns the saved confirmed map and appliedDiff; set explicitAdultConfirmation true only after explicit adult allergy confirmation.",
    ConfirmKitchenMapUpdateArgumentsSchema,
  ),
];

export const PLANNING_TOOL_DEFINITIONS: Responses.FunctionTool[] = [
  functionTool(
    "search_recipes",
    "Discover catalog main-lunch recipes for one member, filtered only by confirmed allergens, cross-contact rules, and diets. Logistics are checked later by plan validation. Returns data as catalog recipe records.",
    SearchRecipesArgumentsSchema,
  ),
  functionTool(
    "search_verified_snacks",
    "Return verified catalog break snacks for one member and period after deterministic safety, duration, packaging, opening, mess, and school-rule checks. Branded items still require a current-label check.",
    SearchVerifiedSnacksArgumentsSchema,
  ),
  functionTool(
    "create_weekly_plan",
    "Create and save one member's validated five-school-day plan with separate snacks and batch preparation. Returns data.plan and data.validation; may fail with PLANNING_ERROR when no full plan satisfies logistics or freshness.",
    CreateWeeklyPlanArgumentsSchema,
  ),
  functionTool(
    "validate_weekly_plan",
    "Deterministically validate an entire saved weekly plan. Returns data with valid and machine-readable violations.",
    ValidateWeeklyPlanArgumentsSchema,
  ),
  functionTool(
    "replace_meal",
    "Replace one main lunch using a catalog recipe ID, revalidate the whole plan, and repair at most twice. Returns the valid plan or REPAIR_LIMIT_EXCEEDED.",
    ReplaceMealArgumentsSchema,
  ),
  functionTool(
    "get_shopping_list",
    "Aggregate a saved plan's catalog ingredients deterministically. Returns data containing the combined shopping-list entries.",
    ShoppingListArgumentsSchema,
  ),
];

export const ALL_TOOL_DEFINITIONS: Responses.FunctionTool[] = [
  ...KITCHEN_MAP_TOOL_DEFINITIONS,
  ...PLANNING_TOOL_DEFINITIONS,
];
