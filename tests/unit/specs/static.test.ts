import { describe, expect, it } from "vitest";
import { StaticSpecSource } from "../../../src/specs/static.js";

describe("StaticSpecSource", () => {
  it("returns the passed-in specs verbatim", async () => {
    const specs = [
      {
        name: "tool1",
        description: "x",
        method: "GET" as const,
        pathTemplate: "/x",
        inputSchema: { type: "object" },
      },
    ];
    const source = new StaticSpecSource(specs);
    expect(await source.load()).toEqual(specs);
  });
});
