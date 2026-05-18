export interface Logger {
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export class ConsoleLogger implements Logger {
  constructor(private readonly minLevel: "debug" | "info" | "warn" | "error" = "info") {}

  private shouldLog(level: "debug" | "info" | "warn" | "error"): boolean {
    const order = { debug: 10, info: 20, warn: 30, error: 40 };
    return order[level] >= order[this.minLevel];
  }

  debug(obj: unknown, msg?: string): void {
    if (!this.shouldLog("debug")) return;
    console.error(format("debug", obj, msg));
  }
  info(obj: unknown, msg?: string): void {
    if (!this.shouldLog("info")) return;
    console.error(format("info", obj, msg));
  }
  warn(obj: unknown, msg?: string): void {
    if (!this.shouldLog("warn")) return;
    console.warn(format("warn", obj, msg));
  }
  error(obj: unknown, msg?: string): void {
    if (!this.shouldLog("error")) return;
    console.error(format("error", obj, msg));
  }
}

function format(level: string, obj: unknown, msg?: string): string {
  const payload = typeof obj === "object" && obj != null ? JSON.stringify(obj) : String(obj);
  return msg ? `[${level}] ${msg} ${payload}` : `[${level}] ${payload}`;
}

export class NullLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
