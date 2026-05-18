import type { CallerIdentity, EndpointToolSpec } from "../types.js";
import type { VisibilityFilter } from "./base.js";

export interface ScopeFilterOptions {
  readonly matchClaim?: string;
  readonly defaultVisibility?: "allow" | "deny";
}

export class ScopeFilter implements VisibilityFilter {
  private readonly matchClaim: string;
  private readonly defaultVisibility: "allow" | "deny";

  constructor(opts: ScopeFilterOptions = {}) {
    this.matchClaim = opts.matchClaim ?? "scopes";
    this.defaultVisibility = opts.defaultVisibility ?? "deny";
  }

  allow(spec: EndpointToolSpec, caller: CallerIdentity): boolean {
    const required = spec.requiredScopes ?? [];
    if (required.length === 0) return this.defaultVisibility === "allow";
    const raw = caller.claims?.[this.matchClaim];
    const callerScopes = parseScopes(raw);
    return required.every((s) => callerScopes.has(s));
  }
}

function parseScopes(raw: unknown): Set<string> {
  if (raw == null) return new Set();
  if (typeof raw === "string") return new Set(raw.split(/\s+/).filter(Boolean));
  if (Array.isArray(raw)) return new Set(raw.filter((s): s is string => typeof s === "string"));
  return new Set();
}
