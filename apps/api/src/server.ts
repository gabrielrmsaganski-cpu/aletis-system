// OpenTelemetry — DEVE ser carregado antes de qualquer outro import
// para que o auto-instrumentation enxergue os módulos. No-op quando
// OTEL_ENABLED!=1 (overhead zero em dev).
import { initOtel } from './lib/otel.js'
initOtel()

import Fastify, { FastifyServerOptions } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import metricsPlugin from 'fastify-metrics'
import axios from 'axios'
import axiosRetry from 'axios-retry'
import { join, dirname } from 'path'
import { readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

// Retry global no axios — fontes externas (BCB/CEPEA/INMET/IBGE/etc.) ocasionalmente
// retornam 429/503/timeout. Sem retry, um spike marca a fonte como offline.
// 2 retries com backoff exponencial atende a maioria dos casos transientes.
axiosRetry(axios, {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    if (axiosRetry.isNetworkOrIdempotentRequestError(error)) return true
    const code = error.response?.status
    return code === 429 || code === 502 || code === 503 || code === 504
  },
  shouldResetTimeout: true,
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'

/** Trace IDs curtos (12 chars URL-safe) — alternativa leve ao UUID v4. */
function cryptoRandomId(): string {
  const bytes = new Uint8Array(9)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Buffer.from(bytes).toString('base64url')
}

/** Probe for pino-pretty — optional dev dependency */
function buildLoggerOptions(): FastifyServerOptions['logger'] {
  const level = process.env.LOG_LEVEL || 'info'
  // LGPD/segurança: redaciona campos sensíveis em qualquer log.
  // `paths` aceita pino's bracket-notation e wildcards.
  const redact = {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers["x-portal-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.senha',
      '*.senha_hash',
      '*.token',
      '*.tokenHash',
      '*.token_hash',
      '*.secret',
      '*.apiKey',
      '*.api_key',
      '*.cpf',
      '*.cnpj',
      '*.email',
      '*.celular',
      '*.telefone',
      '*.cardNumber',
      '*.creditCard',
      'body.password',
      'body.senha',
      'body.token',
      'body.cpf',
      'body.cnpj',
      'body.email',
      'authorization',
    ],
    censor: '[REDACTED]',
    remove: false,
  }
  if (process.env.NODE_ENV === 'production') return { level, redact }
  try {
    require.resolve('pino-pretty')
    return {
      level,
      redact,
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    }
  } catch {
    return { level, redact }
  }
}

async function buildApp() {
  const fastify = Fastify({
    logger: buildLoggerOptions(),
    // Trace ID por request: aceita `x-trace-id` do client (front, gateway,
    // outro service) APENAS se passar na regex de segurança; senão gera um
    // próprio. NÃO usamos `requestIdHeader` do Fastify — ele lê o header
    // sem validar e abriria injection no log/response.
    genReqId(req) {
      const headerId = (req.headers['x-trace-id'] || req.headers['x-request-id']) as string | undefined
      if (typeof headerId === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(headerId)) return headerId
      return cryptoRandomId()
    },
    requestIdLogLabel: 'traceId',
  })

  // Eco do trace-id no response para o cliente correlacionar.
  // Aproveita o mesmo hook para anexar security headers básicos
  // (sem @fastify/helmet — implementação manual mínima cobrindo
  // os 5 headers OWASP críticos).
  const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
    // CSP em produção apenas (em dev o Vite injeta scripts inline / eval para HMR).
    ...(process.env.NODE_ENV === 'production'
      ? {
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'Content-Security-Policy':
            "default-src 'self'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        }
      : {}),
  } as const

  fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-trace-id', request.id)
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (!reply.hasHeader(k)) reply.header(k, v)
    }
  })

  // Proteção do /metrics: por padrão somente IPs locais (loopback +
  // RFC1918 + tailscale). Override via env METRICS_TOKEN — quando setado,
  // exige header Authorization: Bearer <token>.
  const METRICS_TOKEN = process.env.METRICS_TOKEN?.trim()
  function isPrivateIp(ip: string): boolean {
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
      ip.startsWith('100.') /* tailscale CGNAT */
    )
  }
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url.split('?')[0] !== '/metrics') return
    if (METRICS_TOKEN) {
      const auth = request.headers.authorization || ''
      const presented = auth.startsWith('Bearer ') ? auth.slice(7) : null
      if (presented !== METRICS_TOKEN) {
        return reply.code(401).send({ error: 'metrics: unauthorized' })
      }
      return
    }
    const ip = (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      || request.ip
    if (!ip || !isPrivateIp(ip)) {
      return reply.code(403).send({ error: 'metrics: forbidden' })
    }
  })

  // --- CORS ---
  // Whitelist via env (CORS_ALLOWED_ORIGINS=https://app.aletis.com.br,https://aletis.com.br).
  // Em dev, sem env: permite tudo. Em prod sem env: erro claro (nunca abre por padrão).
  const corsEnv = process.env.CORS_ALLOWED_ORIGINS?.trim()
  const isProd = process.env.NODE_ENV === 'production'
  let corsOrigin: boolean | string[] | RegExp[]
  if (corsEnv) {
    corsOrigin = corsEnv.split(',').map((o) => o.trim()).filter(Boolean)
  } else if (isProd) {
    throw new Error(
      '[ALETIS] CORS_ALLOWED_ORIGINS é obrigatório em produção (ex: "https://app.aletis.com.br,https://aletis.com.br").'
    )
  } else {
    corsOrigin = true // dev: aberto
    fastify.log.warn('[ALETIS] CORS aberto (dev). Em prod use CORS_ALLOWED_ORIGINS.')
  }
  await fastify.register(cors, { origin: corsOrigin, credentials: true })

  // --- Rate-limit global (proteção básica contra abuso) ---
  // 300 req/min por IP no global; rotas pesadas (ALIX/Foundry) configuram
  // limites mais restritivos via opção rateLimit no próprio handler.
  await fastify.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
    allowList: ['127.0.0.1', '::1'],
    cache: 10_000,
    errorResponseBuilder: (_req, ctx) => ({
      success: false,
      error: `Limite de requisições excedido (${ctx.max}/${ctx.after}). Aguarde e tente novamente.`,
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
      retryAfter: Math.ceil(ctx.ttl / 1000),
    }),
  })

  // --- Métricas Prometheus em /metrics ---
  // fastify-metrics expõe req duration, count, status code, route, e métricas
  // default do prom-client (cpu, mem, gc, event-loop). Default endpoint /metrics.
  await fastify.register(metricsPlugin, {
    endpoint: '/metrics',
    routeMetrics: {
      enabled: true,
      registeredRoutesOnly: false,
    },
    defaultMetrics: { enabled: true },
  })

  // --- JWT (Portal do Cliente) ---
  // Em produção, JWT_SECRET é OBRIGATÓRIO (sem fallback hardcoded — risco de
  // forjar tokens). Em dev/test, cai num secret default avisando o operador.
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[ALETIS] JWT_SECRET é obrigatório em produção. Configure-o no .env ou no provedor de secrets.'
      )
    }
    fastify.log.warn(
      '[ALETIS] JWT_SECRET não setado — usando secret default DEV. Não use em produção.'
    )
  }
  await fastify.register(jwt, {
    secret: jwtSecret || 'aletis-portal-dev-secret-change-me-in-prod',
    sign: { expiresIn: '12h' },
  })

  // Cookie HttpOnly para SSE — permite EventSource autenticado sem expor
  // o JWT no querystring (que vaza em logs/proxies). O frontend usa
  // withCredentials no EventSource e Authorization Bearer no resto.
  await fastify.register(cookie, {
    secret: jwtSecret || 'aletis-portal-dev-secret-change-me-in-prod',
    parseOptions: {},
  })

  // --- Multipart (uploads de NF, comprovantes, OFX, etc) ---
  await fastify.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25 MB por arquivo
      files: 10,
    },
  })

  // --- Request logging hook ---
  fastify.addHook('onRequest', async (request) => {
    request.log.info({ method: request.method, url: request.url }, 'incoming request')
  })

  // --- Global error handler ---
  fastify.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request, reply) => {
    const statusCode = error.statusCode ?? 500
    request.log.error({ err: error, method: request.method, url: request.url }, 'request error')

    reply.status(statusCode).send({
      success: false,
      error: error.message || 'Erro interno do servidor',
      code: error.code || 'INTERNAL_ERROR',
      statusCode,
      timestamp: new Date().toISOString(),
    })
  })

  // --- Not found handler ---
  fastify.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      success: false,
      error: 'Rota não encontrada',
      code: 'NOT_FOUND',
      statusCode: 404,
      timestamp: new Date().toISOString(),
    })
  })

  // --- Health check ---
  // /api/health         → resposta rápida (apenas API up). 200 OK sempre
  //                       que o processo responde — usado por load
  //                       balancer + Docker HEALTHCHECK.
  // /api/health/deep    → checa banco + storage + ALIX/Foundry. Mais
  //                       lento (até ~5s). Usar pra dashboard/migração.
  fastify.get('/api/health', async () => {
    return {
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        services: {
          api: 'running',
          calculationEngine: 'active',
        },
      },
    }
  })

  fastify.get('/api/health/deep', async (_req, reply) => {
    const start = Date.now()
    const result: Record<string, unknown> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      checks: {} as Record<string, { ok: boolean; detail?: string; tookMs?: number }>,
    }
    const checks = result.checks as Record<string, { ok: boolean; detail?: string; tookMs?: number }>

    // 1) Postgres reachability
    if (process.env.ALETIS_PG_ENABLED === '1') {
      const t = Date.now()
      try {
        const { getDb } = await import('./db/client.js')
        const { sql } = await import('drizzle-orm')
        const db = getDb() as any
        // drizzle .execute precisa de sql tag — fallback no $client.query
        try {
          await db.execute(sql`select 1`)
        } catch {
          const pool = db?.$client ?? db?._?.session?.client
          await pool?.query?.('select 1')
        }
        checks.postgres = { ok: true, tookMs: Date.now() - t }
      } catch (err) {
        checks.postgres = { ok: false, detail: (err as Error).message, tookMs: Date.now() - t }
      }
    } else {
      checks.postgres = { ok: true, detail: 'disabled (ALETIS_PG_ENABLED != 1)' }
    }

    // 2) Storage de uploads do portal
    try {
      const { existsSync, statSync } = await import('node:fs')
      const path = process.env.ALETIS_PORTAL_UPLOAD_DIR || './storage/portal-uploads'
      if (existsSync(path)) {
        const s = statSync(path)
        checks.storage = { ok: s.isDirectory(), detail: path }
      } else {
        // Não é erro — diretório é criado on-demand no primeiro upload
        checks.storage = { ok: true, detail: `${path} (será criado no primeiro upload)` }
      }
    } catch (err) {
      checks.storage = { ok: false, detail: (err as Error).message }
    }

    // 3) ALIX / Foundry (apenas se habilitado)
    if (process.env.ALIX_USE_LLM !== 'false' && process.env.AZURE_AI_SERVICES_KEY) {
      checks.alix = { ok: true, detail: 'Foundry credentials present (no ping)' }
    } else {
      checks.alix = { ok: true, detail: 'disabled or no credentials' }
    }

    result.tookMs = Date.now() - start
    const allOk = Object.values(checks).every((c) => c.ok)
    result.status = allOk ? 'ok' : 'degraded'
    if (!allOk) reply.code(503)
    return { success: true, data: result }
  })

  // --- Auto-register route modules ---
  // Per-file try/catch: one bad module should not skip the rest.
  const routesDir = join(__dirname, 'routes')
  let files: string[] = []
  try {
    files = readdirSync(routesDir)
  } catch (err) {
    fastify.log.error({ err }, 'Could not read routes directory')
  }
  for (const file of files) {
    if (!file.endsWith('.ts') && !file.endsWith('.js')) continue
    const modulePath = join(routesDir, file)
    try {
      const routeModule = await import(modulePath)
      const handler = routeModule.default || routeModule
      if (typeof handler === 'function') {
        await fastify.register(handler)
        fastify.log.info(`Route module registered: ${file}`)
      }
    } catch (err) {
      fastify.log.error({ err, file }, `Failed to load route module: ${file}`)
    }
  }

  return fastify
}

async function start(): Promise<void> {
  const app = await buildApp()

  // Auto-migrate antes do listen quando ALETIS_AUTO_MIGRATE=1.
  // Em docker-compose o ambiente é prod e migrations rodam sempre;
  // em dev local é no-op (env não setada).
  try {
    const { runAutoMigrationsIfEnabled } = await import('./lib/auto-migrate.js')
    await runAutoMigrationsIfEnabled(app.log)
  } catch (err) {
    app.log.error({ err }, '[boot] auto-migrate falhou — abortando start')
    process.exit(1)
  }

  // Hidrata stores em memória do Portal a partir do PG (best-effort).
  // Restaura magic-links válidos, pendências e uploads após restart.
  if (process.env.ALETIS_PG_ENABLED === '1') {
    try {
      const [tk, st] = await Promise.all([
        import('./services/PortalTokenService.js').then((m) => m.hydrateFromPg()),
        import('./services/PortalStore.js').then((m) => m.hydratePortalStoreFromPg()),
      ])
      app.log.info(
        { tokens: tk, pendencias: st.pendencias, uploads: st.uploads },
        '[boot] portal hidratado do PG'
      )
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, '[boot] hydrate portal falhou (non-fatal)')
    }
  }

  try {
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`ALETIS API server running on http://${HOST}:${PORT}`)
    // printRoutes() é caro e polui logs em produção (Pino estruturado).
    // Em prod só logamos o número de rotas; em dev mostramos a árvore.
    if (process.env.NODE_ENV === 'production') {
      app.log.info(`Routes registered (count): ${app.printRoutes().split('\n').filter(Boolean).length}`)
    } else {
      app.log.info('Routes registered:')
      const routes = app.printRoutes()
      console.log(routes)
    }

    // Hidratação/seed do Map de clientes a partir do Postgres
    // (ALETIS_PG_ENABLED=1):
    //   - PG tem dados → sobrescreve Map com PG (estado persistido vence)
    //   - PG vazio → dumpa Map (seed) no PG (one-shot bootstrap)
    // Best-effort: erro de PG é só log (servidor já está saudável).
    try {
      const { hydrateOrSeedClientesPg } = await import('./routes/clientes.js')
      const r = await hydrateOrSeedClientesPg()
      if (r.hydrated > 0) {
        app.log.info(`[ALETIS-PG] ${r.hydrated} cliente(s) hidratado(s) do Postgres.`)
      } else if (r.seeded > 0) {
        app.log.info(`[ALETIS-PG] PG vazio — semeado com ${r.seeded} cliente(s) do seed em memória.`)
      }
    } catch (err) {
      app.log.warn({ err }, '[ALETIS-PG] hydrate/seed cliente falhou — seguindo com Map em memória.')
    }

    // Mesmo padrão para propostas (legacy + inteligente).
    try {
      const { hydrateOrSeedPropostasPg } = await import('./routes/propostas.js')
      const r = await hydrateOrSeedPropostasPg()
      if (r.hydrated > 0) {
        app.log.info(`[ALETIS-PG] ${r.hydrated} proposta(s) hidratada(s) do Postgres.`)
      } else if (r.seeded > 0) {
        app.log.info(`[ALETIS-PG] PG vazio — semeado com ${r.seeded} proposta(s) do seed em memória.`)
      }
    } catch (err) {
      app.log.warn({ err }, '[ALETIS-PG] hydrate/seed proposta falhou — seguindo com Map em memória.')
    }

    // Alix Insano F8 — ProactiveService (ingest + insights)
    if ((process.env.ALIX_PROACTIVE_ENABLED ?? 'true').toLowerCase() !== 'false') {
      try {
        const { getProspeccaoService } = await import('./services/prospeccao/ProspeccaoService.js')
        const { getProactiveService } = await import('./services/alix/ProactiveService.js')
        const { join } = await import('path')
        const storageDir = join(process.cwd(), 'storage')
        const proactive = getProactiveService(getProspeccaoService(), storageDir)
        proactive.start()
      } catch (err) {
        console.warn('[server] ProactiveService não iniciou:', (err as Error).message)
      }
    }

    // Sondagem periódica das fontes de dados — primeira após 15s,
    // repetição a cada 10 minutos. Isso mantém o dashboard "Fontes"
    // com status atualizados em vez de "Desconhecido".
    try {
      const { DataSourceManager } = await import('./services/DataSourceManager.js')
      const manager = DataSourceManager.getInstance()

      const runProbe = async () => {
        try {
          const resumo = await manager.probeAllSources()
          app.log.info(
            { resumo },
            `[Fontes] Sondagem concluída: ${resumo.online} online, ${resumo.degraded} degradadas, ${resumo.offline} offline`
          )
        } catch (err) {
          app.log.warn({ err }, '[Fontes] Falha na sondagem periódica')
        }
      }

      // .unref() em ambos: timers de probe não impedem o processo de
      // fechar limpo (testes, SIGTERM em prod). Sem isso, Node fica
      // preso no event loop até o próximo fire.
      setTimeout(() => void runProbe(), 15_000).unref()
      setInterval(() => void runProbe(), 10 * 60_000).unref()
    } catch (err) {
      app.log.warn({ err }, '[Fontes] Não foi possível agendar sondagens periódicas')
    }
  } catch (err) {
    app.log.fatal(err)
    process.exit(1)
  }
}

// Só chama start() quando esse arquivo é o entrypoint (dev/prod), não quando
// importado por testes (Vitest faz `await import(...)` para usar buildApp).
const isMain =
  typeof process.argv[1] === 'string' &&
  import.meta.url === `file://${process.argv[1]}`
if (isMain || process.env.ALETIS_FORCE_START === '1') {
  start()
}

export { buildApp }
