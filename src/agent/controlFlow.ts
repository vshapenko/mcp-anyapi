export const CONTROL_TOOL_NAMES = {
  askClarification: "ask_clarification",
  cannotAnswer: "cannot_answer",
} as const;

export type ControlFlowToolName = (typeof CONTROL_TOOL_NAMES)[keyof typeof CONTROL_TOOL_NAMES];

export function isControlFlowTool(name: string): name is ControlFlowToolName {
  return (
    name === CONTROL_TOOL_NAMES.askClarification || name === CONTROL_TOOL_NAMES.cannotAnswer
  );
}
