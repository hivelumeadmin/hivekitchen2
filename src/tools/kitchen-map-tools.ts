import { z } from "zod";
import { ConfirmationTokenError } from "../domain/confirmation-token.js";
import type { ConfirmationTokenService } from "../domain/confirmation-token.js";
import { diffJson, hashJson, type DiffEntry } from "../domain/json.js";
import type { KitchenMap, KitchenMapContent } from "../schemas/kitchen-map.js";
import {
  ConfirmKitchenMapUpdateArgumentsSchema,
  GetKitchenMapArgumentsSchema,
  ProposeKitchenMapUpdateArgumentsSchema,
  ToolContextSchema,
  type ToolContext,
  type ToolResult,
} from "../schemas/tools.js";
import { RepositoryError, type KitchenMapRepository } from "../repositories/types.js";

export type CompletenessReport = { complete: boolean; missing: string[] };

function completeness(map: KitchenMap | null): CompletenessReport {
  if (!map) return { complete: false, missing: ["kitchenMap"] };
  const missing: string[] = [];
  if (!map.members.some((member) => member.ageGroup !== "adult")) missing.push("childOrTeenMember");
  for (const member of map.members.filter((candidate) => candidate.ageGroup !== "adult")) {
    if (member.schoolLunch.schoolDays.length === 0) missing.push(`members.${member.id}.schoolDays`);
    if (member.schoolLunch.containersAvailable.length === 0)
      missing.push(`members.${member.id}.containersAvailable`);
  }
  return { complete: missing.length === 0, missing };
}

function allergySnapshot(content: KitchenMapContent | null): unknown {
  return (content?.members ?? [])
    .map((member) => ({ id: member.id, allergens: member.allergens }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function failure(error: unknown): ToolResult<never> {
  if (error instanceof RepositoryError) {
    return { ok: false, code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof ConfirmationTokenError) {
    return { ok: false, code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      code: "INVALID_ARGUMENTS",
      message: z.prettifyError(error),
      retryable: true,
    };
  }
  return { ok: false, code: "INTERNAL_ERROR", message: "Unexpected tool failure", retryable: true };
}

export class KitchenMapTools {
  constructor(
    private readonly repository: KitchenMapRepository,
    private readonly confirmations: ConfirmationTokenService,
  ) {}

  async getKitchenMap(contextInput: unknown, argumentsInput: unknown) {
    try {
      const context = ToolContextSchema.parse(contextInput);
      GetKitchenMapArgumentsSchema.parse(argumentsInput);
      const map = await this.repository.get(context.userId, context.householdId);
      return { ok: true, data: { map, completeness: completeness(map) } } as const;
    } catch (error) {
      return failure(error);
    }
  }

  async proposeKitchenMapUpdate(contextInput: unknown, argumentsInput: unknown) {
    try {
      const context = ToolContextSchema.parse(contextInput);
      const args = ProposeKitchenMapUpdateArgumentsSchema.parse(argumentsInput);
      const current = await this.repository.get(context.userId, context.householdId);
      const actualVersion = current?.version ?? 0;
      if (actualVersion !== args.baseVersion) {
        throw new RepositoryError(
          "STALE_VERSION",
          `Expected Kitchen Map version ${args.baseVersion}, found ${actualVersion}`,
        );
      }
      const currentContent = current ? stripMetadata(current) : null;
      const diff = diffJson(currentContent, args.proposedMap);
      const proposedHasAllergies = args.proposedMap.members.some(
        (member) => member.allergens.length > 0,
      );
      const requiresAdultConfirmation = currentContent
        ? hashJson(allergySnapshot(currentContent)) !== hashJson(allergySnapshot(args.proposedMap))
        : proposedHasAllergies;
      const issued = this.confirmations.issue({
        userId: context.userId,
        householdId: context.householdId,
        profileVersion: args.baseVersion,
        diff,
        proposedMap: args.proposedMap,
        requiresAdultConfirmation,
      });
      return {
        ok: true,
        data: { diff, ...issued, requiresAdultConfirmation, proposedMap: args.proposedMap },
      } as const;
    } catch (error) {
      return failure(error);
    }
  }

  async confirmKitchenMapUpdate(contextInput: unknown, argumentsInput: unknown) {
    try {
      const context = ToolContextSchema.parse(contextInput);
      const args = ConfirmKitchenMapUpdateArgumentsSchema.parse(argumentsInput);
      const payload = this.confirmations.verify(args.confirmationToken);
      if (payload.userId !== context.userId || payload.householdId !== context.householdId) {
        return {
          ok: false,
          code: "CONFIRMATION_SCOPE_MISMATCH",
          message: "Confirmation does not belong to this user and household",
          retryable: false,
        } as const;
      }
      const current = await this.repository.get(context.userId, context.householdId);
      const currentContent = current ? stripMetadata(current) : null;
      const diff: DiffEntry[] = diffJson(currentContent, payload.proposedMap);
      if (hashJson(diff) !== payload.diffHash) {
        return {
          ok: false,
          code: "STALE_VERSION",
          message: "Kitchen Map changed after this confirmation was issued",
          retryable: false,
        } as const;
      }
      if (payload.requiresAdultConfirmation && !args.explicitAdultConfirmation) {
        return {
          ok: false,
          code: "ADULT_CONFIRMATION_REQUIRED",
          message: "Allergy changes require explicit adult confirmation",
          retryable: false,
        } as const;
      }
      const saved = await this.repository.save(
        context.userId,
        context.householdId,
        payload.profileVersion,
        {
          ...payload.proposedMap,
          householdId: context.householdId,
          version: payload.profileVersion + 1,
        },
      );
      return { ok: true, data: { map: saved, appliedDiff: diff } } as const;
    } catch (error) {
      return failure(error);
    }
  }
}

function stripMetadata(map: KitchenMap): KitchenMapContent {
  const { householdId: _householdId, version: _version, ...content } = map;
  void _householdId;
  void _version;
  return content;
}

export async function dispatchKitchenMapTool(input: {
  tools: KitchenMapTools;
  context: ToolContext;
  name: string;
  argumentsJson: string;
}): Promise<ToolResult<unknown>> {
  let args: unknown;
  try {
    args = JSON.parse(input.argumentsJson);
  } catch {
    return {
      ok: false,
      code: "INVALID_ARGUMENTS",
      message: "Arguments are not JSON",
      retryable: true,
    };
  }
  switch (input.name) {
    case "get_kitchen_map":
      return input.tools.getKitchenMap(input.context, args);
    case "propose_kitchen_map_update":
      return input.tools.proposeKitchenMapUpdate(input.context, args);
    case "confirm_kitchen_map_update":
      return input.tools.confirmKitchenMapUpdate(input.context, args);
    default:
      return { ok: false, code: "UNKNOWN_TOOL", message: "Unknown tool", retryable: false };
  }
}
