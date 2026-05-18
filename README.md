# mcp-anyapi

> A generic MCP (Model Context Protocol) server and LLM agent runtime for any
> HTTP API. OpenAPI-driven, with pluggable transport, auth, visibility
> filtering, and PII masking.

`mcp-anyapi` turns any OpenAPI-described HTTP API into an MCP server, drives
it with any tool-calling LLM, and offers configurable PII masking before
prompts leave your process. Everything is pluggable — transports, auth
providers, visibility filters, maskers, and LLM clients are all interfaces
with sensible built-ins.

## Quick start

```bash
pnpm add mcp-anyapi
```

```ts
import {
  buildServer,
  Agent,
  OpenApiSpecSource,
  FetchTransport,
  StaticBearerAuth,
  AllowAllFilter,
  ConfigMasker,
  MaskingProfile,
  OpenAiCompatClient,
} from "mcp-anyapi";

const server = await buildServer({
  specSource: new OpenApiSpecSource({
    url: "https://api.example.com/openapi.json",
  }),
  transport: new FetchTransport({ baseUrl: "https://api.example.com" }),
  auth: new StaticBearerAuth({ token: process.env.API_TOKEN! }),
  visibility: new AllowAllFilter(),
  masker: new ConfigMasker(await MaskingProfile.fromYaml("masking.yml")),
});

const agent = new Agent({
  llm: new OpenAiCompatClient({
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o-mini",
  }),
  server,
  masker: server.masker,
  systemPrompt: "You are an admin assistant. Use tools.",
});

const result = await agent.run({
  question: "How many orders shipped yesterday?",
  caller: { subject: "user-42" },
});

console.log(result.finalText);
```

## Concepts

| Layer | Interface | Built-ins |
|------|-----------|-----------|
| Spec source | `SpecSource` | `OpenApiSpecSource`, `StaticSpecSource` |
| Transport | `Transport` | `FetchTransport` |
| Auth | `AuthProvider` | `NoAuth`, `StaticBearerAuth`, `ApiKeyHeaderAuth`, `CallbackAuth` |
| Visibility | `VisibilityFilter` | `AllowAllFilter`, `DenyMutatingFilter`, `TagFilter`, `ScopeFilter`, `CompositeFilter` |
| Masking | `Masker` | `ConfigMasker` (YAML/JSON profile), `NoopMasker` |
| LLM | `LlmClient` | `OpenAiCompatClient`, `AnthropicClient` (peer dep) |

## Masking

Drive masking from a YAML/JSON profile:

```yaml
kinds: [NAME, PHONE, EMAIL]

columnRules:
  NAME: [name, last_name, first_name]
  PHONE: [phone, phone_number]
  EMAIL: [email]

regexRules:
  PHONE: '\+?\d{8,15}'
  EMAIL: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'

skipFields: [id, uuid, createdAt, updatedAt]
```

PII values are replaced with stable opaque tokens (`<NAME_1>`, `<PHONE_1>`,
…) before the LLM sees them; tokens are rehydrated to real values before
results reach the user or downstream tools. The bidirectional map is held
per-`ConfigMasker` instance — use one instance per agent turn.

For anything the config can't express, subclass `Masker` directly.

## Permission gates for arbitrary APIs

OpenAPI doesn't have a first-class "this route needs permission X.Y", so
`mcp-anyapi` provides a three-tier strategy:

1. **`security` (default-on)** — OAuth2/OpenID scope strings become
   `requiredScopes`; `ScopeFilter` matches them against
   `caller.claims.scopes`.
2. **`x-mcp-*` extensions (opt-in)** — `x-mcp-required-scope`,
   `x-mcp-tags`, `x-mcp-extras` on an operation.
3. **Custom `SpecSource`** — subclass to stash any metadata in
   `EndpointToolSpec.extras`; pair with a matching custom
   `VisibilityFilter`.

Set `defaultVisibility: "deny"` on `OpenApiSpecSource` (and built-in
filters) when working against APIs you don't fully trust.

## Status

v0.1.0 — initial release. Streaming responses, multi-source catalog name
collisions, and config-file CLI bootstrap are tracked for v0.2.

## License

MIT
