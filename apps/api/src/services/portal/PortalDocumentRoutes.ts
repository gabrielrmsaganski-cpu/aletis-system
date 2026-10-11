import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { clientes } from '../../routes/clientes.js'
import { resolveInternalSession } from '../../lib/internal-auth.js'
import { getAccessControlService } from '../core/AccessControlService.js'
import { portalDocumentService } from './PortalDocumentService.js'
import { portalDocumentCategorySchema } from './PortalDocumentSchemas.js'
import { canClientSeeUpload, publicPortalRequest, publicPortalUpload, staffPortalUpload } from './PortalDocumentPresentation.js'
import { decodePortalBase64, PORTAL_UPLOAD_MAX_BYTES, PortalUploadError, portalStoragePath, validatePortalFile } from './PortalUploadValidation.js'
import { getPortalDocumentProcessor } from './PortalDocumentProcessor.js'
import { listPortalUpdates, publishPortalUpdate, sharePortalUpload } from './PortalCommunicationService.js'

const fileFieldsSchema = z.object({
  pendenciaId: z.string().trim().min(1).max(100).optional(), categoria: portalDocumentCategorySchema.optional(),
}).strict()
const jsonFileSchema = fileFieldsSchema.extend({
  nome: z.string().min(1).max(255), mime: z.string().max(200).optional(),
  conteudoBase64: z.string().min(1).max(Math.ceil(PORTAL_UPLOAD_MAX_BYTES / 3) * 4),
}).strict()
const idempotencySchema = z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9_.:-]+$/)
const retrySchema = z.object({ etapa: z.enum(['analise', 'drive', 'todas']).default('todas') }).strict()
const uploadsInProgress = new Map<string, number>()
const fileDirectory = () => process.env.ALETIS_PORTAL_UPLOAD_DIR || join(process.cwd(), 'storage', 'portal-uploads')
const clienteIdFromPortal = (request: FastifyRequest) => (request as unknown as { clienteId: string }).clienteId

function keyFromRequest(request: FastifyRequest): string | undefined {
  const value = request.headers['idempotency-key']
  if (value === undefined) return undefined
  const parsed = idempotencySchema.safeParse(value)
  if (!parsed.success) throw new PortalUploadError('Chave de envio inválida.')
  return parsed.data
}

async function readIncomingFile(request: FastifyRequest) {
  if (request.headers['content-type']?.startsWith('application/json')) {
    const parsed = jsonFileSchema.safeParse(request.body)
    if (!parsed.success) throw new PortalUploadError('Informe arquivo, nome e dados de envio válidos.')
    return { buffer: decodePortalBase64(parsed.data.conteudoBase64), filename: parsed.data.nome, pendenciaId: parsed.data.pendenciaId, categoria: parsed.data.categoria }
  }
  if (!request.isMultipart()) throw new PortalUploadError('Envie o arquivo como multipart/form-data.', 415)
  let buffer: Buffer | undefined, filename = ''
  const fields: Record<string, unknown> = {}
  for await (const part of request.parts({ limits: { fileSize: PORTAL_UPLOAD_MAX_BYTES, files: 1, fields: 2, fieldSize: 500, parts: 3 } })) {
    if (part.type === 'file') {
      filename = part.filename
      buffer = await part.toBuffer()
      if (part.file.truncated) throw new PortalUploadError('O arquivo excede 20 MB.', 413)
    } else {
      if (Object.hasOwn(fields, part.fieldname)) throw new PortalUploadError('Campo de envio repetido.')
      fields[part.fieldname] = part.value
    }
  }
  const parsed = fileFieldsSchema.safeParse(fields)
  if (!parsed.success) throw new PortalUploadError('Solicitação ou categoria de envio inválida.')
  if (!buffer) throw new PortalUploadError('Escolha um arquivo para enviar.')
  return { buffer, filename, ...parsed.data }
}

/** O guard interno é explícito neste grupo, inclusive quando o plugin é montado isoladamente. */
export async function assertPortalStaff(fastify: FastifyInstance, request: FastifyRequest, clienteId: string, write = false): Promise<{ client: { id: string }; user: NonNullable<ReturnType<typeof resolveInternalSession>> }> {
  const user = resolveInternalSession(fastify, request)
  if (!user) throw Object.assign(new Error('Sessão da equipe ausente ou expirada.'), { statusCode: 401 })
  const client = clientes.get(clienteId)
  if (!client) throw Object.assign(new Error('Cliente não encontrado.'), { statusCode: 404 })
  await getAccessControlService().assertClienteAccess({
    actor: { id: user.id, nome: user.nome, role: 'consultor', consultorId: user.consultorId },
    clienteId: client.id, action: write ? 'document:write' : 'document:read',
  })
  return { client, user }
}

export async function registerPortalDocumentRoutes(fastify: FastifyInstance, authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) {
  const clientOptions = { preHandler: authenticate }
  fastify.get('/api/portal/pendencias', clientOptions, async request => ({
    success: true, data: (await portalDocumentService.listarPendencias(clienteIdFromPortal(request))).map(publicPortalRequest),
  }))
  fastify.get('/api/portal/uploads', clientOptions, async request => ({
    success: true, data: (await portalDocumentService.listarUploads(clienteIdFromPortal(request))).filter(canClientSeeUpload).map(publicPortalUpload),
  }))
  fastify.post('/api/portal/upload', { ...clientOptions, bodyLimit: 29 * 1024 * 1024 }, async (request, reply) => {
    const clienteId = clienteIdFromPortal(request)
    if ((uploadsInProgress.get(clienteId) || 0) >= 2) return reply.code(429).send({ success: false, error: 'Aguarde os envios em andamento e tente novamente.' })
    uploadsInProgress.set(clienteId, (uploadsInProgress.get(clienteId) || 0) + 1)
    let path: string | undefined, uploadId: string | undefined, recorded = false
    try {
      const idempotencyKey = keyFromRequest(request)
      const input = await readIncomingFile(request)
      const validated = await validatePortalFile(input.buffer, input.filename)
      if (input.pendenciaId) {
        const target = await portalDocumentService.buscarPendencia(clienteId, input.pendenciaId)
        if (!target) throw new PortalUploadError('Solicitação não encontrada para este cliente.', 404)
      }
      uploadId = `up-${randomUUID()}`
      const directory = fileDirectory()
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const storageName = `${uploadId}.bin`
      path = portalStoragePath(directory, storageName)
      await writeFile(path, input.buffer, { flag: 'wx', mode: 0o600 })
      const result = await portalDocumentService.receberUpload({
        id: uploadId, clienteId, pendenciaId: input.pendenciaId, categoria: input.categoria,
        nomeOriginal: validated.nome, nomeStorage: storageName, mime: validated.mime,
        tamanho: input.buffer.length, sha256: createHash('sha256').update(input.buffer).digest('hex'),
        enviadoPor: 'cliente', idempotencyKey,
      }, { ator: `portal:${clienteId}`, canal: 'web', ip: request.ip, userAgent: request.headers['user-agent'] })
      recorded = true
      if (result.replayed) await unlink(path).catch(() => {})
      return reply.code(result.replayed ? 200 : 201).send({ success: true, data: { ...publicPortalUpload(result.upload), replayed: result.replayed } })
    } catch (error) {
      // Uma perda de conexão após COMMIT não pode apagar o arquivo já recebido.
      if (path && uploadId && !recorded) {
        try { if (!await portalDocumentService.buscarUpload(clienteId, uploadId)) await unlink(path).catch(() => {}) } catch { /* reconciliação posterior: preservar arquivo */ }
      }
      throw error
    } finally {
      const remaining = (uploadsInProgress.get(clienteId) || 1) - 1
      if (remaining) uploadsInProgress.set(clienteId, remaining); else uploadsInProgress.delete(clienteId)
    }
  })
  fastify.get('/api/portal/uploads/:id', clientOptions, async (request, reply) => {
    const upload = await portalDocumentService.buscarUpload(clienteIdFromPortal(request), (request.params as { id: string }).id)
    if (!upload || !canClientSeeUpload(upload)) return reply.code(404).send({ success: false, error: 'Arquivo não encontrado.' })
    try {
      const data = await readFile(portalStoragePath(fileDirectory(), upload.nomeStorage))
      return reply.header('Content-Type', upload.mime).header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'private, no-store').header('Content-Security-Policy', "sandbox")
        .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(upload.nomeOriginal)}`).send(data)
    } catch { return reply.code(410).send({ success: false, error: 'Arquivo indisponível. Avise sua equipe.' }) }
  })

  fastify.get('/api/clientes/:id/portal/pendencias', async request => {
    const { client } = await assertPortalStaff(fastify, request, (request.params as { id: string }).id)
    return { success: true, data: (await portalDocumentService.listarPendencias(client.id)).map(publicPortalRequest) }
  })
  fastify.post('/api/clientes/:id/portal/pendencias', async (request, reply) => {
    const { client, user } = await assertPortalStaff(fastify, request, (request.params as { id: string }).id, true)
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {}
    const value = await portalDocumentService.criarPendencia(client.id, { ...body, solicitadoPor: user.nome, idempotencyKey: keyFromRequest(request) } as any, { ator: user.id, canal: 'consultor' })
    return reply.code(201).send({ success: true, data: publicPortalRequest(value) })
  })
  fastify.patch('/api/clientes/:id/portal/pendencias/:pid', async request => {
    const { id, pid } = request.params as { id: string; pid: string }
    const { client, user } = await assertPortalStaff(fastify, request, id, true)
    const value = await portalDocumentService.atualizarPendencia(client.id, pid, (request.body || {}) as any, { ator: user.id, canal: 'consultor' })
    return { success: true, data: publicPortalRequest(value) }
  })
  fastify.delete('/api/clientes/:id/portal/pendencias/:pid', async request => {
    const { id, pid } = request.params as { id: string; pid: string }
    const { client, user } = await assertPortalStaff(fastify, request, id, true)
    const value = await portalDocumentService.cancelarPendencia(client.id, pid, (request.body || {}) as any, { ator: user.id, canal: 'consultor' })
    return { success: true, data: publicPortalRequest(value) }
  })
  fastify.get('/api/clientes/:id/portal/uploads', async request => {
    const { client } = await assertPortalStaff(fastify, request, (request.params as { id: string }).id)
    return { success: true, data: (await portalDocumentService.listarUploads(client.id)).map(staffPortalUpload) }
  })
  fastify.get('/api/clientes/:id/portal/uploads/:uploadId/download', async (request, reply) => {
    const { id, uploadId } = request.params as { id: string; uploadId: string }
    const { client } = await assertPortalStaff(fastify, request, id)
    const upload = await portalDocumentService.buscarUpload(client.id, uploadId)
    if (!upload) return reply.code(404).send({ success: false, error: 'Arquivo não encontrado.' })
    try {
      const data = await readFile(portalStoragePath(fileDirectory(), upload.nomeStorage))
      return reply.header('Content-Type', upload.mime).header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'private, no-store').header('Content-Security-Policy', 'sandbox')
        .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(upload.nomeOriginal)}`).send(data)
    } catch { return reply.code(410).send({ success: false, error: 'Arquivo indisponível. Atualize a listagem ou verifique o armazenamento.' }) }
  })
  fastify.get('/api/clientes/:id/portal/uploads/:uploadId/analysis', async request => {
    const { id, uploadId } = request.params as { id: string; uploadId: string }
    const { client } = await assertPortalStaff(fastify, request, id)
    return { success: true, data: await getPortalDocumentProcessor().getAnalysis({ clienteId: client.id, uploadId }) }
  })
  fastify.post('/api/clientes/:id/portal/uploads/:uploadId/reprocessar', async request => {
    const { id, uploadId } = request.params as { id: string; uploadId: string }
    const { client } = await assertPortalStaff(fastify, request, id, true)
    const parsed = retrySchema.safeParse(request.body || {})
    if (!parsed.success) throw new PortalUploadError('Etapa de processamento inválida.')
    return { success: true, data: await getPortalDocumentProcessor().retry({ clienteId: client.id, uploadId, etapa: parsed.data.etapa }) }
  })
  fastify.get('/api/clientes/:id/portal/andamentos', async request => {
    const { client } = await assertPortalStaff(fastify, request, (request.params as { id: string }).id)
    return { success: true, data: await listPortalUpdates(client.id) }
  })
  fastify.post('/api/clientes/:id/portal/andamentos', async (request, reply) => {
    const { client, user } = await assertPortalStaff(fastify, request, (request.params as { id: string }).id, true)
    return reply.code(201).send({ success: true, data: await publishPortalUpdate(client.id, request.body as any, user.id, keyFromRequest(request)) })
  })
  fastify.patch('/api/clientes/:id/portal/uploads/:uploadId/compartilhar', async request => {
    const { id, uploadId } = request.params as { id: string; uploadId: string }
    const { client, user } = await assertPortalStaff(fastify, request, id, true)
    const parsed = z.object({ disponivel: z.boolean() }).strict().safeParse(request.body)
    if (!parsed.success) throw new PortalUploadError('Informe se o documento deve ficar disponível ao cliente.')
    return { success: true, data: await sharePortalUpload(client.id, uploadId, parsed.data.disponivel, user.id) }
  })
}
