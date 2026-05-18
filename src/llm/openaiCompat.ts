import { LlmError } from "../errors.js";
import type { AssistantMessage, ChatMessage, ToolCall, ToolDef } from "../types.js";
import type { CompleteArgs, LlmClient, ToolChoice } from "./base.js";

export interface OpenAiCompatClientOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
  readonly defaultExtra?: Readonly<Record<string, unknown>>;
  readonly reasoningContentKeys?: ReadonlyArray<string>;
  readonly headers?: Readonly<Record<string, string>>;
}

const DEFAULT_REASONING_KEYS = ["reasoning_content", "reasoning", "thinking"];

export class OpenAiCompatClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly defaultExtra: Readonly<Record<string, unknown>>;
  private readonly reasoningContentKeys: ReadonlyArray<string>;
  private readonly headers: Readonly<Record<string, string>>;

  constructor(opts: OpenAiCompatClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.defaultExtra = opts.defaultExtra ?? {};
    this.reasoningContentKeys = opts.reasoningContentKeys ?? DEFAULT_REASONING_KEYS;
    this.headers = opts.headers ?? {};
  }

  async complete(args: CompleteArgs): Promise<AssistantMessage> {
    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model: this.model,
      messages: args.messages.map(toOpenAiMessage),
      ...(args.tools && args.tools.length > 0 ? { tools: args.tools.map(toOpenAiTool) } : {}),
      ...(args.toolChoice ? { tool_choice: toOpenAiToolChoice(args.toolChoice) } : {}),
      ...this.defaultExtra,
      ...(args.extra ?? {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...this.headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new LlmError(`LLM request failed`, { cause: err });
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new LlmError(`LLM responded ${response.status}: ${text.slice(0, 500)}`, {
        status: response.status,
      });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch (err) {
      throw new LlmError(`LLM returned invalid JSON: ${(err as Error).message}`);
    }

    return this.parseAssistantMessage(parsed);
  }

  private parseAssistantMessage(payload: Record<string, unknown>): AssistantMessage {
    const choices = (payload["choices"] as Array<Record<string, unknown>> | undefined) ?? [];
    const first = choices[0];
    if (!first) {
      throw new LlmError("LLM response missing choices[0]");
    }
    const message = first["message"] as Record<string, unknown> | undefined;
    if (!message) {
      throw new LlmError("LLM response missing choices[0].message");
    }
    const content = typeof message["content"] === "string" ? (message["content"] as string) : null;
    const rawToolCalls =
      (message["tool_calls"] as Array<Record<string, unknown>> | undefined) ?? [];
    const toolCalls: ToolCall[] = rawToolCalls.map((tc) => {
      const fn = tc["function"] as Record<string, unknown> | undefined;
      const name = (fn?.["name"] as string | undefined) ?? "";
      const rawArgs = (fn?.["arguments"] as string | undefined) ?? "{}";
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>;
      } catch {
        args = {};
      }
      return {
        id: (tc["id"] as string | undefined) ?? "",
        name,
        arguments: args,
      };
    });

    let reasoning: string | undefined;
    for (const key of this.reasoningContentKeys) {
      const v = message[key];
      if (typeof v === "string" && v.length > 0) {
        reasoning = v;
        break;
      }
    }

    return {
      content,
      toolCalls,
      reasoningContent: reasoning,
      raw: payload,
    };
  }
}

function toOpenAiMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === "tool") {
    return {
      role: "tool",
      content: m.content ?? "",
      tool_call_id: m.toolCallId,
    };
  }
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: m.content,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }
  return {
    role: m.role,
    content: m.content ?? "",
    ...(m.name ? { name: m.name } : {}),
  };
}

function toOpenAiTool(t: ToolDef): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  };
}

function toOpenAiToolChoice(choice: ToolChoice): unknown {
  if (choice === "auto" || choice === "none") return choice;
  return { type: "function", function: { name: choice.name } };
}
