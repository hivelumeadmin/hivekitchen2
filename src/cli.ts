import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import OpenAI from "openai";
import { MealPlannerAgent, openAiResponseCreator } from "./agents/meal-planner.js";
import { loadConfig } from "./config.js";
import { ConfirmationTokenService } from "./domain/confirmation-token.js";
import { MemoryKitchenMapRepository } from "./repositories/memory-repository.js";
import { KitchenMapTools } from "./tools/kitchen-map-tools.js";

const config = loadConfig();
if (!config.openAiApiKey) throw new Error("Set OPENAI_API_KEY to use the chat CLI");
const apiKey = config.openAiApiKey;
const userId = process.argv[2];
const householdId = process.argv[3];
if (!userId || !householdId) {
  throw new Error("Usage: npm run chat -- <user-uuid> <household-uuid>");
}

const repository = new MemoryKitchenMapRepository();
repository.addMembership(userId, householdId);
const tools = new KitchenMapTools(
  repository,
  new ConfirmationTokenService(config.confirmationSecret),
);
const agent = new MealPlannerAgent(
  openAiResponseCreator(new OpenAI({ apiKey })),
  tools,
  config.openAiModel,
);
const terminal = createInterface({ input: stdin, output: stdout });
let previousResponseId: string | undefined;
stdout.write("School Lunch Kitchen Map (type 'exit' to quit)\n");
for (;;) {
  const message = await terminal.question("> ");
  if (message.trim().toLowerCase() === "exit") break;
  const result = await agent.run({
    userId,
    householdId,
    message,
    ...(previousResponseId ? { previousResponseId } : {}),
  });
  previousResponseId = result.responseId;
  stdout.write(`${result.text}\n`);
}
terminal.close();
