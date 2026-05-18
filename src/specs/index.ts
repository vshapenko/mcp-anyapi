export type { SpecSource } from "./base.js";
export { OpenApiSpecSource } from "./openapi.js";
export type { OpenApiSpecInput, OpenApiSpecSourceOptions } from "./openapi.js";
export { StaticSpecSource } from "./static.js";
export {
  X_MCP_REQUIRED_SCOPE,
  X_MCP_TAGS,
  X_MCP_EXTRAS,
  readScopeExtension,
  readTagsExtension,
  readExtrasExtension,
} from "./visibilityMeta.js";
