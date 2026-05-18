import { describe, expect, it } from "vitest";
import { StaticSpecSource } from "../../../src/specs/index.js";
import { ToolCatalogBuilder } from "../../../src/server/toolCatalog.js";
import type { EndpointToolSpec } from "../../../src/types.js";
import { AllowAllFilter } from "../../../src/visibility/index.js";

function spec(name: string): EndpointToolSpec {
  return {
    name,
    description: "x",
    method: "GET",
    pathTemplate: `/x/${name}`,
    inputSchema: { type: "object" },
  };
}

describe("ToolCatalogBuilder", () => {
  it("merges specs from multiple sources, dropping duplicate names", async () => {
    const c = new ToolCatalogBuilder({
      specSources: [
        new StaticSpecSource([spec("a"), spec("b")]),
        new StaticSpecSource([spec("b"), spec("c")]),
      ],
      visibility: new AllowAllFilter(),
    });
    const all = await c.load();
    expect(all.map((s) => s.name)).toEqual(["a", "b", "c"]);
  });

  it("caches the loaded catalog between calls", async () => {
    let loads = 0;
    const c = new ToolCatalogBuilder({
      specSources: [
        {
          async load(): Promise<readonly EndpointToolSpec[]> {
            loads += 1;
            return [spec("a")];
          },
        },
      ],
      visibility: new AllowAllFilter(),
    });
    await c.load();
    await c.load();
    expect(loads).toBe(1);
  });

  it("listForCaller applies the visibility filter", async () => {
    const c = new ToolCatalogBuilder({
      specSources: [new StaticSpecSource([spec("a"), spec("b")])],
      visibility: { allow: (s) => s.name === "a" },
    });
    const visible = await c.listForCaller({ subject: "u" });
    expect(visible.map((s) => s.name)).toEqual(["a"]);
  });
});
