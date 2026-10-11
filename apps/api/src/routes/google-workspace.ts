import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { clientes } from './clientes.js'
import { isMimeAllowed } from '../lib/upload-validation.js'
import { actorFromRequest, getAccessControlService } from '../services/core/AccessControlService.js'
import { getGoogleWorkspaceClient } from '../services/google-workspace/client.js'
import { getGoogleTokenStore } from '../services/google-workspace/tokenStore.js'
import { getGoogleWorkspaceAuditService } from '../services/google-workspace/audit.js'
import { getGoogleWorkspaceService } from '../services/google-workspace/services.js'
import { getGoogleDriveService } from '../services/google-workspace/drive.js'
import { getGoogleDocsService } from '../services/google-workspace/docs.js'
import { getGoogleWorkspaceCalendarService } from '../services/google-workspace/calendar.js'
import { getGoogleGmailService } from '../services/google-workspace/gmail.js'
import type { GoogleWorkspaceActor } from '../services/google-workspace/schemas.js'
import { z } from 'zod'
import { resolveInternalSession } from '../lib/internal-auth.js'
import { driveConnectionManager } from '../services/google-workspace/DriveAuthorization.js'
import { getCorporateDriveCredentials } from '../services/google-workspace/CorporateDriveCredentials.js'

import { DriveImportBatchError, getDriveImportBatchService } from '../services/google-workspace/DriveImportBatchService.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

function requestOrigin(request: FastifyRequest): string {
  const proto = String(request.headers['x-forwarded-proto'] || 'http').split(',')[0]
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || 'localhost:3001').split(',')[0]
  return `${proto}://${host}`
}

function frontendRedirect(request: FastifyRequest, params: Record<string, string>): string {
  const base = process.env.GOOGLE_OAUTH_FRONTEND_URL || requestOrigin(request)
  const url = new URL('/configuracoes', base)
  url.searchParams.set('tab', 'google')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

function actor(request: FastifyRequest): GoogleWorkspaceActor {
  const user = resolveInternalSession(request.server, request)
  if (user) return { userId: user.id, userName: user.nome, role: 'consultor', tenantId: process.env.ALETIS_TENANT_ID || 'default' }
  const a = actorFromRequest(request)
  return {
    userId: a.id,
    userName: a.nome,
    role: a.role,
    tenantId: process.env.ALETIS_TENANT_ID || 'default',
  }
}

function callbackActor(payload: { userId: string; tenantId: string }): GoogleWorkspaceActor {
  return {
    userId: payload.userId,
    userName: 'Google OAuth',
    role: 'admin_master',
    tenantId: payload.tenantId || process.env.ALETIS_TENANT_ID || 'default',
  }
}

function assertWorkspaceAdmin(gwActor: GoogleWorkspaceActor, reply: FastifyReply): boolean {
  const strict = (process.env.ALETIS_RBAC_STRICT || '').toLowerCase() === 'true'
  if (!strict) return true
  if (gwActor.role === 'admin_master') return true
  reply.status(403).send(fail('Somente administrador pode conectar ou desconectar o Google Workspace.', 'FORBIDDEN'))
  return false
}

function getClienteOr404(id: string, reply: FastifyReply): any | null {
  const cliente = clientes.get(id)
  if (!cliente) {
    reply.status(404).send(fail('Cliente não encontrado.', 'CLIENT_NOT_FOUND'))
    return null
  }
  return cliente
}

async function assertClientAccess(request: FastifyRequest, reply: FastifyReply, cliente: any, action: 'read' | 'write' | 'document:write' | 'document:read') {
  try {
    await getAccessControlService().assertClienteAccess({
      actor: resolveInternalSession(request.server, request) ? { ...actorFromRequest(request), id: actor(request).userId, nome: actor(request).userName, role: 'consultor', consultorId: actor(request).userId } : actorFromRequest(request),
      clienteId: cliente.id,
      cliente,
      action,
    })
    return true
  } catch (err) {
    reply.status((err as any).statusCode || 403).send(fail((err as Error).message, 'FORBIDDEN'))
    return false
  }
}

function fieldValue(file: MultipartFile, name: string): string | undefined {
  const value = (file.fields as Record<string, any>)?.[name]?.value
  return value == null ? undefined : String(value)
}

export default async function googleWorkspaceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/integrations/google/status', async (request) => {
    return ok({ ...await getGoogleWorkspaceService().status(actor(request)), canManageConnection: Boolean(driveConnectionManager(request)) })
  })

  fastify.get('/api/integrations/google/auth-url', async (request: FastifyRequest<{ Querystring: { returnPath?: string } }>, reply) => {
    const gwActor = actor(request)
    if (!assertWorkspaceAdmin(gwActor, reply)) return
    const authorizationUrl = getGoogleWorkspaceClient().buildAuthUrl(gwActor, requestOrigin(request), request.query.returnPath)
    return ok({ authorizationUrl })
  })

  fastify.get('/api/integrations/google/callback', async (request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>, reply) => {
    try {
      if (request.query.error) {
        return reply.redirect(frontendRedirect(request, { google: 'error', message: request.query.error }))
      }
      if (!request.query.code || !request.query.state) {
        return reply.redirect(frontendRedirect(request, { google: 'error', message: 'callback_incompleto' }))
      }
      const state = getGoogleWorkspaceClient().verifyState(request.query.state)
      const gwActor = callbackActor(state)
      const corporate = state.purpose === 'corporate_drive'
      const result = await getGoogleWorkspaceClient().exchangeCode(request.query.code, requestOrigin(request), corporate ? 'corporate_drive' : undefined)
      const connection = {
        actor: gwActor,
        googleEmail: result.googleEmail,
        googleAccountId: result.googleAccountId,
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        tokenExpiry: result.tokens.tokenExpiry,
        scopes: result.tokens.scopes,
        metadata: { connectedVia: corporate ? 'corporate_oauth' : 'oauth2', returnPath: state.returnPath || null },
      }
      if (corporate) {
        await getGoogleTokenStore().saveCorporateConnected(connection)
        getCorporateDriveCredentials().invalidate()
      } else await getGoogleTokenStore().saveConnected(connection)
      await getGoogleWorkspaceAuditService().record({
        actor: gwActor,
        action: corporate ? 'google_drive_persistent_connected' : 'google_workspace_connected',
        resourceType: 'google_connection',
        status: 'succeeded',
        metadata: { googleEmail: result.googleEmail, scopes: result.tokens.scopes },
      })
      return reply.redirect(frontendRedirect(request, { google: 'connected' }))
    } catch (err) {
      request.log.warn({ code: 'GOOGLE_OAUTH_CALLBACK_FAILED' }, '[google-workspace] callback falhou')
      return reply.redirect(frontendRedirect(request, { google: 'error', message: 'falha_oauth' }))
    }
  })

  fastify.post('/api/integrations/google/disconnect', async (request, reply) => {
    const gwActor = actor(request)
    if (!assertWorkspaceAdmin(gwActor, reply)) return
    const disconnected = await getGoogleWorkspaceService().disconnect(gwActor)
    await getGoogleWorkspaceAuditService().record({
      actor: gwActor,
      action: 'google_workspace_disconnected',
      resourceType: 'google_connection',
      resourceId: disconnected?.id,
      status: disconnected ? 'succeeded' : 'skipped',
    })
    return ok({ disconnected: Boolean(disconnected), status: await getGoogleWorkspaceService().status(gwActor) })
  })

  fastify.get('/api/integrations/google/audit-logs', async (request: FastifyRequest<{ Querystring: { limit?: string } }>) => {
    const limit = Math.min(Number(request.query.limit || 100) || 100, 500)
    const logs = await getGoogleWorkspaceAuditService().list(actor(request), limit)
    return ok({ logs, total: logs.length })
  })

  fastify.get('/api/integrations/google/client/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente) return
    if (!await assertClientAccess(request, reply, cliente, 'read')) return
    return ok(await getGoogleWorkspaceService().clientBundle(actor(request), cliente.id))
  })

  fastify.get('/api/clientes/:id/google-workspace', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente) return
    if (!await assertClientAccess(request, reply, cliente, 'read')) return
    return ok(await getGoogleWorkspaceService().clientBundle(actor(request), cliente.id))
  })

  fastify.post('/api/integrations/google/drive/create-client-folder', async (request: FastifyRequest<{ Body: { clientId?: string } }>, reply) => {
    const clientId = request.body?.clientId
    if (!clientId) return reply.status(400).send(fail('clientId obrigatório.', 'BAD_REQUEST'))
    const cliente = getClienteOr404(clientId, reply)
    if (!cliente) return
    if (!await assertClientAccess(request, reply, cliente, 'document:write')) return
    const folder = await getGoogleDriveService().createClientFolder({
      actor: actor(request),
      clientId: cliente.id,
      clientName: cliente.nome,
    })
    return reply.status(folder.createdNow ? 201 : 200).send(ok(folder))
  })

  fastify.post('/api/integrations/google/drive/upload-client-file', async (request: FastifyRequest<{ Querystring: { clientId?: string } }>, reply) => {
    let file: MultipartFile | undefined
    try {
      file = await request.file()
    } catch (err) {
      request.log.warn({ err }, '[google-workspace] falha ao ler multipart')
      return reply.status(400).send(fail('Falha ao ler arquivo enviado.', 'BAD_MULTIPART'))
    }
    if (!file) return reply.status(400).send(fail('Nenhum arquivo enviado.', 'NO_FILE'))
    if (!isMimeAllowed(file.mimetype)) return reply.status(415).send(fail(`Tipo de arquivo não suportado: ${file.mimetype}.`, 'UNSUPPORTED_MEDIA_TYPE'))
    const clientId = request.query.clientId || fieldValue(file, 'clientId')
    if (!clientId) return reply.status(400).send(fail('clientId obrigatório.', 'BAD_REQUEST'))
    const cliente = getClienteOr404(clientId, reply)
    if (!cliente) return
    if (!await assertClientAccess(request, reply, cliente, 'document:write')) return
    const uploaded = await getGoogleDriveService().uploadBufferToClientFolder({
      actor: actor(request),
      clientId: cliente.id,
      clientName: cliente.nome,
      filename: file.filename,
      mime: file.mimetype,
      buffer: await file.toBuffer(),
      subfolder: fieldValue(file, 'subfolder'),
    })
    return reply.status(201).send(ok(uploaded))
  })

  fastify.get('/api/integrations/google/drive/client/:id/files', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente) return
    if (!await assertClientAccess(request, reply, cliente, 'document:read')) return
    const query = z.object({ refresh: z.enum(['true', 'false']).optional() }).safeParse(request.query)
    if (!query.success) return reply.status(400).send(fail('Parâmetros de consulta inválidos.', 'BAD_REQUEST'))
    const inventory = await getGoogleDriveService().listClientFiles({
      actor: actor(request),
      clientId: cliente.id,
      refresh: query.data.refresh === 'true',
    })
    return ok({ ...inventory, total: inventory.files.length })
  })

  fastify.post('/api/integrations/google/drive/client/:id/import', async (
    request: FastifyRequest<{ Params: { id: string }; Body: { requestId?: string; fileIds?: string[] } }>,
    reply,
  ) => {
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente) return
    if (!await assertClientAccess(request, reply, cliente, 'document:write')) return
    if (!resolveInternalSession(request.server, request)) return reply.status(401).send(fail('Autenticação interna necessária.', 'AUTH_REQUIRED'))
    const parsed = z.object({ requestId: z.string().uuid(), fileIds: z.array(z.string().trim().regex(/^[A-Za-z0-9_-]{6,160}$/)).min(1).max(20) }).strict().safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail('Selecione de 1 a 20 arquivos válidos do Google Drive.', 'INVALID_DRIVE_FILES'))
    const controller = new AbortController()
    const disconnect = () => { if (!reply.raw.writableEnded) controller.abort() }
    reply.raw.once('close', disconnect)
    try {
      const receipt = await getDriveImportBatchService().run({ actor: actor(request), clientId: cliente.id, clientName: String(cliente.nome || cliente.id), ...parsed.data, signal: controller.signal })
      return reply.status(receipt.status === 'completed' ? 200 : 202).send(ok(receipt))
    } catch (error) {
      request.log.warn({ err: error }, '[google-workspace] falha no lote retomável')
      return reply.status(error instanceof DriveImportBatchError ? error.statusCode : 503).send(fail(error instanceof DriveImportBatchError ? error.message : 'A importação foi interrompida. Retome o mesmo lote; os arquivos recebidos foram preservados.', 'DRIVE_IMPORT_FAILED'))
    } finally { reply.raw.off('close', disconnect) }
  })

  fastify.get('/api/integrations/google/drive/client/:id/import-batches', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    if (!resolveInternalSession(request.server, request)) return reply.status(401).send(fail('Autenticação interna necessária.', 'AUTH_REQUIRED'))
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente || !await assertClientAccess(request, reply, cliente, 'document:read')) return
    return ok({ batches: await getDriveImportBatchService().list(actor(request), cliente.id) })
  })

  fastify.get('/api/integrations/google/drive/client/:id/import-batches/:requestId', async (request: FastifyRequest<{ Params: { id: string; requestId: string } }>, reply) => {
    if (!resolveInternalSession(request.server, request)) return reply.status(401).send(fail('Autenticação interna necessária.', 'AUTH_REQUIRED'))
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente || !await assertClientAccess(request, reply, cliente, 'document:read')) return
    if (!z.string().uuid().safeParse(request.params.requestId).success) return reply.status(400).send(fail('Lote inválido.', 'BAD_REQUEST'))
    const batch = await getDriveImportBatchService().get(actor(request), cliente.id, request.params.requestId)
    if (!batch) return reply.status(404).send(fail('Lote não encontrado.', 'NOT_FOUND'))
    return ok(batch)
  })

  fastify.post('/api/integrations/google/docs/create-from-template', async (request: FastifyRequest<{ Body: { clientId?: string; documentType?: string; title?: string; templateId?: string } }>, reply) => {
    const clientId = request.body?.clientId
    if (!clientId) return reply.status(400).send(fail('clientId obrigatório.', 'BAD_REQUEST'))
    const cliente = getClienteOr404(clientId, reply)
    if (!cliente) return
    if (!await assertClientAccess(request, reply, cliente, 'write')) return
    const doc = await getGoogleDocsService().createFromTemplate({
      actor: actor(request),
      clientId: cliente.id,
      cliente,
      documentType: request.body?.documentType || 'relatorio_estrategico',
      title: request.body?.title,
      templateId: request.body?.templateId,
    })
    return reply.status(201).send(ok(doc))
  })

  fastify.post('/api/integrations/google/calendar/create-event', async (request: FastifyRequest<{ Body: { clientId?: string; title?: string; description?: string; startTime?: string; endTime?: string; attendees?: string[]; createMeetLink?: boolean } }>, reply) => {
    const clientId = request.body?.clientId
    if (!clientId) return reply.status(400).send(fail('clientId obrigatório.', 'BAD_REQUEST'))
    if (!request.body?.title || !request.body?.startTime) return reply.status(400).send(fail('Título e início são obrigatórios.', 'BAD_REQUEST'))
    const cliente = getClienteOr404(clientId, reply)
    if (!cliente) return
    if (!await assertClientAccess(request, reply, cliente, 'write')) return
    const event = await getGoogleWorkspaceCalendarService().createEvent({
      actor: actor(request),
      clientId: cliente.id,
      clienteNome: cliente.nome,
      title: request.body.title,
      description: request.body.description,
      startTime: request.body.startTime,
      endTime: request.body.endTime,
      attendees: request.body.attendees,
      createMeetLink: request.body.createMeetLink,
    })
    return reply.status(201).send(ok(event))
  })

  fastify.post('/api/integrations/google/calendar/cancel-event', async (request: FastifyRequest<{ Body: { googleEventId?: string } }>, reply) => {
    if (!request.body?.googleEventId) return reply.status(400).send(fail('googleEventId obrigatório.', 'BAD_REQUEST'))
    await getGoogleWorkspaceCalendarService().cancelEvent(actor(request), request.body.googleEventId)
    return ok({ cancelled: true })
  })

  fastify.post('/api/integrations/google/gmail/send', async (request: FastifyRequest<{ Body: { clientId?: string; to?: string; subject?: string; body?: string } }>, reply) => {
    const clientId = request.body?.clientId
    if (!clientId) return reply.status(400).send(fail('clientId obrigatório.', 'BAD_REQUEST'))
    const cliente = getClienteOr404(clientId, reply)
    if (!cliente) return
    if (!await assertClientAccess(request, reply, cliente, 'write')) return
    const email = await getGoogleGmailService().send({
      actor: actor(request),
      clientId: cliente.id,
      clienteNome: cliente.nome,
      to: request.body?.to || '',
      subject: request.body?.subject || '',
      body: request.body?.body || '',
    })
    return reply.status(201).send(ok(email))
  })

  fastify.log.info('[Google Workspace] Rotas registradas: OAuth, Drive, Docs, Calendar, Gmail e auditoria')
}
