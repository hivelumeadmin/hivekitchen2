import { describe, expect, it } from "vitest";
import {
  KITCHEN_MAP_INTERVIEWER_PROMPT,
  KITCHEN_MAP_PROMPT_VERSION,
} from "../src/prompts/kitchen-map.js";
import {
  MEAL_PLANNER_PROMPT_VERSION,
  MEAL_PLANNER_SYSTEM_PROMPT,
} from "../src/prompts/orchestrator.js";
import {
  KITCHEN_MAP_TOOL_DEFINITIONS,
  PLANNING_TOOL_DEFINITIONS,
} from "../src/tools/definitions.js";

describe("orchestrator prompt", () => {
  it("forbids invented UI recovery paths in the console-only prototype", () => {
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("only a console CLI");
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("Never refer to an app screen");
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("state its exact error code");
  });

  it("keeps discovery dietary while validating logistics before planning", () => {
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("Discovery filters only confirmed allergens");
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("Do not exclude a recipe during discovery");
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("Before placing any discovered recipe");
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("soft ranking preferences");
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("additional unique feasible mains");
  });

  it("uses server-owned confirmation state and verifies the saved map", () => {
    expect(MEAL_PLANNER_PROMPT_VERSION).toBe("school-lunch-planner-v3");
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("never ask for, repeat, or pass a token");
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("call get_kitchen_map and verify");
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("only explicitAdultConfirmation");
  });

  it("plans separately for each member and never invents substitutions", () => {
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("A weekly plan targets one member");
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("create one plan per member");
    expect(MEAL_PLANNER_SYSTEM_PROMPT).toContain("catalog-authored substitutions");
  });

  it("keeps the Kitchen Map interviewer console-safe and confirmation-aware", () => {
    expect(KITCHEN_MAP_PROMPT_VERSION).toBe("kitchen-map-interviewer-v2");
    expect(KITCHEN_MAP_INTERVIEWER_PROMPT).toContain("application owns the pending token");
    expect(KITCHEN_MAP_INTERVIEWER_PROMPT).toContain("console-only");
    expect(KITCHEN_MAP_INTERVIEWER_PROMPT).toContain("verify its confirmed status");
  });

  it("describes dietary-only recipe discovery and hides confirmation tokens", () => {
    const recipeSearch = PLANNING_TOOL_DEFINITIONS.find((tool) => tool.name === "search_recipes");
    const confirmation = KITCHEN_MAP_TOOL_DEFINITIONS.find(
      (tool) => tool.name === "confirm_kitchen_map_update",
    );
    expect(recipeSearch?.description).toContain("filtered only by confirmed allergens");
    expect(recipeSearch?.description).toContain("Logistics are checked later");
    expect(JSON.stringify(confirmation?.parameters)).not.toContain("confirmationToken");
    expect(confirmation?.description).toContain("server-side token");
  });
});
