// ============================================================
// ALETIS — WhatsApp Brain
// Stateful conversational agent for WhatsApp Business.
// - Persona: Alix, consultora ALETIS (rural debt restructuring)
// - Lead capture flow: nome → cidade/UF → credor → valor da dívida → urgência
// - Escalation triggers (penhora/leilão/execução) → handoff human
// - Delegates business/market/legal questions to AlixService
// - Plain-text, audio-friendly output (no markdown)
// ============================================================

import { promises as fs } from 'fs'
import { join } from 'path'
import type { AlixService } from '../AlixService.js'
import { moneyToCents, parseMoneyPtBr } from '../../lib/parseMoneyPtBr.js'

// ── Session types ────────────────────────────────────────────

export type Etapa =
  | 'novo'
  | 'coletando_nome'
  | 'coletando_cidade'
  | 'coletando_credor'
  | 'coletando_valor'
  | 'qualificado'
  | 'aguardando_humano'

export interface LeadInfo {
  nome?: string
  cidade?: string
  uf?: string
  credor?: string
  valorDivida?: string
  culturas?: string[]
  urgencia?: 'baixa' | 'media' | 'alta' | 'critica'
  motivoUrgencia?: string
  canalPreferido?: 'audio' | 'texto'
}

export interface WhatsAppMsg {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  kind?: 'text' | 'audio' | 'button'
  audioTranscricao?: string
  intent?: string
  toolsUsed?: string[]
}

export interface WhatsAppSession {
  waId: string              // phone number (Meta wa_id)
  nomeContato?: string      // from WhatsApp profile
  etapa: Etapa
  lead: LeadInfo
  criadoEm: number
  atualizadoEm: number
  mensagens: WhatsAppMsg[]
  escalouHumano: boolean
  ultimaInteracaoHumano?: number
  tagsDeEscalada: string[]
}

export interface ResponderInput {
  waId: string
  nomeContato?: string
  texto: string
  kind?: 'text' | 'audio' | 'button'
  audioTranscricao?: string
}

export interface ResponderOutput {
  reply: string
  sendAsAudio: boolean      // true when user spoke (audio-in → audio-out)
  session: WhatsAppSession
  escalated: boolean
  intent: string
}

// ── Handoff configuration ────────────────────────────────────

const HANDOFF_CONTATOS = {
  consultorPrincipal: process.env.ALETIS_HANDOFF_NOME || 'Christian Kohler',
  telefone: process.env.ALETIS_HANDOFF_FONE || '',
  email: process.env.ALETIS_HANDOFF_EMAIL || 'contato@aletis.com.br',
}

// ── Utilities ────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function parseValorBRL(texto: string): string | null {
  return parseMoneyPtBr(texto).amount
}

function formatValorBRL(amount: string): string {
  const cents = moneyToCents(amount)
  if (cents === null) return 'valor a confirmar'
  return `R$ ${(cents / 100n).toLocaleString('pt-BR')},${String(cents % 100n).padStart(2, '0')}`
}

function detectaUrgencia(texto: string): { nivel: LeadInfo['urgencia']; motivo?: string } {
  const q = norm(texto)
  if (/penhora|leilao|leilão|execu[cç][aã]o fiscal|execu[cç][aã]o judicial|citacao|citação|despejo|mandado|intima[cç][aã]o.*judicial/.test(q)) {
    const m = q.match(/(penhora|leilao|leilão|execu[cç][aã]o fiscal|execu[cç][aã]o judicial|despejo)/)
    return { nivel: 'critica', motivo: m?.[1] }
  }
  if (/negativa[cç][aã]o|serasa|spc|protesto|bloqueio|conta bloqueada|nao consigo pagar|dividas? vencidas?/.test(q)) {
    return { nivel: 'alta', motivo: 'endividamento ativo' }
  }
  if (/urgente|urgencia|rapido|pra ontem|preciso.*ja|me ajuda logo/.test(q)) {
    return { nivel: 'alta', motivo: 'pedido explicito de urgencia' }
  }
  if (/dificuldade|apertado|dificil|preocup|medo/.test(q)) {
    return { nivel: 'media' }
  }
  return { nivel: 'baixa' }
}

function extrairUF(texto: string): string | undefined {
  const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
  const up = texto.toUpperCase()
  for (const uf of ufs) {
    if (new RegExp(`\\b${uf}\\b`).test(up) || new RegExp(`[-/,\\s]${uf}\\b`).test(up)) return uf
  }
  return undefined
}

function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^[•\-\*]\s+/gm, '- ')
}

function resumoCurto(s: string, max: number = 900): string {
  const clean = stripMarkdown(s).replace(/\n{3,}/g, '\n\n').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastDot = cut.lastIndexOf('. ')
  return (lastDot > max * 0.6 ? cut.slice(0, lastDot + 1) : cut) + '\n\n(Posso detalhar qualquer ponto — é só pedir.)'
}

// ── Intent classifier (WhatsApp-specific) ────────────────────

type WaIntent =
  | { tipo: 'saudacao' }
  | { tipo: 'despedida' }
  | { tipo: 'agradecimento' }
  | { tipo: 'falar_humano' }
  | { tipo: 'apresenta_nome'; nome: string }
  | { tipo: 'apresenta_cidade'; cidade: string; uf?: string }
  | { tipo: 'apresenta_credor'; credor: string }
  | { tipo: 'apresenta_valor'; valor: string }
  | { tipo: 'duvida_negocio' }   // "o que voces fazem?"
  | { tipo: 'duvida_mercado' }   // dolar, selic, soja — delega ALIX
  | { tipo: 'duvida_juridica' }  // sumula, mcr, proagro — delega ALIX
  | { tipo: 'emergencia' }
  | { tipo: 'generico' }

function classify(texto: string, etapa: Etapa): WaIntent {
  const q = norm(texto)

  // Emergency wins over everything — a greeting wrapping "recebi penhora" still needs humans now
  const urg = detectaUrgencia(texto)
  if (urg.nivel === 'critica') return { tipo: 'emergencia' }

  // Short greetings / farewells / thanks: match only when the message is basically just that
  if (q.length <= 25 && /^(oi|ola|ol[aá]|e ai|bom dia|boa tarde|boa noite|hey|salve|opa)\b/.test(q)) return { tipo: 'saudacao' }
  if (/^(tchau|ate mais|falou|obrigad[oa] tchau|flw|xau)\b/.test(q) && q.length <= 30) return { tipo: 'despedida' }
  if (/^(obrigad[oa]|valeu|muito obrigad[oa]|grat[oa]|thanks)\b/.test(q) && q.length <= 30) return { tipo: 'agradecimento' }
  if (/(falar com|atendente|humano|pessoa real|consultor|especialista|christian|eduardo|mariana)/.test(q)) return { tipo: 'falar_humano' }

  // Stage-specific capture
  if (etapa === 'coletando_nome') {
    const nomeMatch = texto.match(/(?:me chamo|meu nome e|sou o|sou a|aqui e|e o|e a)\s*([A-Za-zÀ-ú][A-Za-zÀ-ú ]{2,40})|^([A-Za-zÀ-ú][A-Za-zÀ-ú ]{2,40})$/i)
    const nome = (nomeMatch?.[1] || nomeMatch?.[2] || '').trim()
    if (nome && nome.split(/\s+/).length <= 5 && !/[0-9]/.test(nome)) return { tipo: 'apresenta_nome', nome }
  }
  if (etapa === 'coletando_cidade') {
    const uf = extrairUF(texto)
    const cidadeMatch = texto.match(/(?:moro em|estou em|sou de|cidade|aqui em)\s*([A-Za-zÀ-ú][A-Za-zÀ-ú \-]{2,40})|^([A-Za-zÀ-ú][A-Za-zÀ-ú \-]{2,40})(?:\s*[-,/]\s*[A-Z]{2})?$/i)
    const cidade = (cidadeMatch?.[1] || cidadeMatch?.[2] || '').replace(/[-,/]\s*[A-Z]{2}$/i, '').trim()
    if (cidade) return { tipo: 'apresenta_cidade', cidade, uf }
  }
  if (etapa === 'coletando_credor') {
    // Banks & common creditors
    const bancos = ['banco do brasil', 'bb', 'bradesco', 'itau', 'itaú', 'santander', 'sicredi', 'sicoob', 'caixa', 'banrisul', 'basa', 'bnb', 'bndes', 'john deere', 'new holland', 'case', 'agroamigo']
    for (const b of bancos) {
      if (new RegExp(`\\b${b.replace(/ /g, '\\s+')}\\b`, 'i').test(texto)) return { tipo: 'apresenta_credor', credor: b }
    }
    if (texto.trim().length >= 2 && texto.trim().length <= 60) return { tipo: 'apresenta_credor', credor: texto.trim() }
  }
  if (etapa === 'coletando_valor') {
    const v = parseValorBRL(texto)
    if (v !== null) return { tipo: 'apresenta_valor', valor: v }
  }

  // Business/market/legal routing
  if (/(dolar|dólar|euro|usd|eur|cambio|soja|milho|boi|cafe|café|preco|preço|cotacao|cotação|selic|ipca|clima|tempo|previsao|mercado)/.test(q)) return { tipo: 'duvida_mercado' }
  if (/(sumula|súmula|mcr|manual.*credito|pronaf|pronamp|plano safra|proagro|juros abusiv|capitaliza|taxa abusiv|contrato.*credito rural|renegocia|refinancia|alonga|prorroga|resolu[cç][aã]o 4966|jurispruden|precedente|stj)/.test(q)) return { tipo: 'duvida_juridica' }
  if (/(aletis|voces fazem|o que vocês fazem|como funciona|como ajudam|servico|serviço|consultoria|honorario|honorário|cobran|preco.*servico)/.test(q)) return { tipo: 'duvida_negocio' }

  return { tipo: 'generico' }
}

// ── Brain ────────────────────────────────────────────────────

export class WhatsAppBrain {
  private storageDir: string
  private alix: AlixService
  private sessions = new Map<string, WhatsAppSession>()
  private loaded = false

  constructor(alix: AlixService, storageDir: string) {
    this.alix = alix
    this.storageDir = storageDir
  }

  // ── Persistence ─────────────────────────────────────────

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    try {
      await fs.mkdir(this.storageDir, { recursive: true })
      const files = await fs.readdir(this.storageDir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const raw = await fs.readFile(join(this.storageDir, file), 'utf8')
          const s = JSON.parse(raw) as WhatsAppSession
          if (s?.waId) {
            if (s.lead?.valorDivida !== undefined) {
              s.lead.valorDivida = parseMoneyPtBr(String(s.lead.valorDivida)).amount || undefined
            }
            this.sessions.set(s.waId, s)
          }
        } catch { /* skip */ }
      }
    } catch { /* no storage yet */ }
    this.loaded = true
  }

  private async persist(session: WhatsAppSession): Promise<void> {
    const safe = session.waId.replace(/[^0-9]/g, '')
    const path = join(this.storageDir, `${safe}.json`)
    await fs.writeFile(path, JSON.stringify(session, null, 2), 'utf8')
  }

  async getSession(waId: string): Promise<WhatsAppSession | null> {
    await this.ensureLoaded()
    return this.sessions.get(waId) || null
  }

  async listSessions(): Promise<WhatsAppSession[]> {
    await this.ensureLoaded()
    return Array.from(this.sessions.values()).sort((a, b) => b.atualizadoEm - a.atualizadoEm)
  }

  async resetSession(waId: string): Promise<boolean> {
    await this.ensureLoaded()
    if (!this.sessions.has(waId)) return false
    this.sessions.delete(waId)
    try {
      const safe = waId.replace(/[^0-9]/g, '')
      await fs.unlink(join(this.storageDir, `${safe}.json`))
    } catch { /* ok */ }
    return true
  }

  private newSession(waId: string, nomeContato?: string): WhatsAppSession {
    const now = Date.now()
    return {
      waId,
      nomeContato,
      etapa: 'novo',
      lead: { nome: nomeContato },
      criadoEm: now,
      atualizadoEm: now,
      mensagens: [],
      escalouHumano: false,
      tagsDeEscalada: [],
    }
  }

  private nextMsgId(): string {
    return `wa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  }

  // ── Main entrypoint ─────────────────────────────────────

  async responder(input: ResponderInput): Promise<ResponderOutput> {
    await this.ensureLoaded()
    let session = this.sessions.get(input.waId)
    if (!session) {
      session = this.newSession(input.waId, input.nomeContato)
      this.sessions.set(input.waId, session)
    } else if (input.nomeContato && !session.nomeContato) {
      session.nomeContato = input.nomeContato
      if (!session.lead.nome) session.lead.nome = input.nomeContato
    }

    // Record user message
    const userMsg: WhatsAppMsg = {
      id: this.nextMsgId(),
      role: 'user',
      content: input.texto,
      timestamp: Date.now(),
      kind: input.kind || 'text',
      audioTranscricao: input.audioTranscricao,
    }
    session.mensagens.push(userMsg)

    // Track channel preference (audio in → audio out)
    const cameFromAudio = input.kind === 'audio'
    session.lead.canalPreferido = cameFromAudio ? 'audio' : 'texto'

    // Pre-check for escalation triggers in any message
    const urg = detectaUrgencia(input.texto)
    if (urg.nivel && urg.nivel !== 'baixa') {
      session.lead.urgencia = urg.nivel
      if (urg.motivo) session.lead.motivoUrgencia = urg.motivo
      if (urg.nivel === 'critica' && !session.tagsDeEscalada.includes(urg.motivo || 'critica')) {
        session.tagsDeEscalada.push(urg.motivo || 'critica')
      }
    }

    // Classify
    const intent = classify(input.texto, session.etapa)

    // Generate response
    const { reply, toolsUsed, escalated } = await this.compose(intent, input.texto, session)

    const replyMsg: WhatsAppMsg = {
      id: this.nextMsgId(),
      role: 'assistant',
      content: reply,
      timestamp: Date.now(),
      kind: cameFromAudio ? 'audio' : 'text',
      intent: intent.tipo,
      toolsUsed,
    }
    session.mensagens.push(replyMsg)
    session.atualizadoEm = Date.now()
    if (escalated) {
      session.escalouHumano = true
      session.ultimaInteracaoHumano = Date.now()
    }

    await this.persist(session)

    return {
      reply,
      sendAsAudio: cameFromAudio,
      session,
      escalated: escalated ?? false,
      intent: intent.tipo,
    }
  }

  // ── Response composer ───────────────────────────────────

  private async compose(
    intent: WaIntent,
    raw: string,
    session: WhatsAppSession,
  ): Promise<{ reply: string; toolsUsed?: string[]; escalated?: boolean }> {
    // 1. Emergency overrides everything
    if (intent.tipo === 'emergencia') {
      session.etapa = 'aguardando_humano'
      return {
        reply: this.respostaEmergencia(session),
        escalated: true,
        toolsUsed: ['escalada'],
      }
    }

    // 2. Explicit handoff request
    if (intent.tipo === 'falar_humano') {
      session.etapa = 'aguardando_humano'
      return {
        reply: this.respostaHandoff(session),
        escalated: true,
        toolsUsed: ['escalada'],
      }
    }

    // 3. Lead capture stage machine
    if (session.etapa === 'coletando_nome' && intent.tipo === 'apresenta_nome') {
      session.lead.nome = intent.nome
      session.etapa = 'coletando_cidade'
      return { reply: `Prazer, ${intent.nome.split(' ')[0]}. De qual cidade e estado você fala comigo? (ex: Toledo - PR)` }
    }
    if (session.etapa === 'coletando_cidade' && intent.tipo === 'apresenta_cidade') {
      session.lead.cidade = intent.cidade
      if (intent.uf) session.lead.uf = intent.uf
      session.etapa = 'coletando_credor'
      return { reply: `Anotado, ${intent.cidade}${intent.uf ? ' - ' + intent.uf : ''}. Agora me conta: com qual banco ou credor a dívida está hoje? (Banco do Brasil, Sicredi, Bradesco, ou outro)` }
    }
    if (session.etapa === 'coletando_credor' && intent.tipo === 'apresenta_credor') {
      session.lead.credor = intent.credor
      session.etapa = 'coletando_valor'
      return { reply: `Ok, ${intent.credor}. E qual o valor aproximado da dívida total? (pode ser uma estimativa - ex: 500 mil, 1.2 milhão)` }
    }
    if (session.etapa === 'coletando_valor' && intent.tipo === 'apresenta_valor') {
      session.lead.valorDivida = intent.valor
      const fmt = formatValorBRL(intent.valor)
      session.etapa = 'qualificado'
      // Auto-escalate if high value
      if ((moneyToCents(intent.valor) || 0n) >= 50000000n) {
        session.etapa = 'aguardando_humano'
        session.tagsDeEscalada.push('valor_alto')
        return {
          reply: `Entendi. Com ${fmt} em ${session.lead.credor}, o caso merece análise técnica detalhada. Vou avisar nosso consultor principal, ${HANDOFF_CONTATOS.consultorPrincipal}, que fala diretamente com você em breve. Enquanto isso: você já recebeu alguma notificação judicial ou extrajudicial sobre essa dívida?`,
          escalated: true,
          toolsUsed: ['qualificacao', 'escalada'],
        }
      }
      return {
        reply: `Perfeito. Com ${fmt}, consigo te passar um panorama inicial aqui mesmo. A ALETIS analisa os documentos da operação e as condições financeiras para avaliar alternativas de reestruturação. As normas aplicáveis precisam ser conferidas para o seu contrato.\n\nPosso te explicar as estratégias possíveis para o seu caso, ou você prefere já agendar uma conversa com nosso consultor?`,
        toolsUsed: ['qualificacao'],
      }
    }

    // 4. Initial greeting - start lead capture
    if (intent.tipo === 'saudacao') {
      if (session.etapa === 'novo') {
        session.etapa = 'coletando_nome'
        const nomeSugerido = session.nomeContato ? ` ${session.nomeContato.split(' ')[0]}` : ''
        return {
          reply: `${greeting()}${nomeSugerido}! Aqui é a Alix, assistente virtual da ALETIS — consultoria especializada em reestruturação de dívida rural.\n\nPra te ajudar melhor, como posso te chamar?`,
        }
      }
      return { reply: `${greeting()}${session.lead.nome ? ', ' + session.lead.nome.split(' ')[0] : ''}! Bom ter você de volta. Como posso ajudar hoje?` }
    }

    if (intent.tipo === 'despedida') {
      return { reply: 'Tchau! Quando precisar, é só mandar mensagem. ALETIS está aqui.' }
    }
    if (intent.tipo === 'agradecimento') {
      return { reply: 'Imagina, estou aqui pra isso. Alguma outra dúvida?' }
    }

    // 5. Business/market/legal questions — delegate to ALIX
    if (intent.tipo === 'duvida_mercado' || intent.tipo === 'duvida_juridica') {
      try {
        const alixKey = `wa_${session.waId.replace(/[^0-9]/g, '')}`
        // We use a parallel ALIX session keyed by phone so context builds up
        const alixResult = await this.alix.chat(alixKey, raw)
        const trimmed = resumoCurto(alixResult.reply.content, 1200)
        return {
          reply: trimmed + this.maybeCtaAfter(session),
          toolsUsed: ['alix', ...(alixResult.reply.toolsUsed || [])],
        }
      } catch (err) {
        return {
          reply: 'Não consegui consultar nossas fontes agora. Pode tentar de novo ou reformular? Se for urgente, digita "falar com consultor" que te encaminho para um humano.',
        }
      }
    }

    if (intent.tipo === 'duvida_negocio') {
      return { reply: this.respostaSobreALETIS(session) }
    }

    // 6. Stage-specific re-prompts (when user drifts from capture flow)
    if (session.etapa === 'coletando_nome') {
      return { reply: 'Pra continuar, preciso saber como te chamar. Qual é o seu nome?' }
    }
    if (session.etapa === 'coletando_cidade') {
      return { reply: 'Qual cidade e estado você está? (ex: Cascavel - PR)' }
    }
    if (session.etapa === 'coletando_credor') {
      return { reply: 'Com qual banco ou credor está a dívida? (Banco do Brasil, Sicredi, Bradesco, etc.)' }
    }
    if (session.etapa === 'coletando_valor') {
      return { reply: 'Qual o valor aproximado da dívida? Pode escrever como preferir (ex: 800 mil, 1.5 milhão).' }
    }

    // 7. Qualified — open-ended support
    if (session.etapa === 'qualificado' || session.etapa === 'novo') {
      // Try ALIX as a fallback for anything that sounds like a real question
      if (raw.trim().length >= 8 && /[?]|como|quando|quanto|qual|por que|porque|o que|quais/i.test(raw)) {
        try {
          const alixKey = `wa_${session.waId.replace(/[^0-9]/g, '')}`
          const alixResult = await this.alix.chat(alixKey, raw)
          const trimmed = resumoCurto(alixResult.reply.content, 1200)
          return { reply: trimmed + this.maybeCtaAfter(session), toolsUsed: ['alix'] }
        } catch { /* fall through */ }
      }
      if (session.etapa === 'novo') {
        session.etapa = 'coletando_nome'
        return { reply: `${greeting()}! Aqui é a Alix, da ALETIS. Antes de continuar, como posso te chamar?` }
      }
      return {
        reply: `Estou aqui${session.lead.nome ? ', ' + session.lead.nome.split(' ')[0] : ''}. Posso te ajudar com:\n\n- Estratégias pra renegociar sua dívida (${session.lead.credor || 'seu credor'})\n- Dúvidas sobre Plano Safra vigente, PRONAF, PRONAMP\n- Questões jurídicas (súmulas STJ, MCR, juros abusivos)\n- Dados de mercado (dólar, soja, selic, clima)\n\nO que você precisa agora?`,
      }
    }

    // 8. Already with human
    if (session.etapa === 'aguardando_humano') {
      return {
        reply: `Recebi sua mensagem e já está na fila pro ${HANDOFF_CONTATOS.consultorPrincipal}. Se for algo novo e urgente, me diz que eu sinalizo. Caso contrário, a resposta humana chega em breve.`,
      }
    }

    // Default fallback
    return { reply: 'Não entendi completamente. Pode reformular? Ou digita "ajuda" pra eu te mostrar o que posso fazer.' }
  }

  // ── Response templates ──────────────────────────────────

  private respostaSobreALETIS(session: WhatsAppSession): string {
    const nome = session.lead.nome ? session.lead.nome.split(' ')[0] : ''
    const cab = nome ? `${nome}, ` : ''
    return `${cab}a ALETIS é uma consultoria técnica especializada em reestruturação de dívida rural.

O que a gente faz:
- Análise jurídica e financeira do contrato de crédito rural
- Conferência dos encargos contratuais e dos fundamentos aplicáveis à operação
- Estratégias de alongamento, prorrogação e refinanciamento pelo Plano Safra (PRONAF, PRONAMP, empresarial)
- Uso do PROAGRO para frustração de safra elegível
- Organização das informações contábeis e da capacidade de pagamento
- Negociação direta com o banco com base técnica, não apenas comercial

As alternativas e os resultados dependem dos documentos, das condições da operação e da análise do caso. Posso começar organizando essas informações com você.

Quer que eu ${session.etapa === 'novo' ? 'comece uma análise do seu caso' : 'continue a análise do seu caso'}?`
  }

  private respostaEmergencia(session: WhatsAppSession): string {
    const nome = session.lead.nome ? ', ' + session.lead.nome.split(' ')[0] : ''
    const motivo = session.lead.motivoUrgencia ? ` (${session.lead.motivoUrgencia})` : ''
    return `Entendi${nome}. Situação de urgência judicial${motivo} precisa de atenção humana imediata.

Vou acionar nosso consultor principal, ${HANDOFF_CONTATOS.consultorPrincipal}, agora. Ele entra em contato com você o mais rápido possível.

Enquanto isso, me responde aqui mesmo:
1. Você recebeu algum documento oficial? (mandado, citação, intimação)
2. Qual a data que aparece no documento?
3. Qual o banco/credor envolvido?

Essas informações aceleram nossa resposta.`
  }

  private respostaHandoff(session: WhatsAppSession): string {
    const nome = session.lead.nome ? ', ' + session.lead.nome.split(' ')[0] : ''
    const resumo = this.resumirLead(session.lead)
    return `Claro${nome}. Vou encaminhar sua conversa para ${HANDOFF_CONTATOS.consultorPrincipal}.

${resumo}

Ele recebe a notificação e retorna por aqui mesmo ou pelo telefone. Se preferir, também pode contatar direto:
- E-mail: ${HANDOFF_CONTATOS.email}${HANDOFF_CONTATOS.telefone ? `\n- Telefone: ${HANDOFF_CONTATOS.telefone}` : ''}

Posso ajudar com mais alguma coisa enquanto isso?`
  }

  private resumirLead(lead: LeadInfo): string {
    const linhas: string[] = []
    if (lead.nome) linhas.push(`Nome: ${lead.nome}`)
    if (lead.cidade) linhas.push(`Local: ${lead.cidade}${lead.uf ? ' - ' + lead.uf : ''}`)
    if (lead.credor) linhas.push(`Credor: ${lead.credor}`)
    if (lead.valorDivida) {
      const fmt = formatValorBRL(lead.valorDivida)
      linhas.push(`Valor aprox.: ${fmt}`)
    }
    if (lead.urgencia && lead.urgencia !== 'baixa') linhas.push(`Urgência: ${lead.urgencia}${lead.motivoUrgencia ? ' - ' + lead.motivoUrgencia : ''}`)
    if (linhas.length === 0) return 'Contato novo, ainda sem ficha completa.'
    return 'Resumo do lead:\n' + linhas.map((l) => `- ${l}`).join('\n')
  }

  private maybeCtaAfter(session: WhatsAppSession): string {
    // After a market/legal answer, gently nudge lead capture if incomplete
    if (session.etapa === 'novo' || session.etapa === 'coletando_nome') {
      return '\n\nA propósito, se você quiser que eu analise seu caso específico, me conta rapidinho seu nome pra eu te acompanhar.'
    }
    if (!session.lead.valorDivida && (session.etapa === 'coletando_credor' || session.etapa === 'coletando_valor')) {
      return '\n\nSeguindo nossa conversa — me passa o valor aproximado da dívida que eu consigo ser mais específica pro seu caso.'
    }
    return ''
  }
}

// ── Singleton helper ─────────────────────────────────────────

let _instance: WhatsAppBrain | null = null

export function getWhatsAppBrain(alix: AlixService, storageDir: string): WhatsAppBrain {
  if (!_instance) _instance = new WhatsAppBrain(alix, storageDir)
  return _instance
}

/**
 * Acessa o brain só se já foi inicializado (rotas WhatsApp registradas).
 * Útil para watchers que querem inspecionar sessões sem forçar boot do
 * serviço quando a integração WhatsApp não está em uso.
 */
export function getWhatsAppBrainIfInitialized(): WhatsAppBrain | null {
  return _instance
}
