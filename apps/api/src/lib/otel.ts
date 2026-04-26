/**
 * OpenTelemetry — instrumentação opcional.
 *
 * Habilita-se via env `OTEL_ENABLED=1` + `OTEL_EXPORTER_OTLP_ENDPOINT`
 * (ex: http://localhost:4318/v1/traces para Tempo/Grafana local;
 * https://api.honeycomb.io/v1/traces para Honeycomb; etc.).
 *
 * Auto-instrumenta: HTTP, fetch, fastify, pg (queries), undici.
 * Sem efeito quando OTEL_ENABLED não é '1' — overhead zero em dev.
 *
 * Inicializado ANTES de qualquer outro import via require side-effect
 * em server.ts (precisa rodar antes do `import Fastify` para o
 * auto-instrumentation enxergar o módulo carregado).
 */

let started = false

export function initOtel(): void {
  if (started) return
  if (process.env.OTEL_ENABLED !== '1') return
  started = true

  // Imports síncronos com require — esse arquivo é carregado de forma
  // eager no topo do server.ts; auto-instrumentations precisa ver os
  // módulos ANTES de eles serem importados pelo resto do app.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NodeSDK } = require('@opentelemetry/sdk-node')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resourceFromAttributes } = require('@opentelemetry/resources')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const semconv = require('@opentelemetry/semantic-conventions')

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [semconv.ATTR_SERVICE_NAME || 'service.name']: 'aletis-api',
      [semconv.ATTR_SERVICE_VERSION || 'service.version']: process.env.npm_package_version ?? '0.1.0',
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Sleep '@opentelemetry/instrumentation-fs' — barulhento e
        // não agrega valor em produção (centenas de spans por request).
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        // HTTP, pg, fastify, undici, fetch ficam ligados (default).
      }),
    ],
  })

  try {
    sdk.start()
    // eslint-disable-next-line no-console
    console.log(`[otel] iniciado — exporter: ${endpoint}`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[otel] falha ao iniciar:', (err as Error).message)
  }

  // Shutdown limpo
  const shutdown = async () => {
    try {
      await sdk.shutdown()
      // eslint-disable-next-line no-console
      console.log('[otel] shutdown OK')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[otel] shutdown falhou:', (err as Error).message)
    }
  }
  process.once('SIGTERM', () => void shutdown())
  process.once('SIGINT', () => void shutdown())
}
