import type { ToolServer } from "../server/index.js";
import type { CallerIdentity, ToolCall, ToolResult } from "../types.js";

export interface DispatchResult {
  readonly toolCall: ToolCall;
  readonly result: ToolResult;
  readonly error?: string;
}

export async function dispatchToolCall(
  server: ToolServer,
  call: ToolCall,
  caller: CallerIdentity,
): Promise<DispatchResult> {
  try {
    const result = await server.callTool(call.name, call.arguments, caller);
    return { toolCall: call, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result: ToolResult = {
      status: 500,
      ok: false,
      body: { error: message },
      headers: {},
    };
    return { toolCall: call, result, error: message };
  }
}
