import type { AssistantMessage, ChatMessage, ToolDef } from "../types.js";

export type ToolChoice = "auto" | "none" | { name: string };

export interface CompleteArgs {
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolDef[];
  readonly toolChoice?: ToolChoice;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface LlmClient {
  complete(args: CompleteArgs): Promise<AssistantMessage>;
}
