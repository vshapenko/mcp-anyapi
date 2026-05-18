import { describe, expect, it } from "vitest";
import {
  ApiKeyHeaderAuth,
  CallbackAuth,
  NoAuth,
  StaticBearerAuth,
} from "../../../src/auth/index.js";
import type { EndpointToolSpec } from "../../../src/types.js";

const SPEC: EndpointToolSpec = {
  name: "x",
  description: "x",
  method: "GET",
  pathTemplate: "/x",
  inputSchema: {},
};

describe("NoAuth", () => {
  it("returns empty headers", async () => {
    const auth = new NoAuth();
    expect(await auth.headers(SPEC, { subject: "u" })).toEqual({});
  });
});

describe("StaticBearerAuth", () => {
  it("returns Authorization Bearer header", async () => {
    const auth = new StaticBearerAuth({ token: "abc" });
    expect(await auth.headers(SPEC, { subject: "u" })).toEqual({ Authorization: "Bearer abc" });
  });

  it("uses caller's bearerToken when supplied", async () => {
    const auth = new StaticBearerAuth({ token: "fallback" });
    const headers = await auth.headers(SPEC, { subject: "u", bearerToken: "caller-tok" });
    expect(headers).toEqual({ Authorization: "Bearer caller-tok" });
  });

  it("supports custom header and scheme", async () => {
    const auth = new StaticBearerAuth({ token: "abc", header: "X-Custom", scheme: "Token" });
    expect(await auth.headers(SPEC, { subject: "u" })).toEqual({ "X-Custom": "Token abc" });
  });
});

describe("ApiKeyHeaderAuth", () => {
  it("uses default X-API-Key header", async () => {
    const auth = new ApiKeyHeaderAuth({ key: "secret" });
    expect(await auth.headers(SPEC, { subject: "u" })).toEqual({ "X-API-Key": "secret" });
  });

  it("respects custom header name", async () => {
    const auth = new ApiKeyHeaderAuth({ key: "secret", header: "X-My-Key" });
    expect(await auth.headers(SPEC, { subject: "u" })).toEqual({ "X-My-Key": "secret" });
  });
});

describe("CallbackAuth", () => {
  it("invokes mintHeaders with spec and caller", async () => {
    let seenSubject = "";
    const auth = new CallbackAuth({
      mintHeaders: async (_spec, caller) => {
        seenSubject = caller.subject;
        return { "X-Caller": caller.subject };
      },
    });
    const headers = await auth.headers(SPEC, { subject: "alice" });
    expect(seenSubject).toBe("alice");
    expect(headers).toEqual({ "X-Caller": "alice" });
  });

  it("supports synchronous mintHeaders", async () => {
    const auth = new CallbackAuth({ mintHeaders: () => ({ "X-Static": "v" }) });
    expect(await auth.headers(SPEC, { subject: "u" })).toEqual({ "X-Static": "v" });
  });
});
