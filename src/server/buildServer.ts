import type { AuthProvider } from "../auth/index.js";
import type { Masker } from "../masking/index.js";
import type { SpecSource } from "../specs/index.js";
import type { Transport } from "../transport/index.js";
import type { VisibilityFilter } from "../visibility/index.js";
import { ToolCatalogBuilder } from "./toolCatalog.js";
import type { ExtraTool } from "./toolServer.js";
import { ToolServer } from "./toolServer.js";

export interface BuildServerOptions {
  readonly specSource: SpecSource | readonly SpecSource[];
  readonly transport: Transport;
  readonly auth: AuthProvider;
  readonly visibility: VisibilityFilter;
  readonly masker?: Masker;
  readonly extraTools?: readonly ExtraTool[];
}

export async function buildServer(opts: BuildServerOptions): Promise<ToolServer> {
  const specSources = Array.isArray(opts.specSource)
    ? (opts.specSource as readonly SpecSource[])
    : [opts.specSource as SpecSource];
  const catalog = new ToolCatalogBuilder({
    specSources,
    visibility: opts.visibility,
  });
  // Eagerly load so callers see spec errors at boot time.
  await catalog.load();
  return new ToolServer({
    catalog,
    transport: opts.transport,
    auth: opts.auth,
    masker: opts.masker,
    extraTools: opts.extraTools,
  });
}
