import OpenAI from "openai";
import Fastify from "fastify";
import { z } from "zod";
import { MealPlannerAgent, openAiResponseCreator } from "./agents/meal-planner.js";
import type { AppConfig } from "./config.js";
import { ConfirmationTokenService } from "./domain/confirmation-token.js";
import { MemoryKitchenMapRepository } from "./repositories/memory-repository.js";
import { MemoryWeeklyPlanRepository } from "./repositories/plan-repository.js";
import { KitchenMapTools } from "./tools/kitchen-map-tools.js";
import { PlanningTools } from "./tools/planning-tools.js";

const ChatBodySchema = z
  .object({
    userId: z.string().uuid(),
    householdId: z.string().uuid(),
    message: z.string().trim().min(1),
    previousResponseId: z.string().min(1).optional(),
  })
  .strict();

export function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.nodeEnv !== "test" });
  const repository = new MemoryKitchenMapRepository();
  const tools = new KitchenMapTools(
    repository,
    new ConfirmationTokenService(config.confirmationSecret),
  );
  const plans = new MemoryWeeklyPlanRepository(repository);
  const planningTools = new PlanningTools(repository, plans);

  app.get("/health", async () => ({ ok: true, service: "school-lunch-agent" }));
  app.post("/chat", async (request, reply) => {
    const parsed = ChatBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ ok: false, code: "INVALID_ARGUMENTS", issues: parsed.error.issues });
    }
    if (!config.openAiApiKey) {
      return reply.code(503).send({ ok: false, code: "OPENAI_NOT_CONFIGURED" });
    }
    repository.addMembership(parsed.data.userId, parsed.data.householdId);
    const client = new OpenAI({ apiKey: config.openAiApiKey });
    const agent = new MealPlannerAgent(
      openAiResponseCreator(client),
      tools,
      config.openAiModel,
      8,
      planningTools,
    );
    return agent.run(parsed.data);
  });
  return { app, repository, tools, plans, planningTools };
}
