import { describe, expect, it } from "vitest";
import { FetchTransport } from "../../../src/transport/fetch.js";
import type { EndpointToolSpec } from "../../../src/types.js";

const SPEC: EndpointToolSpec = {
  name: "getThing",
  description: "x",
  method: "GET",
  pathTemplate: "/things/{id}",
  inputSchema: { type: "object" },
};

describe("FetchTransport", () => {
  it("renders path + query and forwards headers", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    const transport = new FetchTransport({
      baseUrl: "https://api.example.com/",
      fetchFn: (async (url, init) => {
        captured = { url: String(url), init: init as RequestInit };
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    const result = await transport.call(
      SPEC,
      { path: { id: "42" }, query: { v: "2" } },
      { Authorization: "Bearer abc" },
    );
    expect(captured.url).toBe("https://api.example.com/things/42?v=2");
    expect((captured.init as RequestInit).method).toBe("GET");
    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ ok: true });
  });

  it("strips trailing slashes from baseUrl", async () => {
    let captured = "";
    const transport = new FetchTransport({
      baseUrl: "https://api.example.com///",
      fetchFn: (async (url) => {
        captured = String(url);
        return new Response("", { status: 200 });
      }) as typeof fetch,
    });
    await transport.call({ ...SPEC, pathTemplate: "/x" }, {}, {});
    expect(captured).toBe("https://api.example.com/x");
  });

  it("serializes JSON body and sets content-type for POST", async () => {
    let captured: { init?: RequestInit } = {};
    const transport = new FetchTransport({
      baseUrl: "https://api.example.com",
      fetchFn: (async (_url, init) => {
        captured = { init: init as RequestInit };
        return new Response(JSON.stringify({ id: 7 }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    const result = await transport.call(
      { ...SPEC, method: "POST", pathTemplate: "/things" },
      { body: { hello: "world" } },
      {},
    );
    const init = captured.init!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ hello: "world" });
    const headers = new Headers(init.headers as Record<string, string>);
    expect(headers.get("content-type")).toBe("application/json");
    expect(result.body).toEqual({ id: 7 });
  });

  it("returns ok=false for non-2xx with body data", async () => {
    const transport = new FetchTransport({
      baseUrl: "https://api.example.com",
      fetchFn: (async () =>
        new Response(JSON.stringify({ error: "nope" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
    });
    const result = await transport.call(SPEC, { path: { id: "1" } }, {});
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "nope" });
  });

  it("returns raw text when content-type is not JSON", async () => {
    const transport = new FetchTransport({
      baseUrl: "https://api.example.com",
      fetchFn: (async () =>
        new Response("plain text", {
          status: 200,
          headers: { "content-type": "text/plain" },
        })) as typeof fetch,
    });
    const result = await transport.call(SPEC, { path: { id: "1" } }, {});
    expect(result.body).toBe("plain text");
  });

  it("does not send a body for GET requests", async () => {
    let capturedBody: string | null | undefined;
    const transport = new FetchTransport({
      baseUrl: "https://api.example.com",
      fetchFn: (async (_url, init) => {
        capturedBody = (init as RequestInit).body as string | null | undefined;
        return new Response("", { status: 200 });
      }) as typeof fetch,
    });
    await transport.call(SPEC, { path: { id: "1" }, body: { ignored: true } }, {});
    expect(capturedBody).toBeUndefined();
  });

  it("throws TransportError on network failure", async () => {
    const transport = new FetchTransport({
      baseUrl: "https://api.example.com",
      fetchFn: (async () => {
        throw new Error("connection refused");
      }) as typeof fetch,
    });
    await expect(transport.call(SPEC, { path: { id: "1" } }, {})).rejects.toThrow(/HTTP request/);
  });
});
