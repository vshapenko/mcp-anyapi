import type { CallerIdentity, EndpointToolSpec } from "../types.js";

export interface VisibilityFilter {
  allow(spec: EndpointToolSpec, caller: CallerIdentity): boolean;
  filter?(
    specs: readonly EndpointToolSpec[],
    caller: CallerIdentity,
  ): Promise<readonly EndpointToolSpec[]>;
}

export async function applyFilter(
  filter: VisibilityFilter,
  specs: readonly EndpointToolSpec[],
  caller: CallerIdentity,
): Promise<readonly EndpointToolSpec[]> {
  if (filter.filter) return filter.filter(specs, caller);
  return specs.filter((s) => filter.allow(s, caller));
}
