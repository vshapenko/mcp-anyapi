export class McpAnyApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SpecError extends McpAnyApiError {}
export class TransportError extends McpAnyApiError {
  readonly status?: number;
  constructor(message: string, opts?: { status?: number; cause?: unknown }) {
    super(message, opts?.cause ? { cause: opts.cause } : undefined);
    this.status = opts?.status;
  }
}
export class AuthError extends McpAnyApiError {}
export class PolicyError extends McpAnyApiError {}
export class MaskingError extends McpAnyApiError {}
export class LlmError extends McpAnyApiError {
  readonly status?: number;
  constructor(message: string, opts?: { status?: number; cause?: unknown }) {
    super(message, opts?.cause ? { cause: opts.cause } : undefined);
    this.status = opts?.status;
  }
}
export class AgentRunawayError extends McpAnyApiError {
  readonly iterations: number;
  constructor(message: string, iterations: number) {
    super(message);
    this.iterations = iterations;
  }
}
