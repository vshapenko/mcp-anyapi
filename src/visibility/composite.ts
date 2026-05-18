import type { CallerIdentity, EndpointToolSpec } from "../types.js";
import type { VisibilityFilter } from "./base.js";

export class CompositeFilter implements VisibilityFilter {
  constructor(private readonly filters: readonly VisibilityFilter[]) {}

  allow(spec: EndpointToolSpec, caller: CallerIdentity): boolean {
    return this.filters.every((f) => f.allow(spec, caller));
  }
}
