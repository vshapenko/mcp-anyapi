/**
 * Example: Anthropic-backed agent with PII masking before any prompt leaves
 * the process.
 *
 * Requires ANTHROPIC_API_KEY. Run with:
 *   pnpm tsx examples/02-anthropic-with-masking.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  Agent,
  AllowAllFilter,
  AnthropicClient,
  ConfigMasker,
  FetchTransport,
  MaskingProfile,
  NoAuth,
  OpenApiSpecSource,
  buildServer,
} from "../src/index.js";

async function main(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is required");
    process.exit(1);
  }

  const profile = MaskingProfile.fromObject({
    kinds: ["NAME", "EMAIL", "PHONE"],
    columnRules: {
      NAME: ["name", "firstName", "lastName"],
      EMAIL: ["email"],
      PHONE: ["phone"],
    },
    regexRules: {
      EMAIL: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
      PHONE: "\\+?\\d{8,15}",
    },
    skipFields: ["id"],
  });

  const server = await buildServer({
    specSource: new OpenApiSpecSource({
      url: "https://petstore3.swagger.io/api/v3/openapi.json",
    }),
    transport: new FetchTransport({ baseUrl: "https://petstore3.swagger.io/api/v3" }),
    auth: new NoAuth(),
    visibility: new AllowAllFilter(),
    masker: new ConfigMasker(profile),
  });

  // The Anthropic SDK's typed `messages.create` shape is wider than our
  // minimal `AnthropicSdkLike` (it requires `model`, `messages`,
  // `max_tokens` at the type level). At runtime our `AnthropicClient`
  // fills those in; the cast bridges the static-type gap.
  const sdk = new Anthropic({ apiKey });
  const agent = new Agent({
    llm: new AnthropicClient({
      client: sdk as unknown as ConstructorParameters<typeof AnthropicClient>[0]["client"],
      model: process.env["ANTHROPIC_MODEL"] ?? "claude-haiku-4-5-20251001",
    }),
    server,
    masker: server.masker,
    systemPrompt: "You are a helpful assistant.",
  });

  const result = await agent.run({
    question: "Look up the user 'jane@example.com' and tell me what you found.",
    caller: { subject: "demo-admin" },
  });

  console.log("FINAL:", result.finalText);
  console.log("Masking stats:", result.maskingStats);
}

void main();
