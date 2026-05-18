export const X_MCP_REQUIRED_SCOPE = "x-mcp-required-scope";
export const X_MCP_TAGS = "x-mcp-tags";
export const X_MCP_EXTRAS = "x-mcp-extras";

export function readScopeExtension(op: Record<string, unknown>): string[] {
  const raw = op[X_MCP_REQUIRED_SCOPE];
  if (raw == null) return [];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string");
  return [];
}

export function readTagsExtension(op: Record<string, unknown>): string[] {
  const raw = op[X_MCP_TAGS];
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string");
  return [];
}

export function readExtrasExtension(op: Record<string, unknown>): Record<string, unknown> {
  const raw = op[X_MCP_EXTRAS];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}
