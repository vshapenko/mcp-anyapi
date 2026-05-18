import { TransportError } from "../errors.js";
import type { EndpointToolSpec, ToolInvocation, ToolResult } from "../types.js";
import type { Transport } from "./base.js";
import { renderPath, renderQuery } from "./pathRender.js";

export interface FetchTransportOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetchFn?: typeof fetch;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
}

export class FetchTransport implements Transport {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly defaultHeaders: Readonly<Record<string, string>>;

  constructor(opts: FetchTransportOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.defaultHeaders = opts.defaultHeaders ?? {};
  }

  async call(
    spec: EndpointToolSpec,
    invocation: ToolInvocation,
    authHeaders: Readonly<Record<string, string>>,
  ): Promise<ToolResult> {
    const url =
      this.baseUrl + renderPath(spec.pathTemplate, invocation.path) + renderQuery(invocation.query);
    const headers = new Headers();
    for (const [k, v] of Object.entries(this.defaultHeaders)) headers.set(k, v);
    for (const [k, v] of Object.entries(authHeaders)) headers.set(k, v);
    for (const [k, v] of Object.entries(invocation.headers ?? {})) headers.set(k, v);

    let body: string | undefined;
    if (invocation.body !== undefined && spec.method !== "GET" && spec.method !== "HEAD") {
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
      body = typeof invocation.body === "string" ? invocation.body : JSON.stringify(invocation.body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: spec.method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      throw new TransportError(`HTTP request failed for ${spec.method} ${url}`, { cause: err });
    } finally {
      clearTimeout(timer);
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const text = await response.text();
    const parsedBody = parseBody(text, response.headers.get("content-type"));

    return {
      status: response.status,
      ok: response.ok,
      body: parsedBody,
      headers: responseHeaders,
    };
  }
}

function parseBody(text: string, contentType: string | null): unknown {
  if (text.length === 0) return null;
  if (contentType && contentType.toLowerCase().includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}
