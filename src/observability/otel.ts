import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

const SERVICE_NAME = 'unified-service-scheduler'
const SERVICE_VERSION = '1.0.0'

/**
 * OpenTelemetry Web SDK → Jaeger by default (OTLP via Vite `/otlp` proxy).
 *
 * Default: OTLP → Jaeger UI (http://localhost:16686)
 * Fallback without Jaeger/Docker: VITE_OTEL_EXPORTER=console
 *
 * Does NOT register FetchInstrumentation (breaks MSW).
 *
 * @see https://www.npmjs.com/package/@opentelemetry/sdk-trace-web
 */
export function initOpenTelemetry() {
  // Default OTLP/Jaeger; set VITE_OTEL_EXPORTER=console if Docker/Jaeger is off
  const useConsole = import.meta.env.VITE_OTEL_EXPORTER === 'console'

  const exporter = useConsole
    ? new ConsoleSpanExporter()
    : new OTLPTraceExporter({
        url: `${window.location.origin}/otlp/v1/traces`,
      })

  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      'service.version': SERVICE_VERSION,
      'deployment.environment': import.meta.env.MODE,
    }),
    spanProcessors: [
      useConsole ? new SimpleSpanProcessor(exporter) : new BatchSpanProcessor(exporter),
    ],
  })

  provider.register()

  if (useConsole) {
    console.info(
      `[otel] ${SERVICE_NAME} → Console exporter. For Jaeger UI: unset VITE_OTEL_EXPORTER, run npm run jaeger:up, restart npm run dev`,
    )
  } else {
    console.info(
      `[otel] ${SERVICE_NAME} → OTLP /otlp/v1/traces → Jaeger UI http://localhost:16686 (service: ${SERVICE_NAME})`,
    )
  }

  return provider
}
