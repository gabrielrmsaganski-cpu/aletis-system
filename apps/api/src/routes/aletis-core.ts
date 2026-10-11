import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { clientes } from './clientes.js'
import { isMimeAllowed } from '../lib/upload-validation.js'
import { actorFromRequest, getAccessControlService } from '../services/core/AccessControlService.js'
import { getClientCoreService } from '../services/core/ClientCoreService.js'
import { getCoreDocumentService } from '../services/core/CoreDocumentService.js'
import { getClientIntelligenceService } from '../services/core/ClientIntelligenceService.js'
import { getAutomationEventService } from '../services/core/AutomationEventService.js'
import { getN8nAutomationService } from '../services/integrations/N8nAutomationService.js'
import { getGoogleDriveService } from '../services/google-workspace/drive.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

function getClienteOr404(id: string, reply: FastifyReply): any | null {
  const cliente = clientes.get(id)
  if (!cliente) {
    reply.status(404).send(fail('Cliente não encontrado.', 'CLIENT_NOT_FOUND'))
    return null
  }
  return cliente
}

async function assertAccess(request: FastifyRequest, reply: FastifyReply, cliente: any, action: Parameters<ReturnType<typeof getAccessControlService>['assertClienteAccess']>[0]['action']) {
  const actor = actorFromRequest(request)
  try {
    await getAccessControlService().assertClienteAccess({
      actor,
      clienteId: cliente.id,
      cliente,
      action,
    })
    return actor
  } catch (err) {
    reply.status((err as any).statusCode || 403).send(fail((err as Error).message, 'FORBIDDEN'))
    return null
  }
}

function fieldValue(file: MultipartFile, name: string): string | undefined {
  const fields = file.fields as Record<string, any>
  const value = fields?.[name]?.value
  return value == null ? undefined : String(value)
}

function shouldSyncToGoogleDrive(): boolean {
  return process.env.GOOGLE_DRIVE_SYNC_ENABLED === 'true'
}

function googleDriveSubfolder(categoria: string): string {
  if (categoria === 'contrato') return 'Contratos'
  if (categoria === 'proposta') return 'Propostas'
  return categoria === 'outros' ? 'Anexos' : 'Documentos'
}

async function handleCoreSummary(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const cliente = getClienteOr404(request.params.id, reply)
  if (!cliente) return
  const actor = await assertAccess(request, reply, cliente, 'read')
  if (!actor) return
  const data = await getClientCoreService().getSummary(cliente.id, cliente.timeline || [])
  return reply.send(ok(data))
}

async function handleDocumentsList(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const cliente = getClienteOr404(request.params.id, reply)
  if (!cliente) return
  const actor = await assertAccess(request, reply, cliente, 'document:read')
  if (!actor) return
  const documents = await getCoreDocumentService().listClientDocuments(cliente.id)
  return reply.send(ok({ clienteId: cliente.id, documents, total: documents.length }))
}

async function handleKnowledgeSummary(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const cliente = getClienteOr404(request.params.id, reply)
  if (!cliente) return
  const actor = await assertAccess(request, reply, cliente, 'ai:ask')
  if (!actor) return
  const data = await getCoreDocumentService().knowledgeSummary(cliente.id)
  return reply.send(ok(data))
}

async function handleAsk(request: FastifyRequest<{ Params: { id: string }; Body: { question?: string; message?: string } }>, reply: FastifyReply) {
  const cliente = getClienteOr404(request.params.id, reply)
  if (!cliente) return
  const actor = await assertAccess(request, reply, cliente, 'ai:ask')
  if (!actor) return
  const question = request.body?.question || request.body?.message || ''
  if (!question.trim()) return reply.status(400).send(fail('Pergunta obrigatória.', 'BAD_REQUEST'))
  const answer = await getClientIntelligenceService().ask({ cliente, question, actor })
  return reply.send(ok(answer))
}

export default async function aletisCoreRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/clients/:id/core', handleCoreSummary)
  fastify.get('/api/clientes/:id/core', handleCoreSummary)

  fastify.get('/api/clients/:id/documents', handleDocumentsList)
  fastify.get('/api/clientes/:id/documents', handleDocumentsList)

  fastify.get('/api/clients/:id/knowledge-summary', handleKnowledgeSummary)
  fastify.get('/api/clientes/:id/knowledge-summary', handleKnowledgeSummary)

  fastify.post('/api/clients/:id/ask', handleAsk)
  fastify.post('/api/clientes/:id/ask', handleAsk)

  fastify.post('/api/clients/:id/contacts', async (request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply) => {
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente) return
    const actor = await assertAccess(request, reply, cliente, 'write')
    if (!actor) return
    const data = await getClientCoreService().addContact(cliente.id, request.body || {}, actor.id)
    return reply.status(201).send(ok(data))
  })

  fastify.post('/api/clients/:id/tasks', async (request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply) => {
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente) return
    const actor = await assertAccess(request, reply, cliente, 'write')
    if (!actor) return
    const data = await getClientCoreService().addTask(cliente.id, request.body || {}, actor.id)
    return reply.status(201).send(ok(data))
  })

  fastify.patch('/api/clients/:id/tasks/:taskId', async (request: FastifyRequest<{ Params: { id: string; taskId: string }; Body: Record<string, unknown> }>, reply) => {
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente) return
    const actor = await assertAccess(request, reply, cliente, 'write')
    if (!actor) return
    const data = await getClientCoreService().updateTask(cliente.id, request.params.taskId, request.body || {}, actor.id)
    if (!data) return reply.status(404).send(fail('Tarefa não encontrada.', 'TASK_NOT_FOUND'))
    return reply.send(ok(data))
  })

  fastify.post('/api/clients/:id/meetings', async (request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply) => {
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente) return
    const actor = await assertAccess(request, reply, cliente, 'write')
    if (!actor) return
    const data = await getClientCoreService().addMeeting(cliente.id, request.body || {}, actor.id)
    return reply.status(201).send(ok(data))
  })

  fastify.post('/api/clients/:id/contracts', async (request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply) => {
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente) return
    const actor = await assertAccess(request, reply, cliente, 'write')
    if (!actor) return
    const data = await getClientCoreService().addContract(cliente.id, request.body || {}, actor.id)
    return reply.status(201).send(ok(data))
  })

  fastify.post('/api/clients/:id/timeline', async (request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply) => {
    const cliente = getClienteOr404(request.params.id, reply)
    if (!cliente) return
    const actor = await assertAccess(request, reply, cliente, 'write')
    if (!actor) return
    const data = await getClientCoreService().addTimelineEvent(cliente.id, request.body || {}, actor.id)
    return reply.status(201).send(ok(data))
  })

  fastify.post('/api/documents/upload', async (request: FastifyRequest<{ Querystring: { clienteId?: string } }>, reply) => {
    let file: MultipartFile | undefined
    try {
      file = await request.file()
    } catch (err) {
      request.log.warn({ err }, '[aletis-core] falha ao ler multipart')
      return reply.status(400).send(fail('Falha ao ler o arquivo enviado.', 'BAD_MULTIPART'))
    }
    if (!file) return reply.status(400).send(fail('Nenhum arquivo enviado.', 'NO_FILE'))
    if (!isMimeAllowed(file.mimetype)) {
      return reply.status(415).send(fail(`Tipo de arquivo não suportado: ${file.mimetype}.`, 'UNSUPPORTED_MEDIA_TYPE'))
    }
    const clienteId = request.query.clienteId || fieldValue(file, 'clienteId')
    if (!clienteId) return reply.status(400).send(fail('clienteId obrigatório.', 'BAD_REQUEST'))
    const cliente = getClienteOr404(clienteId, reply)
    if (!cliente) return
    const actor = await assertAccess(request, reply, cliente, 'document:write')
    if (!actor) return
    const buffer = await file.toBuffer()
    const documentService = getCoreDocumentService()
    let data = await documentService.upload({
      clienteId,
      filename: file.filename,
      mimetype: file.mimetype,
      buffer,
      categoria: fieldValue(file, 'categoria'),
      status: fieldValue(file, 'status'),
      validade: fieldValue(file, 'validade'),
      observacoes: fieldValue(file, 'observacoes'),
      criadoPor: actor.id,
      source: fieldValue(file, 'source') || 'crm',
      sourceId: fieldValue(file, 'sourceId'),
    })
    const existingGoogleDrive = data.metadata?.googleDrive as { status?: string } | undefined
    if (shouldSyncToGoogleDrive() && existingGoogleDrive?.status !== 'uploaded') {
      const subfolder = googleDriveSubfolder(data.categoria)
      try {
        const synced = await getGoogleDriveService().uploadBufferToClientFolder({
          actor: { userId: actor.id, userName: actor.nome, role: actor.role, tenantId: 'default' },
          clientId: cliente.id,
          clientName: String(cliente.nome || cliente.id),
          filename: file.filename,
          mime: file.mimetype,
          buffer,
          subfolder,
        })
        data = await documentService.recordGoogleDriveSync(data.id, {
          status: 'uploaded',
          fileId: synced.googleFileId,
          url: synced.url,
          subfolder,
          syncedAt: new Date().toISOString(),
        })
      } catch (driveError) {
        request.log.warn({ err: driveError, clienteId: cliente.id, filename: file.filename }, '[aletis-core] espelhamento Google Drive falhou')
        try {
          data = await documentService.recordGoogleDriveSync(data.id, {
            status: 'failed',
            subfolder,
            syncedAt: new Date().toISOString(),
            error: String((driveError as Error).message || 'Falha desconhecida').slice(0, 280),
          })
        } catch (metadataError) {
          request.log.warn({ err: metadataError, documentId: data.id }, '[aletis-core] falha registrando estado do Drive')
        }
      }
    }
    return reply.status(201).send(ok(data))
  })

  fastify.get('/api/documents/:id/download', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const bundle = await getCoreDocumentService().downloadBuffer(request.params.id)
    if (!bundle) return reply.status(404).send(fail('Documento não encontrado no storage.', 'DOCUMENT_NOT_FOUND'))
    const cliente = getClienteOr404(bundle.doc.clienteId, reply)
    if (!cliente) return
    const actor = await assertAccess(request, reply, cliente, 'document:read')
    if (!actor) return
    reply.header('Content-Type', bundle.doc.mime)
    reply.header('Content-Disposition', `attachment; filename="${bundle.doc.nome}"`)
    return reply.send(bundle.buffer)
  })

  fastify.post('/api/documents/:id/extract', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const doc = await getCoreDocumentService().get(request.params.id)
    if (!doc) return reply.status(404).send(fail('Documento não encontrado.', 'DOCUMENT_NOT_FOUND'))
    const cliente = getClienteOr404(doc.clienteId, reply)
    if (!cliente) return
    const actor = await assertAccess(request, reply, cliente, 'document:write')
    if (!actor) return
    const data = await getCoreDocumentService().extract(request.params.id)
    return reply.send(ok(data))
  })

  fastify.post('/api/documents/:id/index', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const doc = await getCoreDocumentService().get(request.params.id)
    if (!doc) return reply.status(404).send(fail('Documento não encontrado.', 'DOCUMENT_NOT_FOUND'))
    const cliente = getClienteOr404(doc.clienteId, reply)
    if (!cliente) return
    const actor = await assertAccess(request, reply, cliente, 'document:write')
    if (!actor) return
    const data = await getCoreDocumentService().index(request.params.id)
    return reply.send(ok(data))
  })

  fastify.get('/api/automation/events', async (request: FastifyRequest<{ Querystring: { limit?: string } }>) => {
    const limit = Math.min(Number(request.query.limit || 100) || 100, 500)
    const events = await getAutomationEventService().list(limit)
    return ok({ events, total: events.length })
  })

  fastify.post('/api/webhooks/n8n/:eventType', async (request: FastifyRequest<{ Params: { eventType: string }; Body: Record<string, unknown> }>, reply) => {
    const secret = process.env.N8N_INBOUND_SECRET
    if (secret && request.headers['x-aletis-webhook-secret'] !== secret) {
      return reply.status(401).send(fail('Webhook não autorizado.', 'UNAUTHORIZED'))
    }
    const event = await getAutomationEventService().record({
      eventType: request.params.eventType,
      payload: request.body || {},
      targetProvider: 'internal',
      metadata: { inbound: true, provider: 'n8n' },
    })
    return reply.status(202).send(ok(event))
  })

  fastify.get('/api/integrations/ai-core/status', async () => ok({
    n8n: getN8nAutomationService().getConfigSummary(),
    automations: {
      internalQueue: true,
      externalProvider: 'n8n',
    },
    documents: {
      ragProvider: 'aletis-local',
    },
    rbac: {
      strict: (process.env.ALETIS_RBAC_STRICT || '').toLowerCase() === 'true',
    },
  }))

  fastify.log.info('[ALETIS Core] Rotas registradas: CRM core, documentos, IA por cliente, automações e adapters')
}
