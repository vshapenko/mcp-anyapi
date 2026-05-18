export type StringVisitor = (value: string, parentKey: string | undefined) => string;
export type FieldValueVisitor = (
  value: unknown,
  key: string,
) => { handled: boolean; replacement?: unknown };

export interface WalkVisitors {
  readonly visitField?: FieldValueVisitor;
  readonly visitString?: StringVisitor;
}

export function walkJson(input: unknown, visitors: WalkVisitors, parentKey?: string): unknown {
  if (input == null) return input;
  if (typeof input === "string") {
    return visitors.visitString ? visitors.visitString(input, parentKey) : input;
  }
  if (typeof input === "number" || typeof input === "boolean" || typeof input === "bigint") {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => walkJson(item, visitors, parentKey));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (visitors.visitField) {
        const r = visitors.visitField(value, key);
        if (r.handled) {
          out[key] = r.replacement;
          continue;
        }
      }
      out[key] = walkJson(value, visitors, key);
    }
    return out;
  }
  return input;
}
