import type { EndpointToolSpec } from "../types.js";

export interface SpecSource {
  load(): Promise<readonly EndpointToolSpec[]>;
}
