/**
 * Example: provide a custom SpecSource that fabricates endpoints from a
 * config object (instead of an OpenAPI document). Useful when you wrap a
 * non-OpenAPI HTTP API.
 */

import {
  Agent,
  AllowAllFilter,
  CallbackAuth,
  FetchTransport,
  OpenAiCompatClient,
  StaticSpecSource,
  buildServer,
  type EndpointToolSpec,
} from "../src/index.js";

const tools: EndpointToolSpec[] = [
  {
    name: "search",
    description: "Search the public DuckDuckGo Instant Answer API.",
    method: "GET",
    pathTemplate: "/",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "object",
          properties: {
            q: { type: "string" },
            format: { type: "string", const: "json" },
          },
          required: ["q", "format"],
          additionalProperties: false,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    tags: ["search"],
  },
];

async function main(): Promise<void> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const server = await buildServer({
    specSource: new StaticSpecSource(tools),
    transport: new FetchTransport({ baseUrl: "https://api.duckduckgo.com" }),
    auth: new CallbackAuth({
      mintHeaders: async (_spec, caller) => ({
        "X-Caller": caller.subject,
      }),
    }),
    visibility: new AllowAllFilter(),
  });

  const agent = new Agent({
    llm: new OpenAiCompatClient({
      baseUrl: "https://api.openai.com/v1",
      apiKey,
      model: process.env["OPENAI_MODEL"] ?? "gpt-4o-mini",
    }),
    server,
    masker: server.masker,
    systemPrompt: "Answer factual questions with the search tool.",
  });

  const result = await agent.run({
    question: "When was the Eiffel Tower completed?",
    caller: { subject: "demo" },
  });

  console.log(result.finalText);
}

void main();
