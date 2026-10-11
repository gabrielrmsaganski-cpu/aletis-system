import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { alixAuthMiddleware } from '../middleware/alixAuth.js'
import { DriveCorpusError, getDriveCorpusService } from '../services/google-workspace/DriveCorpusService.js'
import type { GoogleWorkspaceActor } from '../services/google-workspace/schemas.js'
import { listDriveCorpusAnalyses } from '../services/alix/intake/DriveCorpusAnalysisService.js'

const optionalText = z.string().trim().min(1).max(180).optional()
const querySchema = z.object({
  clienteId: optionalText, query: z.string().trim().max(300).optional(), category: z.string().max(100).optional(),
  status: z.enum(['pending','complete','partial','failed','unsupported','changed','deferred']).optional(),
  changedSince: z.string().datetime({ offset: true }).optional(),
  corporateOnly: z.enum(['1','0','true','false']).optional().transform(value => value === '1' || value === 'true'),
  offset: z.coerce.number().int().min(0).max(2_000_000).optional(), limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()
const readSchema = z.object({ clienteId: optionalText, cursor: z.string().max(1500).optional(), maxChars: z.coerce.number().int().min(1000).max(16000).optional() }).strict()
function actor(request: FastifyRequest): GoogleWorkspaceActor {
  const user = request.alixUser
  if (!user?.id || user.authSource === 'anonymous') throw new DriveCorpusError('Autenticação necessária.', 401, 'AUTH_REQUIRED')
  return { userId: user.id, userName: user.nome, role: user.role || 'consultor', tenantId: process.env.ALETIS_TENANT_ID || 'default' }
}
async function respond(request: FastifyRequest, reply: FastifyReply, action: () => Promise<unknown>) {
  reply.header('Cache-Control','private, no-store')
  try { return { success: true, data: await action() } }
  catch (error) {
    if (error instanceof z.ZodError) return reply.status(400).send({ success: false, error: 'Parâmetros inválidos para consultar o Drive.' })
    if (error instanceof DriveCorpusError) return reply.status(error.statusCode).send({ success: false, error: error.message, code: error.code })
    // Não expor SQL, credenciais ou caminhos de extração na resposta ou no log.
    request.log.error({ errorType: error instanceof Error ? error.name : 'UnknownError' }, 'Falha no catálogo do Drive')
    return reply.status(503).send({ success: false, error: 'A consulta ao acervo está indisponível. Tente novamente.', code: 'DRIVE_CORPUS_UNAVAILABLE' })
  }
}
export default async function alixDriveCorpusRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest',async(_request,reply)=>{reply.header('Cache-Control','private, no-store')})
  const service = getDriveCorpusService()
  fastify.get('/api/alix/drive-corpus/analyses', { onRequest: alixAuthMiddleware }, (request,reply) => respond(request,reply,() => {
    const input=z.object({clienteId:optionalText,analysisId:z.string().regex(/^[a-f0-9]{64}$/).optional(),
      offset:z.coerce.number().int().min(0).max(2_000_000).optional(),limit:z.coerce.number().int().min(1).max(20).optional(),
      candidateOffset:z.coerce.number().int().min(0).max(256).optional(),candidateLimit:z.coerce.number().int().min(1).max(16).optional()}).strict().parse(request.query)
    return listDriveCorpusAnalyses(actor(request),input)
  }))
  fastify.get('/api/alix/drive-corpus/overview', { onRequest: alixAuthMiddleware }, (request,reply) => respond(request,reply,() => service.overview(actor(request),querySchema.parse(request.query))))
  fastify.get('/api/alix/drive-corpus/files', { onRequest: alixAuthMiddleware }, (request,reply) => respond(request,reply,() => service.list(actor(request),querySchema.parse(request.query))))
  fastify.get('/api/alix/drive-corpus/search', { onRequest: alixAuthMiddleware }, (request,reply) => respond(request,reply,() => service.search(actor(request),querySchema.parse(request.query))))
  fastify.get('/api/alix/drive-corpus/files/:fileId', { onRequest: alixAuthMiddleware }, (request,reply) => respond(request,reply,() => {
    const { fileId } = z.object({ fileId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/) }).parse(request.params)
    return service.read(actor(request),fileId,readSchema.parse(request.query))
  }))
}
