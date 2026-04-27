// ============================================================
// ALETIS — ALIX Routes
// Chat endpoint + persistent session history (CRUD)
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { join } from 'path'
import { DataSourceManager } from '../services/DataSourceManager.js'
import { AlixService, registerStores, registerCrmWriteBackends } from '../services/AlixService.js'
import { pingFoundry, isLLMEnabled, CLAUDE_MODEL_SONNET } from '../services/llm/ClaudeFoundryClient.js'
import { WebSearchProviderFactory } from '../services/alix/tools/websearch/WebSearchProviderFactory.js'
import { OrchestratorService } from '../services/alix/OrchestratorService.js'
import { getProspeccaoService } from '../services/prospeccao/ProspeccaoService.js'
import { aggregateTelemetry, telemetryPath, type TelemetryRecord } from '../services/alix/telemetry.js'
import { readFileSync, existsSync } from 'fs'
import { clientes } from './clientes.js'
import { propostas, propostasInteligentes } from './propostas.js'
import { upsertCliente as pgUpsertCliente } from '../db/ClienteRepository.js'
import { upsertProposta as pgUpsertProposta } from '../db/PropostaRepository.js'

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
    propostasInteligentes: () => Array.from(propostasInteligentes.values()).map((p: any) => ({
      id: p.id,
      clienteNome: p.clienteNome || p.dadosCliente?.nome || '—',
      estrategia: p.estrategia || p.metadata?.estrategiaRecomendada || 'padrão',
      dividaTotal: p.dividaTotal || p.contexto?.dividaTotal || 0,
      secoes: Array.isArray(p.secoes) ? p.secoes.length : 15,
    })),
  })

  // Alix Insano F4 — backends de escrita no CRM
  // Cada `setCliente`/`setPropostaInteligente`/`updateProposta` agora faz
  // dual-write: Map em memória (source of truth runtime) + Postgres
  // (best-effort via flag ALETIS_PG_ENABLED). Mesmo padrão dos handlers
  // tradicionais — ALIX não pode ser exceção, ou perdemos as escritas dela
  // quando o servidor reiniciar.
  registerCrmWriteBackends({
    setCliente: (c) => {
      clientes.set(c.id as string, c as any)
      void pgUpsertCliente(c as unknown as Parameters<typeof pgUpsertCliente>[0])
    },
    setPropostaInteligente: (p) => {
      propostasInteligentes.set(p.id as string, p as any)
      void pgUpsertProposta(p as unknown as Parameters<typeof pgUpsertProposta>[0])
    },
    updateProposta: (id, partial) => {
      const p = propostas.get(id)
      if (!p) return false
      Object.assign(p as any, partial, { atualizadoEm: new Date().toISOString() })
      propostas.set(id, p)
      void pgUpsertProposta(p as unknown as Parameters<typeof pgUpsertProposta>[0])
      return true
    },
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
  const alix = getAlixService()

  // ── POST /api/alix/chat ─────────────────────────────────
  // Body: { sessionId?: string, message: string, attachments?: string[], clienteId?: string }
  // - attachments: IDs de documentos previamente enviados via /api/alix/documents/upload
  // - clienteId  : dispara auto-injeção da memória persistente do cliente
  // Returns the reply plus the full (updated) session
  fastify.post('/api/alix/chat', {
    config: {
      // Rate limit dedicado: ALIX/Foundry custa $0.015–$0.075 por chamada;
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
    } }>,
    reply: FastifyReply,
  ) => {
    try {
      const { sessionId, message, attachments, clienteId } = request.body ?? {}
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Campo "message" é obrigatório (string não vazia)',
        })
      }

      const multi = isMultiagentEnabled()
      const safeAttachments = Array.isArray(attachments) ? attachments.filter((x) => typeof x === 'string') : undefined
      const safeClienteId = typeof clienteId === 'string' && clienteId.trim() ? clienteId.trim() : undefined
      const result = multi
        ? await (await getOrchestrator()).chat(sessionId, message.trim(), {
            attachments: safeAttachments,
            clienteId: safeClienteId,
          })
        : await alix.chat(sessionId, message.trim(), {
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
            }
          : result.reply
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
  // tool-loop do runClaude).
  fastify.post('/api/alix/chat/stream', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (
    request: FastifyRequest<{ Body: {
      sessionId?: string
      message?: string
      attachments?: string[]
      clienteId?: string
    } }>,
    reply: FastifyReply,
  ) => {
    const { sessionId, message, attachments, clienteId } = request.body ?? {}
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

      let replyContent: string
      let replySessionId: string
      let replyObj: any

      if (multi) {
        // Caminho principal: Orchestrator (Opus + 60+ tools, inclusive
        // prospeccao_buscar, delegate_deal_analyzer, inventário, etc.)
        const orch = await getOrchestrator()
        const result = await orch.chat(sessionId, message.trim(), {
          attachments: Array.isArray(attachments) ? attachments.filter((x) => typeof x === 'string') : undefined,
          clienteId: typeof clienteId === 'string' && clienteId.trim() ? clienteId.trim() : undefined,
          onToolCall: (name) => {
            toolsUsed.push(name)
            try { send('tool', { name }) } catch { /* stream fechado */ }
          },
        })
        replyContent = result.reply
        replySessionId = result.session.id
        replyObj = {
          id: result.session.messages[result.session.messages.length - 1]?.id,
          role: 'assistant',
          content: result.reply,
          timestamp: Date.now(),
          toolsUsed,
        }
      } else {
        // Legacy — mantido apenas para cenários com ALIX_MULTIAGENT_ENABLED=false
        const result = await alix.chat(sessionId, message.trim(), {
          attachments: Array.isArray(attachments) ? attachments.filter((x) => typeof x === 'string') : undefined,
          clienteId: typeof clienteId === 'string' && clienteId.trim() ? clienteId.trim() : undefined,
          onToolCall: (name: string) => {
            toolsUsed.push(name)
            try { send('tool', { name }) } catch { /* stream fechado */ }
          },
        })
        replyContent = result.reply.content || ''
        replySessionId = result.session.id
        replyObj = result.reply
      }

      // Stream palavra-a-palavra — delay 4ms. Fica natural sem drenar CPU.
      const words = replyContent.split(/(\s+)/) // preserva espaços/quebras
      for (const w of words) {
        send('token', { text: w })
        if (w.trim().length > 0) await new Promise((r) => setTimeout(r, 4))
      }

      send('done', {
        reply: replyObj,
        sessionId: replySessionId,
        sources: replyObj?.sources || [],
        toolsUsed: replyObj?.toolsUsed || toolsUsed,
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

  // ── GET /api/alix/sessions ──────────────────────────────
  // Lists all persisted sessions (most recent first)
  fastify.get('/api/alix/sessions', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessions = await alix.listSessions()
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
      return reply.status(200).send({ success: true, data: session })
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
      const session = await alix.createSession(title)
      return reply.status(201).send({ success: true, data: session })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      return reply.status(500).send({ success: false, error: 'Erro ao criar sessão', detalhes: msg })
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
  // Health-check do cérebro LLM (Foundry / Claude Sonnet 4.6)
  fastify.get('/api/alix/llm/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ping = await pingFoundry()
    return reply.status(ping.ok ? 200 : 503).send({
      success: ping.ok,
      data: {
        enabled: isLLMEnabled(),
        model: CLAUDE_MODEL_SONNET,
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

  console.log('[ALIX] Rotas registradas: POST /api/alix/chat, GET/POST/DELETE /api/alix/session(s), GET /api/alix/llm/health, GET /api/alix/telemetry/:sessionId, GET /api/alix/push/health, POST /api/alix/push/test, POST /api/alix/briefing/run')
}
