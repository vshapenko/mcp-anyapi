import { describe, expect, it } from "vitest";
import { AnthropicClient } from "../../../src/llm/anthropic.js";

function fakeClient(response: unknown): {
  client: {
    messages: { create: (args: Record<string, unknown>) => Promise<Record<string, unknown>> };
  };
  captured: { last?: Record<string, unknown> };
} {
  const captured: { last?: Record<string, unknown> } = {};
  const client = {
    messages: {
      create: async (args: Record<string, unknown>) => {
        captured.last = args;
        return response as Record<string, unknown>;
      },
    },
  };
  return { client, captured };
}

describe("AnthropicClient.complete", () => {
  it("splits the first system message into the top-level `system` field", async () => {
    const { client, captured } = fakeClient({ content: [{ type: "text", text: "hi" }] });
    const llm = new AnthropicClient({ client, model: "claude-test" });
    await llm.complete({
      messages: [
        { role: "system", content: "be helpful" },
        { role: "user", content: "hi" },
      ],
    });
    expect(captured.last?.["system"]).toBe("be helpful");
    expect(captured.last?.["messages"]).toEqual([{ role: "user", content: "hi" }]);
  });

  it("translates assistant tool calls into tool_use blocks", async () => {
    const { client, captured } = fakeClient({ content: [{ type: "text", text: "ok" }] });
    const llm = new AnthropicClient({ client, model: "claude-test" });
    await llm.complete({
      messages: [
        { role: "user", content: "x" },
        {
          role: "assistant",
          content: null,
          toolCalls: [{ id: "u1", name: "t", arguments: { q: "x" } }],
        },
      ],
    });
    const msgs = captured.last?.["messages"] as Array<{ role: string; content: unknown }>;
    const assistantMsg = msgs[1]!;
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.content).toEqual([
      { type: "tool_use", id: "u1", name: "t", input: { q: "x" } },
    ]);
  });

  it("translates tool result messages into user/tool_result blocks", async () => {
    const { client, captured } = fakeClient({ content: [{ type: "text", text: "ok" }] });
    const llm = new AnthropicClient({ client, model: "claude-test" });
    await llm.complete({
      messages: [
        { role: "tool", toolCallId: "u1", content: JSON.stringify({ ok: true }) },
      ],
    });
    const msgs = captured.last?.["messages"] as Array<{ role: string; content: unknown }>;
    expect(msgs[0]?.content).toEqual([
      { type: "tool_result", tool_use_id: "u1", content: JSON.stringify({ ok: true }) },
    ]);
  });

  it("parses content blocks into text + toolCalls", async () => {
    const { client } = fakeClient({
      content: [
        { type: "text", text: "I will look up " },
        { type: "tool_use", id: "u1", name: "search", input: { q: "x" } },
      ],
    });
    const llm = new AnthropicClient({ client, model: "claude-test" });
    const out = await llm.complete({ messages: [{ role: "user", content: "x" }] });
    expect(out.content).toBe("I will look up ");
    expect(out.toolCalls).toEqual([{ id: "u1", name: "search", arguments: { q: "x" } }]);
  });

  it("propagates tools and tool_choice into the request", async () => {
    const { client, captured } = fakeClient({ content: [{ type: "text", text: "ok" }] });
    const llm = new AnthropicClient({ client, model: "claude-test" });
    await llm.complete({
      messages: [{ role: "user", content: "x" }],
      tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }],
      toolChoice: { name: "t" },
    });
    expect(captured.last?.["tools"]).toEqual([
      { name: "t", description: "d", input_schema: { type: "object" } },
    ]);
    expect(captured.last?.["tool_choice"]).toEqual({ type: "tool", name: "t" });
  });
});
