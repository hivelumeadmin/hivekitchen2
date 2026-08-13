import { createHash } from "node:crypto";

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type DiffEntry = {
  path: string;
  before?: JsonValue;
  after?: JsonValue;
};

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function escapePath(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function diffJson(before: unknown, after: unknown, path = ""): DiffEntry[] {
  if (canonicalJson(before) === canonicalJson(after)) return [];
  const beforeIsObject = before !== null && typeof before === "object" && !Array.isArray(before);
  const afterIsObject = after !== null && typeof after === "object" && !Array.isArray(after);
  if (beforeIsObject && afterIsObject) {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    return keys.flatMap((key) => diffJson(left[key], right[key], `${path}/${escapePath(key)}`));
  }
  return [
    {
      path: path || "/",
      ...(before !== undefined ? { before: before as JsonValue } : {}),
      ...(after !== undefined ? { after: after as JsonValue } : {}),
    },
  ];
}
