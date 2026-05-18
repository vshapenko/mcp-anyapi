import { describe, expect, it } from "vitest";
import { walkJson } from "../../../src/masking/walker.js";

describe("walkJson", () => {
  it("passes primitives through unchanged", () => {
    expect(walkJson(42, {})).toBe(42);
    expect(walkJson(null, {})).toBe(null);
    expect(walkJson(true, {})).toBe(true);
  });

  it("applies visitString to string leaves", () => {
    const out = walkJson({ a: "hello" }, { visitString: (s) => s.toUpperCase() });
    expect(out).toEqual({ a: "HELLO" });
  });

  it("walks nested arrays and objects", () => {
    const out = walkJson(
      { rows: [{ name: "ann" }, { name: "bob" }] },
      { visitString: (s) => `<${s}>` },
    );
    expect(out).toEqual({ rows: [{ name: "<ann>" }, { name: "<bob>" }] });
  });

  it("visitField may handle a field and skip the recursive walk", () => {
    const out = walkJson(
      { name: "ann", note: "hi" },
      {
        visitField: (_value, key) =>
          key === "name" ? { handled: true, replacement: "<masked>" } : { handled: false },
        visitString: (s) => s.toUpperCase(),
      },
    );
    expect(out).toEqual({ name: "<masked>", note: "HI" });
  });

  it("passes parent key into visitString", () => {
    const seen: Array<string | undefined> = [];
    walkJson({ a: "x", b: { c: "y" } }, { visitString: (s, key) => (seen.push(key), s) });
    expect(seen).toContain("a");
    expect(seen).toContain("c");
  });
});
