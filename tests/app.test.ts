import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("HTTP service", () => {
  it("serves health without an OpenAI key", async () => {
    const { app } = buildApp({
      nodeEnv: "test",
      openAiModel: "gpt-test",
      confirmationSecret: "a-test-secret-that-is-longer-than-thirty-two",
      port: 3000,
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "school-lunch-agent" });
    await app.close();
  });
});
