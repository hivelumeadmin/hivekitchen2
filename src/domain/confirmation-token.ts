import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { KitchenMapContentSchema, type KitchenMapContent } from "../schemas/kitchen-map.js";
import { hashJson, type DiffEntry } from "./json.js";

const TokenPayloadSchema = z
  .object({
    userId: z.string().uuid(),
    householdId: z.string().uuid(),
    profileVersion: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    diffHash: z.string().length(64),
    proposedMapHash: z.string().length(64),
    proposalId: z.uuid(),
    requiresAdultConfirmation: z.boolean(),
  })
  .strict();

export type ConfirmationPayload = z.infer<typeof TokenPayloadSchema>;
export type VerifiedConfirmation = ConfirmationPayload & { proposedMap: KitchenMapContent };

export class ConfirmationTokenError extends Error {
  constructor(public readonly code: "INVALID_CONFIRMATION" | "CONFIRMATION_EXPIRED") {
    super(code);
  }
}

export class ConfirmationTokenService {
  private readonly proposals = new Map<string, KitchenMapContent>();
  private readonly latestTokensByScope = new Map<string, string>();

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
    proposedMap: KitchenMapContent;
    requiresAdultConfirmation: boolean;
  }): { token: string; expiresAt: string } {
    const proposalId = randomUUID();
    const proposedMap = KitchenMapContentSchema.parse(input.proposedMap);
    const payload = TokenPayloadSchema.parse({
      userId: input.userId,
      householdId: input.householdId,
      profileVersion: input.profileVersion,
      expiresAt: this.now() + this.ttlMs,
      diffHash: hashJson(input.diff),
      proposedMapHash: hashJson(proposedMap),
      proposalId,
      requiresAdultConfirmation: input.requiresAdultConfirmation,
    });
    this.proposals.set(proposalId, structuredClone(proposedMap));
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(encoded);
    const token = `${encoded}.${signature}`;
    this.latestTokensByScope.set(this.scopeKey(payload.userId, payload.householdId), token);
    return {
      token,
      expiresAt: new Date(payload.expiresAt).toISOString(),
    };
  }

  latestToken(userId: string, householdId: string): string {
    const token = this.latestTokensByScope.get(this.scopeKey(userId, householdId));
    if (!token) throw new ConfirmationTokenError("INVALID_CONFIRMATION");
    return token;
  }

  verify(token: string): VerifiedConfirmation {
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
      if (payload.expiresAt <= this.now()) {
        this.proposals.delete(payload.proposalId);
        throw new ConfirmationTokenError("CONFIRMATION_EXPIRED");
      }
      const proposedMap = this.proposals.get(payload.proposalId);
      if (!proposedMap || hashJson(proposedMap) !== payload.proposedMapHash) {
        throw new ConfirmationTokenError("INVALID_CONFIRMATION");
      }
      return { ...payload, proposedMap: structuredClone(proposedMap) };
    } catch (error) {
      if (error instanceof ConfirmationTokenError) throw error;
      throw new ConfirmationTokenError("INVALID_CONFIRMATION");
    }
  }

  consume(proposalId: string, userId: string, householdId: string): void {
    this.proposals.delete(proposalId);
    this.latestTokensByScope.delete(this.scopeKey(userId, householdId));
  }

  private sign(encoded: string): string {
    return createHmac("sha256", this.secret).update(encoded).digest("base64url");
  }

  private scopeKey(userId: string, householdId: string): string {
    return `${userId}:${householdId}`;
  }
}
