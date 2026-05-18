import type { AuthProvider } from "../auth/index.js";
import { PolicyError } from "../errors.js";
import type { Masker } from "../masking/index.js";
import { NoopMasker } from "../masking/index.js";
import type { Transport } from "../transport/index.js";
import type {
  CallerIdentity,
  EndpointToolSpec,
  ToolDef,
  ToolInvocation,
  ToolResult,
} from "../types.js";
import type { ToolCatalogBuilder } from "./toolCatalog.js";

export interface ExtraTool {
  readonly spec: EndpointToolSpec;
  readonly handler: (
    invocation: ToolInvocation,
    caller: CallerIdentity,
  ) => Promise<ToolResult> | ToolResult;
}

export interface ToolServerOptions {
  readonly catalog: ToolCatalogBuilder;
  readonly transport: Transport;
  readonly auth: AuthProvider;
  readonly masker?: Masker;
  readonly extraTools?: readonly ExtraTool[];
}

export class ToolServer {
  private readonly catalog: ToolCatalogBuilder;
  private readonly transport: Transport;
  private readonly auth: AuthProvider;
  readonly masker: Masker;
  private readonly extraTools: ReadonlyMap<string, ExtraTool>;

  constructor(opts: ToolServerOptions) {
    this.catalog = opts.catalog;
    this.transport = opts.transport;
    this.auth = opts.auth;
    this.masker = opts.masker ?? new NoopMasker();
    const map = new Map<string, ExtraTool>();
    for (const t of opts.extraTools ?? []) {
      map.set(t.spec.name, t);
    }
    this.extraTools = map;
  }

  async listTools(caller: CallerIdentity): Promise<readonly ToolDef[]> {
    const httpTools = await this.catalog.listForCaller(caller);
    const extras = [...this.extraTools.values()].map((t) => t.spec);
    return [...httpTools, ...extras].map((s) => ({
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
    }));
  }

  async listSpecs(caller: CallerIdentity): Promise<readonly EndpointToolSpec[]> {
    const httpTools = await this.catalog.listForCaller(caller);
    const extras = [...this.extraTools.values()].map((t) => t.spec);
    return [...httpTools, ...extras];
  }

  async callTool(
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: CallerIdentity,
  ): Promise<ToolResult> {
    const extra = this.extraTools.get(name);
    if (extra) {
      return await extra.handler(args as ToolInvocation, caller);
    }

    const visible = await this.catalog.listForCaller(caller);
    const spec = visible.find((s) => s.name === name);
    if (!spec) {
      throw new PolicyError(`Tool "${name}" is not visible to caller "${caller.subject}"`);
    }

    const invocation: ToolInvocation = {
      path: (args["path"] as Record<string, string | number> | undefined) ?? {},
      query: (args["query"] as Record<string, string | number | boolean> | undefined) ?? {},
      headers: (args["headers"] as Record<string, string> | undefined) ?? {},
      body: args["body"],
    };

    const authHeaders = await this.auth.headers(spec, caller);
    return await this.transport.call(spec, invocation, authHeaders);
  }
}
