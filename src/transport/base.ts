import type { EndpointToolSpec, ToolInvocation, ToolResult } from "../types.js";

export interface Transport {
  call(
    spec: EndpointToolSpec,
    invocation: ToolInvocation,
    authHeaders: Readonly<Record<string, string>>,
  ): Promise<ToolResult>;
}
