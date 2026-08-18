export function normalizeCliMessage(message: string): string | null {
  const normalized = message.trim();
  return normalized.length === 0 ? null : normalized;
}
