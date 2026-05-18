import { describe, expect, it } from "vitest";
import { AgentRunawayError } from "../../../src/errors.js";
import { NoAuth } from "../../../src/auth/index.js";
import { Agent } from "../../../src/agent/index.js";
import { NoopMasker } from "../../../src/masking/index.js";
import { StaticSpecSource } from "../../../src/specs/index.js";
import { ToolCatalogBuilder } from "../../../src/server/toolCatalog.js";
import { ToolServer } from "../../../src/server/toolServer.js";
import type { Transport } from "../../../src/transport/index.js";
import type {
  AssistantMessage,
  EndpointToolSpec,
  ToolCall,
  ToolResult,
} from "../../../src/types.js";
import type { CompleteArgs, LlmClient } from "../../../src/llm/index.js";
import { AllowAllFilter } from "../../../src/visibility/index.js";

const SPEC: EndpointToolSpec = {
  name: "search",
  description: "x",
  method: "GET",
  pathTemplate: "/search",
  inputSchema: { type: "object" },
};

class FakeTransport implements Transport {
  async call(): Promise<ToolResult> {
    return { status: 200, ok: true, body: { hit: "found" }, headers: {} };
  }
}

class ScriptedLlm implements LlmClient {
  calls = 0;
  receivedTools: ReadonlyArray<{ name: string }>[] = [];
  constructor(private readonly script: AssistantMessage[]) {}
  async complete(args: CompleteArgs): Promise<AssistantMessage> {
    this.receivedTools.push((args.tools ?? []).map((t) => ({ name: t.name })));
    const next = this.script[this.calls++];
    if (!next) throw new Error(`script exhausted at ${this.calls}`);
    return next;
  }
}

function buildServer(): ToolServer {
  return new ToolServer({
    catalog: new ToolCatalogBuilder({
      specSources: [new StaticSpecSource([SPEC])],
      visibility: new AllowAllFilter(),
    }),
    transport: new FakeTransport(),
    auth: new NoAuth(),
  });
}

const tc = (id: string, name: string, args: Record<string, unknown>): ToolCall => ({
  id,
  name,
  arguments: args,
});

describe("Agent.run — happy path", () => {
  it("returns final text after the LLM stops calling tools", async () => {
    const llm = new ScriptedLlm([
      { content: null, toolCalls: [tc("c1", "search", {})] },
      { content: "found it", toolCalls: [] },
    ]);
    const agent = new Agent({
      llm,
      server: buildServer(),
      masker: new NoopMasker(),
      systemPrompt: "you help",
    });
    const result = await agent.run({ question: "q", caller: { subject: "u" } });
    expect(result.finalText).toBe("found it");
    expect(result.iterations).toBe(2);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.controlFlow).toBe("completed");
  });

  it("exposes server tools plus control-flow tools to the LLM", async () => {
    const llm = new ScriptedLlm([{ content: "done", toolCalls: [] }]);
    const agent = new Agent({
      llm,
      server: buildServer(),
      masker: new NoopMasker(),
      systemPrompt: "x",
    });
    await agent.run({ question: "q", caller: { subject: "u" } });
    const seen = llm.receivedTools[0]!.map((t) => t.name);
    expect(seen).toContain("search");
    expect(seen).toContain("ask_clarification");
    expect(seen).toContain("cannot_answer");
  });
});

describe("Agent.run — control flow", () => {
  it("returns clarification text when ask_clarification is called", async () => {
    const llm = new ScriptedLlm([
      {
        content: null,
        toolCalls: [tc("c1", "ask_clarification", { clarification: "what date?" })],
      },
    ]);
    const agent = new Agent({
      llm,
      server: buildServer(),
      masker: new NoopMasker(),
      systemPrompt: "x",
    });
    const result = await agent.run({ question: "q", caller: { subject: "u" } });
    expect(result.controlFlow).toBe("clarification");
    expect(result.finalText).toBe("what date?");
  });

  it("returns refusal text when cannot_answer is called", async () => {
    const llm = new ScriptedLlm([
      { content: null, toolCalls: [tc("c1", "cannot_answer", { reason: "I cannot help" })] },
    ]);
    const agent = new Agent({
      llm,
      server: buildServer(),
      masker: new NoopMasker(),
      systemPrompt: "x",
    });
    const result = await agent.run({ question: "q", caller: { subject: "u" } });
    expect(result.controlFlow).toBe("refused");
    expect(result.finalText).toBe("I cannot help");
  });
});

describe("Agent.run — iteration cap", () => {
  it("throws AgentRunawayError when the LLM keeps calling tools", async () => {
    const looping: AssistantMessage[] = Array.from({ length: 20 }, () => ({
      content: null,
      toolCalls: [tc("c", "search", {})],
    }));
    const llm = new ScriptedLlm(looping);
    const agent = new Agent({
      llm,
      server: buildServer(),
      masker: new NoopMasker(),
      systemPrompt: "x",
      maxIterations: 3,
    });
    await expect(agent.run({ question: "q", caller: { subject: "u" } })).rejects.toThrow(
      AgentRunawayError,
    );
  });
});

describe("Agent.run — hooks", () => {
  it("fires onToolCall for each tool dispatched", async () => {
    const events: string[] = [];
    const llm = new ScriptedLlm([
      { content: null, toolCalls: [tc("c1", "search", {})] },
      { content: "ok", toolCalls: [] },
    ]);
    const agent = new Agent({
      llm,
      server: buildServer(),
      masker: new NoopMasker(),
      systemPrompt: "x",
      onToolCall: (e) => events.push(`${e.call.name}:${e.iteration}`),
    });
    await agent.run({ question: "q", caller: { subject: "u" } });
    expect(events).toEqual(["search:1"]);
  });

  it("fires onIteration for each LLM round", async () => {
    let n = 0;
    const llm = new ScriptedLlm([
      { content: null, toolCalls: [tc("c1", "search", {})] },
      { content: "ok", toolCalls: [] },
    ]);
    const agent = new Agent({
      llm,
      server: buildServer(),
      masker: new NoopMasker(),
      systemPrompt: "x",
      onIteration: () => {
        n += 1;
      },
    });
    await agent.run({ question: "q", caller: { subject: "u" } });
    expect(n).toBe(2);
  });
});
