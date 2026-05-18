import type { ChatMessage, MaskingStats } from "../types.js";
import type { Masker } from "./base.js";
import type { MaskingProfile } from "./profile.js";
import { walkJson } from "./walker.js";

interface ForwardKey {
  readonly kind: string;
  readonly value: string;
}

const forwardKey = (kind: string, value: string) => `${kind}::${value}`;

export class ConfigMasker implements Masker {
  private forward = new Map<string, string>();
  private reverse = new Map<string, string>();
  private counts = new Map<string, number>();
  private tokenRe: RegExp;

  constructor(private readonly profile: MaskingProfile) {
    this.tokenRe = buildTokenRegex(profile);
  }

  reset(): void {
    this.forward.clear();
    this.reverse.clear();
    this.counts.clear();
  }

  stats(): MaskingStats {
    const out: Record<string, number> = {};
    let total = 0;
    for (const [k, v] of this.counts.entries()) {
      out[k] = v;
      total += v;
    }
    return { counts: out, totalReplacements: total };
  }

  tokenizeMessages(messages: readonly ChatMessage[]): readonly ChatMessage[] {
    return messages.map((m) => this.tokenizeMessage(m));
  }

  private tokenizeMessage(m: ChatMessage): ChatMessage {
    if (this.profile.skipRoles.has(m.role)) return m;
    const content = m.content;
    if (content == null) return m;
    // Tool messages typically carry JSON in `content`; try to parse,
    // walk, and reserialize. Fall back to string masking if that fails.
    if (m.role === "tool") {
      const parsed = tryParseJson(content);
      if (parsed !== UNPARSED) {
        const walked = this.tokenizeObject(parsed);
        return { ...m, content: JSON.stringify(walked) };
      }
    }
    return { ...m, content: this.tokenizeString(content) };
  }

  tokenizeObject(obj: unknown): unknown {
    return walkJson(obj, {
      visitField: (value, key) => {
        if (this.profile.skipFields.has(key)) {
          return { handled: true, replacement: value };
        }
        const columnKind = this.profile.columnRules.get(key);
        if (columnKind != null && typeof value === "string") {
          return { handled: true, replacement: this.tokenForValue(columnKind, value) };
        }
        return { handled: false };
      },
      visitString: (value) => this.tokenizeString(value),
    });
  }

  private tokenizeString(s: string): string {
    let out = s;
    for (const [kind, re] of this.profile.regexRules.entries()) {
      // Reset regex state because /g regexes are stateful in JS
      re.lastIndex = 0;
      out = out.replace(re, (match) => {
        if (this.tokenRe.test(match)) {
          this.tokenRe.lastIndex = 0;
          return match;
        }
        return this.tokenForValue(kind, match);
      });
    }
    return out;
  }

  rehydrate(text: string): string {
    if (!text) return text;
    this.tokenRe.lastIndex = 0;
    return text.replace(this.tokenRe, (token) => {
      const real = this.reverse.get(token);
      return real ?? token;
    });
  }

  private tokenForValue(kind: string, value: string): string {
    const key = forwardKey(kind, value);
    const existing = this.forward.get(key);
    if (existing) return existing;

    const n = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, n);
    const token = this.profile.tokenFormat.replace("{KIND}", kind).replace("{N}", String(n));
    this.forward.set(key, token);
    this.reverse.set(token, value);
    return token;
  }
}

const UNPARSED = Symbol("unparsed");

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return UNPARSED;
  try {
    return JSON.parse(trimmed);
  } catch {
    return UNPARSED;
  }
}

function buildTokenRegex(profile: MaskingProfile): RegExp {
  const escapedKinds = profile.kinds.map(escapeRegex).join("|");
  const placeholderPattern = profile.tokenFormat
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace("\\{KIND\\}", `(?:${escapedKinds})`)
    .replace("\\{N\\}", "\\d+");
  return new RegExp(placeholderPattern, "g");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { type ForwardKey };
