import type { EndpointToolSpec } from "../types.js";
import type { SpecSource } from "./base.js";

export class StaticSpecSource implements SpecSource {
  constructor(private readonly specs: readonly EndpointToolSpec[]) {}

  async load(): Promise<readonly EndpointToolSpec[]> {
    return this.specs;
  }
}
