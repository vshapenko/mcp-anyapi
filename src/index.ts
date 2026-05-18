// Versioning
export { VERSION } from "./version.js";

// Types
export type {
  EndpointToolSpec,
  HttpMethod,
  ToolInvocation,
  ToolResult,
  CallerIdentity,
  ChatMessage,
  ChatRole,
  ToolCall,
  ToolDef,
  AssistantMessage,
  AgentResult,
  ControlFlow,
  MaskingStats,
  JsonSchema,
} from "./types.js";

// Errors
export {
  McpAnyApiError,
  SpecError,
  TransportError,
  AuthError,
  PolicyError,
  MaskingError,
  LlmError,
  AgentRunawayError,
} from "./errors.js";

// Specs
export type { SpecSource } from "./specs/index.js";
export {
  OpenApiSpecSource,
  StaticSpecSource,
  X_MCP_REQUIRED_SCOPE,
  X_MCP_TAGS,
  X_MCP_EXTRAS,
  readScopeExtension,
  readTagsExtension,
  readExtrasExtension,
} from "./specs/index.js";
export type { OpenApiSpecInput, OpenApiSpecSourceOptions } from "./specs/index.js";

// Transport
export type { Transport } from "./transport/index.js";
export { FetchTransport, renderPath, renderQuery } from "./transport/index.js";
export type { FetchTransportOptions } from "./transport/index.js";

// Auth
export type { AuthProvider, MintHeadersFn } from "./auth/index.js";
export {
  NoAuth,
  StaticBearerAuth,
  ApiKeyHeaderAuth,
  CallbackAuth,
} from "./auth/index.js";
export type {
  StaticBearerAuthOptions,
  ApiKeyHeaderAuthOptions,
  CallbackAuthOptions,
} from "./auth/index.js";

// Visibility
export type { VisibilityFilter } from "./visibility/index.js";
export {
  AllowAllFilter,
  DenyMutatingFilter,
  TagFilter,
  ScopeFilter,
  CompositeFilter,
  applyFilter,
} from "./visibility/index.js";
export type { TagFilterOptions, ScopeFilterOptions } from "./visibility/index.js";

// Masking
export type { Masker, MaskingProfileInput, MaskingProfileData } from "./masking/index.js";
export { MaskingProfile, ConfigMasker, NoopMasker, walkJson } from "./masking/index.js";
export type { WalkVisitors, StringVisitor, FieldValueVisitor } from "./masking/index.js";

// LLM
export type { LlmClient, CompleteArgs, ToolChoice } from "./llm/index.js";
export { OpenAiCompatClient, AnthropicClient } from "./llm/index.js";
export type {
  OpenAiCompatClientOptions,
  AnthropicClientOptions,
} from "./llm/index.js";

// Server
export { buildServer, ToolServer, ToolCatalogBuilder, McpStdioServer } from "./server/index.js";
export type {
  BuildServerOptions,
  ToolServerOptions,
  ExtraTool,
  ToolCatalogBuilderOptions,
  McpStdioServerOptions,
} from "./server/index.js";

// Agent
export { Agent, dispatchToolCall, isControlFlowTool, CONTROL_TOOL_NAMES } from "./agent/index.js";
export type {
  AgentOptions,
  AgentRunArgs,
  ToolCallEvent,
  IterationEvent,
  ControlFlowToolName,
  DispatchResult,
} from "./agent/index.js";

// Observability
export type { Logger, TracerProvider, SpanLike, TracerLike } from "./observability/index.js";
export { ConsoleLogger, NullLogger, noopTracerProvider, withSpan } from "./observability/index.js";
