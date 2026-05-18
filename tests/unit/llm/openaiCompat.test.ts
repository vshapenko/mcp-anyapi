import { describe, expect, it } from "vitest";
import { LlmError } from "../../../src/errors.js";
import { OpenAiCompatClient } from "../../../src/llm/openaiCompat.js";

function mockFetch(response: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(response), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

describe("OpenAiCompatClient.complete — request shape", () => {
  it("sends model, messages, tools to /chat/completions with auth header", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const client = new OpenAiCompatClient({
      baseUrl: "https://llm.example/v1",
      apiKey: "sk-test",
      model: "test-model",
      fetchFn: (async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init as RequestInit;
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "hello", role: "assistant" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    await client.complete({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "t1", description: "x", inputSchema: { type: "object" } }],
      toolChoice: "auto",
    });

    expect(capturedUrl).toBe("https://llm.example/v1/chat/completions");
    const headers = new Headers(capturedInit?.headers as Record<string, string>);
    expect(headers.get("authorization")).toBe("Bearer sk-test");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(capturedInit?.body as string) as Record<string, unknown>;
    expect(body["model"]).toBe("test-model");
    expect(body["messages"]).toEqual([{ role: "user", content: "hi" }]);
    expect(body["tool_choice"]).toBe("auto");
    expect(Array.isArray(body["tools"])).toBe(true);
  });

  it("merges defaultExtra and per-call extra into the body", async () => {
    let captured: Record<string, unknown> | undefined;
    const client = new OpenAiCompatClient({
      baseUrl: "https://llm.example/v1",
      apiKey: "k",
      model: "m",
      defaultExtra: { chat_template_kwargs: { enable_thinking: true } },
      fetchFn: (async (_url, init) => {
        captured = JSON.parse((init as RequestInit).body as string);
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "ok", role: "assistant" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });
    await client.complete({
      messages: [{ role: "user", content: "x" }],
      extra: { temperature: 0.1 },
    });
    expect(captured?.["chat_template_kwargs"]).toEqual({ enable_thinking: true });
    expect(captured?.["temperature"]).toBe(0.1);
  });

  it("sends tool_choice in the {type:function} form when given a named choice", async () => {
    let captured: Record<string, unknown> | undefined;
    const client = new OpenAiCompatClient({
      baseUrl: "https://llm.example/v1",
      apiKey: "k",
      model: "m",
      fetchFn: (async (_url, init) => {
        captured = JSON.parse((init as RequestInit).body as string);
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "ok", role: "assistant" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });
    await client.complete({
      messages: [{ role: "user", content: "x" }],
      toolChoice: { name: "t1" },
    });
    expect(captured?.["tool_choice"]).toEqual({ type: "function", function: { name: "t1" } });
  });
});

describe("OpenAiCompatClient.complete — response parsing", () => {
  it("returns content and parses tool calls", async () => {
    const client = new OpenAiCompatClient({
      baseUrl: "https://llm.example/v1",
      apiKey: "k",
      model: "m",
      fetchFn: mockFetch({
        choices: [
          {
            message: {
              role: "assistant",
              content: "calling tool",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "t1", arguments: JSON.stringify({ a: 1 }) },
                },
              ],
            },
          },
        ],
      }),
    });
    const out = await client.complete({ messages: [{ role: "user", content: "x" }] });
    expect(out.content).toBe("calling tool");
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]).toMatchObject({
      id: "call_1",
      name: "t1",
      arguments: { a: 1 },
    });
  });

  it("returns {} for tool arguments that fail to parse", async () => {
    const client = new OpenAiCompatClient({
      baseUrl: "https://x",
      apiKey: "k",
      model: "m",
      fetchFn: mockFetch({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "t", arguments: "{broken" },
                },
              ],
            },
          },
        ],
      }),
    });
    const out = await client.complete({ messages: [{ role: "user", content: "x" }] });
    expect(out.toolCalls[0]?.arguments).toEqual({});
  });

  it("extracts reasoning_content when present", async () => {
    const client = new OpenAiCompatClient({
      baseUrl: "https://x",
      apiKey: "k",
      model: "m",
      fetchFn: mockFetch({
        choices: [
          {
            message: {
              role: "assistant",
              content: "answer",
              reasoning_content: "let me think",
            },
          },
        ],
      }),
    });
    const out = await client.complete({ messages: [{ role: "user", content: "x" }] });
    expect(out.reasoningContent).toBe("let me think");
  });

  it("throws LlmError with status on non-2xx", async () => {
    const client = new OpenAiCompatClient({
      baseUrl: "https://x",
      apiKey: "k",
      model: "m",
      fetchFn: mockFetch({ error: "rate limited" }, 429),
    });
    await expect(
      client.complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ name: "LlmError", status: 429 });
  });

  it("throws LlmError on missing choices[0]", async () => {
    const client = new OpenAiCompatClient({
      baseUrl: "https://x",
      apiKey: "k",
      model: "m",
      fetchFn: mockFetch({ choices: [] }),
    });
    await expect(
      client.complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(LlmError);
  });
});
