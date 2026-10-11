// ============================================================
// ALETIS - Alix Notebooks Routes
// Camada tipo NotebookLM para corpus documental + sintese.
// ============================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { applyAlixAuth } from '../middleware/alixAuth.js'
import { accessibleLegacySharedSessionIds, alixAccessError, alixOwnerIds, assertAlixSessionAccess, isAlixAccessEnforced, isAlixAdmin } from '../services/alix/AlixAccessService.js'

import {
  getAlixNotebookService,
  type NotebookArtifactKind,
} from '../services/alix/notebook/AlixNotebookService.js'
import { exportNotebookArtifact } from '../services/alix/notebook/AlixNotebookExportService.js'
import { renderNotebookArtifactHtml } from '../services/alix/notebook/AlixNotebookHtmlRenderer.js'
import { NotebookCitationError } from '../services/alix/notebook/NotebookCitationIntegrity.js'
import { assertNotebookScopeAccess, assertNotebookSourcesAccess, filterNotebookScopeAccess, NOTEBOOK_UNAVAILABLE } from '../services/alix/notebook/NotebookAccessService.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

const artifactKinds = new Set<NotebookArtifactKind>([
  'dossie',
  'briefing',
  'outline',
  'parecer',
  'proposta',
  'checklist',
  'relatorio',
  'memoria',
])

const sourceScopePatchSchema = z.object({
  includeCrm: z.boolean().optional(),
  includeDocuments: z.boolean().optional(),
  includeProposals: z.boolean().optional(),
  includeNegotiations: z.boolean().optional(),
  includeWeb: z.boolean().optional(),
  proposalIds: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
  negotiationIds: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
}).strict()

const commentSchema = z.object({
  artifactId: z.string().trim().min(1).max(160).optional(),
  text: z.string().trim().min(1).max(4_000),
  authorId: z.string().trim().min(1).max(160).optional(),
}).strict()

const commentUpdateSchema = z.object({
  status: z.enum(['open', 'resolved']),
  actorId: z.string().trim().min(1).max(160).optional(),
}).strict()

const artifactUpdateSchema = z.object({
  instructions: z.string().trim().max(4_000).optional(),
  limit: z.number().int().min(1).max(28).optional(),
  researchWeb: z.boolean().optional(),
}).strict()

const conversionSchema = z.object({
  target: z.enum(['task', 'note', 'proposal', 'checklist']),
  title: z.string().trim().min(1).max(180).optional(),
}).strict()

const actionUpdateSchema = z.object({
  status: z.enum(['open', 'done', 'dismissed']),
}).strict()

function cleanString(value: unknown, max = 2_000): string | undefined {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, max) : undefined
}

function normalizeSources(value: unknown): Array<{ sessionId: string; documentId: string }> {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const rec = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        sessionId: String(rec.sessionId || '').trim(),
        documentId: String(rec.documentId || '').trim(),
      }
    })
    .filter((item) => item.sessionId && item.documentId)
}

export default async function alixNotebooksRoutes(fastify: FastifyInstance): Promise<void> {
  applyAlixAuth(fastify)
  const svc = getAlixNotebookService()
  fastify.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'private, no-store') })
  fastify.addHook('preHandler', async (request, reply) => {
    if (!isAlixAccessEnforced(request.alixUser)) return
    try {
      const params = request.params as { id?: string }
      if (params.id) {
        const notebook = await svc.get(params.id, { strict: true })
        if (!notebook) throw alixAccessError(404, NOTEBOOK_UNAVAILABLE)
        await assertNotebookScopeAccess(request.alixUser, notebook)
      }
      const input = (request.method === 'GET' ? request.query : request.body) as { sessionId?: unknown; clienteId?: unknown; sources?: unknown } | undefined
      if (input?.sessionId !== undefined) {
        if (typeof input.sessionId !== 'string') throw alixAccessError(400, 'Identificador de sessão inválido.')
        await assertAlixSessionAccess(request.alixUser, input.sessionId)
      }
      const sources = normalizeSources(input?.sources)
      if (sources.length) await assertNotebookSourcesAccess(request.alixUser, sources)
      if (request.method === 'POST' && !params.id) {
        if (!isAlixAdmin(request.alixUser) && !input?.sessionId) throw alixAccessError(400, 'Abra uma conversa da ALIX para criar o Notebook com seu acesso preservado.')
        await assertNotebookScopeAccess(request.alixUser, { sessionId: typeof input?.sessionId === 'string' ? input.sessionId : undefined, clienteId: cleanString(input?.clienteId, 120), sources: sources.map(source => ({ ...source, addedAt: '' })) })
      }
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (status && status >= 400 && status < 500) return reply.status(status).send(fail(status === 404 ? NOTEBOOK_UNAVAILABLE : (error as Error).message, 'NOTEBOOK_ACCESS_DENIED'))
      request.log.error({ errorType: error instanceof Error ? error.name : 'UnknownError' }, '[alix-notebooks] access authority unavailable')
      return reply.status(503).send(fail('Não foi possível conferir o acesso ao Notebook. Tente novamente.', 'NOTEBOOK_ACCESS_UNAVAILABLE'))
    }
  })

  fastify.get('/api/alix/notebooks', async (
    request: FastifyRequest<{ Querystring: { clienteId?: string; sessionId?: string; limit?: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const scoped = isAlixAccessEnforced(request.alixUser) && !isAlixAdmin(request.alixUser)
      const notebooks = await filterNotebookScopeAccess(request.alixUser, await svc.list({
        clienteId: cleanString(request.query?.clienteId, 120),
        sessionId: cleanString(request.query?.sessionId, 120),
        limit: Number(request.query?.limit) || undefined,
      }, { strict: isAlixAccessEnforced(request.alixUser), ...(scoped ? { ownerIds: alixOwnerIds(request.alixUser), sharedSessionIds: await accessibleLegacySharedSessionIds(request.alixUser) } : {}) }))
      return ok({ notebooks, total: notebooks.length })
    } catch (error) {
      request.log.error({ errorType: error instanceof Error ? error.name : 'UnknownError' }, '[alix-notebooks] listing authority unavailable')
      return reply.status(503).send(fail('Não foi possível consultar os Notebooks. Tente novamente.', 'NOTEBOOK_ACCESS_UNAVAILABLE'))
    }
  })

  fastify.post('/api/alix/notebooks', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{
      Body: {
        title?: string
        clienteId?: string
        sessionId?: string
        objective?: string
        sources?: Array<{ sessionId: string; documentId: string }>
      }
    }>,
    reply: FastifyReply,
  ) => {
    try {
      const notebook = await svc.create({
        title: cleanString(request.body?.title, 140) || '',
        clienteId: cleanString(request.body?.clienteId, 120),
        sessionId: cleanString(request.body?.sessionId, 120),
        objective: cleanString(request.body?.objective, 2_000),
        sources: normalizeSources(request.body?.sources),
      })
      return reply.status(201).send(ok(notebook))
    } catch (err) {
      return reply.status(400).send(fail((err as Error).message, 'BAD_NOTEBOOK'))
    }
  })

  fastify.get('/api/alix/notebooks/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const notebook = await svc.get(request.params.id)
    if (!notebook) return reply.status(404).send(fail('Notebook nao encontrado.', 'NOT_FOUND'))
    return ok(notebook)
  })

  fastify.get('/api/alix/notebooks/:id/source-map', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      return ok(await svc.sourceMap(request.params.id))
    } catch (err) {
      return reply.status(404).send(fail((err as Error).message, 'NOTEBOOK_SOURCE_MAP_ERROR'))
    }
  })

  fastify.patch('/api/alix/notebooks/:id/source-scope', async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply,
  ) => {
    const parsed = sourceScopePatchSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail(parsed.error.issues[0]?.message || 'Escopo inválido.', 'BAD_SOURCE_SCOPE'))
    try {
      return ok(await svc.updateSourceScope(request.params.id, parsed.data))
    } catch (err) {
      return reply.status(404).send(fail((err as Error).message, 'NOTEBOOK_SOURCE_SCOPE_ERROR'))
    }
  })

  fastify.post('/api/alix/notebooks/:id/comments', async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply,
  ) => {
    const parsed = commentSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail(parsed.error.issues[0]?.message || 'Comentário inválido.', 'BAD_COMMENT'))
    try {
      return reply.status(201).send(ok(await svc.addComment(request.params.id, { ...parsed.data, authorId: request.alixUser?.id || parsed.data.authorId })))
    } catch (err) {
      return reply.status(400).send(fail((err as Error).message, 'NOTEBOOK_COMMENT_ERROR'))
    }
  })

  fastify.patch('/api/alix/notebooks/:id/comments/:commentId', async (
    request: FastifyRequest<{ Params: { id: string; commentId: string }; Body: unknown }>,
    reply: FastifyReply,
  ) => {
    const parsed = commentUpdateSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail(parsed.error.issues[0]?.message || 'Status inválido.', 'BAD_COMMENT_STATUS'))
    try {
      return ok(await svc.updateComment(request.params.id, request.params.commentId, parsed.data.status, request.alixUser?.id || parsed.data.actorId))
    } catch (err) {
      return reply.status(404).send(fail((err as Error).message, 'NOTEBOOK_COMMENT_ERROR'))
    }
  })

  fastify.get('/api/alix/notebooks/:id/artifacts/:artifactId/html', async (
    request: FastifyRequest<{ Params: { id: string; artifactId: string } }>,
    reply: FastifyReply,
  ) => {
    const found = await svc.getArtifact(request.params.id, request.params.artifactId)
    if (!found) return reply.status(404).send(fail('Documento do notebook não encontrado.', 'ARTIFACT_NOT_FOUND'))
    try {
      const document = renderNotebookArtifactHtml(found.notebook, found.artifact)
      return reply
        .type('text/html; charset=utf-8')
        .header('Content-Disposition', `inline; filename="${document.filename}"`)
        .header('Cache-Control', 'no-store')
        .send(document.html)
    } catch (err) {
      if (err instanceof NotebookCitationError) return reply.status(err.statusCode).send(fail(err.message, err.code))
      request.log.error({ err }, '[alix-notebooks] html preview failed')
      return reply.status(500).send(fail('Não foi possível preparar a visualização do documento.', 'NOTEBOOK_EXPORT_ERROR'))
    }
  })

  fastify.get('/api/alix/notebooks/:id/artifacts/:artifactId/export/:format', async (
    request: FastifyRequest<{ Params: { id: string; artifactId: string; format: string } }>,
    reply: FastifyReply,
  ) => {
    const format = z.enum(['pdf', 'docx']).safeParse(request.params.format)
    if (!format.success) return reply.status(400).send(fail('Formato deve ser pdf ou docx.', 'BAD_EXPORT_FORMAT'))
    const found = await svc.getArtifact(request.params.id, request.params.artifactId)
    if (!found) return reply.status(404).send(fail('Documento do notebook não encontrado.', 'ARTIFACT_NOT_FOUND'))
    try {
      const document = await exportNotebookArtifact(found.notebook, found.artifact, format.data)
      return reply
        .type(document.mimetype)
        .header('Content-Disposition', `attachment; filename="${document.filename}"`)
        .header('Cache-Control', 'no-store')
        .send(document.buffer)
    } catch (err) {
      if (err instanceof NotebookCitationError) return reply.status(err.statusCode).send(fail(err.message, err.code))
      request.log.error({ err }, '[alix-notebooks] export failed')
      return reply.status(500).send(fail('Não foi possível exportar o documento.', 'NOTEBOOK_EXPORT_ERROR'))
    }
  })

  fastify.get('/api/alix/notebooks/:id/artifacts/:artifactId/versions', async (
    request: FastifyRequest<{ Params: { id: string; artifactId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const versions = await svc.listArtifactVersions(request.params.id, request.params.artifactId)
      return ok({ versions, total: versions.length })
    } catch (err) {
      return reply.status(404).send(fail((err as Error).message, 'NOTEBOOK_VERSIONS_ERROR'))
    }
  })

  fastify.get('/api/alix/notebooks/:id/artifacts/compare', async (
    request: FastifyRequest<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>,
    reply: FastifyReply,
  ) => {
    const parsed = z.object({ from: z.string().min(1), to: z.string().min(1) }).safeParse(request.query)
    if (!parsed.success) return reply.status(400).send(fail('Informe as versões from e to.', 'BAD_VERSION_COMPARE'))
    try {
      return ok(await svc.compareArtifacts(request.params.id, parsed.data.from, parsed.data.to))
    } catch (err) {
      return reply.status(400).send(fail((err as Error).message, 'NOTEBOOK_COMPARE_ERROR'))
    }
  })

  fastify.post('/api/alix/notebooks/:id/artifacts/:artifactId/update', {
    config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Params: { id: string; artifactId: string }; Body: unknown }>,
    reply: FastifyReply,
  ) => {
    const parsed = artifactUpdateSchema.safeParse(request.body || {})
    if (!parsed.success) return reply.status(400).send(fail(parsed.error.issues[0]?.message || 'Atualização inválida.', 'BAD_ARTIFACT_UPDATE'))
    try {
      return ok(await svc.updateArtifact(request.params.id, request.params.artifactId, parsed.data))
    } catch (err) {
      request.log.error({ err }, '[alix-notebooks] artifact update failed')
      return reply.status(422).send(fail((err as Error).message, 'NOTEBOOK_UPDATE_ERROR'))
    }
  })

  fastify.post('/api/alix/notebooks/:id/artifacts/:artifactId/convert', async (
    request: FastifyRequest<{ Params: { id: string; artifactId: string }; Body: unknown }>,
    reply: FastifyReply,
  ) => {
    const parsed = conversionSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail(parsed.error.issues[0]?.message || 'Conversão inválida.', 'BAD_CONVERSION'))
    try {
      return reply.status(201).send(ok(await svc.convertArtifact(request.params.id, request.params.artifactId, parsed.data)))
    } catch (err) {
      return reply.status(400).send(fail((err as Error).message, 'NOTEBOOK_CONVERSION_ERROR'))
    }
  })

  fastify.patch('/api/alix/notebooks/:id/actions/:actionId', async (
    request: FastifyRequest<{ Params: { id: string; actionId: string }; Body: unknown }>,
    reply: FastifyReply,
  ) => {
    const parsed = actionUpdateSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail(parsed.error.issues[0]?.message || 'Status inválido.', 'BAD_ACTION_STATUS'))
    try {
      return ok(await svc.updateAction(request.params.id, request.params.actionId, parsed.data.status))
    } catch (err) {
      return reply.status(404).send(fail((err as Error).message, 'NOTEBOOK_ACTION_ERROR'))
    }
  })

  fastify.post('/api/alix/notebooks/:id/sources', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Params: { id: string }; Body: { sources?: Array<{ sessionId: string; documentId: string }> } }>,
    reply: FastifyReply,
  ) => {
    try {
      const notebook = await svc.addSources(request.params.id, normalizeSources(request.body?.sources))
      return ok(notebook)
    } catch (err) {
      return reply.status(404).send(fail((err as Error).message, 'NOTEBOOK_SOURCE_ERROR'))
    }
  })

  fastify.post('/api/alix/notebooks/:id/notes', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Params: { id: string }; Body: { text?: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const notebook = await svc.addNote(request.params.id, cleanString(request.body?.text, 8_000) || '')
      return ok(notebook)
    } catch (err) {
      return reply.status(400).send(fail((err as Error).message, 'NOTEBOOK_NOTE_ERROR'))
    }
  })

  fastify.post('/api/alix/notebooks/:id/search', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Params: { id: string }; Body: { query?: string; limit?: number } }>,
    reply: FastifyReply,
  ) => {
    const query = cleanString(request.body?.query, 1_000)
    if (!query) return reply.status(400).send(fail('query obrigatoria.', 'BAD_QUERY'))
    try {
      const hits = await svc.search(request.params.id, query, request.body?.limit)
      return ok({ query, hits, total: hits.length })
    } catch (err) {
      return reply.status(404).send(fail((err as Error).message, 'NOTEBOOK_SEARCH_ERROR'))
    }
  })

  fastify.post('/api/alix/notebooks/:id/ask', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Params: { id: string }; Body: { question?: string; limit?: number; researchWeb?: boolean } }>,
    reply: FastifyReply,
  ) => {
    const question = cleanString(request.body?.question, 2_000)
    if (!question) return reply.status(400).send(fail('question obrigatoria.', 'BAD_QUESTION'))
    try {
      const artifact = await svc.ask(request.params.id, question, request.body?.limit, request.body?.researchWeb !== false)
      return ok(artifact)
    } catch (err) {
      request.log.error({ err }, '[alix-notebooks] ask failed')
      return reply.status(422).send(fail((err as Error).message, 'NOTEBOOK_ASK_ERROR'))
    }
  })

  fastify.post('/api/alix/notebooks/:id/generate', {
    config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{
      Params: { id: string }
      Body: { kind?: NotebookArtifactKind; objective?: string; audience?: string; limit?: number; researchWeb?: boolean }
    }>,
    reply: FastifyReply,
  ) => {
    const kind = artifactKinds.has(request.body?.kind as NotebookArtifactKind)
      ? request.body?.kind
      : 'briefing'
    try {
      const artifact = await svc.synthesize(request.params.id, {
        kind,
        objective: cleanString(request.body?.objective, 2_000),
        audience: cleanString(request.body?.audience, 500),
        limit: request.body?.limit,
        researchWeb: request.body?.researchWeb !== false,
      })
      return ok(artifact)
    } catch (err) {
      request.log.error({ err }, '[alix-notebooks] generate failed')
      return reply.status(422).send(fail((err as Error).message, 'NOTEBOOK_GENERATE_ERROR'))
    }
  })
}
