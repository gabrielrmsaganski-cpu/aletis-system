// ============================================================
// ALETIS - Alix Document Intake Routes (Wave 9-INTAKE)
// POST   /api/alix/documents/upload?sessionId=...
// GET    /api/alix/documents/:sessionId
// GET    /api/alix/documents/:sessionId/:id
// DELETE /api/alix/documents/:sessionId/:id
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { z } from 'zod'

import { documentClientScopeReview, getDocumentIntakeService } from '../services/alix/intake/DocumentIntakeService.js'
import type { IngestedDocument } from '../services/alix/intake/types.js'
import { applyAlixAuth } from '../middleware/alixAuth.js'
import { assertAlixSessionAccess, canAccessAlixOwner, isAlixAccessEnforced } from '../services/alix/AlixAccessService.js'
import { MAX_FILE_BYTES } from '../services/alix/intake/types.js'
import { getAiJobQueueService } from '../services/alix/jobs/AiJobQueueService.js'
import { runDocumentDeepAnalysis } from '../services/alix/jobs/DocumentDeepAnalysisRunner.js'
import {
  buildDocumentOnboardingCandidate,
  getDocumentOnboardingReviewService,
  type DocumentOnboardingReviewStatus,
} from '../services/alix/intake/DocumentOnboardingReviewService.js'
import { isMimeAllowed } from '../lib/upload-validation.js'
import { alixGetClientes } from '../services/AlixService.js'
import { findClienteByCpfCnpj, normalizeCpfCnpj } from '../db/ClienteRepository.js'
import { actorFromRequest, getAccessControlService } from '../services/core/AccessControlService.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

function cleanFocus(value: unknown): string | undefined {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 1_500) : undefined
}

/** Validação estrita só da prova documental; não muda regras de cadastro legado. */
export function isVerifiedDocumentTaxId(value: unknown): boolean {
  const digits = normalizeCpfCnpj(value)
  if (!/^(?:\d{11}|\d{14})$/.test(digits) || /^(\d)\1+$/.test(digits)) return false
  const numbers = [...digits].map(Number)
  const check = (base: number[], weights: number[]) => {
    const remainder = base.reduce((sum, digit, index) => sum + digit * weights[index], 0) % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  if (numbers.length === 11) {
    return check(numbers.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]) === numbers[9]
      && check(numbers.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === numbers[10]
  }
  return check(numbers.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === numbers[12]
    && check(numbers.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === numbers[13]
}

export function resolveDocumentClientScope(input: {
  activeClienteId?: string
  activeCpfCnpj?: unknown
  detectedClienteId?: string
  detectedCpfCnpj?: unknown
}): { status: 'conflict' | 'matched' | 'unverified' | 'session_only'; identityConflict: boolean } {
  const activeCpfCnpj = normalizeCpfCnpj(input.activeCpfCnpj)
  const detectedCpfCnpj = normalizeCpfCnpj(input.detectedCpfCnpj)
  const identityMatch = Boolean(input.activeClienteId && (
    (input.detectedClienteId && input.detectedClienteId === input.activeClienteId)
    || (detectedCpfCnpj && activeCpfCnpj && detectedCpfCnpj === activeCpfCnpj)
  ))
  const identityConflict = Boolean(input.activeClienteId && (
    (input.detectedClienteId && input.detectedClienteId !== input.activeClienteId)
    || (detectedCpfCnpj && activeCpfCnpj && detectedCpfCnpj !== activeCpfCnpj)
  ))
  return {
    identityConflict,
    status: identityConflict
      ? 'conflict'
      : input.activeClienteId
        ? (identityMatch ? 'matched' : 'unverified')
        : 'session_only',
  }
}

function findClienteLocalByCpfCnpj(cpfCnpj: unknown): { id?: string; nome?: string; cpfCnpj?: string } | null {
  const clean = normalizeCpfCnpj(cpfCnpj)
  if (!clean) return null
  const found = alixGetClientes().find((c) => normalizeCpfCnpj(c?.cpfCnpj ?? c?.cpfcnpj ?? c?.cpf ?? c?.cnpj) === clean)
  return found ? { id: found.id, nome: found.nome, cpfCnpj: found.cpfCnpj } : null
}

export default async function alixDocumentsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const svc = getDocumentIntakeService()
  applyAlixAuth(fastify)
  fastify.addHook('preHandler', async (request, reply) => {
    if (!isAlixAccessEnforced(request.alixUser)) return
    const params = request.params as { sessionId?: string; id?: string }
    const query = request.query as { sessionId?: string }
    let sessionId = params?.sessionId || query?.sessionId
    if (!sessionId && params?.id && request.routeOptions.url?.includes('/document-reviews/')) {
      sessionId = (await getDocumentOnboardingReviewService().get(params.id))?.sessionId
    }
    if (!sessionId) return reply.status(400).send(fail('Informe a sessão documental.', 'SESSION_REQUIRED'))
    try { await assertAlixSessionAccess(request.alixUser, sessionId) } catch (error) {
      return reply.status((error as { statusCode?: number }).statusCode || 403).send(fail((error as Error).message, 'FORBIDDEN'))
    }
  })

  async function assertDestination(request: FastifyRequest, clienteId: string) {
    const cliente = alixGetClientes().find((item) => item.id === clienteId)
    if (!cliente) throw Object.assign(new Error('Cliente não encontrado.'), { statusCode: 404 })
    await getAccessControlService().assertClienteAccess({ actor: actorFromRequest(request), clienteId, cliente, action: 'document:write' })
    return cliente
  }

  async function attachVerified(request: FastifyRequest, doc: IngestedDocument, cliente: Record<string, any>) {
    const previous = doc.metadata.clientScopeAttachment as { status?: string; cofre?: unknown } | undefined
    if (previous?.status === 'attached') return { clienteId: cliente.id, ok: true as const, cofre: previous.cofre }
    const currentActor = actorFromRequest(request)
    const { attachAlixDocumentToCliente } = await import('../services/alix/intake/DocumentVaultBridgeService.js')
    const tipo = doc.metadata?.agroTipo as string | undefined
    try {
      const cofre = await attachAlixDocumentToCliente({
        sessionId: doc.sessionId, documentoId: doc.id, clienteId: String(cliente.id),
        clientName: String(cliente.nome || cliente.razaoSocial || cliente.id), categoria: tipo ? 'agro' : 'outros', enviadoPor: 'consultor',
        skipGoogleDriveSync: (doc.metadata.source as { type?: string } | undefined)?.type === 'google_drive',
        googleWorkspaceActor: { userId: currentActor.id, userName: currentActor.nome, role: currentActor.role, tenantId: 'default' },
      })
      if (!cofre.ok) throw new Error(cofre.reason)
      await svc.saveMetadata(doc.sessionId, doc.id, { clientScopeAttachment: { status: 'attached', cofre, attachedAt: new Date().toISOString() } })
      return { clienteId: String(cliente.id), ok: true as const, tipoDetectado: tipo, cofre }
    } catch (error) {
      await svc.saveMetadata(doc.sessionId, doc.id, { clientScopeAttachment: { status: 'failed', error: (error as Error).message.slice(0, 300) } })
      throw error
    }
  }

  // -------- POST /api/alix/documents/upload --------
  // Query:
  //   sessionId    — sessão Alix (default 'anon')
  //   clienteId    — contexto ativo. O vínculo no CRM só ocorre depois da
  //                  conferência de identidade do documento.
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
    const clienteId = (request.query?.clienteId ?? '').toString().trim() || undefined

    try {
      const activeClient = clienteId ? await assertDestination(request, clienteId) : undefined
      let doc = await svc.ingest({
        buffer,
        filename: file.filename,
        mimetype: file.mimetype,
        sessionId,
        processingMode: 'deep',
      }, { requestedBy: request.alixUser?.id || 'anonymous', requestedClienteId: clienteId })

      let onboardingReview = null
      try {
        const reviewSvc = getDocumentOnboardingReviewService()
        const candidate = buildDocumentOnboardingCandidate(doc)
        if (candidate) {
          const duplicate = candidate.candidate.cpfCnpj
            ? findClienteLocalByCpfCnpj(candidate.candidate.cpfCnpj) ?? await findClienteByCpfCnpj(candidate.candidate.cpfCnpj)
            : null
          const status: DocumentOnboardingReviewStatus = duplicate
            ? 'blocked_duplicate'
            : candidate.ready
              ? 'ready_for_hitl'
              : 'needs_review'
          onboardingReview = await reviewSvc.createFromDocument(doc, {
            status,
            duplicateCliente: duplicate ?? undefined,
          })
        }
      } catch (err) {
        request.log.warn({ err }, '[alix-documents] falha ao criar revisão de onboarding')
      }

      // Só vincula ao cliente ativo quando a identidade documental não aponta
      // para outro cadastro. Em conflito, o arquivo permanece apenas na sessão
      // para comparação e o consultor escolhe o destino correto pelo chat.
      let anexadoAoCliente: { clienteId: string; ok: true; tipoDetectado?: string; cofre?: unknown } | null = null
      const activeCpfCnpj = normalizeCpfCnpj(activeClient?.cpfCnpj ?? activeClient?.cpfcnpj ?? activeClient?.cpf ?? activeClient?.cnpj)
      const detectedCpfCnpj = normalizeCpfCnpj(onboardingReview?.candidate?.cpfCnpj)
      const detectedClienteId = onboardingReview?.duplicateCliente?.id
      const scope = resolveDocumentClientScope({
        activeClienteId: clienteId,
        activeCpfCnpj,
        detectedClienteId,
        detectedCpfCnpj,
      })
      // CPF/CNPJ inferido pelo modelo só confirma identidade se aparece no texto.
      const documentIdentities = new Set((doc.extractedText.match(/\b(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g) || [])
        .map(value => normalizeCpfCnpj(value)).filter(value => isVerifiedDocumentTaxId(value)))
      const identityInDocument = isVerifiedDocumentTaxId(detectedCpfCnpj) && documentIdentities.has(detectedCpfCnpj)
      // Vários titulares, garantidores ou instituições exigem revisar o papel de cada um.
      const identityEvidenceVerified = identityInDocument && documentIdentities.size === 1
      if (scope.status === 'matched' && !identityEvidenceVerified) scope.status = 'unverified'
      const identityConflict = scope.identityConflict
      const scopeReview = {
        status: scope.status,
        activeClienteId: clienteId,
        detectedCliente: onboardingReview?.candidate?.nome
          ? {
              id: detectedClienteId,
              nome: onboardingReview.candidate.nome,
              cpfCnpj: detectedCpfCnpj || undefined,
            }
          : undefined,
        message: identityConflict
          ? 'Identidade divergente. Documento em revisão, sem vínculo ou conhecimento do cliente. Confirme o destino e o motivo.'
          : scope.status === 'matched'
            ? 'Identidade conferida no documento e no cadastro.'
            : 'Documento em revisão. Confirme o cliente e o motivo para anexar e disponibilizar no conhecimento.',
      }
      const review = documentClientScopeReview(doc)!
      doc = (await svc.saveMetadata(sessionId, doc.id, { clientScopeReview: {
        ...review, status: scope.status === 'matched' ? 'pending' : identityConflict ? 'conflict' : 'unverified',
        detectedCpfCnpj: detectedCpfCnpj || undefined, detectedClienteId, identityEvidenceVerified,
      } }))!
      if (clienteId && activeClient && scope.status === 'matched') {
        doc = (await svc.confirmClientScope(sessionId, doc.id, {
          clienteId, reviewedBy: request.alixUser?.id || 'anonymous', verification: 'document_identity',
          reason: 'CPF/CNPJ literal do documento corresponde ao cadastro de destino.',
        }))!
        try {
          anexadoAoCliente = await attachVerified(request, doc, activeClient)
        } catch (err) {
          request.log.warn({ err }, '[alix-documents] falha ao anexar ao cliente')
        }
      }

      // Na resposta: omite imageBase64 (pesado) e trunca extractedText
      // para evitar respostas JSON gigantes que podem causar problemas
      // de detached ArrayBuffer no fetch do navegador.
      const { imageBase64: _omit, extractedText, ...publicDocRest } = doc
      const MAX_TEXT_RESP_LEN = 32_000 // ~32KB de texto na resposta
      const truncatedText = extractedText && extractedText.length > MAX_TEXT_RESP_LEN
        ? extractedText.slice(0, MAX_TEXT_RESP_LEN) + '\n\n[... texto truncado na resposta; completo disponível via GET /api/alix/documents/:sessionId/:id]'
        : extractedText
      return reply.status(201).type('application/json').send(
        ok({
          ...publicDocRest,
          extractedText: truncatedText,
          textTruncated: extractedText && extractedText.length > MAX_TEXT_RESP_LEN,
          hasImage: !!doc.imageBase64,
          anexadoAoCliente,
          onboardingReview,
          scopeReview,
        }),
      )
    } catch (err) {
      const message = (err as Error)?.message ?? 'Falha ao processar o documento.'
      request.log.error({ err }, '[alix-documents] ingest failed')
      return reply.status((err as { statusCode?: number }).statusCode || 422).send(fail(message, 'INGEST_FAILED'))
    }
  })

  fastify.post('/api/alix/documents/:sessionId/:id/client-scope', async (
    request: FastifyRequest<{ Params: { sessionId: string; id: string } }>, reply: FastifyReply,
  ) => {
    const parsed = z.object({ clienteId: z.string().trim().min(1).max(180), confirmed: z.literal(true), reason: z.string().trim().min(10).max(1000) }).strict().safeParse(request.body)
    if (!parsed.success) return reply.status(400).send(fail('Confirme o destino e informe um motivo com 10 a 1.000 caracteres.', 'INVALID_REVIEW'))
    const doc = await svc.get(request.params.sessionId, request.params.id)
    if (!doc) return reply.status(404).send(fail('Documento não encontrado.', 'NOT_FOUND'))
    const review = documentClientScopeReview(doc)
    if (!review || !canAccessAlixOwner(request.alixUser, review.requestedBy)) return reply.status(404).send(fail('Revisão não encontrada para este usuário.', 'NOT_FOUND'))
    try {
      const cliente = await assertDestination(request, parsed.data.clienteId)
      const updated = await svc.confirmClientScope(doc.sessionId, doc.id, {
        clienteId: parsed.data.clienteId, reviewedBy: request.alixUser?.id || 'anonymous', reason: parsed.data.reason, verification: 'human',
      })
      if (!updated) return reply.status(404).send(fail('Documento não encontrado.', 'NOT_FOUND'))
      let anexadoAoCliente = null
      let attachmentError: string | undefined
      try { anexadoAoCliente = await attachVerified(request, updated, cliente) } catch (error) {
        attachmentError = 'Identidade confirmada; anexo ao cofre pendente. Repita a confirmação para tentar novamente.'
        request.log.warn({ err: error }, '[alix-documents] anexo após revisão falhou')
      }
      return ok({ id: doc.id, sessionId: doc.sessionId, clienteId: updated.clienteId, scopeReview: documentClientScopeReview(updated), anexadoAoCliente, attachmentError })
    } catch (error) {
      return reply.status((error as { statusCode?: number }).statusCode || 409).send(fail((error as Error).message, 'SCOPE_REVIEW_FAILED'))
    }
  })

  // -------- GET /api/alix/document-reviews --------
  fastify.get('/api/alix/document-reviews', async (
    request: FastifyRequest<{ Querystring: { sessionId?: string; status?: DocumentOnboardingReviewStatus } }>,
  ) => {
    const sessionId = request.query?.sessionId?.toString().trim() || undefined
    const status = request.query?.status
    const reviews = await getDocumentOnboardingReviewService().list({ sessionId, status })
    return ok({ sessionId, status, reviews, total: reviews.length })
  })

  // -------- PATCH /api/alix/document-reviews/:id --------
  fastify.patch('/api/alix/document-reviews/:id', async (
    request: FastifyRequest<{ Params: { id: string }; Body: { status?: DocumentOnboardingReviewStatus } }>,
    reply: FastifyReply,
  ) => {
    const allowed = new Set<DocumentOnboardingReviewStatus>(['needs_review', 'ready_for_hitl', 'blocked_duplicate', 'dismissed', 'converted'])
    const status = request.body?.status
    if (!status || !allowed.has(status)) {
      return reply.status(400).send(fail('status inválido.', 'BAD_STATUS'))
    }
    const updated = await getDocumentOnboardingReviewService().updateStatus(request.params.id, status)
    if (!updated) return reply.status(404).send(fail('Revisão não encontrada.', 'NOT_FOUND'))
    return ok(updated)
  })

  // -------- POST /api/alix/documents/:sessionId/:id/analyze-deep --------
  // Leitura forte, multimodal e baseada em evidências. A análise é salva junto
  // ao documento para que chat, Notebook e CRM reutilizem o mesmo diagnóstico.
  fastify.post('/api/alix/documents/:sessionId/:id/analyze-deep', {
    config: { rateLimit: { max: 16, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Params: { sessionId: string; id: string }; Body: { foco?: string; async?: boolean } }>,
    reply: FastifyReply,
  ) => {
    const sessionId = request.params.sessionId.trim()
    const documentId = request.params.id.trim()
    if (!sessionId || !documentId) return reply.status(400).send(fail('Sessão e documento são obrigatórios.', 'BAD_PARAM'))
    try {
      const foco = cleanFocus(request.body?.foco)
      const doc = await svc.get(sessionId, documentId)
      if (!doc) return reply.status(404).send(fail('Documento não encontrado.', 'NOT_FOUND'))
      const queue = getAiJobQueueService()
      if (request.body?.async && queue.ready()) {
        const job = await queue.enqueueDeepAnalysis({ sessionId, documentId, focus: foco })
        return reply.status(202).send(ok({
          queued: true,
          ...job,
          sourceReadiness: {
            extractedTextChars: doc.extractedText?.length ?? 0,
            evidenceCount: doc.evidences?.length ?? 0,
            hasNativeFile: Boolean(doc.metadata?.rawFile),
            clientScope: doc.clienteId ? 'cliente' : 'sessao',
          },
        }))
      }
      return reply.send(ok(await runDocumentDeepAnalysis({ sessionId, documentId, focus: foco })))
    } catch (err) {
      request.log.error({ err, sessionId, documentId }, '[alix-documents] deep analysis failed')
      return reply.status(422).send(fail((err as Error).message || 'Não foi possível concluir a análise profunda.', 'DEEP_ANALYSIS_FAILED'))
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
