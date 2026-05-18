/**
 * Optional OpenTelemetry hooks. Consumers wire `@opentelemetry/api` themselves
 * (peer dep) and pass a tracer/meter via `getTracer`. We avoid importing the
 * module directly so it stays a true peer dependency.
 */

export interface SpanLike {
  setAttribute(key: string, value: unknown): void;
  recordException(err: unknown): void;
  end(): void;
}

export interface TracerLike {
  startSpan(name: string, attrs?: Record<string, unknown>): SpanLike;
}

export type TracerProvider = () => TracerLike | undefined;

const noopSpan: SpanLike = {
  setAttribute(): void {},
  recordException(): void {},
  end(): void {},
};

export const noopTracerProvider: TracerProvider = () => ({
  startSpan(): SpanLike {
    return noopSpan;
  },
});

export async function withSpan<T>(
  tracerProvider: TracerProvider,
  name: string,
  attrs: Record<string, unknown>,
  fn: (span: SpanLike) => Promise<T>,
): Promise<T> {
  const tracer = tracerProvider();
  if (!tracer) return fn(noopSpan);
  const span = tracer.startSpan(name, attrs);
  try {
    return await fn(span);
  } catch (err) {
    span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}
