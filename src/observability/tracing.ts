import { SpanStatusCode, context, trace, type Span } from '@opentelemetry/api'

const tracer = () => trace.getTracer('unified-service-scheduler', '1.0.0')

export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean | undefined>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = tracer().startSpan(name)
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) span.setAttribute(key, value)
  }

  try {
    return await context.with(trace.setSpan(context.active(), span), () => fn(span))
  } catch (e) {
    span.recordException(e as Error)
    span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message })
    throw e
  } finally {
    span.end()
  }
}

export function recordEvent(
  name: string,
  attributes: Record<string, string | number | boolean | undefined> = {},
) {
  const span = tracer().startSpan(name)
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) span.setAttribute(key, value)
  }
  span.end()
}
