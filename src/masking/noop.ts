import type { ChatMessage, MaskingStats } from "../types.js";
import type { Masker } from "./base.js";

export class NoopMasker implements Masker {
  tokenizeMessages(messages: readonly ChatMessage[]): readonly ChatMessage[] {
    return messages;
  }

  tokenizeObject(obj: unknown): unknown {
    return obj;
  }

  rehydrate(text: string): string {
    return text;
  }

  reset(): void {}

  stats(): MaskingStats {
    return { counts: {}, totalReplacements: 0 };
  }
}
