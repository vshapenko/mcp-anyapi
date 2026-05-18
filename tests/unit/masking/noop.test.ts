import { describe, expect, it } from "vitest";
import { NoopMasker } from "../../../src/masking/noop.js";

describe("NoopMasker", () => {
  it("passes messages through unchanged", () => {
    const m = new NoopMasker();
    const msgs = [{ role: "user" as const, content: "ahmed@x.com" }];
    expect(m.tokenizeMessages(msgs)).toBe(msgs);
  });
  it("passes objects through unchanged", () => {
    const m = new NoopMasker();
    const obj = { name: "Ahmed" };
    expect(m.tokenizeObject(obj)).toBe(obj);
  });
  it("rehydrate is a no-op", () => {
    expect(new NoopMasker().rehydrate("x")).toBe("x");
  });
  it("stats returns zeros", () => {
    expect(new NoopMasker().stats()).toEqual({ counts: {}, totalReplacements: 0 });
  });
});
