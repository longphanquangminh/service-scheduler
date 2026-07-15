import type { Span } from '@opentelemetry/api'

const MAX_ATTR_CHARS = 2048
const REDACT_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key'])

function truncate(value: string, max = MAX_ATTR_CHARS): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…[truncated ${value.length - max} chars]`
}

/** Safe JSON for Jaeger attributes (string only; size-capped). */
export function toSpanJson(value: unknown): string {
  try {
    if (typeof value === 'string') {
      try {
        return truncate(JSON.stringify(JSON.parse(value), null, 0))
      } catch {
        return truncate(value)
      }
    }
    return truncate(JSON.stringify(value))
  } catch {
    return '[unserializable]'
  }
}

export function headersToSpanAttrs(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    out[`http.request.header.${lower}`] = REDACT_HEADERS.has(lower) ? '[redacted]' : truncate(value, 512)
  })
  return out
}

export function attachRequestPayload(
  span: Span,
  opts: {
    headers?: Headers
    body?: unknown
  },
) {
  if (opts.headers) {
    for (const [key, value] of Object.entries(headersToSpanAttrs(opts.headers))) {
      span.setAttribute(key, value)
    }
  }
  if (opts.body !== undefined && opts.body !== null && opts.body !== '') {
    span.setAttribute('http.request.body', toSpanJson(opts.body))
  }
}

export function attachResponsePayload(span: Span, body: unknown) {
  if (body === undefined) return
  span.setAttribute('http.response.body', toSpanJson(body))
}
