import type { CallerIdentity, EndpointToolSpec } from "../types.js";

export interface AuthProvider {
  headers(
    spec: EndpointToolSpec,
    caller: CallerIdentity,
  ): Promise<Readonly<Record<string, string>>>;
}
