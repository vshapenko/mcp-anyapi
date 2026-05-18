import { TransportError } from "../errors.js";

const PARAM_RE = /\{([^}]+)\}/g;

export function renderPath(
  template: string,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(PARAM_RE, (_match, name: string) => {
    const value = params[name];
    if (value == null) {
      throw new TransportError(`Missing path parameter "${name}" for template "${template}"`);
    }
    return encodeURIComponent(String(value));
  });
}

export function renderQuery(
  query: Readonly<
    Record<string, string | number | boolean | ReadonlyArray<string | number | boolean>>
  > = {},
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
      }
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}
