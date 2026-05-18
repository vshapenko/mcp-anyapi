import type { CallerIdentity, EndpointToolSpec } from "../types.js";
import type { AuthProvider } from "./base.js";

export type MintHeadersFn = (
  spec: EndpointToolSpec,
  caller: CallerIdentity,
) => Promise<Readonly<Record<string, string>>> | Readonly<Record<string, string>>;

export interface CallbackAuthOptions {
  readonly mintHeaders: MintHeadersFn;
}

export class CallbackAuth implements AuthProvider {
  private readonly mintHeaders: MintHeadersFn;

  constructor(opts: CallbackAuthOptions) {
    this.mintHeaders = opts.mintHeaders;
  }

  async headers(
    spec: EndpointToolSpec,
    caller: CallerIdentity,
  ): Promise<Readonly<Record<string, string>>> {
    return await this.mintHeaders(spec, caller);
  }
}
