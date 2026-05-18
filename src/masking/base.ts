import type { ChatMessage, MaskingStats } from "../types.js";

export interface Masker {
  tokenizeMessages(messages: readonly ChatMessage[]): readonly ChatMessage[];
  tokenizeObject(obj: unknown, parentKey?: string): unknown;
  rehydrate(text: string): string;
  reset(): void;
  stats(): MaskingStats;
}
