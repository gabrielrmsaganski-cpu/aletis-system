// ============================================================
// ALETIS — WhatsApp Routes
// Webhook (GET verify, POST receive) + admin endpoints for testing
// Pipeline: webhook → parse → [STT] → brain → [TTS] → send
// ============================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { join } from 'path'
import { DataSourceManager } from '../services/DataSourceManager.js'
import { AlixService, registerStores } from '../services/AlixService.js'
import { getWhatsAppService, WhatsAppService } from '../services/whatsapp/WhatsAppService.js'
import { getOpenAIAudioService, OpenAIAudioService, OPENAI_VOICES_PT_BR } from '../services/whatsapp/OpenAIAudioService.js'
import { getWhatsAppBrain, WhatsAppBrain } from '../services/whatsapp/WhatsAppBrain.js'
import { getEvolutionClient, EvolutionClient } from '../services/whatsapp/evolution/EvolutionClient.js'
import { isEvolutionWebhook, normalizeEvolutionWebhook } from '../services/whatsapp/evolution/EvolutionWebhookNormalizer.js'
import { getConversationStateService, ConversationStateService } from '../services/whatsapp/ConversationStateService.js'
import { getWhatsAppIaService, WhatsAppIaService } from '../services/whatsapp/WhatsAppIaService.js'
import { getDocumentIntakeService, DocumentIntakeService } from '../services/whatsapp/DocumentIntakeService.js'
import { getGoogleCalendarService, GoogleCalendarService } from '../services/whatsapp/GoogleCalendarService.js'
import { getWhatsAppOutboxService, WhatsAppOutboxService } from '../services/whatsapp/WhatsAppOutboxService.js'
import { WhatsAppWebhookQueueService } from '../services/whatsapp/WhatsAppWebhookQueueService.js'
import { getHumanTakeoverService, HumanTakeoverService } from '../services/whatsapp/HumanTakeoverService.js'
import { isWhatsAppAutoLeadCreationEnabled, isWhatsAppAutomationEnabled, isEvolutionWebhookEnabled } from '../services/whatsapp/AutomationSafety.js'
import { clientes } from './clientes.js'
import { propostas, propostasInteligentes } from './propostas.js'

// ── Wire singletons once ────────────────────────────────────

let brain: WhatsAppBrain | null = null
let wa: WhatsAppService | null = null
let speech: OpenAIAudioService | null = null
let evolution: EvolutionClient | null = null
let state: ConversationStateService | null = null
let whatsappIa: WhatsAppIaService | null = null
let documentIntake: DocumentIntakeService | null = null
let calendar: GoogleCalendarService | null = null
let outbox: WhatsAppOutboxService | null = null
let takeover: HumanTakeoverService | null = null

function sendOutcome(reply: FastifyReply, result: { status?: string; messageId?: string }, data: unknown = result) {
  if (result.status === 'sent' || (!result.status && result.messageId)) return reply.send({ success: true, data })
  const status = result.status || 'uncertain'
  const error = status === 'dry_run' ? 'Modo de simulação: nenhuma mensagem foi enviada.'
    : status === 'uncertain' ? 'O provedor não confirmou o envio. Confira a conversa antes de tentar novamente.'
      : 'A mensagem não foi enviada. O resultado foi registrado para acompanhamento.'
  return reply.status(status === 'failed' ? 502 : 409).send({ success: false, status, error, data })
}

function init(): void {
  if (brain) return

  wa = getWhatsAppService()
  speech = getOpenAIAudioService()
  evolution = getEvolutionClient()
  state = getConversationStateService()
  whatsappIa = getWhatsAppIaService()
  documentIntake = getDocumentIntakeService()
  calendar = getGoogleCalendarService()
  outbox = getWhatsAppOutboxService()
  takeover = getHumanTakeoverService()

  // Build an isolated AlixService for WhatsApp (separate storage dir)
  const dsm = DataSourceManager.getInstance()
  const alixStorage = join(process.cwd(), 'storage', 'whatsapp-alix-sessions')
  const alix = new AlixService(dsm, alixStorage)

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

  const brainStorage = join(process.cwd(), 'storage', 'whatsapp-sessions')
  brain = getWhatsAppBrain(alix, brainStorage)

  console.log('[WhatsApp] Routes initialized. Configured:',
    `provider=${process.env.WHATSAPP_PROVIDER || 'evolution'} meta=${wa.isConfigured()} evolution=${evolution.isConfigured()} speech=${speech.isConfigured()}`)
}

// ── Plugin ──────────────────────────────────────────────────

export default async function whatsappRoutes(fastify: FastifyInstance): Promise<void> {
  init()
  const webhookQueue = new WhatsAppWebhookQueueService(state!, whatsappIa!, outbox!, {
    logger: fastify.log,
    metaHandler: async (payload) => {
      const messages = wa!.parseInbound(payload as unknown as Parameters<NonNullable<typeof wa>['parseInbound']>[0])
      for (const message of messages) await handleInbound(message, fastify)
    },
  })
  fastify.addHook('onReady', async () => { webhookQueue.start() })
  fastify.addHook('onClose', async () => { await webhookQueue.stop() })

  fastify.get('/api/whatsapp/queue', async (_request, reply) => {
    const events = await state!.listWebhookQueueEvents(100)
    return reply.send({ success: true, data: { events, limit: 100, automationEnabled: isWhatsAppAutomationEnabled() } })
  })

  // ── GET /api/whatsapp/webhook ──────────────────────────
  // Meta handshake: returns hub.challenge when verify_token matches
  fastify.get('/api/whatsapp/webhook', async (
    request: FastifyRequest<{ Querystring: Record<string, string> }>,
    reply: FastifyReply,
  ) => {
    const mode = request.query['hub.mode']
    const token = request.query['hub.verify_token']
    const challenge = request.query['hub.challenge']

    const result = wa!.verifyWebhook(mode, token, challenge)
    if (result) {
      fastify.log.info('[WhatsApp] Webhook verified')
      return reply.type('text/plain').send(result)
    }
    return reply.status(403).send({ success: false, error: 'Webhook verification failed' })
  })

  // ── POST /api/whatsapp/webhook ──────────────────────────
  // Receives inbound messages + status updates from Meta
  fastify.post('/api/whatsapp/webhook', async (
    request: FastifyRequest<{ Body: any; Querystring: Record<string, string | undefined> }>,
    reply: FastifyReply,
  ) => {
    const configuredSecret = process.env.WHATSAPP_WEBHOOK_SECRET || process.env.EVOLUTION_WEBHOOK_SECRET
    if (configuredSecret) {
      const presented =
        request.headers['x-whatsapp-webhook-secret'] ||
        request.headers['x-evolution-webhook-secret'] ||
        request.headers['x-webhook-secret'] ||
        request.query?.secret
      if (presented !== configuredSecret) {
        return reply.status(401).send({ success: false, error: 'Webhook nao autorizado' })
      }
    }

    const maxBytes = Number(process.env.WHATSAPP_WEBHOOK_MAX_BYTES || 2_000_000)
    const approxBytes = Buffer.byteLength(JSON.stringify(request.body || {}))
    if (approxBytes > maxBytes) {
      return reply.status(413).send({ success: false, error: 'Payload do webhook excede limite' })
    }

    try {
      const payload = request.body
      const accepted = isEvolutionWebhook(payload)
        ? await webhookQueue.acceptEvolution(normalizeEvolutionWebhook(payload))
        : await webhookQueue.acceptMeta(payload || {})
      // Confirma recebimento apenas depois do registro durável. O worker recupera
      // entradas pendentes e respostas preparadas após reinício.
      return reply.status(200).send({ success: true, ...accepted })
    } catch (err) {
      fastify.log.error({ err }, '[WhatsApp] Falha ao persistir webhook')
      return reply.status(503).send({ success: false, error: 'Não foi possível registrar o evento. Tente novamente.' })
    }
  })

  // ── GET /api/whatsapp/status ────────────────────────────
  // Health / config summary (does not expose secrets)
  fastify.get('/api/whatsapp/status', async (_request, reply) => {
    const evolutionStatus = await evolution!.getRuntimeStatus()
    return reply.send({
      success: true,
      data: {
        provider: process.env.WHATSAPP_PROVIDER || 'evolution',
        automation: {
          enabled: isWhatsAppAutomationEnabled(),
          autoCreateLeads: isWhatsAppAutoLeadCreationEnabled(),
          evolutionWebhookEnabled: isEvolutionWebhookEnabled(),
        },
        evolution: evolutionStatus,
        whatsapp: wa!.getConfigSummary(),
        speech: speech!.getConfigSummary(),
        calendar: calendar!.getConfigSummary(),
        storage: {
          provider: process.env.WHATSAPP_STORAGE_PROVIDER || 'local',
          dir: process.env.WHATSAPP_STORAGE_DIR || 'storage/whatsapp-media',
        },
        documentosObrigatorios: documentIntake!.getRequiredDocuments(),
        vozesDisponiveis: Object.values(OPENAI_VOICES_PT_BR).map((v) => ({
          nome: v.nome,
          descricao: v.descricao,
        })),
        handoff: {
          consultor: process.env.ALETIS_HANDOFF_NOME || 'Christian Kohler',
          email: process.env.ALETIS_HANDOFF_EMAIL || 'contato@aletis.com.br',
          telefone: process.env.ALETIS_HANDOFF_FONE || null,
        },
      },
    })
  })

  // ── GET /api/whatsapp/instances ─────────────────────────
  fastify.get('/api/whatsapp/instances', async (_request, reply) => {
    try {
      const instances = await evolution!.fetchInstances()
      return reply.send({ success: true, data: { instances } })
    } catch (err) {
      return reply.status(502).send({ success: false, error: (err as Error).message })
    }
  })

  // ── POST /api/whatsapp/evolution/instances ─────────────
  fastify.post('/api/whatsapp/evolution/instances', async (
    request: FastifyRequest<{ Body: { instanceName?: string; qrcode?: boolean } }>,
    reply,
  ) => {
    try {
      const created = await evolution!.createInstance({
        instanceName: request.body?.instanceName,
        qrcode: request.body?.qrcode ?? true,
      })
      return reply.send({ success: true, data: created })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ── POST /api/whatsapp/evolution/instances/:instance/connect ──
  fastify.post('/api/whatsapp/evolution/instances/:instance/connect', async (
    request: FastifyRequest<{ Params: { instance: string } }>,
    reply,
  ) => {
    try {
      let qr: unknown
      try {
        qr = await evolution!.connect(request.params.instance)
      } catch (err) {
        const msg = (err as Error).message.toLowerCase()
        if (msg.includes('not found') || msg.includes('nao encontrada') || msg.includes('não encontrada')) {
          await evolution!.createInstance({ instanceName: request.params.instance, qrcode: true })
          qr = await evolution!.connect(request.params.instance)
        } else {
          throw err
        }
      }
      return reply.send({ success: true, data: qr })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ── GET /api/whatsapp/evolution/instances/:instance/status ──
  fastify.get('/api/whatsapp/evolution/instances/:instance/status', async (
    request: FastifyRequest<{ Params: { instance: string } }>,
    reply,
  ) => {
    try {
      const [health, connection] = await Promise.all([
        evolution!.health(),
        evolution!.connectionState(request.params.instance),
      ])
      return reply.send({ success: true, data: { health, connection } })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ── POST /api/whatsapp/evolution/webhook/set ────────────
  fastify.post('/api/whatsapp/evolution/webhook/set', async (
    request: FastifyRequest<{ Body: { instance?: string; url?: string } }>,
    reply,
  ) => {
    try {
      const out = await evolution!.setWebhook(request.body?.instance, request.body?.url)
      return reply.send({ success: true, data: out })
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ── GET /api/whatsapp/conversations ─────────────────────
  fastify.get('/api/whatsapp/conversations', async (
    request: FastifyRequest<{ Querystring: { limit?: string; search?: string } }>,
    reply,
  ) => {
    const limit = Math.min(Number(request.query.limit || 80) || 80, 200)
    const conversations = await state!.listConversations(limit, request.query.search || '')
    return reply.send({ success: true, data: { conversations, total: conversations.length } })
  })

  // ── GET /api/whatsapp/conversations/:id ─────────────────
  fastify.get('/api/whatsapp/conversations/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply,
  ) => {
    const bundle = await state!.getConversationBundle(request.params.id)
    if (!bundle.conversation) return reply.status(404).send({ success: false, error: 'Conversa nao encontrada' })
    const checklist = await documentIntake!.getChecklistStatus(request.params.id)
    return reply.send({ success: true, data: { ...bundle, checklist } })
  })

  // ── POST /api/whatsapp/conversations/:id/handoff ────────
  fastify.post('/api/whatsapp/conversations/:id/handoff', async (
    request: FastifyRequest<{ Params: { id: string }; Body: { assignedUserId?: string; reason?: string } }>,
    reply,
  ) => {
    await takeover!.takeover({
      conversationId: request.params.id,
      assignedUserId: request.body?.assignedUserId,
      reason: request.body?.reason,
    })
    return reply.send({ success: true, data: { id: request.params.id, atendimentoModo: 'humano' } })
  })

  // ── POST /api/whatsapp/conversations/:id/ai ─────────────
  fastify.post('/api/whatsapp/conversations/:id/ai', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply,
  ) => {
    await takeover!.release({ conversationId: request.params.id, actor: 'system' })
    return reply.send({ success: true, data: { id: request.params.id, atendimentoModo: 'ia' } })
  })

  // ── POST /api/whatsapp/conversations/:id/send ───────────
  fastify.post('/api/whatsapp/conversations/:id/send', async (
    request: FastifyRequest<{ Params: { id: string }; Body: { text: string; idempotencyKey?: string } }>,
    reply,
  ) => {
    const text = request.body?.text?.trim()
    if (!text) return reply.status(400).send({ success: false, error: 'Campo "text" obrigatorio' })
    const bundle = await state!.getConversationBundle(request.params.id)
    const conversation = bundle.conversation
    if (!conversation) return reply.status(404).send({ success: false, error: 'Conversa nao encontrada' })
    try {
      const sent = await outbox!.send({
        conversationId: conversation.id,
        instanceName: conversation.instanceName,
        toNumber: conversation.telefone,
        type: 'text',
        text,
        idempotencyKey: request.body?.idempotencyKey,
      })
      const msg = await state!.recordMessage({
        conversationId: conversation.id,
        instanceName: conversation.instanceName,
        providerMessageId: sent.providerMessageId || `outbox:${sent.outboxId}`,
        direction: 'outbound',
        type: 'text',
        status: sent.status,
        text,
        toNumber: conversation.telefone,
        timestamp: new Date(),
        payload: { ...sent },
      })
      return sendOutcome(reply, sent, msg.message)
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message })
    }
  })

  // ── GET /api/whatsapp/documents ─────────────────────────
  fastify.get('/api/whatsapp/documents', async (
    request: FastifyRequest<{ Querystring: { limit?: string } }>,
    reply,
  ) => {
    const limit = Math.min(Number(request.query.limit || 200) || 200, 500)
    const documents = await state!.listDocuments(limit)
    return reply.send({ success: true, data: { documents, total: documents.length } })
  })

  // ── POST /api/whatsapp/conversations/:id/documents/checklist ──
  fastify.post('/api/whatsapp/conversations/:id/documents/checklist', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply,
  ) => {
    const bundle = await state!.getConversationBundle(request.params.id)
    const conversation = bundle.conversation
    if (!conversation) return reply.status(404).send({ success: false, error: 'Conversa nao encontrada' })
    const checklist = await documentIntake!.getChecklistStatus(request.params.id)
    await state!.upsertDocumentRequests({
      conversationId: request.params.id,
      clienteId: conversation.clienteId,
      requests: checklist.map((d) => ({ key: d.key, label: d.label, status: d.status })),
    })
    const pendentes = checklist.filter((d) => d.status !== 'recebido')
    const text = pendentes.length
      ? `Para seguir com a analise, envie por aqui: ${pendentes.map((d) => d.label).join('; ')}.`
      : 'Checklist documental completo nesta etapa. Vou deixar registrado para analise da equipe ALETIS.'
    const sent = await outbox!.send({
      conversationId: conversation.id,
      instanceName: conversation.instanceName,
      toNumber: conversation.telefone,
      type: 'text',
      text,
    })
    await state!.recordMessage({
      conversationId: conversation.id,
      instanceName: conversation.instanceName,
      providerMessageId: sent.providerMessageId,
      direction: 'outbound',
      type: 'text',
      status: sent.status,
      text,
      toNumber: conversation.telefone,
      timestamp: new Date(),
      payload: { ...sent },
    })
    return sendOutcome(reply, sent, { checklist, sent })
  })

  // ── GET /api/whatsapp/sessions ──────────────────────────
  fastify.get('/api/whatsapp/sessions', async (_request, reply) => {
    const all = await brain!.listSessions()
    return reply.send({
      success: true,
      data: all.map((s) => ({
        waId: s.waId,
        nomeContato: s.nomeContato,
        etapa: s.etapa,
        lead: s.lead,
        escalouHumano: s.escalouHumano,
        tagsDeEscalada: s.tagsDeEscalada,
        criadoEm: s.criadoEm,
        atualizadoEm: s.atualizadoEm,
        totalMensagens: s.mensagens.length,
      })),
      total: all.length,
    })
  })

  // ── GET /api/whatsapp/session/:waId ─────────────────────
  fastify.get('/api/whatsapp/session/:waId', async (
    request: FastifyRequest<{ Params: { waId: string } }>,
    reply: FastifyReply,
  ) => {
    const s = await brain!.getSession(request.params.waId)
    if (!s) return reply.status(404).send({ success: false, error: 'Sessão não encontrada' })
    return reply.send({ success: true, data: s })
  })

  // ── DELETE /api/whatsapp/session/:waId ──────────────────
  fastify.delete('/api/whatsapp/session/:waId', async (
    request: FastifyRequest<{ Params: { waId: string } }>,
    reply: FastifyReply,
  ) => {
    const ok = await brain!.resetSession(request.params.waId)
    if (!ok) return reply.status(404).send({ success: false, error: 'Sessão não encontrada' })
    return reply.send({ success: true, data: { reset: request.params.waId } })
  })

  // ── POST /api/whatsapp/send-text ────────────────────────
  // Admin: send arbitrary text (e.g., from CRM)
  fastify.post('/api/whatsapp/send-text', async (
    request: FastifyRequest<{ Body: { to: string; text: string; previewUrl?: boolean; idempotencyKey?: string } }>,
    reply: FastifyReply,
  ) => {
    const { to, text, previewUrl } = request.body || {}
    if (!to || !text) return reply.status(400).send({ success: false, error: 'Campos "to" e "text" obrigatórios' })
    try {
      const r = (process.env.WHATSAPP_PROVIDER || 'evolution') === 'evolution'
        ? await outbox!.send({
            instanceName: evolution!.getDefaultInstance(),
            toNumber: to,
            type: 'text',
            text,
            idempotencyKey: request.body.idempotencyKey,
          })
        : await wa!.sendText(to, text, previewUrl || false)
      return sendOutcome(reply, r)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro'
      return reply.status(500).send({ success: false, error: msg })
    }
  })

  // ── POST /api/whatsapp/send-audio-tts ───────────────────
  // Admin: sintetiza texto via OpenAI e envia como nota de voz no WhatsApp
  fastify.post('/api/whatsapp/send-audio-tts', async (
    request: FastifyRequest<{ Body: { to: string; text: string; voice?: string; style?: string; idempotencyKey?: string } }>,
    reply: FastifyReply,
  ) => {
    const { to, text, voice, style } = request.body || {}
    if (!to || !text) return reply.status(400).send({ success: false, error: 'Campos "to" e "text" obrigatórios' })
    try {
      const audio = await speech!.textToSpeech(text, { voice, style: style as any })
      const r = (process.env.WHATSAPP_PROVIDER || 'evolution') === 'evolution'
        ? await outbox!.send({
            instanceName: evolution!.getDefaultInstance(),
            toNumber: to,
            type: 'audio',
            mediaBase64: audio.toString('base64'),
            mediaMime: 'audio/ogg',
            idempotencyKey: request.body.idempotencyKey,
          })
        : await wa!.sendAudio(to, audio, 'audio/ogg')
      return sendOutcome(reply, r)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro'
      return reply.status(500).send({ success: false, error: msg })
    }
  })

  // ── POST /api/whatsapp/test-tts ─────────────────────────
  // Quick TTS check: returns audio bytes inline
  fastify.post('/api/whatsapp/test-tts', async (
    request: FastifyRequest<{ Body: { text: string; voice?: string; style?: string; format?: string } }>,
    reply: FastifyReply,
  ) => {
    const { text, voice, style, format } = request.body || {}
    if (!text) return reply.status(400).send({ success: false, error: 'Campo "text" obrigatório' })
    try {
      const buf = await speech!.textToSpeech(text, { voice, style: style as any, outputFormat: format })
      return reply
        .type(format?.startsWith('audio') ? format : 'audio/ogg')
        .header('Content-Disposition', 'attachment; filename="tts.ogg"')
        .send(buf)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro'
      return reply.status(500).send({ success: false, error: msg })
    }
  })

  // ── POST /api/whatsapp/test-brain ───────────────────────
  // Hit the brain without going through Meta (dev)
  fastify.post('/api/whatsapp/test-brain', async (
    request: FastifyRequest<{ Body: { waId: string; texto: string; nomeContato?: string; kind?: 'text' | 'audio' } }>,
    reply: FastifyReply,
  ) => {
    const { waId, texto, nomeContato, kind } = request.body || {}
    if (!waId || !texto) return reply.status(400).send({ success: false, error: 'Campos "waId" e "texto" obrigatórios' })
    try {
      const out = await brain!.responder({ waId, texto, nomeContato, kind: kind || 'text' })
      return reply.send({
        success: true,
        data: {
          reply: out.reply,
          intent: out.intent,
          sendAsAudio: out.sendAsAudio,
          escalated: out.escalated,
          etapa: out.session.etapa,
          lead: out.session.lead,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro'
      return reply.status(500).send({ success: false, error: msg })
    }
  })

  console.log('[WhatsApp] Rotas registradas: /api/whatsapp/{webhook,status,instances,conversations,documents,sessions,send-text,send-audio-tts,test-tts,test-brain}')
}

// ── Inbound handler ──────────────────────────────────────────

async function handleInbound(
  msg: import('../services/whatsapp/WhatsAppService.js').InboundMessage,
  fastify: FastifyInstance,
): Promise<void> {
  if (!wa || !brain || !speech) return

  const from = msg.from
  const nomeContato = msg.contact?.nome

  // Mark incoming message as read right away
  wa.markAsRead(msg.messageId).catch(() => { /* best-effort */ })

  let texto = ''
  let kind: 'text' | 'audio' | 'button' = 'text'
  let audioTranscricao: string | undefined

  if (msg.type === 'text') {
    texto = msg.text || ''
    kind = 'text'
  } else if (msg.type === 'audio' && msg.audio) {
    kind = 'audio'
    let audioFallback: string | undefined
    try {
      if (!speech.isConfigured()) {
        audioFallback = 'Recebi seu áudio, mas nossa transcrição não está configurada agora. Pode escrever por favor?'
      } else {
        const { buffer, mimeType } = await wa.downloadMedia(msg.audio.mediaId)
        const stt = await speech.speechToText(buffer, mimeType || msg.audio.mimeType, 'pt-BR')
        texto = stt.texto || ''
        audioTranscricao = texto
        if (!texto.trim()) audioFallback = 'Não consegui entender o áudio. Pode repetir ou escrever?'
      }
    } catch (err) {
      fastify.log.error({ err, from }, '[WhatsApp] STT falhou')
      audioFallback = 'Tive um problema pra ouvir seu áudio. Pode escrever por favor?'
    }
    if (audioFallback) {
      await wa.sendText(from, audioFallback)
      return
    }
  } else if (msg.type === 'interactive' && msg.buttonReply) {
    kind = 'button'
    texto = msg.buttonReply.title
  } else if (msg.type === 'image') {
    await wa.sendText(from, 'Recebi sua imagem. No momento trabalho melhor com texto ou áudio. Pode me descrever o que é?')
    return
  } else {
    await wa.sendText(from, 'Recebi sua mensagem, mas esse tipo de conteúdo ainda não é suportado. Pode mandar como texto ou áudio?')
    return
  }

  // Delegate to brain
  const out = await brain.responder({ waId: from, nomeContato, texto, kind, audioTranscricao })

  // Ship reply: audio-in → audio-out when Speech is configured, otherwise fallback to text
  if (out.sendAsAudio && speech.isConfigured()) {
    let audio: Buffer | undefined
    try {
      audio = await speech.textToSpeech(out.reply)
    } catch (err) {
      fastify.log.warn({ err }, '[WhatsApp] TTS falhou, caindo pra texto')
      // fall through to text
    }
    if (audio) {
      // Falha de envio pode acontecer depois da aceitação: não duplicar em texto.
      await wa.sendAudio(from, audio, 'audio/ogg')
      return
    }
  }

  // Text response (split if huge — WhatsApp hard-limit is 4096)
  const chunks = splitForWhatsApp(out.reply, 3800)
  for (const chunk of chunks) {
    await wa.sendText(from, chunk)
  }
}

function splitForWhatsApp(text: string, max: number): string[] {
  if (text.length <= max) return [text]
  const out: string[] = []
  let remaining = text
  while (remaining.length > max) {
    const cut = remaining.lastIndexOf('\n\n', max)
    const idx = cut > max * 0.5 ? cut : remaining.lastIndexOf('. ', max)
    const split = idx > max * 0.4 ? idx + 1 : max
    out.push(remaining.slice(0, split).trim())
    remaining = remaining.slice(split).trim()
  }
  if (remaining) out.push(remaining)
  return out
}
