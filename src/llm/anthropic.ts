import { LlmError } from "../errors.js";
import type { AssistantMessage, ChatMessage, ToolCall, ToolDef } from "../types.js";
import type { CompleteArgs, LlmClient, ToolChoice } from "./base.js";

interface AnthropicSdkLike {
  messages: {
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
}

export interface AnthropicClientOptions {
  readonly client: AnthropicSdkLike;
  readonly model: string;
  readonly maxTokens?: number;
  readonly defaultExtra?: Readonly<Record<string, unknown>>;
}

export class AnthropicClient implements LlmClient {
  private readonly client: AnthropicSdkLike;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly defaultExtra: Readonly<Record<string, unknown>>;

  constructor(opts: AnthropicClientOptions) {
    this.client = opts.client;
    this.model = opts.model;
    this.maxTokens = opts.maxTokens ?? 4096;
    this.defaultExtra = opts.defaultExtra ?? {};
  }

  async complete(args: CompleteArgs): Promise<AssistantMessage> {
    const { system, conversation } = splitSystem(args.messages);
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: conversation.map(toAnthropicMessage),
      ...(system ? { system } : {}),
      ...(args.tools && args.tools.length > 0 ? { tools: args.tools.map(toAnthropicTool) } : {}),
      ...(args.toolChoice ? { tool_choice: toAnthropicToolChoice(args.toolChoice) } : {}),
      ...this.defaultExtra,
      ...(args.extra ?? {}),
    };

    let response: Record<string, unknown>;
    try {
      response = await this.client.messages.create(body);
    } catch (err) {
      throw new LlmError(`Anthropic request failed`, { cause: err });
    }

    return parseAnthropicResponse(response);
  }
}

function splitSystem(messages: readonly ChatMessage[]): {
  system: string | undefined;
  conversation: readonly ChatMessage[];
} {
  let system: string | undefined;
  const conversation: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system" && system === undefined) {
      system = m.content ?? undefined;
    } else {
      conversation.push(m);
    }
  }
  return { system, conversation };
}

function toAnthropicMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === "tool") {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: m.toolCallId,
          content: m.content ?? "",
        },
      ],
    };
  }
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    const blocks: Array<Record<string, unknown>> = [];
    if (m.content) blocks.push({ type: "text", text: m.content });
    for (const tc of m.toolCalls) {
      blocks.push({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.arguments,
      });
    }
    return { role: "assistant", content: blocks };
  }
  return { role: m.role === "system" ? "user" : m.role, content: m.content ?? "" };
}

function toAnthropicTool(t: ToolDef): Record<string, unknown> {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  };
}

function toAnthropicToolChoice(choice: ToolChoice): unknown {
  if (choice === "auto") return { type: "auto" };
  if (choice === "none") return { type: "none" };
  return { type: "tool", name: choice.name };
}

function parseAnthropicResponse(payload: Record<string, unknown>): AssistantMessage {
  const blocks = (payload["content"] as Array<Record<string, unknown>> | undefined) ?? [];
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const block of blocks) {
    if (block["type"] === "text" && typeof block["text"] === "string") {
      text += block["text"] as string;
    } else if (block["type"] === "tool_use") {
      toolCalls.push({
        id: (block["id"] as string | undefined) ?? "",
        name: (block["name"] as string | undefined) ?? "",
        arguments: (block["input"] as Record<string, unknown> | undefined) ?? {},
      });
    }
  }
  return {
    content: text.length > 0 ? text : null,
    toolCalls,
    raw: payload,
  };
}
