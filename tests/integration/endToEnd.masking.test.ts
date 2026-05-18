import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { AllowAllFilter } from "../../src/visibility/index.js";
import { Agent } from "../../src/agent/index.js";
import { NoAuth } from "../../src/auth/index.js";
import { buildServer } from "../../src/server/index.js";
import { OpenApiSpecSource } from "../../src/specs/index.js";
import { FetchTransport } from "../../src/transport/index.js";
import { ConfigMasker, MaskingProfile } from "../../src/masking/index.js";
import type { CompleteArgs, LlmClient } from "../../src/llm/index.js";
import type { AssistantMessage, ChatMessage } from "../../src/types.js";

class RecordingLlm implements LlmClient {
  observedMessages: ChatMessage[][] = [];
  private calls = 0;
  constructor(private readonly script: AssistantMessage[]) {}
  async complete(args: CompleteArgs): Promise<AssistantMessage> {
    this.observedMessages.push([...args.messages]);
    const next = this.script[this.calls++];
    if (!next) throw new Error("script exhausted");
    return next;
  }
}

describe("end-to-end: PII masking round trip", () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    app = Fastify();
    app.get("/users", async () => [
      { id: "uuid-1", name: "Ahmed Mohamed", email: "ahmed@example.com" },
    ]);
    await app.listen({ port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("never lets raw PII appear in any prompt sent to the LLM", async () => {
    const profile = MaskingProfile.fromObject({
      kinds: ["NAME", "EMAIL"],
      columnRules: { NAME: ["name"], EMAIL: ["email"] },
      regexRules: {
        EMAIL: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
      },
      skipFields: ["id"],
    });
    const masker = new ConfigMasker(profile);

    const server = await buildServer({
      specSource: new OpenApiSpecSource({
        document: {
          openapi: "3.0.0",
          info: { title: "x", version: "1" },
          paths: {
            "/users": {
              get: {
                operationId: "listUsers",
                responses: { "200": { description: "ok" } },
              },
            },
          },
        },
      }),
      transport: new FetchTransport({ baseUrl }),
      auth: new NoAuth(),
      visibility: new AllowAllFilter(),
      masker,
    });

    const llm = new RecordingLlm([
      { content: null, toolCalls: [{ id: "c1", name: "listUsers", arguments: {} }] },
      { content: "I found user <NAME_1> reachable at <EMAIL_1>.", toolCalls: [] },
    ]);

    const agent = new Agent({
      llm,
      server,
      masker,
      systemPrompt: "you help",
    });

    const result = await agent.run({ question: "list users", caller: { subject: "u" } });

    // 1. The final answer must contain the rehydrated original values.
    expect(result.finalText).toBe(
      "I found user Ahmed Mohamed reachable at ahmed@example.com.",
    );

    // 2. No raw PII may appear in any message the LLM was given.
    for (const batch of llm.observedMessages) {
      for (const m of batch) {
        const c = m.content ?? "";
        expect(c).not.toContain("Ahmed");
        expect(c).not.toContain("ahmed@example.com");
      }
    }

    // 3. The masker recorded both replacements.
    expect(result.maskingStats?.totalReplacements).toBeGreaterThanOrEqual(2);
  });
});
