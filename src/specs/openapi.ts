import { readFile } from "node:fs/promises";
import type { OpenAPIV3 } from "openapi-types";
import { SpecError } from "../errors.js";
import type { EndpointToolSpec, HttpMethod, JsonSchema } from "../types.js";
import type { SpecSource } from "./base.js";
import {
  readExtrasExtension,
  readScopeExtension,
  readTagsExtension,
} from "./visibilityMeta.js";

export type OpenApiSpecInput =
  | { url: string }
  | { path: string }
  | { document: OpenAPIV3.Document };

export interface OpenApiSpecSourceOptions {
  readonly bodySchemaDepth?: number;
  readonly defaultVisibility?: "allow" | "deny";
  readonly fetchFn?: typeof fetch;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
type LowerMethod = (typeof HTTP_METHODS)[number];

export class OpenApiSpecSource implements SpecSource {
  private readonly bodySchemaDepth: number;
  readonly defaultVisibility: "allow" | "deny";
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly input: OpenApiSpecInput,
    options: OpenApiSpecSourceOptions = {},
  ) {
    this.bodySchemaDepth = options.bodySchemaDepth ?? 6;
    this.defaultVisibility = options.defaultVisibility ?? "allow";
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async load(): Promise<readonly EndpointToolSpec[]> {
    const doc = await this.loadDocument();
    return this.specsFromDocument(doc);
  }

  private async loadDocument(): Promise<OpenAPIV3.Document> {
    if ("document" in this.input) return this.input.document;
    if ("path" in this.input) {
      const raw = await readFile(this.input.path, "utf-8");
      return JSON.parse(raw) as OpenAPIV3.Document;
    }
    const res = await this.fetchFn(this.input.url);
    if (!res.ok) {
      throw new SpecError(`Failed to fetch OpenAPI spec from ${this.input.url}: ${res.status}`);
    }
    return (await res.json()) as OpenAPIV3.Document;
  }

  private specsFromDocument(doc: OpenAPIV3.Document): EndpointToolSpec[] {
    if (!doc.paths) return [];
    const specs: EndpointToolSpec[] = [];
    const seenNames = new Set<string>();
    const globalSecurity = doc.security ?? [];
    const securitySchemes = (doc.components?.securitySchemes ?? {}) as Record<
      string,
      OpenAPIV3.SecuritySchemeObject
    >;

    for (const [pathTemplate, pathItem] of Object.entries(doc.paths)) {
      if (!pathItem) continue;
      for (const method of HTTP_METHODS) {
        const op = pathItem[method] as OpenAPIV3.OperationObject | undefined;
        if (!op) continue;
        const spec = this.specFromOperation({
          pathTemplate,
          method,
          op,
          pathParameters: (pathItem.parameters ?? []) as readonly OpenAPIV3.ParameterObject[],
          globalSecurity,
          securitySchemes,
          seenNames,
        });
        specs.push(spec);
      }
    }
    return specs;
  }

  private specFromOperation(args: {
    pathTemplate: string;
    method: LowerMethod;
    op: OpenAPIV3.OperationObject;
    pathParameters: readonly OpenAPIV3.ParameterObject[];
    globalSecurity: readonly OpenAPIV3.SecurityRequirementObject[];
    securitySchemes: Record<string, OpenAPIV3.SecuritySchemeObject>;
    seenNames: Set<string>;
  }): EndpointToolSpec {
    const { pathTemplate, method, op } = args;
    const name = this.uniqueName(args.seenNames, pathTemplate, method, op);
    const description = buildDescription(op);
    const parameters = mergeParameters(args.pathParameters, op.parameters);
    const inputSchema = buildInputSchema(parameters, op.requestBody, this.bodySchemaDepth);
    const requiredScopes = resolveScopes(
      op.security ?? args.globalSecurity,
      args.securitySchemes,
      op,
    );
    const tags = [
      ...(op.tags ?? []),
      ...readTagsExtension(op as unknown as Record<string, unknown>),
    ];
    const extras = readExtrasExtension(op as unknown as Record<string, unknown>);

    return {
      name,
      description,
      method: method.toUpperCase() as HttpMethod,
      pathTemplate,
      inputSchema,
      requiredScopes,
      tags,
      extras,
    };
  }

  private uniqueName(
    seen: Set<string>,
    pathTemplate: string,
    method: LowerMethod,
    op: OpenAPIV3.OperationObject,
  ): string {
    const base = op.operationId ?? deriveName(method, pathTemplate);
    let name = base;
    let n = 2;
    while (seen.has(name)) {
      name = `${base}_${n++}`;
    }
    seen.add(name);
    return name;
  }
}

function buildDescription(op: OpenAPIV3.OperationObject): string {
  const summary = op.summary?.trim();
  const description = op.description?.trim();
  if (summary && description) return `${summary}\n\n${description}`;
  return summary ?? description ?? "(no description)";
}

function deriveName(method: LowerMethod, pathTemplate: string): string {
  const cleaned = pathTemplate
    .replace(/^\/+/, "")
    .replace(/\{([^}]+)\}/g, "by_$1")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${method}_${cleaned || "root"}`;
}

function mergeParameters(
  pathLevel: readonly OpenAPIV3.ParameterObject[],
  opLevel: readonly (OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject)[] | undefined,
): readonly OpenAPIV3.ParameterObject[] {
  const opParams = (opLevel ?? []).filter(
    (p): p is OpenAPIV3.ParameterObject => !("$ref" in p),
  );
  const seen = new Set<string>(opParams.map((p) => `${p.in}:${p.name}`));
  const pathOnly = pathLevel.filter((p) => !seen.has(`${p.in}:${p.name}`));
  return [...opParams, ...pathOnly];
}

function buildInputSchema(
  parameters: readonly OpenAPIV3.ParameterObject[],
  requestBody: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject | undefined,
  bodySchemaDepth: number,
): JsonSchema {
  const props: Record<string, unknown> = {};
  const required: string[] = [];

  const buckets = { path: {}, query: {}, header: {} } as {
    path: Record<string, unknown>;
    query: Record<string, unknown>;
    header: Record<string, unknown>;
  };
  const requiredBuckets = { path: [] as string[], query: [] as string[], header: [] as string[] };

  for (const p of parameters) {
    const where = p.in === "cookie" ? null : (p.in as "path" | "query" | "header");
    if (!where) continue;
    const schema = pruneSchema(p.schema as JsonSchema | undefined, bodySchemaDepth);
    const entry: Record<string, unknown> = { ...(schema ?? { type: "string" }) };
    if (p.description) entry["description"] = p.description;
    buckets[where][p.name] = entry;
    if (p.required) requiredBuckets[where].push(p.name);
  }

  for (const k of ["path", "query", "header"] as const) {
    const keys = Object.keys(buckets[k]);
    if (keys.length === 0) continue;
    const subSchema: Record<string, unknown> = {
      type: "object",
      properties: buckets[k],
      additionalProperties: false,
    };
    if (requiredBuckets[k].length > 0) subSchema["required"] = requiredBuckets[k];
    props[k] = subSchema;
    if (requiredBuckets[k].length > 0) required.push(k);
  }

  if (requestBody && !("$ref" in requestBody)) {
    const jsonContent = requestBody.content?.["application/json"];
    if (jsonContent?.schema) {
      props["body"] = pruneSchema(jsonContent.schema as JsonSchema, bodySchemaDepth) ?? {};
      if (requestBody.required) required.push("body");
    }
  }

  const schema: Record<string, unknown> = {
    type: "object",
    properties: props,
    additionalProperties: false,
  };
  if (required.length > 0) schema["required"] = required;
  return schema;
}

function pruneSchema(schema: JsonSchema | undefined, depth: number): JsonSchema | undefined {
  if (!schema) return undefined;
  if (depth <= 0) return { type: "object", description: "(truncated by bodySchemaDepth)" };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (v == null) continue;
    if (k === "properties" && typeof v === "object") {
      const pruned: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        pruned[pk] = pruneSchema(pv as JsonSchema, depth - 1) ?? {};
      }
      out[k] = pruned;
    } else if (k === "items" && typeof v === "object") {
      out[k] = pruneSchema(v as JsonSchema, depth - 1) ?? {};
    } else if ((k === "oneOf" || k === "anyOf" || k === "allOf") && Array.isArray(v)) {
      out[k] = (v as JsonSchema[]).map((s) => pruneSchema(s, depth - 1) ?? {});
    } else {
      out[k] = v;
    }
  }
  return out;
}

function resolveScopes(
  security: readonly OpenAPIV3.SecurityRequirementObject[],
  schemes: Record<string, OpenAPIV3.SecuritySchemeObject>,
  op: OpenAPIV3.OperationObject,
): string[] {
  const scopes = new Set<string>();
  for (const req of security) {
    for (const [schemeName, scopeList] of Object.entries(req)) {
      const scheme = schemes[schemeName];
      if (!scheme) continue;
      if (scheme.type === "oauth2" || scheme.type === "openIdConnect") {
        for (const s of scopeList) scopes.add(s);
      }
    }
  }
  for (const s of readScopeExtension(op as unknown as Record<string, unknown>)) {
    scopes.add(s);
  }
  return [...scopes];
}
