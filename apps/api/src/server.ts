import Fastify from 'fastify'
import cors from '@fastify/cors'
import { join, dirname } from 'path'
import { readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'

/** Probe for pino-pretty — optional dev dependency */
function getLoggerTransport(): object | undefined {
  if (process.env.NODE_ENV === 'production') return undefined
  try {
    require.resolve('pino-pretty')
    return { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
  } catch {
    return undefined
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: getLoggerTransport(),
    },
  })

  // --- CORS ---
  await fastify.register(cors, { origin: true, credentials: true })

  // --- Request logging hook ---
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    request.log.info({ method: request.method, url: request.url }, 'incoming request')
  })

  // --- Global error handler ---
  fastify.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
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
  fastify.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({
      success: false,
      error: 'Rota não encontrada',
      code: 'NOT_FOUND',
      statusCode: 404,
      timestamp: new Date().toISOString(),
    })
  })

  // --- Health check ---
  fastify.get('/api/health', async () => {
    return {
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        services: {
          api: 'running',
          database: 'in-memory',
          calculationEngine: 'active',
        },
      },
    }
  })

  // --- Auto-register route modules ---
  const routesDir = join(__dirname, 'routes')
  try {
    const files = readdirSync(routesDir)
    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        const modulePath = join(routesDir, file)
        const routeModule = await import(modulePath)
        const handler = routeModule.default || routeModule
        if (typeof handler === 'function') {
          await fastify.register(handler)
          fastify.log.info(`Route module registered: ${file}`)
        }
      }
    }
  } catch (err) {
    fastify.log.warn({ err }, 'Could not auto-load routes directory')
  }

  return fastify
}

async function start(): Promise<void> {
  const app = await buildApp()

  try {
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`ALETIS API server running on http://${HOST}:${PORT}`)
    app.log.info('Routes registered:')
    const routes = app.printRoutes()
    console.log(routes)
  } catch (err) {
    app.log.fatal(err)
    process.exit(1)
  }
}

start()

export { buildApp }
