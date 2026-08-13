import OpenAI from "openai";
import { describe, expect, it } from "vitest";

const integration = process.env["OPENAI_API_KEY"] ? it : it.skip;

describe("OpenAI integration (opt-in)", () => {
  integration(
    "calls the Responses API when OPENAI_API_KEY exists",
    async () => {
      const client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
      const response = await client.responses.create({
        model: process.env["OPENAI_MODEL"] ?? "gpt-5.6-terra",
        input: "Reply with exactly: ready",
        max_output_tokens: 16,
      });
      expect(response.output_text.trim().toLowerCase()).toContain("ready");
    },
    30_000,
  );
});
