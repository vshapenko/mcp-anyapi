import { describe, expect, it } from "vitest";
import {
  readExtrasExtension,
  readScopeExtension,
  readTagsExtension,
} from "../../../src/specs/visibilityMeta.js";

describe("visibilityMeta", () => {
  it("readScopeExtension accepts a string", () => {
    expect(readScopeExtension({ "x-mcp-required-scope": "ADMIN.READ" })).toEqual(["ADMIN.READ"]);
  });

  it("readScopeExtension accepts an array of strings", () => {
    expect(readScopeExtension({ "x-mcp-required-scope": ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("readScopeExtension returns [] for missing or wrong type", () => {
    expect(readScopeExtension({})).toEqual([]);
    expect(readScopeExtension({ "x-mcp-required-scope": 42 })).toEqual([]);
  });

  it("readTagsExtension filters non-string array items", () => {
    expect(readTagsExtension({ "x-mcp-tags": ["a", 1, "b"] as unknown[] })).toEqual(["a", "b"]);
  });

  it("readExtrasExtension returns object when present", () => {
    expect(readExtrasExtension({ "x-mcp-extras": { perm: "X.Y" } })).toEqual({ perm: "X.Y" });
  });

  it("readExtrasExtension returns {} when missing or non-object", () => {
    expect(readExtrasExtension({})).toEqual({});
    expect(readExtrasExtension({ "x-mcp-extras": [1, 2] })).toEqual({});
  });
});
