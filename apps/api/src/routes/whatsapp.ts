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
import { getAzureSpeechService, AzureSpeechService, VOZES_PT_BR_FEMININAS } from '../services/whatsapp/AzureSpeechService.js'
import { getWhatsAppBrain, WhatsAppBrain } from '../services/whatsapp/WhatsAppBrain.js'
import { clientes } from './clientes.js'
import { propostas, propostasInteligentes } from './propostas.js'

// ── Wire singletons once ────────────────────────────────────

let brain: WhatsAppBrain | null = null
let wa: WhatsAppService | null = null
let speech: AzureSpeechService | null = null

function init(): void {
  if (brain) return

  wa = getWhatsAppService()
  speech = getAzureSpeechService()

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
    `meta=${wa.isConfigured()} speech=${speech.isConfigured()}`)
}

// ── Plugin ──────────────────────────────────────────────────

export default async function whatsappRoutes(fastify: FastifyInstance): Promise<void> {
  init()

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
    request: FastifyRequest<{ Body: any }>,
    reply: FastifyReply,
  ) => {
    // Respond 200 immediately (Meta retries if slow)
    reply.status(200).send({ success: true })

    try {
      const payload = request.body as Parameters<NonNullable<typeof wa>['parseInbound']>[0]
      const messages = wa!.parseInbound(payload)
      if (messages.length === 0) return

      for (const msg of messages) {
        // Fire and forget, but log errors
        handleInbound(msg, fastify).catch((err) => {
          fastify.log.error({ err, msg }, '[WhatsApp] handleInbound error')
        })
      }
    } catch (err) {
      fastify.log.error({ err }, '[WhatsApp] Webhook parse error')
    }
  })

  // ── GET /api/whatsapp/status ────────────────────────────
  // Health / config summary (does not expose secrets)
  fastify.get('/api/whatsapp/status', async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        whatsapp: wa!.getConfigSummary(),
        speech: speech!.getConfigSummary(),
        vozesDisponiveis: Object.values(VOZES_PT_BR_FEMININAS).map((v) => ({
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
    request: FastifyRequest<{ Body: { to: string; text: string; previewUrl?: boolean } }>,
    reply: FastifyReply,
  ) => {
    const { to, text, previewUrl } = request.body || {}
    if (!to || !text) return reply.status(400).send({ success: false, error: 'Campos "to" e "text" obrigatórios' })
    try {
      const r = await wa!.sendText(to, text, previewUrl || false)
      return reply.send({ success: true, data: r })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro'
      return reply.status(500).send({ success: false, error: msg })
    }
  })

  // ── POST /api/whatsapp/send-audio-tts ───────────────────
  // Admin: synthesize text via Azure TTS and send as WhatsApp audio note
  fastify.post('/api/whatsapp/send-audio-tts', async (
    request: FastifyRequest<{ Body: { to: string; text: string; voice?: string; style?: string } }>,
    reply: FastifyReply,
  ) => {
    const { to, text, voice, style } = request.body || {}
    if (!to || !text) return reply.status(400).send({ success: false, error: 'Campos "to" e "text" obrigatórios' })
    try {
      const audio = await speech!.textToSpeech(text, { voice, style: style as any })
      const r = await wa!.sendAudio(to, audio, 'audio/ogg')
      return reply.send({ success: true, data: r })
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

  console.log('[WhatsApp] Rotas registradas: /api/whatsapp/{webhook,status,sessions,session/:waId,send-text,send-audio-tts,test-tts,test-brain}')
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
    try {
      const { buffer, mimeType } = await wa.downloadMedia(msg.audio.mediaId)
      if (!speech.isConfigured()) {
        await wa.sendText(from, 'Recebi seu áudio, mas nossa transcrição não está configurada agora. Pode escrever por favor?')
        return
      }
      const stt = await speech.speechToText(buffer, mimeType || msg.audio.mimeType, 'pt-BR')
      texto = stt.texto || ''
      audioTranscricao = texto
      fastify.log.info({ from, confianca: stt.confianca, duracaoMs: stt.duracaoMs }, '[WhatsApp] STT result')
      if (!texto.trim()) {
        await wa.sendText(from, 'Não consegui entender o áudio. Pode repetir ou escrever?')
        return
      }
    } catch (err) {
      fastify.log.error({ err, from }, '[WhatsApp] STT falhou')
      await wa.sendText(from, 'Tive um problema pra ouvir seu áudio. Pode escrever por favor?')
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
    try {
      const audio = await speech.textToSpeech(out.reply)
      await wa.sendAudio(from, audio, 'audio/ogg')
      return
    } catch (err) {
      fastify.log.warn({ err }, '[WhatsApp] TTS falhou, caindo pra texto')
      // fall through to text
    }
  }

  // Text response (split if huge — WhatsApp hard-limit is 4096)
  const chunks = splitForWhatsApp(out.reply, 3800)
  for (const chunk of chunks) {
    await wa.sendText(from, chunk).catch((err) => {
      fastify.log.error({ err }, '[WhatsApp] sendText falhou')
    })
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
