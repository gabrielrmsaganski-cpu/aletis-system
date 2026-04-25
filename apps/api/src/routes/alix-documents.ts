// ============================================================
// ALETIS - Alix Document Intake Routes (Wave 9-INTAKE)
// POST   /api/alix/documents/upload?sessionId=...
// GET    /api/alix/documents/:sessionId
// GET    /api/alix/documents/:sessionId/:id
// DELETE /api/alix/documents/:sessionId/:id
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'

import { getDocumentIntakeService } from '../services/alix/intake/DocumentIntakeService.js'
import { MAX_FILE_BYTES } from '../services/alix/intake/types.js'
import { isMimeAllowed } from '../lib/upload-validation.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

export default async function alixDocumentsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const svc = getDocumentIntakeService()

  // -------- POST /api/alix/documents/upload --------
  // Query:
  //   sessionId    — sessão Alix (default 'anon')
  //   clienteId    — se presente, o documento é auto-anexado ao cliente no CRM
  //                  e a nota de histórico é inserida via AlixMemoryService
  fastify.post('/api/alix/documents/upload', async (
    request: FastifyRequest<{ Querystring: { sessionId?: string; clienteId?: string } }>,
    reply: FastifyReply,
  ) => {
    let file: MultipartFile | undefined
    try {
      file = await request.file({
        limits: {
          fileSize: MAX_FILE_BYTES,
          files: 1,
        },
      })
    } catch (err) {
      request.log.warn({ err }, '[alix-documents] failed to read multipart file')
      return reply.status(400).send(fail('Falha ao ler o arquivo enviado.', 'BAD_MULTIPART'))
    }

    if (!file) {
      return reply.status(400).send(fail('Nenhum arquivo enviado (campo multipart).', 'NO_FILE'))
    }

    // Whitelist de MIME — recusa antes de gastar memória com toBuffer().
    if (!isMimeAllowed(file.mimetype)) {
      return reply
        .status(415)
        .send(fail(`Tipo de arquivo não suportado: ${file.mimetype}.`, 'UNSUPPORTED_MEDIA_TYPE'))
    }

    let buffer: Buffer
    try {
      buffer = await file.toBuffer()
    } catch (err) {
      request.log.warn({ err }, '[alix-documents] toBuffer failed')
      // @fastify/multipart dispara erro com code=FST_REQ_FILE_TOO_LARGE quando excede.
      const code = (err as { code?: string })?.code
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply
          .status(413)
          .send(fail('Arquivo excede o limite de 20 MB.', 'FILE_TOO_LARGE'))
      }
      return reply.status(400).send(fail('Arquivo invalido.', 'BAD_FILE'))
    }

    const sessionId = (request.query?.sessionId ?? 'anon').toString().trim() || 'anon'

    try {
      const doc = await svc.ingest({
        buffer,
        filename: file.filename,
        mimetype: file.mimetype,
        sessionId,
      })

      // Auto-anexa ao cliente no CRM quando clienteId vem no query.
      // Registra nota no histórico via AlixMemoryService com tipo/resumo.
      const clienteId = (request.query?.clienteId ?? '').toString().trim()
      let anexadoAoCliente: { clienteId: string; ok: true; tipoDetectado?: string } | null = null
      if (clienteId) {
        try {
          const { getAlixMemoryService } = await import('../services/alix/memory/AlixMemoryService.js')
          const mem = getAlixMemoryService()
          const tipo = doc.metadata?.agroTipo as string | undefined
          const resumo = `Documento anexado: ${doc.filename}${tipo ? ` (tipo=${tipo})` : ''} · id=${doc.id}`
          await mem.appendNota(clienteId, 'historico', resumo)
          anexadoAoCliente = { clienteId, ok: true, tipoDetectado: tipo }
        } catch (err) {
          request.log.warn({ err }, '[alix-documents] falha ao anexar ao cliente')
        }
      }

      // Na resposta: preserva extractedText completo (util para o front
      // mostrar preview) mas omite imageBase64 (pesado).
      const { imageBase64: _omit, ...publicDoc } = doc
      return reply.status(201).send(
        ok({
          ...publicDoc,
          hasImage: !!doc.imageBase64,
          anexadoAoCliente,
        }),
      )
    } catch (err) {
      const message = (err as Error)?.message ?? 'Falha ao processar o documento.'
      request.log.error({ err }, '[alix-documents] ingest failed')
      return reply.status(422).send(fail(message, 'INGEST_FAILED'))
    }
  })

  // -------- GET /api/alix/documents/:sessionId --------
  fastify.get('/api/alix/documents/:sessionId', async (
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply,
  ) => {
    const { sessionId } = request.params
    if (!sessionId) return reply.status(400).send(fail('sessionId obrigatorio.', 'BAD_PARAM'))
    const docs = await svc.list(sessionId)
    return ok({ sessionId, documents: docs, total: docs.length })
  })

  // -------- GET /api/alix/documents/:sessionId/:id --------
  fastify.get('/api/alix/documents/:sessionId/:id', async (
    request: FastifyRequest<{
      Params: { sessionId: string; id: string }
      Querystring: { includeImage?: string }
    }>,
    reply: FastifyReply,
  ) => {
    const { sessionId, id } = request.params
    const doc = await svc.get(sessionId, id)
    if (!doc) return reply.status(404).send(fail('Documento nao encontrado.', 'NOT_FOUND'))
    const includeImage = request.query?.includeImage === 'true'
    if (!includeImage) {
      const { imageBase64: _b, ...rest } = doc
      return ok({ ...rest, hasImage: !!doc.imageBase64 })
    }
    return ok(doc)
  })

  // -------- DELETE /api/alix/documents/:sessionId/:id --------
  fastify.delete('/api/alix/documents/:sessionId/:id', async (
    request: FastifyRequest<{ Params: { sessionId: string; id: string } }>,
    reply: FastifyReply,
  ) => {
    const { sessionId, id } = request.params
    const removed = await svc.remove(sessionId, id)
    if (!removed) return reply.status(404).send(fail('Documento nao encontrado.', 'NOT_FOUND'))
    return ok({ sessionId, id, removed: true })
  })
}
