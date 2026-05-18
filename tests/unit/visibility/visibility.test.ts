import { describe, expect, it } from "vitest";
import {
  AllowAllFilter,
  applyFilter,
  CompositeFilter,
  DenyMutatingFilter,
  ScopeFilter,
  TagFilter,
} from "../../../src/visibility/index.js";
import type { EndpointToolSpec } from "../../../src/types.js";

function spec(overrides: Partial<EndpointToolSpec> & { name: string }): EndpointToolSpec {
  return {
    description: "x",
    method: "GET",
    pathTemplate: "/x",
    inputSchema: {},
    ...overrides,
  };
}

describe("AllowAllFilter", () => {
  it("allows every spec", () => {
    const f = new AllowAllFilter();
    expect(f.allow()).toBe(true);
  });
});

describe("DenyMutatingFilter", () => {
  it("allows safe methods", () => {
    const f = new DenyMutatingFilter();
    for (const method of ["GET", "HEAD", "OPTIONS"] as const) {
      expect(f.allow(spec({ name: "x", method }))).toBe(true);
    }
  });
  it("blocks mutating methods", () => {
    const f = new DenyMutatingFilter();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      expect(f.allow(spec({ name: "x", method }))).toBe(false);
    }
  });
});

describe("TagFilter", () => {
  it("any-mode allows when at least one tag matches", () => {
    const f = new TagFilter({ allowed: ["admin", "read"] });
    expect(f.allow(spec({ name: "x", tags: ["read"] }))).toBe(true);
    expect(f.allow(spec({ name: "x", tags: ["write"] }))).toBe(false);
  });
  it("all-mode requires every tag to match", () => {
    const f = new TagFilter({ allowed: ["admin", "read"], mode: "all" });
    expect(f.allow(spec({ name: "x", tags: ["admin", "read"] }))).toBe(true);
    expect(f.allow(spec({ name: "x", tags: ["admin"] }))).toBe(false);
  });
  it("untagged specs follow defaultVisibility (default deny)", () => {
    const denyDefault = new TagFilter({ allowed: ["admin"] });
    expect(denyDefault.allow(spec({ name: "x" }))).toBe(false);
    const allowDefault = new TagFilter({ allowed: ["admin"], defaultVisibility: "allow" });
    expect(allowDefault.allow(spec({ name: "x" }))).toBe(true);
  });
});

describe("ScopeFilter", () => {
  it("allows when caller has all required scopes (array claim)", () => {
    const f = new ScopeFilter();
    const s = spec({ name: "x", requiredScopes: ["read:pets"] });
    expect(f.allow(s, { subject: "u", claims: { scopes: ["read:pets"] } })).toBe(true);
    expect(f.allow(s, { subject: "u", claims: { scopes: ["other"] } })).toBe(false);
  });
  it("parses space-separated string claims", () => {
    const f = new ScopeFilter();
    const s = spec({ name: "x", requiredScopes: ["a", "b"] });
    expect(f.allow(s, { subject: "u", claims: { scopes: "a b" } })).toBe(true);
    expect(f.allow(s, { subject: "u", claims: { scopes: "a" } })).toBe(false);
  });
  it("supports custom matchClaim", () => {
    const f = new ScopeFilter({ matchClaim: "permissions" });
    const s = spec({ name: "x", requiredScopes: ["x"] });
    expect(f.allow(s, { subject: "u", claims: { permissions: ["x"] } })).toBe(true);
  });
  it("falls back to defaultVisibility for specs without requiredScopes", () => {
    const deny = new ScopeFilter();
    expect(deny.allow(spec({ name: "x" }), { subject: "u" })).toBe(false);
    const allow = new ScopeFilter({ defaultVisibility: "allow" });
    expect(allow.allow(spec({ name: "x" }), { subject: "u" })).toBe(true);
  });
});

describe("CompositeFilter", () => {
  it("requires every sub-filter to allow", () => {
    const f = new CompositeFilter([new AllowAllFilter(), new DenyMutatingFilter()]);
    expect(f.allow(spec({ name: "x", method: "GET" }), { subject: "u" })).toBe(true);
    expect(f.allow(spec({ name: "x", method: "POST" }), { subject: "u" })).toBe(false);
  });
});

describe("applyFilter", () => {
  it("uses bulk filter override when defined", async () => {
    const calls: string[] = [];
    const filter = {
      allow: () => true,
      filter: async (specs: readonly EndpointToolSpec[]) => {
        calls.push("bulk");
        return specs.slice(0, 1);
      },
    };
    const specs = [spec({ name: "a" }), spec({ name: "b" })];
    const out = await applyFilter(filter, specs, { subject: "u" });
    expect(out).toHaveLength(1);
    expect(calls).toContain("bulk");
  });
  it("falls back to per-spec allow when no bulk filter", async () => {
    const filter = { allow: (s: EndpointToolSpec) => s.name === "a" };
    const out = await applyFilter(filter, [spec({ name: "a" }), spec({ name: "b" })], {
      subject: "u",
    });
    expect(out.map((s) => s.name)).toEqual(["a"]);
  });
});
