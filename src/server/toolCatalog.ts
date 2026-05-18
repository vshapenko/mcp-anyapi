import type { SpecSource } from "../specs/index.js";
import type { CallerIdentity, EndpointToolSpec } from "../types.js";
import type { VisibilityFilter } from "../visibility/index.js";
import { applyFilter } from "../visibility/index.js";

export interface ToolCatalogBuilderOptions {
  readonly specSources: readonly SpecSource[];
  readonly visibility: VisibilityFilter;
}

export class ToolCatalogBuilder {
  private cached: readonly EndpointToolSpec[] | null = null;

  constructor(private readonly opts: ToolCatalogBuilderOptions) {}

  async load(): Promise<readonly EndpointToolSpec[]> {
    if (this.cached) return this.cached;
    const all: EndpointToolSpec[] = [];
    const seen = new Set<string>();
    for (const src of this.opts.specSources) {
      for (const spec of await src.load()) {
        if (seen.has(spec.name)) {
          continue;
        }
        seen.add(spec.name);
        all.push(spec);
      }
    }
    this.cached = all;
    return this.cached;
  }

  async listForCaller(caller: CallerIdentity): Promise<readonly EndpointToolSpec[]> {
    const all = await this.load();
    return applyFilter(this.opts.visibility, all, caller);
  }
}
