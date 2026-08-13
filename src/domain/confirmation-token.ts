import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { KitchenMapContentSchema } from "../schemas/kitchen-map.js";
import { hashJson, type DiffEntry } from "./json.js";

const TokenPayloadSchema = z
  .object({
    userId: z.string().uuid(),
    householdId: z.string().uuid(),
    profileVersion: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    diffHash: z.string().length(64),
    proposedMap: KitchenMapContentSchema,
    requiresAdultConfirmation: z.boolean(),
  })
  .strict();

export type ConfirmationPayload = z.infer<typeof TokenPayloadSchema>;

export class ConfirmationTokenError extends Error {
  constructor(public readonly code: "INVALID_CONFIRMATION" | "CONFIRMATION_EXPIRED") {
    super(code);
  }
}

export class ConfirmationTokenService {
  constructor(
    private readonly secret: string,
    private readonly ttlMs = 10 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  issue(input: {
    userId: string;
    householdId: string;
    profileVersion: number;
    diff: DiffEntry[];
    proposedMap: ConfirmationPayload["proposedMap"];
    requiresAdultConfirmation: boolean;
  }): { token: string; expiresAt: string } {
    const payload = TokenPayloadSchema.parse({
      userId: input.userId,
      householdId: input.householdId,
      profileVersion: input.profileVersion,
      expiresAt: this.now() + this.ttlMs,
      diffHash: hashJson(input.diff),
      proposedMap: input.proposedMap,
      requiresAdultConfirmation: input.requiresAdultConfirmation,
    });
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(encoded);
    return {
      token: `${encoded}.${signature}`,
      expiresAt: new Date(payload.expiresAt).toISOString(),
    };
  }

  verify(token: string): ConfirmationPayload {
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) throw new ConfirmationTokenError("INVALID_CONFIRMATION");
    const expected = this.sign(encoded);
    const suppliedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      throw new ConfirmationTokenError("INVALID_CONFIRMATION");
    }
    try {
      const payload = TokenPayloadSchema.parse(
        JSON.parse(Buffer.from(encoded, "base64url").toString()),
      );
      if (payload.expiresAt <= this.now()) throw new ConfirmationTokenError("CONFIRMATION_EXPIRED");
      return payload;
    } catch (error) {
      if (error instanceof ConfirmationTokenError) throw error;
      throw new ConfirmationTokenError("INVALID_CONFIRMATION");
    }
  }

  private sign(encoded: string): string {
    return createHmac("sha256", this.secret).update(encoded).digest("base64url");
  }
}
