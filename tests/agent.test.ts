import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Responses } from "openai/resources/responses/responses";
import { MealPlannerAgent } from "../src/agents/meal-planner.js";
import { ConfirmationTokenService } from "../src/domain/confirmation-token.js";
import { MemoryKitchenMapRepository } from "../src/repositories/memory-repository.js";
import { KitchenMapTools } from "../src/tools/kitchen-map-tools.js";

function response(input: Partial<Responses.Response>): Responses.Response {
  return { id: "resp", output: [], output_text: "", ...input } as Responses.Response;
}

describe("MealPlannerAgent", () => {
  it("dispatches tool calls and chains state with previous_response_id", async () => {
    const userId = randomUUID();
    const householdId = randomUUID();
    const repository = new MemoryKitchenMapRepository();
    repository.addMembership(userId, householdId);
    const tools = new KitchenMapTools(
      repository,
      new ConfirmationTokenService("a-test-secret-that-is-longer-than-thirty-two"),
    );
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          id: "resp_1",
          output: [
            { type: "function_call", call_id: "call_1", name: "get_kitchen_map", arguments: "{}" },
          ] as Responses.ResponseOutputItem[],
        }),
      )
      .mockResolvedValueOnce(response({ id: "resp_2", output_text: "Let's begin." }));
    const agent = new MealPlannerAgent(create, tools, "gpt-test");
    const result = await agent.run({ userId, householdId, message: "Help me onboard" });
    expect(result).toEqual({ responseId: "resp_2", text: "Let's begin." });
    expect(create).toHaveBeenCalledTimes(2);
    const secondCall = create.mock.calls[1]?.[0] as Responses.ResponseCreateParamsNonStreaming;
    expect(secondCall).toMatchObject({ previous_response_id: "resp_1" });
    expect(Array.isArray(secondCall.input) && secondCall.input[0]).toMatchObject({
      type: "function_call_output",
      call_id: "call_1",
    });
  });
});
