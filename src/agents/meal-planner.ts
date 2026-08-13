import type OpenAI from "openai";
import type { Responses } from "openai/resources/responses/responses";
import { z } from "zod";
import { MEAL_PLANNER_SYSTEM_PROMPT } from "../prompts/orchestrator.js";
import { ToolContextSchema } from "../schemas/tools.js";
import { KITCHEN_MAP_TOOL_DEFINITIONS } from "../tools/definitions.js";
import { dispatchKitchenMapTool, type KitchenMapTools } from "../tools/kitchen-map-tools.js";

const RunInputSchema = ToolContextSchema.extend({
  message: z.string().trim().min(1),
  previousResponseId: z.string().min(1).optional(),
}).strict();

export type ResponseCreate = (
  params: Responses.ResponseCreateParamsNonStreaming,
) => Promise<Responses.Response>;

export class MealPlannerAgent {
  constructor(
    private readonly createResponse: ResponseCreate,
    private readonly tools: KitchenMapTools,
    private readonly model: string,
    private readonly maxToolTurns = 8,
  ) {}

  async run(input: z.input<typeof RunInputSchema>): Promise<{ responseId: string; text: string }> {
    const parsed = RunInputSchema.parse(input);
    let response = await this.createResponse({
      model: this.model,
      reasoning: { effort: "low" },
      instructions: MEAL_PLANNER_SYSTEM_PROMPT,
      input: parsed.message,
      ...(parsed.previousResponseId ? { previous_response_id: parsed.previousResponseId } : {}),
      tools: KITCHEN_MAP_TOOL_DEFINITIONS,
    });

    for (let turn = 0; turn < this.maxToolTurns; turn += 1) {
      const calls = response.output.filter(
        (item): item is Responses.ResponseFunctionToolCall => item.type === "function_call",
      );
      if (calls.length === 0) return { responseId: response.id, text: response.output_text };

      const outputs: Responses.ResponseInputItem[] = await Promise.all(
        calls.map(async (call) => ({
          type: "function_call_output" as const,
          call_id: call.call_id,
          output: JSON.stringify(
            await dispatchKitchenMapTool({
              tools: this.tools,
              context: { userId: parsed.userId, householdId: parsed.householdId },
              name: call.name,
              argumentsJson: call.arguments,
            }),
          ),
        })),
      );
      response = await this.createResponse({
        model: this.model,
        reasoning: { effort: "low" },
        instructions: MEAL_PLANNER_SYSTEM_PROMPT,
        previous_response_id: response.id,
        input: outputs,
        tools: KITCHEN_MAP_TOOL_DEFINITIONS,
      });
    }
    throw new Error(`Agent exceeded maximum of ${this.maxToolTurns} tool turns`);
  }
}

export function openAiResponseCreator(client: OpenAI): ResponseCreate {
  return (params) => client.responses.create(params);
}
