import type { CallerIdentity, EndpointToolSpec } from "../types.js";
import type { VisibilityFilter } from "./base.js";

export interface TagFilterOptions {
  readonly allowed: ReadonlyArray<string>;
  readonly mode?: "any" | "all";
  readonly defaultVisibility?: "allow" | "deny";
}

export class TagFilter implements VisibilityFilter {
  private readonly allowed: ReadonlySet<string>;
  private readonly mode: "any" | "all";
  private readonly defaultVisibility: "allow" | "deny";

  constructor(opts: TagFilterOptions) {
    this.allowed = new Set(opts.allowed);
    this.mode = opts.mode ?? "any";
    this.defaultVisibility = opts.defaultVisibility ?? "deny";
  }

  allow(spec: EndpointToolSpec, _caller?: CallerIdentity): boolean {
    const tags = new Set(spec.tags ?? []);
    if (tags.size === 0) return this.defaultVisibility === "allow";
    if (this.mode === "all") {
      for (const required of this.allowed) {
        if (!tags.has(required)) return false;
      }
      return true;
    }
    for (const t of tags) if (this.allowed.has(t)) return true;
    return false;
  }
}
