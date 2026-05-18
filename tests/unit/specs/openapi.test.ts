import { describe, expect, it } from "vitest";
import type { OpenAPIV3 } from "openapi-types";
import { OpenApiSpecSource } from "../../../src/specs/openapi.js";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PETSTORE = resolve(__dirname, "../../fixtures/petstore.openapi.json");
const TINY = resolve(__dirname, "../../fixtures/tiny-fastapi.openapi.json");

describe("OpenApiSpecSource", () => {
  it("loads endpoints from a file", async () => {
    const source = new OpenApiSpecSource({ path: PETSTORE });
    const specs = await source.load();
    const names = specs.map((s) => s.name).sort();
    expect(names).toEqual(["createPet", "getPet", "listPets"]);
  });

  it("emits the correct HTTP method and path", async () => {
    const source = new OpenApiSpecSource({ path: PETSTORE });
    const specs = await source.load();
    const getPet = specs.find((s) => s.name === "getPet");
    expect(getPet?.method).toBe("GET");
    expect(getPet?.pathTemplate).toBe("/pets/{petId}");
  });

  it("derives required path parameters into the input schema", async () => {
    const source = new OpenApiSpecSource({ path: PETSTORE });
    const specs = await source.load();
    const getPet = specs.find((s) => s.name === "getPet");
    const schema = getPet?.inputSchema as { required?: string[]; properties: Record<string, unknown> };
    expect(schema.required).toContain("path");
    const pathSchema = schema.properties["path"] as { required?: string[] };
    expect(pathSchema.required).toContain("petId");
  });

  it("copies OAuth2 scopes from operation security into requiredScopes", async () => {
    const source = new OpenApiSpecSource({ path: PETSTORE });
    const specs = await source.load();
    const listPets = specs.find((s) => s.name === "listPets");
    expect(listPets?.requiredScopes).toContain("read:pets");
    const createPet = specs.find((s) => s.name === "createPet");
    expect(createPet?.requiredScopes).toContain("write:pets");
  });

  it("honours x-mcp-required-scope extension", async () => {
    const source = new OpenApiSpecSource({ path: TINY });
    const specs = await source.load();
    const update = specs.find((s) => s.name === "update_user");
    expect(update?.requiredScopes).toContain("USER_DIRECTORY.UPDATE");
  });

  it("honours x-mcp-tags extension", async () => {
    const source = new OpenApiSpecSource({ path: PETSTORE });
    const specs = await source.load();
    const createPet = specs.find((s) => s.name === "createPet");
    expect(createPet?.tags).toContain("mutation");
  });

  it("includes request body schema for POST operations", async () => {
    const source = new OpenApiSpecSource({ path: PETSTORE });
    const specs = await source.load();
    const createPet = specs.find((s) => s.name === "createPet");
    const schema = createPet?.inputSchema as {
      properties: Record<string, { properties?: Record<string, unknown> }>;
    };
    expect(schema.properties["body"]).toBeDefined();
    expect(schema.properties["body"]?.properties).toHaveProperty("name");
  });

  it("falls back to derived names when operationId is absent", async () => {
    const source = new OpenApiSpecSource({
      document: {
        openapi: "3.0.0",
        info: { title: "x", version: "1" },
        paths: {
          "/foo/bar": {
            get: {
              responses: { "200": { description: "ok" } },
            },
          },
        },
      } as unknown as OpenAPIV3.Document,
    });
    const specs = await source.load();
    expect(specs[0]?.name).toBe("get_foo_bar");
  });

  it("loads from a URL via fetchFn", async () => {
    const mockFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          openapi: "3.0.0",
          info: { title: "x", version: "1" },
          paths: {
            "/x": {
              get: { operationId: "doX", responses: { "200": { description: "ok" } } },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ) as Response;
    const source = new OpenApiSpecSource(
      { url: "https://fake/spec.json" },
      { fetchFn: mockFetch as typeof fetch },
    );
    const specs = await source.load();
    expect(specs[0]?.name).toBe("doX");
  });

  it("throws SpecError when the URL fetch fails", async () => {
    const mockFetch = async (): Promise<Response> => new Response("nope", { status: 500 });
    const source = new OpenApiSpecSource(
      { url: "https://fake/spec.json" },
      { fetchFn: mockFetch as typeof fetch },
    );
    await expect(source.load()).rejects.toThrow(/Failed to fetch OpenAPI spec/);
  });

  it("respects bodySchemaDepth pruning", async () => {
    const deepDoc = {
      openapi: "3.0.0",
      info: { title: "x", version: "1" },
      paths: {
        "/x": {
          post: {
            operationId: "deep",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      a: {
                        type: "object",
                        properties: {
                          b: { type: "object", properties: { c: { type: "string" } } },
                        },
                      },
                    },
                  },
                },
              },
            },
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };
    const source = new OpenApiSpecSource(
      { document: deepDoc as unknown as OpenAPIV3.Document },
      { bodySchemaDepth: 2 },
    );
    const specs = await source.load();
    const deep = specs[0]!;
    const schema = deep.inputSchema as { properties: Record<string, unknown> };
    expect(JSON.stringify(schema)).toContain("truncated by bodySchemaDepth");
  });
});
