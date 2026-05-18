import { describe, expect, it } from "vitest";
import { TransportError } from "../../../src/errors.js";
import { renderPath, renderQuery } from "../../../src/transport/pathRender.js";

describe("renderPath", () => {
  it("substitutes a single placeholder", () => {
    expect(renderPath("/pets/{petId}", { petId: "42" })).toBe("/pets/42");
  });

  it("URL-encodes path values", () => {
    expect(renderPath("/items/{name}", { name: "hello world/&?" })).toBe(
      "/items/hello%20world%2F%26%3F",
    );
  });

  it("supports numeric params", () => {
    expect(renderPath("/items/{n}", { n: 7 })).toBe("/items/7");
  });

  it("throws TransportError on missing param", () => {
    expect(() => renderPath("/items/{n}", {})).toThrow(TransportError);
  });

  it("returns templates without placeholders unchanged", () => {
    expect(renderPath("/x/y")).toBe("/x/y");
  });
});

describe("renderQuery", () => {
  it("renders simple key=value pairs", () => {
    expect(renderQuery({ a: "1", b: "two" })).toBe("?a=1&b=two");
  });

  it("URL-encodes both keys and values", () => {
    expect(renderQuery({ "a b": "c d" })).toBe("?a%20b=c%20d");
  });

  it("supports arrays as repeated keys", () => {
    expect(renderQuery({ tag: ["a", "b"] })).toBe("?tag=a&tag=b");
  });

  it("returns '' for empty query object", () => {
    expect(renderQuery({})).toBe("");
  });

  it("coerces booleans and numbers", () => {
    expect(renderQuery({ active: true, n: 3 })).toBe("?active=true&n=3");
  });

  it("skips null/undefined values", () => {
    expect(renderQuery({ a: "1", b: undefined as unknown as string })).toBe("?a=1");
  });
});
