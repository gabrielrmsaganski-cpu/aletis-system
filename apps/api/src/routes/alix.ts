// ============================================================
// ALETIS — ALIX Routes
// Chat endpoint + persistent session history (CRUD)
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { join } from 'path'
import { DataSourceManager } from '../services/DataSourceManager.js'
import { AlixService, registerStores } from '../services/AlixService.js'
import { pingFoundry, isLLMEnabled, CLAUDE_MODEL_SONNET } from '../services/llm/ClaudeFoundryClient.js'
import { clientes } from './clientes.js'
import { propostas, propostasInteligentes } from './propostas.js'

// ── Singleton ─────────────────────────────────────────────

let alixInstance: AlixService | null = null

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

  console.log('[ALIX] AlixService initialized — storage:', storageDir)
  return alixInstance
}

// ── Route plugin ──────────────────────────────────────────

export default async function alixRoutes(fastify: FastifyInstance): Promise<void> {
  const alix = getAlixService()

  // ── POST /api/alix/chat ─────────────────────────────────
  // Body: { sessionId?: string, message: string }
  // Returns the reply plus the full (updated) session
  fastify.post('/api/alix/chat', async (
    request: FastifyRequest<{ Body: { sessionId?: string; message?: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const { sessionId, message } = request.body ?? {}
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Campo "message" é obrigatório (string não vazia)',
        })
      }

      const result = await alix.chat(sessionId, message.trim())
      return reply.status(200).send({
        success: true,
        data: {
          reply: result.reply,
          sessionId: result.session.id,
          session: {
            id: result.session.id,
            title: result.session.title,
            createdAt: result.session.createdAt,
            updatedAt: result.session.updatedAt,
            messageCount: result.session.messages.length,
          },
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      request.log.error({ err }, '[ALIX] chat error')
      return reply.status(500).send({ success: false, error: 'Erro no chat ALIX', detalhes: msg })
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

  console.log('[ALIX] Rotas registradas: POST /api/alix/chat, GET/POST/DELETE /api/alix/session(s), GET /api/alix/llm/health')
}
