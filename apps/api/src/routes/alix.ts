import { z } from 'zod'
// ============================================================
// ALETIS — ALIX Routes
// Chat endpoint + persistent session history (CRUD)
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { join } from 'path'
import { DataSourceManager } from '../services/DataSourceManager.js'
import { AlixService, registerStores, registerCrmWriteBackends } from '../services/AlixService.js'
import { pingOpenAI, isOpenAIEnabled } from '../services/llm/OpenAIClient.js'
import { getModelForRole, MODEL_REGISTRY } from '../services/llm/LLMConfig.js'
import { WebSearchProviderFactory } from '../services/alix/tools/websearch/WebSearchProviderFactory.js'
import { OrchestratorService } from '../services/alix/OrchestratorService.js'
import { getProspeccaoService } from '../services/prospeccao/ProspeccaoService.js'
import { aggregateTelemetry, telemetryPath, type TelemetryRecord } from '../services/alix/telemetry.js'
import { applyAlixAuth } from '../middleware/alixAuth.js'
import { alixAccessError, assertAlixSessionAccess, canAccessAlixOwner, filterAlixSessions, isAlixAccessEnforced, isAlixLegacySharedSession } from '../services/alix/AlixAccessService.js'
import { readFileSync, existsSync } from 'fs'
import { clientes } from './clientes.js'
import { propostas, propostasInteligentes, updatePropostaCommand } from './propostas.js'
import { getAlixTurnContext } from '../services/alix/AlixTurnContext.js'
import { normalizeAlixProposalPatch } from '../services/alix/crm/proposal-patch.js'
import { deleteCliente as pgDeleteCliente, upsertClienteStrict as pgUpsertClienteStrict } from '../db/ClienteRepository.js'
import { upsertProposta as pgUpsertProposta } from '../db/PropostaRepository.js'
import type { AlixWorkMode } from '../services/alix/workspace/AlixMissionService.js'
import { getAlixMissionService } from '../services/alix/workspace/AlixMissionService.js'
import { isConfirmationMessage } from '../services/alix/ConfirmationChat.js'
import type { GoogleWorkspaceActor } from '../services/google-workspace/schemas.js'

function workspaceActor(request: FastifyRequest): GoogleWorkspaceActor | undefined {
  const auth = request.alixUser && request.alixUser.id !== 'anonymous' ? request.alixUser : (request as FastifyRequest & { user?: Record<string, unknown> }).user
  if (!auth || !(auth.id || auth.sub)) return undefined
  return { userId: String(auth.id || auth.sub), userName: String(auth.nome || 'Consultor'), role: String(auth.role || 'consultor'), tenantId: process.env.ALETIS_TENANT_ID || 'default' }
}

// ── Singleton ─────────────────────────────────────────────

let alixInstance: AlixService | null = null
let orchestratorInstance: OrchestratorService | null = null
let orchestratorInit: Promise<OrchestratorService> | null = null

function isMultiagentEnabled(): boolean {
  return (process.env.ALIX_MULTIAGENT_ENABLED ?? 'true').toLowerCase() !== 'false'
}

async function getOrchestrator(): Promise<OrchestratorService> {
  if (orchestratorInstance) return orchestratorInstance
  if (orchestratorInit) return orchestratorInit
  orchestratorInit = (async () => {
    const dsm = DataSourceManager.getInstance()
    const storageDir = join(process.cwd(), 'storage', 'alix-sessions')
    orchestratorInstance = await OrchestratorService.create(dsm, storageDir)
    console.log('[ALIX] OrchestratorService pronto (feature flag ALIX_MULTIAGENT_ENABLED)')
    return orchestratorInstance
  })()
  return orchestratorInit
}

function getAlixService(): AlixService {
  if (alixInstance) return alixInstance

  const dsm = DataSourceManager.getInstance()
  const storageDir = join(process.cwd(), 'storage', 'alix-sessions')
  alixInstance = new AlixService(dsm, storageDir)

  // Wire CRM stores so ALIX can introspect clientes/propostas
  registerStores({
    clientes: () => Array.from(clientes.values()),
    propostas: () => Array.from(propostas.values()),
    propostasInteligentes: () => Array.from(propostasInteligentes.values()),
  })

  // Alix Insano F4 — backends de escrita no CRM.
  // Para clientes, quando PG está ativo, o upsert PG roda antes do Map:
  // o banco é a barreira principal de unicidade e o Map vira cache runtime.
  registerCrmWriteBackends({
    setCliente: async (c) => {
      await pgUpsertClienteStrict(c as unknown as Parameters<typeof pgUpsertClienteStrict>[0])
      clientes.set(c.id as string, c as any)
    },
    getCliente: (id) => clientes.get(id),
    deleteCliente: async (id) => {
      await pgDeleteCliente(id)
      clientes.delete(id)
    },
    patchCliente: async (id, partial, timelineEvent) => {
      const cliente = clientes.get(id)
      if (!cliente) return null
      const now = new Date().toISOString()
      const hoje = now.slice(0, 10)
      const currentTimeline = Array.isArray((cliente as any).timeline) ? (cliente as any).timeline : []
      const updated = {
        ...(cliente as any),
        ...partial,
        timeline: timelineEvent ? [...currentTimeline, timelineEvent] : currentTimeline,
        ultimaAtualizacao: hoje,
        atualizadoEm: now,
      }
      await pgUpsertClienteStrict(updated as unknown as Parameters<typeof pgUpsertClienteStrict>[0])
      clientes.set(id, updated as any)
      return updated
    },
    setPropostaInteligente: (p) => {
      propostasInteligentes.set(p.id as string, p as any)
      void pgUpsertProposta(p as unknown as Parameters<typeof pgUpsertProposta>[0])
    },
    updateProposta: (id, partial) => updatePropostaCommand(id, normalizeAlixProposalPatch(partial), getAlixTurnContext()?.actor || { nome: 'ALIX' }),
    getLead: (cpfCnpj) => getProspeccaoService().getLead(cpfCnpj),
  });

  console.log('[ALIX] AlixService initialized — storage:', storageDir)

  // Warm-up do WebSearch provider — injeta no Alix quando resolver
  WebSearchProviderFactory.warmUp()
    .then((provider) => {
      alixInstance!.setWebSearchProvider(provider)
      console.log('[ALIX] WebSearch provider ativo:', provider.name)
    })
    .catch((err) => console.warn('[ALIX] WebSearch warmUp falhou:', (err as Error).message))

  return alixInstance
}

// ── Route plugin ──────────────────────────────────────────

export default async function alixRoutes(fastify: FastifyInstance): Promise<void> {
  applyAlixAuth(fastify)
  const alix = getAlixService()

  fastify.addHook('preHandler', async (request) => {
    if (!isAlixAccessEnforced(request.alixUser)) return
    const path = request.routeOptions.url || ''
    const params = request.params as Record<string, string>
    const body = request.body as Record<string, unknown> | undefined
    const query = request.query as Record<string, unknown> | undefined
    let sessionId: unknown
    if (path.startsWith('/api/alix/chat')) sessionId = body?.sessionId
    else if (path === '/api/alix/session/:id') sessionId = params.id
    else if (path.startsWith('/api/alix/telemetry/') || path.startsWith('/api/alix/audit/')) sessionId = params.sessionId
    else if (path === '/api/alix/documents/analyze') sessionId = query?.sessionId
    if (sessionId !== undefined) {
      if (typeof sessionId !== 'string') throw alixAccessError(400, 'Identificador de sessão inválido.')
      const session = await assertAlixSessionAccess(request.alixUser, sessionId)
      if (path.startsWith('/api/alix/chat') && typeof body?.message === 'string' && isConfirmationMessage(body.message)
        && body.clienteId !== undefined && body.clienteId !== session.clienteId) {
        throw alixAccessError(409, 'A confirmação deve usar o contexto atual salvo da conversa. Revise o cliente antes de executar.')
      }
    }
    if (path.startsWith('/api/alix/chat') && body?.missionId !== undefined) {
      if (typeof body.missionId !== 'string' || !sessionId) throw alixAccessError(400, 'A retomada exige missão e sessão válidas.')
      const mission = await getAlixMissionService().get(body.missionId)
      const session = await assertAlixSessionAccess(request.alixUser, String(sessionId))
      if (!mission || mission.sessionId !== sessionId || (!session.legacyShared && !canAccessAlixOwner(request.alixUser, mission.consultorId))) {
        throw alixAccessError(404, 'Missão não encontrada ou indisponível para este usuário.')
      }
    }
  })

  // ── POST /api/alix/chat ─────────────────────────────────
  // Body: { sessionId?: string, message: string, attachments?: string[], clienteId?: string }
  // - attachments: IDs de documentos previamente enviados via /api/alix/documents/upload
  // - clienteId  : dispara auto-injeção da memória persistente do cliente
  // Returns the reply plus the full (updated) session
  fastify.post('/api/alix/chat', {
    config: {
      // Rate limit dedicado: chamadas de IA possuem custo e latência variáveis.
      // sem cap específico, abuso pode gerar centenas de USD em minutos.
      // 30 req/min por IP é suficiente para uso interno legítimo.
      rateLimit: { max: 30, timeWindow: '1 minute' },
    },
  }, async (
    request: FastifyRequest<{ Body: {
      sessionId?: string
      message?: string
      attachments?: string[]
      clienteId?: string
      analysisMode?: 'standard' | 'deep'
      workMode?: AlixWorkMode
      missionId?: string
      modelPreference?: string
    } }>,
    reply: FastifyReply,
  ) => {
    try {
      const { sessionId, message, attachments, clienteId, analysisMode, workMode, missionId, modelPreference } = request.body ?? {}
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Campo "message" é obrigatório (string não vazia)',
        })
      }

      const selection = z.string().trim().min(1).max(160).optional().safeParse(modelPreference)
      if (!selection.success) return reply.status(400).send({ success: false, error: 'Preferência de modelo inválida.' })
      const multi = isMultiagentEnabled()
      const safeAttachments = Array.isArray(attachments) ? attachments.filter((x) => typeof x === 'string') : undefined
      const safeClienteId = typeof clienteId === 'string' && clienteId.trim() ? clienteId.trim() : undefined
      const result = multi
        ? await (await getOrchestrator()).chat(sessionId, message.trim(), {
            modelPreference: selection.data,
            attachments: safeAttachments,
            clienteId: safeClienteId,
            analysisMode: analysisMode === 'deep' ? 'deep' : 'standard',
            workMode,
            missionId: typeof missionId === 'string' ? missionId : undefined,
            consultorId: request.alixUser?.consultorId || request.alixUser?.id,
            actor: workspaceActor(request),
          })
        : await alix.chat(sessionId, message.trim(), {
            actor: { id: request.alixUser?.id, nome: request.alixUser?.nome },
            consultorId: request.alixUser?.consultorId || request.alixUser?.id,
            attachments: safeAttachments,
            clienteId: safeClienteId,
          })
      // Normaliza `reply` em objeto ChatMessage (Orchestrator devolve string,
      // AlixService devolve objeto). UI espera objeto.
      const replyObj =
        typeof result.reply === 'string'
          ? {
              id: result.session.messages[result.session.messages.length - 1]?.id,
              role: 'assistant' as const,
              content: result.reply,
              timestamp: result.session.messages[result.session.messages.length - 1]?.timestamp ?? Date.now(),
              toolsUsed: result.session.messages[result.session.messages.length - 1]?.toolsUsed,
              metadata: result.session.messages[result.session.messages.length - 1]?.metadata,
            }
          : result.reply
      // ALIX Auditável — anexa trail da resposta (tools usadas + source + confidence)
      let audit: any = null
      try {
        const { getAlixAuditTrailService } = await import('../services/alix/AlixAuditTrailService.js')
        const lastMsg = result.session.messages[result.session.messages.length - 1]
        if (lastMsg?.id) {
          audit = getAlixAuditTrailService().getTrail(`${result.session.id}:${lastMsg.id}`)
        }
      } catch { /* audit best-effort */ }

      return reply.status(200).send({
        success: true,
        data: {
          reply: replyObj,
          sessionId: result.session.id,
          session: {
            id: result.session.id,
            title: result.session.title,
            createdAt: result.session.createdAt,
            updatedAt: result.session.updatedAt,
            messageCount: result.session.messages.length,
          },
          mode: multi ? 'multiagent' : 'legacy',
          audit,
          mission: 'mission' in result ? result.mission : undefined,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      request.log.error({ err }, '[ALIX] chat error')
      return reply.status(500).send({ success: false, error: 'Erro no chat ALIX', detalhes: msg })
    }
  })

  // ── POST /api/alix/chat/stream (SSE) ────────────────────
  // Mesmo body do /chat mas devolve uma sequência de eventos SSE.
  // Eventos: 'start', 'token' (chunks), 'tool' (nome da tool usada),
  //          'done' (payload final), 'error'.
  // Implementação pragmática: roda o chat completo e faz stream por
  // chunking de palavras (latência similar à real, sem refatorar o
  // tool-loop do runOpenAI).
  fastify.post('/api/alix/chat/stream', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Body: {
      sessionId?: string
      message?: string
      attachments?: string[]
      clienteId?: string
      analysisMode?: 'standard' | 'deep'
      workMode?: AlixWorkMode
      missionId?: string
      modelPreference?: string
    } }>,
    reply: FastifyReply,
  ) => {
    const { sessionId, message, attachments, clienteId, analysisMode, workMode, missionId, modelPreference } = request.body ?? {}
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.status(400).send({ success: false, error: 'Campo "message" é obrigatório' })
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders?.()

    const send = (event: string, payload: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    }

    send('start', { sessionId, ts: Date.now() })

    // Heartbeat a cada 10s enquanto LLM processa — evita que o cliente perceba
    // conexão morta enquanto tools são executadas.
    const heartbeat = setInterval(() => send('ping', { ts: Date.now() }), 10_000)

    try {
      // Pensamento inicial — avisa o UI que estamos trabalhando
      send('thinking', { text: 'analisando pergunta e escolhendo tools…' })

      const multi = isMultiagentEnabled()
      const toolsUsed: string[] = []
      let emittedText = false

      let replyContent: string
      let replySessionId: string
      let replyObj: any
      let mission: unknown = null

      if (multi) {
      // Caminho principal: Orchestrator OpenAI com ferramentas selecionadas,
        // prospeccao_buscar, delegate_deal_analyzer, inventário, etc.)
        const orch = await getOrchestrator()
        const result = await orch.chat(sessionId, message.trim(), {
          attachments: Array.isArray(attachments) ? attachments.filter((x) => typeof x === 'string') : undefined,
          clienteId: typeof clienteId === 'string' && clienteId.trim() ? clienteId.trim() : undefined,
          analysisMode: analysisMode === 'deep' ? 'deep' : 'standard',
          workMode,
          missionId: typeof missionId === 'string' ? missionId : undefined,
          consultorId: request.alixUser?.consultorId || request.alixUser?.id,
          actor: workspaceActor(request),
          onMission: (value) => {
            mission = value
            try { send('mission', value) } catch { /* stream fechado */ }
          },
          onTextDelta: (text) => {
            emittedText = true
            try { send('token', { text }) } catch { /* stream fechado */ }
          },
          onToolCall: (name) => {
            toolsUsed.push(name)
            try { send('tool', { name }) } catch { /* stream fechado */ }
          },
        })
        replyContent = result.reply
        replySessionId = result.session.id
        mission = result.mission || mission
        replyObj = {
          id: result.session.messages[result.session.messages.length - 1]?.id,
          role: 'assistant',
          content: result.reply,
          timestamp: Date.now(),
          toolsUsed,
          metadata: result.session.messages[result.session.messages.length - 1]?.metadata,
        }
      } else {
        // Legacy — mantido apenas para cenários com ALIX_MULTIAGENT_ENABLED=false
        const result = await alix.chat(sessionId, message.trim(), {
            actor: { id: request.alixUser?.id, nome: request.alixUser?.nome },
          consultorId: request.alixUser?.consultorId || request.alixUser?.id,
          attachments: Array.isArray(attachments) ? attachments.filter((x) => typeof x === 'string') : undefined,
          clienteId: typeof clienteId === 'string' && clienteId.trim() ? clienteId.trim() : undefined,
          onTextDelta: (text) => {
            emittedText = true
            try { send('token', { text }) } catch { /* stream fechado */ }
          },
          onToolCall: (name: string) => {
            toolsUsed.push(name)
            try { send('tool', { name }) } catch { /* stream fechado */ }
          },
        })
        replyContent = result.reply.content || ''
        replySessionId = result.session.id
        replyObj = result.reply
      }

      // Respostas deterministicas (por exemplo confirmacoes HITL) nao passam pelo LLM.
      if (!emittedText && replyContent) send('token', { text: replyContent })

      send('done', {
        reply: replyObj,
        sessionId: replySessionId,
        sources: replyObj?.sources || [],
        toolsUsed: replyObj?.toolsUsed || toolsUsed,
        mission,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      request.log.error({ err }, '[ALIX] stream error')
      send('error', { error: msg })
    } finally {
      clearInterval(heartbeat)
      reply.raw.end()
    }
  })

  // ── POST /api/alix/chat/stream-v2 (SSE — streaming via Orchestrator + tools) ──
  // Esta versão usa o OrchestratorService completo (60+ tools, sub-agentes,
  // CRM, prospeccao, websearch). A diferença para /chat é apenas o streaming
  // SSE da resposta final.
  fastify.post('/api/alix/chat/stream-v2', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Body: {
      sessionId?: string
      message?: string
      attachments?: string[]
      clienteId?: string
      analysisMode?: 'standard' | 'deep'
      workMode?: AlixWorkMode
      missionId?: string
      modelPreference?: string
    } }>,
    reply: FastifyReply,
  ) => {
    const { sessionId, message, attachments, clienteId, analysisMode, workMode, missionId, modelPreference } = request.body ?? {}
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.status(400).send({ success: false, error: 'Campo "message" é obrigatório' })
    }

    const selection = z.string().trim().min(1).max(160).optional().safeParse(modelPreference)
    if (!selection.success) return reply.status(400).send({ success: false, error: 'Preferência de modelo inválida.' })
    const abort = new AbortController()
    const disconnect = () => abort.abort(new Error('A conexão da conversa foi encerrada.'))
    reply.raw.on('close', disconnect)

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders?.()

    const send = (event: string, payload: unknown) => {
      if (reply.raw.destroyed || reply.raw.writableEnded) return
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    }

    send('start', { sessionId, ts: Date.now() })

    const heartbeat = setInterval(() => send('ping', { ts: Date.now() }), 10_000)

    try {
      const multi = isMultiagentEnabled()
      const toolsUsed: string[] = []
      let emittedText = false

      let replyText: string
      let replySessionId: string
      let replyObj: any
      let mission: unknown = null

      if (multi) {
        // CAMINHO PRINCIPAL: OrchestratorService com 60+ tools
        const orch = await getOrchestrator()
        const result = await orch.chat(sessionId, message.trim(), {
          modelPreference: selection.data,
          signal: abort.signal,
          onRouting: (routing) => send('routing', routing),
          onProgress: (event) => send('progress', event),
          attachments: Array.isArray(attachments) ? attachments.filter((x) => typeof x === 'string') : undefined,
          clienteId: typeof clienteId === 'string' && clienteId.trim() ? clienteId.trim() : undefined,
          analysisMode: analysisMode === 'deep' ? 'deep' : 'standard',
          workMode,
          missionId: typeof missionId === 'string' ? missionId : undefined,
          consultorId: request.alixUser?.consultorId || request.alixUser?.id,
          actor: workspaceActor(request),
          onMission: (value) => {
            mission = value
            try { send('mission', value) } catch { /* stream fechado */ }
          },
          onTextDelta: (text) => {
            emittedText = true
            try { send('token', { text }) } catch { /* stream fechado */ }
          },
          onToolCall: (name) => {
            toolsUsed.push(name)
            try { send('tool', { name }) } catch { /* stream fechado */ }
          },
        })
        replyText = result.reply
        replySessionId = result.session.id
        mission = result.mission || mission

        const lastMsg = result.session.messages[result.session.messages.length - 1]
        replyObj = {
          id: lastMsg?.id,
          role: 'assistant',
          content: replyText,
          timestamp: Date.now(),
          toolsUsed,
          metadata: lastMsg?.metadata,
        }
      } else {
        // Legacy — mantido apenas para cenários com ALIX_MULTIAGENT_ENABLED=false
        const result = await alix.chat(sessionId, message.trim(), {
            actor: { id: request.alixUser?.id, nome: request.alixUser?.nome },
          consultorId: request.alixUser?.consultorId || request.alixUser?.id,
          attachments: Array.isArray(attachments) ? attachments.filter((x) => typeof x === 'string') : undefined,
          clienteId: typeof clienteId === 'string' && clienteId.trim() ? clienteId.trim() : undefined,
          onTextDelta: (text) => {
            emittedText = true
            try { send('token', { text }) } catch { /* stream fechado */ }
          },
          onToolCall: (name: string) => {
            toolsUsed.push(name)
            try { send('tool', { name }) } catch { /* stream fechado */ }
          },
        })
        replyText = result.reply.content || ''
        replySessionId = result.session.id
        replyObj = result.reply
      }

      if (!emittedText && replyText) send('token', { text: replyText })

      send('done', {
        reply: replyObj,
        sessionId: replySessionId,
        sources: replyObj?.sources || [],
        toolsUsed: replyObj?.toolsUsed || toolsUsed,
        mission,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      request.log.error({ err }, '[ALIX] stream-v2 error')
      send('error', { error: msg })
    } finally {
      clearInterval(heartbeat)
      reply.raw.off('close', disconnect)
      reply.raw.end()
    }
  })

  // ── GET /api/alix/sessions ──────────────────────────────
  // Lists all persisted sessions (most recent first)
  fastify.get('/api/alix/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessions = await filterAlixSessions(request.alixUser, await alix.listSessions())
      return reply.status(200).send({ success: true, data: sessions, total: sessions.length })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      return reply.status(500).send({ success: false, error: 'Erro ao listar sessões', detalhes: msg })
    }
  })

  // ── GET /api/alix/session/:id ───────────────────────────
  // Retrieves the full session with all messages
  fastify.get('/api/alix/session/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const { id } = request.params
      const session = await alix.getSession(id)
      if (!session) {
        return reply.status(404).send({ success: false, error: 'Sessão não encontrada' })
      }
      return reply.status(200).send({ success: true, data: { ...session, ...(isAlixLegacySharedSession(request.alixUser, session) ? { legacyShared: true } : {}) } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      return reply.status(500).send({ success: false, error: 'Erro ao buscar sessão', detalhes: msg })
    }
  })

  // ── POST /api/alix/session ──────────────────────────────
  // Creates an empty new session
  fastify.post('/api/alix/session', async (
    request: FastifyRequest<{ Body: { title?: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const { title } = request.body ?? {}
      const session = await alix.createSession(title, request.alixUser?.consultorId || request.alixUser?.id)
      return reply.status(201).send({ success: true, data: session })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      return reply.status(500).send({ success: false, error: 'Erro ao criar sessão', detalhes: msg })
    }
  })

  // ── PATCH /api/alix/session/:id ───────────────────────────
  // Atualiza metadados operacionais sem apagar o histórico.
  fastify.patch('/api/alix/session/:id', async (
    request: FastifyRequest<{
      Params: { id: string }
      Body: { title?: string; archived?: boolean; pinned?: boolean; clienteId?: string | null }
    }>,
    reply: FastifyReply,
  ) => {
    try {
      const body = request.body ?? {}
      const hasPatch = ['title', 'archived', 'pinned', 'clienteId'].some((key) => Object.prototype.hasOwnProperty.call(body, key))
      if (!hasPatch) return reply.status(400).send({ success: false, error: 'Nenhuma alteração informada' })
      if (body.title !== undefined && typeof body.title !== 'string') {
        return reply.status(400).send({ success: false, error: 'Título inválido' })
      }
      const session = await alix.updateSession(request.params.id, body, { strict: true })
      if (!session) return reply.status(404).send({ success: false, error: 'Sessão não encontrada' })
      return reply.status(200).send({ success: true, data: session })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      return reply.status(500).send({ success: false, error: 'Erro ao atualizar sessão', detalhes: msg })
    }
  })

  // ── DELETE /api/alix/session/:id ────────────────────────
  fastify.delete('/api/alix/session/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const { id } = request.params
      const ok = await alix.deleteSession(id)
      if (!ok) return reply.status(404).send({ success: false, error: 'Sessão não encontrada' })
      return reply.status(200).send({ success: true, data: { deleted: id } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      return reply.status(500).send({ success: false, error: 'Erro ao deletar sessão', detalhes: msg })
    }
  })

  // ── GET /api/alix/llm/health ─────────────────────────────
  // Health-check do cérebro LLM na plataforma OpenAI.
  fastify.get('/api/alix/llm/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const model = getModelForRole('orchestrator')
    const ping = await pingOpenAI(model)
    return reply.status(ping.ok ? 200 : 503).send({
      success: ping.ok,
      data: {
        enabled: isOpenAIEnabled(),
        operational: ping.ok,
        activeRole: 'orchestrator',
        availableModels: Object.keys(MODEL_REGISTRY).length,
        ping,
      },
    })
  })

  // ── Alix Insano F8 — Insights proativos ────────────────
  fastify.get(
    '/api/alix/insights',
    async (request: FastifyRequest<{ Querystring: { days?: string } }>, reply: FastifyReply) => {
      try {
        const { getProactiveService } = await import('../services/alix/ProactiveService.js')
        const { getProspeccaoService } = await import('../services/prospeccao/ProspeccaoService.js')
        const storageDir = join(process.cwd(), 'storage')
        const proactive = getProactiveService(getProspeccaoService(), storageDir)
        const days = Math.min(Number(request.query?.days ?? 7) || 7, 30)
        const insights = await proactive.getRecentInsights(days)
        return reply.send({ success: true, data: insights, total: insights.length })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // ── Alix Insano F7 — Telemetria ───────────────────────
  fastify.get(
    '/api/alix/telemetry/:sessionId',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const storageDir = join(process.cwd(), 'storage', 'alix-sessions')
      const path = telemetryPath(storageDir, request.params.sessionId)
      if (!existsSync(path)) {
        return reply.status(404).send({ success: false, error: 'Sem telemetria para esta sessão' })
      }
      try {
        const raw = readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean)
        const records: TelemetryRecord[] = raw.map(line => JSON.parse(line))
        const agg = aggregateTelemetry(records)
        return reply.send({ success: true, data: { aggregate: agg, records } })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // ── GET /api/alix/push/health ─────────────────────────
  // Status do canal de push (WhatsApp ou log-only) — útil para admin saber
  // se alertas críticos estão chegando no destino configurado.
  fastify.get('/api/alix/push/health', async (_req, reply) => {
    try {
      const { getAlixPushChannel } = await import('../services/alix/push/AlixPushChannel.js')
      const { getProspeccaoService } = await import('../services/prospeccao/ProspeccaoService.js')
      const { getProactiveService } = await import('../services/alix/ProactiveService.js')
      const ch = getAlixPushChannel()
      const proactive = getProactiveService(getProspeccaoService(), (ch as any).storageDir || process.cwd())
      return reply.send({ success: true, data: { ...ch.health(), nextBriefingAt: proactive.getNextBriefingAt?.() || null } })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ── POST /api/alix/push/test ──────────────────────────
  // Envia uma mensagem de teste via canal de push (respeitando dryrun/flags).
  fastify.post('/api/alix/push/test', async (req: FastifyRequest<{ Body: { body?: string } }>, reply) => {
    try {
      const { getAlixPushChannel } = await import('../services/alix/push/AlixPushChannel.js')
      const ch = getAlixPushChannel()
      const body = (req.body?.body || '').trim() ||
        `🧪 *ALIX — teste de push*\nSe você recebeu esta mensagem, o canal está funcional (${new Date().toLocaleString('pt-BR')}).`
      const result = await ch.send({ body, opts: { tag: 'test', force: true } })
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ── POST /api/alix/briefing/run ───────────────────────
  // Dispara o briefing diário sob demanda (dev/admin).
  fastify.post('/api/alix/briefing/run', async (_req, reply) => {
    try {
      const { getDailyBriefingService } = await import('../services/alix/push/DailyBriefingService.js')
      const svc = getDailyBriefingService()
      const result = await svc.sendDailyBriefing()
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ── Wave B1 — Alert Rules CRUD ────────────────────────
  // GET /api/alix/rules → lista todas
  // GET /api/alix/rules/:clienteId → lista de um cliente
  // POST /api/alix/rules → cria
  // DELETE /api/alix/rules/:ruleId → remove
  // PATCH /api/alix/rules/:ruleId → atualiza valor/operador/ativo
  // POST /api/alix/rules/evaluate-now → roda watcher manualmente
  fastify.get('/api/alix/rules', async (_req, reply) => {
    try {
      const { getAlertRulesService } = await import('../services/alix/AlertRulesService.js')
      const rules = getAlertRulesService().listAll()
      return reply.send({ success: true, data: rules, total: rules.length })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  fastify.get<{ Params: { clienteId: string } }>('/api/alix/rules/:clienteId', async (req, reply) => {
    try {
      const { getAlertRulesService } = await import('../services/alix/AlertRulesService.js')
      const rules = getAlertRulesService().list(req.params.clienteId)
      return reply.send({ success: true, data: rules, total: rules.length })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  fastify.post<{ Body: Record<string, unknown> }>('/api/alix/rules', async (req, reply) => {
    try {
      const { getAlertRulesService } = await import('../services/alix/AlertRulesService.js')
      const b = (req.body || {}) as Record<string, any>
      if (!b.clienteId || !b.tipo || !b.simbolo || !b.operador || b.valor == null) {
        return reply.status(400).send({ success: false, error: 'clienteId, tipo, simbolo, operador, valor são obrigatórios' })
      }
      const rule = await getAlertRulesService().create({
        clienteId: String(b.clienteId),
        tipo: b.tipo,
        simbolo: String(b.simbolo),
        operador: b.operador,
        valor: Number(b.valor),
        unidade: b.unidade,
        motivo: b.motivo,
        cooldownDias: b.cooldownDias != null ? Number(b.cooldownDias) : undefined,
      })
      return reply.status(201).send({ success: true, data: rule })
    } catch (err) {
      return reply.status(400).send({ success: false, error: (err as Error).message })
    }
  })

  fastify.patch<{ Params: { ruleId: string }; Body: Record<string, unknown> }>('/api/alix/rules/:ruleId', async (req, reply) => {
    try {
      const { getAlertRulesService } = await import('../services/alix/AlertRulesService.js')
      const updated = await getAlertRulesService().update(req.params.ruleId, (req.body || {}) as any)
      if (!updated) return reply.status(404).send({ success: false, error: 'Regra não encontrada' })
      return reply.send({ success: true, data: updated })
    } catch (err) {
      return reply.status(400).send({ success: false, error: (err as Error).message })
    }
  })

  fastify.delete<{ Params: { ruleId: string } }>('/api/alix/rules/:ruleId', async (req, reply) => {
    try {
      const { getAlertRulesService } = await import('../services/alix/AlertRulesService.js')
      const ok = await getAlertRulesService().delete(req.params.ruleId)
      if (!ok) return reply.status(404).send({ success: false, error: 'Regra não encontrada' })
      return reply.send({ success: true })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ── Wave B4 — context hint (pré-computa "o que mudou" antes de o user
  // abrir o chat). Frontend chama ao abrir ClienteDetalhes; backend
  // retorna insights pendentes do cliente + sugestões de foco.
  fastify.post<{ Body: { clienteId: string; tela?: string } }>(
    '/api/alix/context-hint',
    async (req, reply) => {
      try {
        const clienteId = String(req.body?.clienteId || '').trim()
        if (!clienteId) return reply.status(400).send({ success: false, error: 'clienteId obrigatório' })
        const tela = req.body?.tela ? String(req.body.tela).slice(0, 80) : undefined

        const { getProactiveService } = await import('../services/alix/ProactiveService.js')
        const { getProspeccaoService } = await import('../services/prospeccao/ProspeccaoService.js')
        const storageDir = join(process.cwd(), 'storage')
        const proactive = getProactiveService(getProspeccaoService(), storageDir)

        // Insights dos últimos 14 dias filtrados por clienteId no payload
        const all = await proactive.getRecentInsights(14)
        const ofCliente = all.filter((i) => {
          const p = (i.payload || {}) as Record<string, unknown>
          return String(p.clienteId || '') === clienteId
        })

        // descontar insights já respondidos (responses.jsonl)
        const respondidos = new Set<string>()
        const responsesFile = join(storageDir, 'alix-insights', 'responses.jsonl')
        if (existsSync(responsesFile)) {
          try {
            const raw = readFileSync(responsesFile, 'utf-8').trim()
            for (const line of raw.split('\n')) {
              if (!line) continue
              try {
                const r = JSON.parse(line)
                if (r?.insightId) respondidos.add(r.insightId)
              } catch {/* skip */}
            }
          } catch {/* skip */}
        }
        const pendentes = ofCliente.filter((i) => !respondidos.has(i.id))

        // Regras de alerta ativas para este cliente
        let regras: Array<{ id: string; tipo: string; simbolo: string; regra: string }> = []
        try {
          const { getAlertRulesService } = await import('../services/alix/AlertRulesService.js')
          regras = getAlertRulesService()
            .list(clienteId)
            .filter((r) => r.ativo)
            .map((r) => ({ id: r.id, tipo: r.tipo, simbolo: r.simbolo, regra: `${r.simbolo} ${r.operador} ${r.valor}` }))
        } catch {/* skip */}

        // Sugestão de foco baseada no insight de maior urgência
        const ordem = { critico: 2, importante: 1, info: 0 } as const
        const top = [...pendentes].sort(
          (a, b) => (ordem[b.urgencia] ?? 0) - (ordem[a.urgencia] ?? 0) || b.ts.localeCompare(a.ts),
        )[0]
        let sugestao: string | null = null
        if (top) {
          if (top.tipo === 'stage-stuck') sugestao = `Deal travado há mais de 14 dias — sugestão: pedir atualização de status ou rebaixar estágio.`
          else if (top.tipo === 'crm-acao-vencida') sugestao = `Próxima ação vencida — sugestão: registrar contato agora ou reagendar com motivo.`
          else if (top.tipo === 'crm-acao-hoje') sugestao = `Existe ação marcada para hoje — sugestão: executar contato e registrar resultado no CRM.`
          else if (top.tipo === 'crm-sem-proxima-acao') sugestao = `Cliente ativo sem próximo passo — sugestão: definir próxima ação com prazo e responsável.`
          else if (top.tipo === 'whatsapp-mudo') sugestao = `Cliente parou de responder no WhatsApp — sugestão: msg curta de retomada ou template fora-da-janela 24h.`
          else if (top.tipo === 'doc-vencendo') sugestao = `Documento pendente há tempo — sugestão: cobrar via WhatsApp ou reenviar magic-link do portal.`
          else if (top.tipo === 'alerta-preco-disparado') sugestao = `Alerta de preço disparou — sugestão: revisar exposição e propor hedge.`
          else sugestao = top.titulo
        }

        return reply.send({
          success: true,
          data: {
            clienteId,
            tela,
            pendentes: pendentes.length,
            criticos: pendentes.filter((i) => i.urgencia === 'critico').length,
            importantes: pendentes.filter((i) => i.urgencia === 'importante').length,
            insights: pendentes.slice(0, 6),
            regrasAtivas: regras,
            sugestao,
          },
        })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // ── Wave Onda B — disparar detectInsights manualmente (dev/admin) ──
  fastify.post('/api/alix/insights/run', async (_req, reply) => {
    try {
      const { getProactiveService } = await import('../services/alix/ProactiveService.js')
      const { getProspeccaoService } = await import('../services/prospeccao/ProspeccaoService.js')
      const storageDir = join(process.cwd(), 'storage')
      const proactive = getProactiveService(getProspeccaoService(), storageDir)
      const insights = await proactive.detectInsights()
      return reply.send({ success: true, data: { count: insights.length, insights: insights.slice(0, 5) } })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  fastify.post('/api/alix/rules/evaluate-now', async (_req, reply) => {
    try {
      const { getProactiveService } = await import('../services/alix/ProactiveService.js')
      const { getProspeccaoService } = await import('../services/prospeccao/ProspeccaoService.js')
      const storageDir = join(process.cwd(), 'storage')
      const proactive = getProactiveService(getProspeccaoService(), storageDir)
      const result = await proactive.evaluateAlertRules()
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ── ALIX Auditável — leitura standalone do trail ────────
  // GET /api/alix/audit/:sessionId/:messageId → trail completo
  fastify.get<{ Params: { sessionId: string; messageId: string } }>(
    '/api/alix/audit/:sessionId/:messageId',
    async (req, reply) => {
      const { getAlixAuditTrailService } = await import('../services/alix/AlixAuditTrailService.js')
      const trail = getAlixAuditTrailService().getTrail(`${req.params.sessionId}:${req.params.messageId}`)
      if (!trail) return reply.status(404).send({ success: false, error: 'trail expirado ou inexistente' })
      return reply.send({ success: true, data: trail })
    },
  )

  // ── Wave B5 — SSE stream de insights ──────────────────
  // GET /api/alix/insights/stream — broadcast em tempo real a cada
  // novo insight emitido por recordInsight (cobre TODOS os watchers).
  // Cliente: new EventSource('/api/alix/insights/stream') + onmessage.
  fastify.get('/api/alix/insights/stream', async (req, reply) => {
    const { getProactiveService } = await import('../services/alix/ProactiveService.js')
    const { getProspeccaoService } = await import('../services/prospeccao/ProspeccaoService.js')
    const storageDir = join(process.cwd(), 'storage')
    const proactive = getProactiveService(getProspeccaoService(), storageDir)

    // SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    // primeiro frame para o cliente saber que tá conectado
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`)

    // heartbeat a cada 25s para manter conexão viva (proxies cortam idle)
    const hb = setInterval(() => {
      try { reply.raw.write(`: heartbeat ${Date.now()}\n\n`) } catch {/* ignore */}
    }, 25_000)

    const onInsight = (insight: any) => {
      try {
        const payload = JSON.stringify(insight)
        reply.raw.write(`event: insight\ndata: ${payload}\n\n`)
      } catch {/* ignore */}
    }
    proactive.events.on('insight', onInsight)

    req.raw.on('close', () => {
      proactive.events.off('insight', onInsight)
      clearInterval(hb)
      try { reply.raw.end() } catch {/* ignore */}
    })
    // Marca como já-respondido pra Fastify não tentar serializar
    return reply
  })

  // ── Wave B3 — Weekly report ───────────────────────────
  fastify.get('/api/alix/weekly-report/preview', async (_req, reply) => {
    try {
      const { getWeeklyReportService } = await import('../services/alix/push/WeeklyReportService.js')
      const svc = getWeeklyReportService()
      const texto = await svc.buildReport()
      return reply.send({ success: true, data: { texto, len: texto.length } })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  fastify.post('/api/alix/weekly-report/run', async (_req, reply) => {
    try {
      const { getWeeklyReportService } = await import('../services/alix/push/WeeklyReportService.js')
      const svc = getWeeklyReportService()
      const result = await svc.sendWeeklyReport()
      return reply.send({ success: true, data: result })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ── Wave 11 — Document Analysis para frontend ─────────
  fastify.get('/api/alix/documents/analyze', async (req: FastifyRequest<{ Querystring: { documentoId?: string; sessionId?: string } }>, reply) => {
    try {
      const { getDocumentIntakeService } = await import('../services/alix/intake/DocumentIntakeService.js')
      const docId = req.query.documentoId
      const sessionId = req.query.sessionId
      if (!docId || !sessionId) {
        return reply.status(400).send({ success: false, error: 'documentoId e sessionId são obrigatórios' })
      }
      const doc = await getDocumentIntakeService().get(sessionId, docId)
      if (!doc) {
        return reply.status(404).send({ success: false, error: 'Documento não encontrado' })
      }
      const smartExtraction = (doc.metadata as any)?.smartExtraction as import('@aletis/shared-types').DocumentExtractionResult | undefined
      if (!smartExtraction) {
        return reply.status(202).send({
          success: true,
          data: null,
          message: 'Documento ainda em processamento. Tente novamente em alguns segundos.',
        })
      }
      const data = {
        documentoId: doc.id,
        tipoDocumento: smartExtraction.tipoDocumento,
        confianca: smartExtraction.confianca,
        entidades: smartExtraction.entidades.slice(0, 20),
        clienteNome: smartExtraction.clienteData?.nome,
        clienteCpfCnpj: smartExtraction.clienteData?.cpfCnpj,
        dividaTotal: smartExtraction.clienteData?.cpfCnpj
          ? smartExtraction.dividas.reduce((sum, d) => sum + (d.valorAtualizado || d.valorOriginal || 0), 0)
          : undefined,
        lacunas: smartExtraction.lacunas,
        riscos: smartExtraction.riscos,
        acoesSugeridas: smartExtraction.acoesSugeridas,
        ready: smartExtraction.lacunas.filter((l) => !/cpf|cnpj/i.test(l)).length === 0 && !!smartExtraction.clienteData?.nome,
      }
      return reply.send({ success: true, data })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  console.log('[ALIX] Rotas registradas: chat, sessions, llm/health, telemetry, push/health, push/test, briefing/run, rules CRUD + evaluate-now, weekly-report, document-analysis')
}
