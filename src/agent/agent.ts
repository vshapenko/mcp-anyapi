import { AgentRunawayError } from "../errors.js";
import type { LlmClient } from "../llm/index.js";
import type { Masker } from "../masking/index.js";
import { NoopMasker } from "../masking/index.js";
import type { ToolServer } from "../server/index.js";
import type {
  AgentResult,
  AssistantMessage,
  CallerIdentity,
  ChatMessage,
  ControlFlow,
  ToolCall,
  ToolDef,
} from "../types.js";
import {
  CONTROL_TOOL_NAMES,
  isControlFlowTool,
  type ControlFlowToolName,
} from "./controlFlow.js";
import { dispatchToolCall } from "./dispatch.js";

export interface ToolCallEvent {
  readonly call: ToolCall;
  readonly result: unknown;
  readonly iteration: number;
  readonly error?: string;
}

export interface IterationEvent {
  readonly iteration: number;
  readonly assistant: AssistantMessage;
}

export interface AgentOptions {
  readonly llm: LlmClient;
  readonly server: ToolServer;
  readonly masker?: Masker;
  readonly maxIterations?: number;
  readonly systemPrompt: string;
  readonly llmExtra?: Readonly<Record<string, unknown>>;
  readonly onToolCall?: (event: ToolCallEvent) => void;
  readonly onIteration?: (event: IterationEvent) => void;
  /**
   * Tools that always pass through, even if they are not in the server
   * catalog. Useful for the `ask_clarification` / `cannot_answer` control-flow
   * tools that the agent recognises internally.
   */
  readonly controlFlowTools?: readonly ToolDef[];
}

export interface AgentRunArgs {
  readonly question: string;
  readonly priorMessages?: readonly ChatMessage[];
  readonly caller: CallerIdentity;
}

const DEFAULT_CONTROL_FLOW_TOOLS: ToolDef[] = [
  {
    name: CONTROL_TOOL_NAMES.askClarification,
    description:
      "Ask the user a follow-up question when the request is ambiguous. Use sparingly.",
    inputSchema: {
      type: "object",
      properties: {
        clarification: { type: "string", description: "The follow-up question" },
      },
      required: ["clarification"],
      additionalProperties: false,
    },
  },
  {
    name: CONTROL_TOOL_NAMES.cannotAnswer,
    description: "Politely refuse when the request cannot be answered with the available tools.",
    inputSchema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Short user-facing reason" },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

export class Agent {
  private readonly llm: LlmClient;
  private readonly server: ToolServer;
  private readonly masker: Masker;
  private readonly maxIterations: number;
  private readonly systemPrompt: string;
  private readonly llmExtra: Readonly<Record<string, unknown>>;
  private readonly onToolCall?: (e: ToolCallEvent) => void;
  private readonly onIteration?: (e: IterationEvent) => void;
  private readonly controlFlowTools: readonly ToolDef[];

  constructor(opts: AgentOptions) {
    this.llm = opts.llm;
    this.server = opts.server;
    this.masker = opts.masker ?? new NoopMasker();
    this.maxIterations = opts.maxIterations ?? 12;
    this.systemPrompt = opts.systemPrompt;
    this.llmExtra = opts.llmExtra ?? {};
    this.onToolCall = opts.onToolCall;
    this.onIteration = opts.onIteration;
    this.controlFlowTools = opts.controlFlowTools ?? DEFAULT_CONTROL_FLOW_TOOLS;
  }

  async run(args: AgentRunArgs): Promise<AgentResult> {
    const { caller } = args;
    this.masker.reset();

    const messages: ChatMessage[] = [
      { role: "system", content: this.systemPrompt },
      ...(args.priorMessages ?? []),
      { role: "user", content: args.question },
    ];

    const tools = await this.buildToolList(caller);
    const collectedCalls: ToolCall[] = [];
    let iteration = 0;
    let controlFlow: ControlFlow = "completed";
    let finalText = "";

    while (iteration < this.maxIterations) {
      iteration += 1;

      const masked = this.masker.tokenizeMessages(messages);
      const assistant = await this.llm.complete({
        messages: masked,
        tools,
        toolChoice: "auto",
        extra: this.llmExtra,
      });
      this.onIteration?.({ iteration, assistant });

      const rehydratedContent =
        assistant.content != null ? this.masker.rehydrate(assistant.content) : null;
      messages.push({
        role: "assistant",
        content: rehydratedContent,
        toolCalls: assistant.toolCalls.length > 0 ? assistant.toolCalls : undefined,
      });

      if (assistant.toolCalls.length === 0) {
        finalText = rehydratedContent ?? "";
        controlFlow = "completed";
        break;
      }

      // Process tool calls
      let controlHit: ControlFlowToolName | null = null;
      let controlText = "";
      for (const call of assistant.toolCalls) {
        collectedCalls.push(call);
        if (isControlFlowTool(call.name)) {
          controlHit = call.name;
          controlText = String(
            (call.arguments as { clarification?: string; reason?: string }).clarification ??
              (call.arguments as { reason?: string }).reason ??
              "",
          );
          break;
        }

        const dispatched = await dispatchToolCall(this.server, call, caller);
        this.onToolCall?.({
          call,
          result: dispatched.result,
          iteration,
          error: dispatched.error,
        });

        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(dispatched.result),
        });
      }

      if (controlHit === CONTROL_TOOL_NAMES.askClarification) {
        finalText = controlText;
        controlFlow = "clarification";
        break;
      }
      if (controlHit === CONTROL_TOOL_NAMES.cannotAnswer) {
        finalText = controlText;
        controlFlow = "refused";
        break;
      }
    }

    if (iteration >= this.maxIterations && controlFlow === "completed" && finalText === "") {
      controlFlow = "max_iterations";
      throw new AgentRunawayError(
        `Agent exceeded max iterations (${this.maxIterations})`,
        iteration,
      );
    }

    return {
      finalText,
      messages,
      toolCalls: collectedCalls,
      iterations: iteration,
      controlFlow,
      maskingStats: this.masker.stats(),
    };
  }

  private async buildToolList(caller: CallerIdentity): Promise<readonly ToolDef[]> {
    const serverTools = await this.server.listTools(caller);
    return [...serverTools, ...this.controlFlowTools];
  }
}
