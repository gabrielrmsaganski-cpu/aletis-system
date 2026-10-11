import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { driveConnectionManager, DriveAuthorizationError, getDriveAuthorizationService } from '../services/google-workspace/DriveAuthorization.js'
import { getGoogleWorkspaceService } from '../services/google-workspace/services.js'
import { getGoogleWorkspaceAuditService } from '../services/google-workspace/audit.js'
import { getCorporateDriveCredentials } from '../services/google-workspace/CorporateDriveCredentials.js'
import { getGoogleWorkspaceClient } from '../services/google-workspace/client.js'

function manager(request: FastifyRequest, reply: FastifyReply) {
  const user = driveConnectionManager(request)
  if (!user) {
    reply.status(403).send({ success: false, code: 'FORBIDDEN', error: 'Somente o responsável pela conta corporativa pode renovar esta conexão.' })
    return null
  }
  const origin = request.headers.origin
  if (origin) {
    let sameOrigin = false
    try { sameOrigin = new URL(origin).host === request.headers.host } catch { /* Origem inválida. */ }
    if (!sameOrigin || request.headers['sec-fetch-site'] === 'cross-site') {
      reply.status(403).send({ success: false, code: 'FORBIDDEN', error: 'Inicie a autorização pelo painel do ALETIS.' })
      return null
    }
  }
  return { userId: user.id, userName: user.nome, role: 'consultor', tenantId: process.env.ALETIS_TENANT_ID || 'default' }
}

function failure(reply: FastifyReply, error: unknown) {
  return reply.status(error instanceof DriveAuthorizationError ? error.statusCode : 503).send({
    success: false, code: 'DRIVE_AUTHORIZATION_FAILED',
    error: error instanceof DriveAuthorizationError ? error.message : 'Não foi possível concluir a autorização Google. Tente novamente.',
  })
}

export default async function googleDriveAuthorizationRoutes(fastify: FastifyInstance) {
  const options = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }
  fastify.get('/api/integrations/google/drive/corporate/status', async (request, reply) => {
    const actor = manager(request, reply)
    if (!actor) return
    reply.header('Cache-Control', 'private, no-store')
    try {
      const status = await getCorporateDriveCredentials().statusPreflight()
      return { success: true, data: { ...status, setup: {
        redirectUri: process.env.GOOGLE_REDIRECT_URI || null,
        clientsUrl: 'https://console.cloud.google.com/auth/clients',
        consentRequirement: 'Use aplicativo em produção ou interno. O modo de teste do Google pode expirar a autorização em sete dias.',
      } } }
    } catch (error) { return failure(reply, error) }
  })
  fastify.post('/api/integrations/google/drive/corporate/authorization/start', options, async (request, reply) => {
    const actor = manager(request, reply)
    if (!actor) return
    reply.header('Cache-Control', 'private, no-store')
    try {
      const authorizationUrl = getGoogleWorkspaceClient().buildCorporateDriveAuthUrl(actor, undefined, '/configuracoes?tab=google')
      await getGoogleWorkspaceAuditService().record({ actor, action: 'google_drive_persistent_authorization_started', resourceType: 'google_connection', status: 'succeeded' })
      return { success: true, data: { authorizationUrl } }
    } catch (error) { return failure(reply, error) }
  })
  fastify.post('/api/integrations/google/drive/authorization/start', options, async (request, reply) => {
    const actor = manager(request, reply)
    if (!actor) return
    reply.header('Cache-Control', 'no-store')
    try {
      const data = await getDriveAuthorizationService().start(`${actor.tenantId}:${actor.userId}`)
      return { success: true, data }
    } catch (error) { return failure(reply, error) }
  })
  fastify.post('/api/integrations/google/drive/authorization/complete', options, async (request, reply) => {
    const actor = manager(request, reply)
    if (!actor) return
    reply.header('Cache-Control', 'no-store')
    const body = z.object({ attemptId: z.string().uuid(), code: z.string().trim().min(1).max(4096).regex(/^[^\r\n\u0000]+$/) }).strict().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ success: false, error: 'Código ou tentativa de autorização inválida.', code: 'BAD_REQUEST' })
    try {
      await getDriveAuthorizationService().finish(`${actor.tenantId}:${actor.userId}`, body.data.attemptId, body.data.code)
      const status = await getGoogleWorkspaceService().status(actor)
      await getGoogleWorkspaceAuditService().record({ actor, action: 'google_drive_reauthorized', resourceType: 'google_connection', status: status.status === 'connected' ? 'succeeded' : 'failed' })
      return { success: true, data: { status } }
    } catch (error) { return failure(reply, error) }
  })
  fastify.post('/api/integrations/google/drive/authorization/cancel', options, async (request, reply) => {
    const actor = manager(request, reply)
    if (!actor) return
    const body = z.object({ attemptId: z.string().uuid() }).strict().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ success: false, error: 'Tentativa inválida.', code: 'BAD_REQUEST' })
    try {
      getDriveAuthorizationService().cancel(`${actor.tenantId}:${actor.userId}`, body.data.attemptId)
      return { success: true, data: { cancelled: true } }
    } catch (error) { return failure(reply, error) }
  })
}
