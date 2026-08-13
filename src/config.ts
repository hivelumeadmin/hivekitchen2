import { z } from "zod";

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1).default("gpt-5.6-terra"),
    CONFIRMATION_SECRET: z.string().min(32).optional(),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  })
  .passthrough();

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  openAiApiKey?: string;
  openAiModel: string;
  confirmationSecret: string;
  port: number;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvironmentSchema.parse(environment);
  if (parsed.NODE_ENV === "production" && !parsed.CONFIRMATION_SECRET) {
    throw new Error("CONFIRMATION_SECRET is required in production");
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    ...(parsed.OPENAI_API_KEY ? { openAiApiKey: parsed.OPENAI_API_KEY } : {}),
    openAiModel: parsed.OPENAI_MODEL,
    confirmationSecret:
      parsed.CONFIRMATION_SECRET ?? "local-development-confirmation-secret-change-me",
    port: parsed.PORT,
  };
}
