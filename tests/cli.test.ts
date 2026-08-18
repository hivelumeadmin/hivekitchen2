import { describe, expect, it } from "vitest";
import { normalizeCliMessage } from "../src/cli-input.js";

describe("CLI input", () => {
  it("ignores blank input instead of sending an invalid message", () => {
    expect(normalizeCliMessage("")).toBeNull();
    expect(normalizeCliMessage("   \t ")).toBeNull();
  });

  it("trims a non-empty message", () => {
    expect(normalizeCliMessage("  Create a plan.  ")).toBe("Create a plan.");
  });
});
