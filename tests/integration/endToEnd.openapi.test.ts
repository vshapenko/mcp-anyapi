import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { AllowAllFilter } from "../../src/visibility/index.js";
import { Agent } from "../../src/agent/index.js";
import { NoAuth } from "../../src/auth/index.js";
import { buildServer } from "../../src/server/index.js";
import { OpenApiSpecSource } from "../../src/specs/index.js";
import { FetchTransport } from "../../src/transport/index.js";
import { NoopMasker } from "../../src/masking/index.js";
import type { CompleteArgs, LlmClient } from "../../src/llm/index.js";
import type { AssistantMessage } from "../../src/types.js";

class ScriptedLlm implements LlmClient {
  capturedToolsSeen: Array<string[]> = [];
  capturedToolMessages: Array<string | null | undefined> = [];
  private calls = 0;
  constructor(private readonly script: AssistantMessage[]) {}
  async complete(args: CompleteArgs): Promise<AssistantMessage> {
    this.capturedToolsSeen.push((args.tools ?? []).map((t) => t.name));
    for (const m of args.messages) {
      if (m.role === "tool") this.capturedToolMessages.push(m.content);
    }
    const next = this.script[this.calls++];
    if (!next) throw new Error("script exhausted");
    return next;
  }
}

describe("end-to-end: spec → server → agent → fixture API", () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    app = Fastify();
    app.get("/pets", async (req): Promise<Array<{ id: number; name: string }>> => {
      const limit = Number((req.query as { limit?: string }).limit ?? "1");
      return Array.from({ length: limit }, (_, i) => ({ id: i + 1, name: `pet${i + 1}` }));
    });
    await app.listen({ port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("dispatches a GET tool against the live fixture and returns final text", async () => {
    const server = await buildServer({
      specSource: new OpenApiSpecSource({
        document: {
          openapi: "3.0.0",
          info: { title: "x", version: "1" },
          paths: {
            "/pets": {
              get: {
                operationId: "listPets",
                summary: "List pets",
                parameters: [
                  { name: "limit", in: "query", schema: { type: "integer" } },
                ],
                responses: { "200": { description: "ok" } },
              },
            },
          },
        },
      }),
      transport: new FetchTransport({ baseUrl }),
      auth: new NoAuth(),
      visibility: new AllowAllFilter(),
      masker: new NoopMasker(),
    });

    const llm = new ScriptedLlm([
      {
        content: null,
        toolCalls: [
          {
            id: "c1",
            name: "listPets",
            arguments: { query: { limit: 2 } },
          },
        ],
      },
      { content: "Found 2 pets.", toolCalls: [] },
    ]);

    const agent = new Agent({
      llm,
      server,
      masker: server.masker,
      systemPrompt: "use tools",
    });
    const result = await agent.run({ question: "list pets", caller: { subject: "u" } });
    expect(result.finalText).toBe("Found 2 pets.");
    expect(result.toolCalls).toHaveLength(1);
    // The recorded tool response (visible in the second LLM call) should
    // contain both pets fetched from the fixture API.
    const toolResponseSeen = llm.capturedToolMessages.find((m) => m && m.includes("pet1"));
    expect(toolResponseSeen).toBeTruthy();
    expect(toolResponseSeen).toContain("pet2");
  });
});
