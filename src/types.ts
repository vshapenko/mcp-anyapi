export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface EndpointToolSpec {
  readonly name: string;
  readonly description: string;
  readonly method: HttpMethod;
  readonly pathTemplate: string;
  readonly inputSchema: JsonSchema;
  readonly requiredScopes?: readonly string[];
  readonly tags?: readonly string[];
  readonly extras?: Readonly<Record<string, unknown>>;
}

export interface ToolInvocation {
  readonly path?: Readonly<Record<string, string | number>>;
  readonly query?: Readonly<Record<string, string | number | boolean | ReadonlyArray<string | number | boolean>>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

export interface ToolResult {
  readonly status: number;
  readonly ok: boolean;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
}

export interface CallerIdentity {
  readonly subject: string;
  readonly claims?: Readonly<Record<string, unknown>>;
  readonly bearerToken?: string;
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string | null;
  readonly toolCalls?: readonly ToolCall[];
  readonly toolCallId?: string;
  readonly name?: string;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export interface ToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
}

export interface AssistantMessage {
  readonly content: string | null;
  readonly toolCalls: readonly ToolCall[];
  readonly reasoningContent?: string;
  readonly raw?: unknown;
}

export interface MaskingStats {
  readonly counts: Readonly<Record<string, number>>;
  readonly totalReplacements: number;
}

export interface AgentResult {
  readonly finalText: string;
  readonly messages: readonly ChatMessage[];
  readonly toolCalls: readonly ToolCall[];
  readonly iterations: number;
  readonly controlFlow: ControlFlow;
  readonly maskingStats?: MaskingStats;
}

export type ControlFlow = "completed" | "max_iterations" | "clarification" | "refused";

export type JsonSchema = Readonly<Record<string, unknown>>;

// Re-export CompleteArgs at top level so consumer test code can import everything
// chat-related from one place. (The canonical home is llm/base.ts.)
export type { CompleteArgs, ToolChoice } from "./llm/base.js";
