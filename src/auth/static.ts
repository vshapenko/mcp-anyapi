import type { CallerIdentity, EndpointToolSpec } from "../types.js";
import type { AuthProvider } from "./base.js";

export class NoAuth implements AuthProvider {
  async headers(
    _spec?: EndpointToolSpec,
    _caller?: CallerIdentity,
  ): Promise<Readonly<Record<string, string>>> {
    return {};
  }
}

export interface StaticBearerAuthOptions {
  readonly token: string;
  readonly header?: string;
  readonly scheme?: string;
}

export class StaticBearerAuth implements AuthProvider {
  private readonly token: string;
  private readonly header: string;
  private readonly scheme: string;

  constructor(opts: StaticBearerAuthOptions) {
    this.token = opts.token;
    this.header = opts.header ?? "Authorization";
    this.scheme = opts.scheme ?? "Bearer";
  }

  async headers(
    _spec: EndpointToolSpec,
    caller: CallerIdentity,
  ): Promise<Readonly<Record<string, string>>> {
    const token = caller.bearerToken ?? this.token;
    return { [this.header]: `${this.scheme} ${token}` };
  }
}

export interface ApiKeyHeaderAuthOptions {
  readonly key: string;
  readonly header?: string;
}

export class ApiKeyHeaderAuth implements AuthProvider {
  private readonly key: string;
  private readonly header: string;

  constructor(opts: ApiKeyHeaderAuthOptions) {
    this.key = opts.key;
    this.header = opts.header ?? "X-API-Key";
  }

  async headers(
    _spec?: EndpointToolSpec,
    _caller?: CallerIdentity,
  ): Promise<Readonly<Record<string, string>>> {
    return { [this.header]: this.key };
  }
}
