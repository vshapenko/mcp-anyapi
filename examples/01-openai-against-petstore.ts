/**
 * Example: drive the Petstore OpenAPI spec with an OpenAI tool-calling agent.
 *
 * Requires OPENAI_API_KEY to be set. Run with:
 *   pnpm tsx examples/01-openai-against-petstore.ts
 *
 * Note: the public Petstore demo at petstore3.swagger.io requires no auth,
 * so we use NoAuth.
 */

import {
  Agent,
  AllowAllFilter,
  FetchTransport,
  NoAuth,
  NoopMasker,
  OpenAiCompatClient,
  OpenApiSpecSource,
  buildServer,
} from "../src/index.js";

async function main(): Promise<void> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const server = await buildServer({
    specSource: new OpenApiSpecSource({
      url: "https://petstore3.swagger.io/api/v3/openapi.json",
    }),
    transport: new FetchTransport({ baseUrl: "https://petstore3.swagger.io/api/v3" }),
    auth: new NoAuth(),
    visibility: new AllowAllFilter(),
    masker: new NoopMasker(),
  });

  const agent = new Agent({
    llm: new OpenAiCompatClient({
      baseUrl: "https://api.openai.com/v1",
      apiKey,
      model: process.env["OPENAI_MODEL"] ?? "gpt-4o-mini",
    }),
    server,
    masker: server.masker,
    systemPrompt:
      "You are a helpful assistant that uses Petstore HTTP tools to answer questions about pets. " +
      "When the user asks about a pet, query the API and summarise the result briefly.",
  });

  const result = await agent.run({
    question: "Find any pet with status 'available' and tell me its name.",
    caller: { subject: "demo-user" },
  });

  console.log("FINAL:", result.finalText);
  console.log("Iterations:", result.iterations);
  console.log("Control flow:", result.controlFlow);
  console.log("Tool calls:", result.toolCalls.length);
}

void main();
