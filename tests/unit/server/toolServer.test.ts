import { describe, expect, it } from "vitest";
import { NoAuth } from "../../../src/auth/index.js";
import { PolicyError } from "../../../src/errors.js";
import { StaticSpecSource } from "../../../src/specs/index.js";
import { ToolCatalogBuilder } from "../../../src/server/toolCatalog.js";
import { ToolServer } from "../../../src/server/toolServer.js";
import type { Transport } from "../../../src/transport/index.js";
import type { EndpointToolSpec, ToolResult } from "../../../src/types.js";
import { AllowAllFilter, DenyMutatingFilter } from "../../../src/visibility/index.js";

const SPEC_GET: EndpointToolSpec = {
  name: "getThing",
  description: "x",
  method: "GET",
  pathTemplate: "/things/{id}",
  inputSchema: { type: "object" },
};
const SPEC_POST: EndpointToolSpec = {
  name: "createThing",
  description: "x",
  method: "POST",
  pathTemplate: "/things",
  inputSchema: { type: "object" },
};

class FakeTransport implements Transport {
  calls: Array<{ spec: EndpointToolSpec; invocation: unknown }> = [];
  async call(spec: EndpointToolSpec, invocation: unknown): Promise<ToolResult> {
    this.calls.push({ spec, invocation });
    return { status: 200, ok: true, body: { ran: spec.name }, headers: {} };
  }
}

function buildServer(visibility = new AllowAllFilter()): {
  server: ToolServer;
  transport: FakeTransport;
} {
  const transport = new FakeTransport();
  const catalog = new ToolCatalogBuilder({
    specSources: [new StaticSpecSource([SPEC_GET, SPEC_POST])],
    visibility,
  });
  const server = new ToolServer({ catalog, transport, auth: new NoAuth() });
  return { server, transport };
}

describe("ToolServer", () => {
  it("lists tools visible to the caller", async () => {
    const { server } = buildServer();
    const tools = await server.listTools({ subject: "u" });
    expect(tools.map((t) => t.name).sort()).toEqual(["createThing", "getThing"]);
  });

  it("filters out tools blocked by visibility", async () => {
    const { server } = buildServer(new DenyMutatingFilter());
    const tools = await server.listTools({ subject: "u" });
    expect(tools.map((t) => t.name)).toEqual(["getThing"]);
  });

  it("dispatches a visible tool through the transport", async () => {
    const { server, transport } = buildServer();
    const result = await server.callTool(
      "getThing",
      { path: { id: "42" } },
      { subject: "u" },
    );
    expect(result.body).toEqual({ ran: "getThing" });
    expect(transport.calls[0]?.spec.name).toBe("getThing");
  });

  it("refuses to dispatch a tool that isn't visible to the caller", async () => {
    const { server } = buildServer(new DenyMutatingFilter());
    await expect(
      server.callTool("createThing", {}, { subject: "u" }),
    ).rejects.toThrow(PolicyError);
  });

  it("dispatches extra tools with their custom handler", async () => {
    const transport = new FakeTransport();
    const catalog = new ToolCatalogBuilder({
      specSources: [new StaticSpecSource([])],
      visibility: new AllowAllFilter(),
    });
    let handlerCalls = 0;
    const server = new ToolServer({
      catalog,
      transport,
      auth: new NoAuth(),
      extraTools: [
        {
          spec: {
            name: "custom",
            description: "x",
            method: "GET",
            pathTemplate: "/n/a",
            inputSchema: { type: "object" },
          },
          handler: () => {
            handlerCalls += 1;
            return { status: 200, ok: true, body: { custom: true }, headers: {} };
          },
        },
      ],
    });
    const result = await server.callTool("custom", {}, { subject: "u" });
    expect(handlerCalls).toBe(1);
    expect(result.body).toEqual({ custom: true });
  });
});
