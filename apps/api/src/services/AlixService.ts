// ============================================================
// ALETIS — ALIX Service (AI brain)
// Intent classification + tool execution + persistent history
// Powered by DataSourceManager (live data) + @aletis/knowledge-base
// ============================================================

import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { DataSourceManager } from './DataSourceManager.js';
import {
  SUMULAS_STJ,
  MCR_SECOES,
  PLANO_SAFRA_2025_26,
  PRONAF_LINHAS,
  PRONAMP_LINHAS,
  EMPRESARIAL_LINHAS,
  PROAGRO_REGRAS_2025_26,
  PRECEDENTES,
  buscarConhecimento,
  buscarSumulaPorTema,
  buscarMCRPorTema,
  buscarLinhasPorPublico,
} from '@aletis/knowledge-base';

// ── Types ────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  sources?: string[];
  toolsUsed?: string[];
  intent?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
}

// ── Utility ──────────────────────────────────────────────────

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtNum = (v: number, digits = 2): string =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

const fmtPct = (v: number): string =>
  `${v >= 0 ? '+' : ''}${fmtNum(v, 2)}%`;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// ── Intent types ─────────────────────────────────────────────

type Intent =
  | { tipo: 'saudacao' }
  | { tipo: 'capacidade' }
  | { tipo: 'ajuda' }
  | { tipo: 'agradecimento' }
  | { tipo: 'fontes_status' }
  | { tipo: 'resumo_sessao' }
  // Market/economic
  | { tipo: 'cambio_atual'; moeda?: string }
  | { tipo: 'cambio_historico'; moeda: string; dias: number }
  | { tipo: 'selic' }
  | { tipo: 'ipca' }
  | { tipo: 'igpm' }
  | { tipo: 'cdi' }
  | { tipo: 'indicadores' }
  | { tipo: 'expectativas'; indicador?: string }
  | { tipo: 'commodity_preco'; produto: string }
  | { tipo: 'commodity_todos' }
  | { tipo: 'commodity_uf'; uf: string }
  | { tipo: 'combustivel' }
  | { tipo: 'icbr' }
  | { tipo: 'sicor' }
  | { tipo: 'incendios' }
  // CRM
  | { tipo: 'cliente_buscar'; termo: string }
  | { tipo: 'clientes_listar' }
  | { tipo: 'propostas_listar'; status?: string }
  | { tipo: 'propostas_inteligentes_listar' }
  // Climate
  | { tipo: 'clima_atual'; cidade?: string; uf?: string }
  | { tipo: 'clima_previsao'; cidade?: string; uf?: string }
  // Knowledge base
  | { tipo: 'sumula'; numero?: number; termo?: string }
  | { tipo: 'mcr'; secao?: string; termo?: string }
  | { tipo: 'plano_safra'; programa?: 'pronaf' | 'pronamp' | 'empresarial' }
  | { tipo: 'proagro' }
  | { tipo: 'precedentes'; termo?: string }
  | { tipo: 'busca_geral'; termo: string }
  // Novos: brief de mercado, sazonalidade e contratos
  | { tipo: 'market_brief' }
  | { tipo: 'sazonalidade'; commodity: string }
  | { tipo: 'contratos_tipos' }
  | { tipo: 'contrato_orientacao'; tipoContrato: string }
  | { tipo: 'generico' };

// ── Intent classifier ────────────────────────────────────────

function classify(input: string): Intent {
  const q = normalize(input);

  // Greetings
  if (/^(oi|ola|e ai|bom dia|boa tarde|boa noite|hey|salve)\b/.test(q)) return { tipo: 'saudacao' };
  if (/^(obrigado|obrigada|valeu|tmj|thanks|thank you)/.test(q)) return { tipo: 'agradecimento' };

  // Meta
  if (/(o que voce|o que tu|quem e voce|que voce pode|sua capacidade|o que faz)/.test(q)) return { tipo: 'capacidade' };
  if (/\b(ajuda|help|comandos|o que posso perguntar|como funciona)\b/.test(q)) return { tipo: 'ajuda' };
  if (/(fontes|status.*fonte|apis.*funcionando|quais fontes|dados.*on-?line)/.test(q)) return { tipo: 'fontes_status' };
  if (/(resumir.*conversa|resume.*sessao|o que conversamos|sumarize)/.test(q)) return { tipo: 'resumo_sessao' };

  // Brief / panorama do mercado
  if (/(panorama|brief|resumo).*(mercado|hoje|dia|dia de hoje)|^(?:como (?:esta|está)|como anda).*mercado|mercado.*hoje|resumo do dia/.test(q)) {
    return { tipo: 'market_brief' };
  }

  // Sazonalidade (quando vender / quando segurar)
  const sazMatch = q.match(/(sazonalidade|padrao sazonal|quando vender|melhor mes|melhor (?:momento|mes) (?:de |para )?vender|epoca de vender).*(soja|milho|boi|cafe|arabica|algodao|trigo)|(soja|milho|boi|cafe|arabica|algodao|trigo).*(sazonalidade|quando vender|melhor mes|melhor (?:momento|mes) (?:de |para )?vender)/);
  if (sazMatch) {
    const commodity = (sazMatch[2] || sazMatch[3] || '').toLowerCase().replace('arabica', 'cafe');
    return { tipo: 'sazonalidade', commodity };
  }

  // Tipos de contrato disponíveis
  if (/(quais contratos|tipos de contrato|quais tipos.*contrato|contratos disponiveis|o que (?:voce )?gera.*contrato)/.test(q)) {
    return { tipo: 'contratos_tipos' };
  }

  // Orientação para gerar contrato específico
  const contratoOrientMatch = q.match(/(gerar|criar|fazer|preparar|montar|emitir).*(cpr|cedula.*produto.*rural|confissao.*divida|termo.*renegociacao|acordo.*extrajudicial|transacao.*excepcional|desenrola rural)/);
  if (contratoOrientMatch) {
    let tipoContrato = 'cpr_financeira';
    const s = q;
    if (/cpr.*fisic|cedula.*fisic/.test(s)) tipoContrato = 'cpr_fisica';
    else if (/cpr/.test(s)) tipoContrato = 'cpr_financeira';
    else if (/confissao/.test(s)) tipoContrato = 'confissao_divida';
    else if (/renegoci|termo de renegoci/.test(s)) tipoContrato = 'termo_renegociacao';
    else if (/acordo.*extrajudicial/.test(s)) tipoContrato = 'acordo_extrajudicial';
    else if (/transacao.*excepcional|desenrola rural/.test(s)) tipoContrato = 'transacao_excepcional';
    return { tipo: 'contrato_orientacao', tipoContrato };
  }

  // Fires
  if (/(incendio|queimada|foco de calor|nasa firms)/.test(q)) return { tipo: 'incendios' };

  // Fuels
  if (/(diesel|gasolina|combustivel|anp)/.test(q)) return { tipo: 'combustivel' };

  // ICBR
  if (/\bicbr\b|indice commodities brasil/.test(q)) return { tipo: 'icbr' };

  // SICOR
  if (/\bsicor\b|credito rural.*agregado|volume.*financiamento/.test(q)) return { tipo: 'sicor' };

  // Selic/IPCA/IGPM/CDI
  if (/\bselic\b|taxa basica/.test(q)) return { tipo: 'selic' };
  if (/\bipca\b|inflacao.*oficial/.test(q)) return { tipo: 'ipca' };
  if (/\bigp.?m\b|indice geral de precos/.test(q)) return { tipo: 'igpm' };
  if (/\bcdi\b|interbancario/.test(q)) return { tipo: 'cdi' };
  if (/(focus|expectativas|projecao.*(selic|ipca|pib|cambio))/.test(q)) {
    let indicador: string | undefined;
    if (/selic/.test(q)) indicador = 'Selic';
    else if (/ipca/.test(q)) indicador = 'IPCA';
    else if (/pib/.test(q)) indicador = 'PIB Total';
    else if (/cambio|dolar/.test(q)) indicador = 'Câmbio';
    return { tipo: 'expectativas', indicador };
  }
  if (/(indicadores|todos.*indicador|macroeconomic)/.test(q)) return { tipo: 'indicadores' };

  // Cambio
  const cambioMatch = q.match(/(historico|evolucao|ultimos? \d+ dias?).*(usd|dolar|eur|euro|cny|yuan|gbp|libra)/);
  if (cambioMatch) {
    const moedaStr = cambioMatch[2];
    const moeda = moedaStr.includes('usd') || moedaStr.includes('dolar') ? 'USD-BRL'
      : moedaStr.includes('eur') ? 'EUR-BRL'
      : moedaStr.includes('cny') || moedaStr.includes('yuan') ? 'CNY-BRL'
      : 'GBP-BRL';
    const diasMatch = q.match(/(\d+)\s*dias?/);
    const dias = diasMatch ? Math.min(Math.max(parseInt(diasMatch[1], 10), 7), 90) : 30;
    return { tipo: 'cambio_historico', moeda, dias };
  }
  if (/(cambio|dolar|dólar|euro|usd|eur|cny|yuan|gbp|libra|cotacao.*moeda)/.test(q)) {
    let moeda: string | undefined;
    if (/usd|dolar|dólar/.test(q)) moeda = 'USD-BRL';
    else if (/eur|euro/.test(q)) moeda = 'EUR-BRL';
    else if (/cny|yuan/.test(q)) moeda = 'CNY-BRL';
    else if (/gbp|libra/.test(q)) moeda = 'GBP-BRL';
    return { tipo: 'cambio_atual', moeda };
  }

  // Commodities - specific product
  const produtos = ['soja', 'milho', 'boi', 'cafe', 'arabica', 'algodao', 'trigo', 'arroz', 'feijao'];
  for (const p of produtos) {
    if (new RegExp(`\\b${p}\\b`).test(q) && /(preco|cotacao|valor|quanto|quanto esta|hoje)/.test(q)) {
      const prodKey = p === 'cafe' || p === 'arabica' ? 'cafe_arabica' : p;
      return { tipo: 'commodity_preco', produto: prodKey };
    }
  }
  // Commodity by UF
  const ufMatch = q.match(/(commodit|preco|cotacao).*(em|no|na)\s*(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\b/);
  if (ufMatch) return { tipo: 'commodity_uf', uf: ufMatch[3].toUpperCase() };

  if (/(commodit|cotacoes.*(hoje|agro)|precos.*agro|mercado.*agricola)/.test(q)) return { tipo: 'commodity_todos' };

  // Clients
  const clienteMatch = q.match(/(?:cliente |do |da |proposta do |proposta da |status do |status da |quem e )([a-z\u00c0-\u00ff][a-z\u00c0-\u00ff \-]{2,40})/i);
  if (clienteMatch && !/^(que|qual|como|quando|preco|precos|hoje|ontem|amanha)/.test(clienteMatch[1].trim())) {
    return { tipo: 'cliente_buscar', termo: clienteMatch[1].trim() };
  }
  if (/(listar.*clientes|todos.*clientes|quantos clientes|crm completo)/.test(q)) return { tipo: 'clientes_listar' };

  // Propostas
  if (/propost/.test(q)) {
    if (/intelig/.test(q)) return { tipo: 'propostas_inteligentes_listar' };
    let status: string | undefined;
    if (/enviad/.test(q)) status = 'enviada';
    else if (/aprovad/.test(q)) status = 'aprovada';
    else if (/rascunh/.test(q)) status = 'rascunho';
    else if (/rejeitad|negad/.test(q)) status = 'rejeitada';
    return { tipo: 'propostas_listar', status };
  }

  // Clima
  const climaMatch = q.match(/(?:clima|tempo|temperatura|chuva|previsao|previs[ãa]o).*?(?:em |no |na |de |para )([a-z\u00c0-\u00ff][a-z\u00c0-\u00ff \-]{2,40})/i);
  if (climaMatch) {
    const cidade = climaMatch[1].replace(/\s+(proximos?|proximos? dias?|semana)/i, '').trim();
    const isPrevisao = /previsao|proximos? dias|semana/.test(q);
    return isPrevisao ? { tipo: 'clima_previsao', cidade } : { tipo: 'clima_atual', cidade };
  }
  if (/(clima|tempo|chuva|previsao)/.test(q)) {
    return { tipo: /previsao|proximos? dias|semana/.test(q) ? 'clima_previsao' : 'clima_atual' };
  }

  // Knowledge base: Sumulas
  if (/sumul|súmul/.test(q)) {
    const numMatch = q.match(/sumul[a]?\s*(\d+)|stj\s*(\d+)/);
    const numero = numMatch ? parseInt(numMatch[1] || numMatch[2], 10) : undefined;
    const termo = q.replace(/sumul[a]?\s*\d+|sumul[a]?|stj|numero|n[úu]mero/g, '').trim();
    return { tipo: 'sumula', numero, termo: termo || undefined };
  }

  // MCR
  if (/\bmcr\b|manual.*credito|equaliz|subven/.test(q)) {
    const secaoMatch = q.match(/(?:mcr\s*|secao\s*)([0-9-]+)/);
    return { tipo: 'mcr', secao: secaoMatch?.[1], termo: q };
  }

  // Plano Safra
  if (/plano safra|pronaf|pronamp|empresarial.*(rural|credito)|linha.*credito/.test(q)) {
    let programa: 'pronaf' | 'pronamp' | 'empresarial' | undefined;
    if (/pronaf/.test(q)) programa = 'pronaf';
    else if (/pronamp/.test(q)) programa = 'pronamp';
    else if (/empresarial|medio|grande.*produtor/.test(q)) programa = 'empresarial';
    return { tipo: 'plano_safra', programa };
  }

  // Proagro
  if (/proagro|seguro rural|frustra.*safra|cobertura.*safra/.test(q)) return { tipo: 'proagro' };

  // Precedentes
  if (/(precedentes?|jurispruden|decisao.*stj|acordao|repetitiv)/.test(q)) {
    const termo = q.replace(/(precedentes?|jurispruden|decisao.*stj|acordao|repetitiv)/g, '').trim();
    return { tipo: 'precedentes', termo: termo || undefined };
  }

  // General knowledge search: user mentions words that match knowledge
  if (q.length >= 6) {
    const hits = buscarConhecimento(q);
    if (hits.totalMatches >= 2) return { tipo: 'busca_geral', termo: q };
  }

  return { tipo: 'generico' };
}

// ── Title generator (first user message → session title) ─────

function generateTitle(firstMessage: string): string {
  const clean = firstMessage.replace(/\s+/g, ' ').trim();
  return clean.length <= 60 ? clean : clean.slice(0, 57) + '...';
}

// ── Service ──────────────────────────────────────────────────

export class AlixService {
  private dsm: DataSourceManager;
  private storageDir: string;
  private sessions = new Map<string, ChatSession>();
  private loaded = false;

  constructor(dsm: DataSourceManager, storageDir: string) {
    this.dsm = dsm;
    this.storageDir = storageDir;
  }

  // ── Session lifecycle ───────────────────────────────────

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      const files = await fs.readdir(this.storageDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(join(this.storageDir, file), 'utf8');
          const session = JSON.parse(raw) as ChatSession;
          if (session?.id) this.sessions.set(session.id, session);
        } catch { /* skip corrupt file */ }
      }
    } catch { /* nothing stored yet */ }
    this.loaded = true;
  }

  private async persist(session: ChatSession): Promise<void> {
    const path = join(this.storageDir, `${session.id}.json`);
    await fs.writeFile(path, JSON.stringify(session, null, 2), 'utf8');
  }

  async listSessions(): Promise<SessionSummary[]> {
    await this.ensureLoaded();
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(s => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.messages.length,
        lastMessage: s.messages.length > 0 ? s.messages[s.messages.length - 1].content.slice(0, 140) : undefined,
      }));
  }

  async getSession(id: string): Promise<ChatSession | null> {
    await this.ensureLoaded();
    return this.sessions.get(id) || null;
  }

  async createSession(title?: string): Promise<ChatSession> {
    await this.ensureLoaded();
    const now = Date.now();
    const session: ChatSession = {
      id: `alix_${randomUUID().slice(0, 8)}_${now.toString(36)}`,
      title: title || 'Nova conversa',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.sessions.set(session.id, session);
    await this.persist(session);
    return session;
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.ensureLoaded();
    if (!this.sessions.has(id)) return false;
    this.sessions.delete(id);
    try {
      await fs.unlink(join(this.storageDir, `${id}.json`));
    } catch { /* file may not exist */ }
    return true;
  }

  // ── Main chat entry point ───────────────────────────────

  async chat(sessionId: string | undefined, userMessage: string): Promise<{ session: ChatSession; reply: ChatMessage }> {
    await this.ensureLoaded();
    let session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session) {
      session = await this.createSession(generateTitle(userMessage));
    }

    const now = Date.now();
    const userMsg: ChatMessage = {
      id: `msg_${randomUUID().slice(0, 6)}_${now.toString(36)}`,
      role: 'user',
      content: userMessage,
      timestamp: now,
    };
    session.messages.push(userMsg);

    const intent = classify(userMessage);
    const response = await this.respond(intent, userMessage, session);

    const replyMsg: ChatMessage = {
      id: `msg_${randomUUID().slice(0, 6)}_${Date.now().toString(36)}`,
      role: 'assistant',
      content: response.content,
      timestamp: Date.now(),
      sources: response.sources,
      toolsUsed: response.toolsUsed,
      intent: intent.tipo,
      metadata: response.metadata,
    };
    session.messages.push(replyMsg);
    session.updatedAt = Date.now();
    if (session.title === 'Nova conversa' && session.messages.length <= 2) {
      session.title = generateTitle(userMessage);
    }
    await this.persist(session);

    return { session, reply: replyMsg };
  }

  // ── Response composer (dispatches per intent) ──────────

  private async respond(
    intent: Intent,
    raw: string,
    session: ChatSession,
  ): Promise<{ content: string; sources?: string[]; toolsUsed?: string[]; metadata?: Record<string, unknown> }> {
    switch (intent.tipo) {
      case 'saudacao':
        return {
          content: `${greeting()}, Christian. ALIX aqui — pronta pra operar. Eu tenho acesso ao câmbio em tempo real (BCB PTAX + Frankfurter), Selic/IPCA/IGPM/CDI, cotações de commodities (Conab), clima BR inteiro, CRM da ALETIS, ${Object.keys(SUMULAS_STJ).length} súmulas do STJ, ${Object.keys(MCR_SECOES).length} seções do MCR, Plano Safra 2025/26 e ${PRECEDENTES.length} precedentes. Pergunta o que precisar.`,
          sources: [],
        };

      case 'capacidade':
        return {
          content: this.renderCapacidade(),
          sources: [],
        };

      case 'ajuda':
        return { content: this.renderAjuda(), sources: [] };

      case 'agradecimento':
        return { content: 'Disponha. Próxima pergunta?', sources: [] };

      case 'fontes_status':
        return this.reportFontes();

      case 'resumo_sessao':
        return { content: this.resumirSessao(session), sources: [] };

      case 'cambio_atual':
        return this.cambioAtual(intent.moeda);

      case 'cambio_historico':
        return this.cambioHistorico(intent.moeda, intent.dias);

      case 'selic': return this.indicador('Selic', 'selic');
      case 'ipca': return this.indicador('IPCA', 'ipca');
      case 'igpm': return this.indicador('IGP-M', 'igpm');
      case 'cdi': return this.indicador('CDI', 'cdi');
      case 'indicadores': return this.todosIndicadores();

      case 'expectativas': return this.expectativas(intent.indicador);
      case 'icbr': return this.icbr();
      case 'sicor': return this.sicorAgregado();
      case 'incendios': return this.incendios();
      case 'combustivel': return this.combustivel();

      case 'commodity_preco': return this.commodityPreco(intent.produto);
      case 'commodity_todos': return this.commodityTodos();
      case 'commodity_uf': return this.commodityPorUF(intent.uf);

      case 'cliente_buscar': return this.clienteBuscar(intent.termo);
      case 'clientes_listar': return this.clientesListar();
      case 'propostas_listar': return this.propostasListar(intent.status);
      case 'propostas_inteligentes_listar': return this.propostasInteligentesListar();

      case 'clima_atual': return this.climaAtual(intent.cidade);
      case 'clima_previsao': return this.climaPrevisao(intent.cidade);

      case 'sumula': return this.sumula(intent.numero, intent.termo);
      case 'mcr': return this.mcr(intent.secao, intent.termo);
      case 'plano_safra': return this.planoSafra(intent.programa);
      case 'proagro': return this.proagro();
      case 'precedentes': return this.precedentes(intent.termo);
      case 'busca_geral': return this.buscaGeral(intent.termo);

      case 'market_brief': return this.marketBrief();
      case 'sazonalidade': return this.sazonalidade(intent.commodity);
      case 'contratos_tipos': return this.contratosTipos();
      case 'contrato_orientacao': return this.contratoOrientacao(intent.tipoContrato);

      case 'generico':
      default:
        return this.generico(raw);
    }
  }

  // ── Response renderers ─────────────────────────────────

  private renderCapacidade(): string {
    return `Sou a **ALIX** — Agente de Leitura e Inteligência Estratégica da ALETIS. Tenho conexão direta a:

**Mercado financeiro** (live)
• Câmbio USD/EUR/CNY/GBP — BCB PTAX + Frankfurter (ECB) + open.er-api (cascade)
• Indicadores BCB: Selic, IPCA, IGP-M, CDI, crédito rural
• Relatório Focus: expectativas (Selic, IPCA, PIB, câmbio)
• ICBR (Índice Commodities Brasil)

**Mercado agro** (live)
• Preços Conab semanais: soja, milho, café, algodão, trigo, arroz, feijão (por UF)
• Preços ANP: diesel, etanol
• Focos de incêndio (NASA FIRMS)
• SICOR: agregado de crédito rural (contratos, volumes, UFs)

**Clima**
• Condição atual e previsão 7 dias de qualquer município BR (OpenMeteo + INMET + IBGE)

**CRM da ALETIS**
• Clientes (buscar por nome, CPF, cidade)
• Propostas (todos os status, incluindo as 15-seções inteligentes)

**Base de conhecimento** (consulta direta)
• ${Object.keys(SUMULAS_STJ).length} Súmulas STJ (93, 294, 296, 297, 298, 322, 323, 380, 472, 596...)
• ${Object.keys(MCR_SECOES).length} Seções do MCR (2-1, 2-6-4, 2-8, 3-2, 6-2, 7-1, 7-4, 8, 16-Proagro)
• Plano Safra 2025/26 — Pronaf, Pronamp, Empresarial
• Proagro 2025/26 — regras e culturas cobertas
• ${PRECEDENTES.length} precedentes do STJ
• Resolução 4.966/21 (provisões ECL)

Pergunta em linguagem natural que eu busco, consulto e cito fonte.`;
  }

  private renderAjuda(): string {
    return `Exemplos de perguntas que eu entendo:

**Mercado**
• "Qual o dólar hoje?" / "Histórico USD 30 dias"
• "Quanto está a soja?" / "Preço do milho em MT"
• "Selic atual" / "IPCA mensal" / "Focus IPCA"

**Agro/clima**
• "Clima em Uberlândia" / "Previsão em Cascavel próximos dias"
• "Focos de incêndio" / "Diesel hoje"

**CRM**
• "Cliente Paulo Luciano" / "Listar propostas aprovadas"
• "Propostas inteligentes"

**Jurídico**
• "Súmula 298" / "Súmulas sobre juros capitalizados"
• "MCR 2-6-4" / "Plano Safra Pronaf"
• "Proagro" / "Precedentes sobre alongamento"

**Meta**
• "Status das fontes" / "Resumir conversa"

Posso responder tudo em segundos. Manda.`;
  }

  private async reportFontes(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    const fontes = this.dsm.getSourceStatus();
    const online = fontes.filter(f => f.status === 'online').length;
    const total = fontes.length;
    const offline = fontes.filter(f => f.status === 'offline');
    const degraded = fontes.filter(f => f.status === 'degraded');
    let content = `**Status das fontes de dados:** ${online}/${total} online\n\n`;
    if (degraded.length > 0) {
      content += `**Degradadas (${degraded.length}):**\n`;
      content += degraded.slice(0, 5).map(f => `• ${f.nome} — ${f.ultimoErro || 'sem detalhes'}`).join('\n') + '\n\n';
    }
    if (offline.length > 0) {
      content += `**Offline (${offline.length}):**\n`;
      content += offline.slice(0, 5).map(f => `• ${f.nome} — ${f.ultimoErro || 'sem detalhes'}`).join('\n') + '\n\n';
    }
    content += `Todas as rotas mantêm fallback — o sistema não quebra.`;
    return { content, sources: ['DataSourceManager.getStatusTodasFontes()'], toolsUsed: ['fontes_status'] };
  }

  private resumirSessao(session: ChatSession): string {
    if (session.messages.length === 0) return 'Conversa vazia.';
    const userMsgs = session.messages.filter(m => m.role === 'user');
    const intents = session.messages.filter(m => m.role === 'assistant' && m.intent).map(m => m.intent);
    const uniqueIntents = Array.from(new Set(intents));
    return `Sessão "${session.title}" — ${session.messages.length} mensagens, ${userMsgs.length} perguntas tuas.\n\nTópicos cobertos: ${uniqueIntents.join(', ') || 'variado'}.\n\nPrimeira pergunta: "${userMsgs[0]?.content.slice(0, 100) || '—'}".`;
  }

  // ── Market handlers ────────────────────────────────────

  private async cambioAtual(moeda?: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const cotacoes = await this.dsm.awesomeApi.getCotacoesAtuais();
      if (!cotacoes || cotacoes.length === 0) throw new Error('sem cotações');
      const lista = moeda ? cotacoes.filter(c => c.moeda === moeda) : cotacoes;
      if (moeda && lista.length === 0) {
        return { content: `Não achei ${moeda}. Disponíveis: ${cotacoes.map(c => c.moeda).join(', ')}.`, sources: [], toolsUsed: [] };
      }
      const linhas = lista.map(c => {
        const setaVar = c.pctChange > 0 ? '+' : (c.pctChange < 0 ? '' : '=');
        return `• **${c.moeda}** — ${fmtBRL(c.bid)} (${setaVar}${fmtPct(c.pctChange)}) — ${c.provedor || 'fonte desconhecida'}`;
      }).join('\n');
      const dataRef = lista[0]?.createDate || 'agora';
      return {
        content: `${linhas}\n\n_Dados de ${dataRef}._`,
        sources: Array.from(new Set(lista.map(c => c.provedor || 'AwesomeAPI'))),
        toolsUsed: ['awesome.getCotacoesAtuais'],
      };
    } catch (err) {
      return { content: `Câmbio indisponível agora (${(err as Error).message}). Tenta de novo em segundos.`, sources: [], toolsUsed: [] };
    }
  }

  private async cambioHistorico(moeda: string, dias: number): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const hist = await this.dsm.awesomeApi.getHistoricoDiario(moeda, dias);
      if (!hist.cotacoes?.length) throw new Error('sem histórico');
      const primeira = hist.cotacoes[0];
      const ultima = hist.cotacoes[hist.cotacoes.length - 1];
      const var30d = ((ultima.valor - primeira.valor) / primeira.valor) * 100;
      const min = Math.min(...hist.cotacoes.map(c => c.valor));
      const max = Math.max(...hist.cotacoes.map(c => c.valor));
      return {
        content: `**${moeda}** — últimos ${hist.cotacoes.length} dias (${hist.provedor}):\n\n• Atual: ${fmtBRL(ultima.valor)}\n• ${dias} dias atrás: ${fmtBRL(primeira.valor)}\n• Variação: ${fmtPct(var30d)}\n• Máxima: ${fmtBRL(max)}\n• Mínima: ${fmtBRL(min)}\n\n_Fonte: ${hist.provedor}_`,
        sources: [hist.provedor || 'unknown'],
        toolsUsed: ['awesome.getHistoricoDiario'],
      };
    } catch (err) {
      return { content: `Histórico de ${moeda} indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async indicador(nome: string, serieKey: 'selic' | 'ipca' | 'igpm' | 'cdi'): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const all = await this.dsm.bancoCentral.getAllIndicators();
      const ind = (all as any)[serieKey];
      if (!ind) throw new Error(`indicador ${nome} não encontrado`);
      return {
        content: `**${ind.nome}**: **${fmtNum(ind.valor, 2)} ${ind.unidade}**\n\n• Referência: ${ind.data}\n• Fonte: BCB SGS (série ${ind.serie})${ind.fonte === 'fallback' ? ' — _dado em fallback_' : ''}`,
        sources: [`BCB SGS (série ${ind.serie})`],
        toolsUsed: ['bancoCentral.getAllIndicators'],
      };
    } catch (err) {
      return { content: `${nome} indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async todosIndicadores(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const all = await this.dsm.bancoCentral.getAllIndicators();
      const linhas: string[] = [
        `• **${all.selic.nome}**: ${fmtNum(all.selic.valor, 2)} ${all.selic.unidade}`,
        `• **${all.ipca.nome}**: ${fmtNum(all.ipca.valor, 2)} ${all.ipca.unidade}`,
        `• **${all.igpm.nome}**: ${fmtNum(all.igpm.valor, 2)} ${all.igpm.unidade}`,
        `• **${all.cdi.nome}**: ${fmtNum(all.cdi.valor, 2)} ${all.cdi.unidade}`,
        `• **Dólar PTAX**: ${fmtBRL(all.ptax.cotacaoVenda)} (${all.ptax.dataHoraCotacao?.slice(0, 10) || '—'})`,
        `• **Crédito Rural (${all.creditoRural.periodo})**: ${all.creditoRural.unidade} ${fmtNum(all.creditoRural.volume, 0)}`,
      ];
      return { content: `**Indicadores macroeconômicos (BCB):**\n\n${linhas.join('\n')}`, sources: ['BCB SGS'], toolsUsed: ['bancoCentral.getAllIndicators'] };
    } catch (err) {
      return { content: `Indicadores indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async expectativas(indicador?: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      if (indicador) {
        const exp = await this.dsm.expectativas.getExpectativasAnuais(indicador, 5);
        if (!exp || !exp.expectativas || exp.expectativas.length === 0) return { content: `Focus: sem projeção para ${indicador}.`, sources: [], toolsUsed: [] };
        const linhas = exp.expectativas.slice(0, 4).map((p: any) => `• **${p.dataReferencia}**: mediana ${fmtNum(p.mediana, 2)} (mín ${fmtNum(p.minimo, 2)} / máx ${fmtNum(p.maximo, 2)})`).join('\n');
        return { content: `**Focus — ${indicador}:**\n\n${linhas}`, sources: ['BCB Expectativas (Focus)'], toolsUsed: ['expectativas.getExpectativasAnuais'] };
      }
      const all = await this.dsm.expectativas.getAllExpectativas();
      const linhas = Object.entries(all).map(([k, v]: [string, any]) => {
        const next = v.expectativas?.[0];
        return next ? `• **${k}**: mediana ${fmtNum(next.mediana, 2)} (${next.dataReferencia})` : `• **${k}**: sem dado`;
      }).join('\n');
      return { content: `**Relatório Focus (BCB):**\n\n${linhas}`, sources: ['BCB Expectativas (Focus)'], toolsUsed: ['expectativas.getAllExpectativas'] };
    } catch (err) {
      return { content: `Focus indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async icbr(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const icbr = await this.dsm.bancoCentral.fetchICBrCompleto();
      const refStr = (icbr as any).data || (icbr as any).referencia || 'recente';
      return {
        content: `**ICBR (Índice Commodities Brasil):**\n\n• Agro: ${fmtNum(icbr.agro?.valor ?? 0, 2)}\n• Metal: ${fmtNum(icbr.metal?.valor ?? 0, 2)}\n• Energia: ${fmtNum(icbr.energia?.valor ?? 0, 2)}\n• Referência: ${refStr}`,
        sources: ['BCB SGS (séries ICBR)'],
        toolsUsed: ['bancoCentral.fetchICBrCompleto'],
      };
    } catch (err) {
      return { content: `ICBR indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async sicorAgregado(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const agg = await this.dsm.sicor.getAgregado(12);
      const topProd = agg.topProdutos.slice(0, 3).map(p => `${p.produto} (${p.participacao}%)`).join(', ');
      const topUFs = agg.topUFs.slice(0, 3).map(u => `${u.uf} ${fmtBRL(u.valor / 1e9)}Bi`).join(', ');
      return {
        content: `**SICOR — crédito rural ${agg.periodo}:**\n\n• Total: ${fmtBRL(agg.valorTotal / 1e9)} Bi em ${agg.totalContratos.toLocaleString('pt-BR')} contratos\n• Valor médio: ${fmtBRL(agg.valorMedio)}\n• Área: ${(agg.areaTotal / 1e6).toFixed(1)} Mi ha\n• Top produtos: ${topProd}\n• Top UFs: ${topUFs}`,
        sources: ['BCB SICOR (fallback: direcional CY 2025)'],
        toolsUsed: ['sicor.getAgregado'],
      };
    } catch (err) {
      return { content: `SICOR indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async incendios(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const focos = await this.dsm.nasaFirms.getIncendiosBrasil();
      const topEstados = Object.entries(focos.porEstado || {})
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3)
        .map(([uf, qtd]) => `${uf} (${qtd})`).join(', ');
      return {
        content: `**Focos de incêndio (NASA FIRMS — últimas 24h):**\n\n• Total: ${focos.totalFocos}\n• Últimas 24h: ${focos.focosUltimas24h}\n• Top estados: ${topEstados || 'n/d'}\n• Atualizado: ${focos.atualizadoEm}`,
        sources: ['NASA FIRMS VIIRS'],
        toolsUsed: ['nasaFirms.getIncendiosBrasil'],
      };
    } catch (err) {
      return { content: `NASA FIRMS indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async combustivel(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const resumo = await this.dsm.anp.getDieselNacional();
      const diesel = resumo.diesel;
      return {
        content: `**Diesel (ANP — última coleta):**\n\n• Preço médio Brasil: ${fmtBRL(diesel.precoMedio)}\n• Mínimo: ${fmtBRL(diesel.precoMinimo)}\n• Máximo: ${fmtBRL(diesel.precoMaximo)}\n• Referência: ${diesel.dataReferencia || resumo.atualizadoEm?.slice(0, 10) || '—'}`,
        sources: ['ANP'],
        toolsUsed: ['anp.getDieselNacional'],
      };
    } catch (err) {
      return { content: `ANP indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async commodityPreco(produto: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const preco = await this.dsm.conabPrecos.getPreco(produto);
      const topEstados = preco.estados.sort((a, b) => b.preco - a.preco).slice(0, 5);
      return {
        content: `**${preco.produto}** — ${preco.semana}\n\n• Preço médio: ${fmtBRL(preco.precoMedio)} (${preco.unidade})\n• Mínimo: ${fmtBRL(preco.precoMinimo)}  •  Máximo: ${fmtBRL(preco.precoMaximo)}\n• Top 5 UFs: ${topEstados.map(e => `${e.uf} ${fmtBRL(e.preco)}`).join(', ')}\n\n_Fonte: CONAB Portal de Informações (${preco.fonte})_`,
        sources: ['CONAB PrecosSemanalUF'],
        toolsUsed: ['conabPrecos.getPreco'],
      };
    } catch (err) {
      return { content: `Preço de ${produto} indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async commodityTodos(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const all = await this.dsm.conabPrecos.getAllPrecos();
      const produtos = ['soja', 'milho', 'cafe_arabica', 'algodao', 'trigo', 'arroz', 'feijao'] as const;
      const linhas = produtos.map(p => {
        const d = all[p] as any;
        return `• **${d.produto}**: ${fmtBRL(d.precoMedio)} (${d.unidade})`;
      }).join('\n');
      return { content: `**Cotações Conab (semana corrente):**\n\n${linhas}`, sources: ['CONAB'], toolsUsed: ['conabPrecos.getAllPrecos'] };
    } catch (err) {
      return { content: `Conab indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async commodityPorUF(uf: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const precos = await this.dsm.conabPrecos.getPrecosPorUF(uf);
      const entries = Object.values(precos);
      if (entries.length === 0) return { content: `Nenhum preço em ${uf}.`, sources: [], toolsUsed: [] };
      const linhas = entries.slice(0, 10).map(e => `• **${e.produto}**: ${fmtBRL(e.preco)} ${e.unidade}`).join('\n');
      return { content: `**Preços em ${uf}:**\n\n${linhas}`, sources: ['CONAB'], toolsUsed: ['conabPrecos.getPrecosPorUF'] };
    } catch (err) {
      return { content: `Erro: ${(err as Error).message}`, sources: [], toolsUsed: [] };
    }
  }

  // ── CRM handlers ───────────────────────────────────────

  private async clienteBuscar(termo: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const list = getClientesStore();
      const t = termo.toLowerCase();
      const match = list.find(c =>
        c.nome?.toLowerCase().includes(t) ||
        c.cpf?.replace(/\D/g, '').includes(t.replace(/\D/g, '')) ||
        c.cidade?.toLowerCase().includes(t)
      );
      if (!match) return { content: `Não achei "${termo}" no CRM (${list.length} clientes cadastrados).`, sources: ['CRM'], toolsUsed: [] };
      const linhas: string[] = [
        `**${match.nome}**`,
        `• CPF: ${match.cpf || 's/ info'}`,
        `• Cidade: ${match.cidade || 's/ info'}${match.uf ? `/${match.uf}` : ''}`,
        `• Cooperativa: ${match.cooperativa || 'independente'}`,
        `• Status: ${match.statusRelacionamento || 'ativo'}`,
      ];
      if (match.dividaAtual) linhas.push(`• Dívida atual: ${fmtBRL(match.dividaAtual)}`);
      return { content: linhas.join('\n'), sources: ['CRM /api/clientes'], toolsUsed: ['crm.buscar'] };
    } catch (err) {
      return { content: `CRM indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async clientesListar(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    const list = getClientesStore();
    if (list.length === 0) return { content: 'CRM vazio.', sources: ['CRM'], toolsUsed: [] };
    const topo = list.slice(0, 10).map(c => `• **${c.nome}** — ${c.cidade || '?'}${c.uf ? `/${c.uf}` : ''} — ${c.statusRelacionamento || 'ativo'}`).join('\n');
    return { content: `**${list.length} clientes no CRM** (primeiros 10):\n\n${topo}${list.length > 10 ? `\n\n...e mais ${list.length - 10}.` : ''}`, sources: ['CRM'], toolsUsed: ['crm.listar'] };
  }

  private async propostasListar(status?: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    const list = getPropostasStore();
    const filtradas = status ? list.filter(p => p.status?.toLowerCase().includes(status)) : list;
    if (filtradas.length === 0) return { content: `Sem propostas${status ? ` (${status})` : ''}.`, sources: ['/api/propostas'], toolsUsed: [] };
    const total = filtradas.reduce((s, p) => s + (p.valorTotal || 0), 0);
    const topo = filtradas.slice(0, 5).map(p => `• ${p.clienteNome || p.clienteId} — ${p.status} — ${p.valorTotal ? fmtBRL(p.valorTotal) : 's/ valor'}`).join('\n');
    return {
      content: `**${filtradas.length} proposta(s)${status ? ` (${status})` : ''}** — total ${fmtBRL(total)}:\n\n${topo}${filtradas.length > 5 ? `\n\n...e mais ${filtradas.length - 5}.` : ''}`,
      sources: ['/api/propostas'],
      toolsUsed: ['propostas.listar'],
    };
  }

  private async propostasInteligentesListar(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    const list = getPropostasInteligentesList();
    if (list.length === 0) return { content: 'Nenhuma proposta inteligente gerada ainda. Use o gerador em Propostas.', sources: [], toolsUsed: [] };
    const topo = list.slice(0, 5).map(p => `• **${p.clienteNome}** — ${p.estrategia} — ${fmtBRL(p.dividaTotal)} — ${p.secoes} seções`).join('\n');
    return {
      content: `**${list.length} proposta(s) inteligente(s):**\n\n${topo}`,
      sources: ['/api/propostas/inteligentes/list'],
      toolsUsed: ['propostasInteligentes.listar'],
    };
  }

  // ── Climate ─────────────────────────────────────────────

  private async resolveMunicipio(cidade: string): Promise<{ codigoIbge: string; nome: string; uf: string; lat: number; lon: number } | null> {
    try {
      const res = await this.fetchInternal(`/api/clima/buscar?q=${encodeURIComponent(cidade)}`);
      const list = res?.resultados || [];
      return list[0] || null;
    } catch {
      return null;
    }
  }

  private async climaAtual(cidade?: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    if (!cidade) return { content: 'Me diz o município. Ex: "clima em Uberlândia".', sources: [], toolsUsed: [] };
    try {
      const mun = await this.resolveMunicipio(cidade);
      if (!mun) throw new Error(`município "${cidade}" não encontrado no IBGE`);
      const data = await this.fetchInternal(`/api/clima/municipio/${mun.codigoIbge}`);
      const c = data?.condicaoAtual;
      const m = data?.municipio || mun;
      if (!c) throw new Error('condição indisponível');
      return {
        content: `**Clima em ${m.nome}${m.uf ? `/${m.uf}` : ''}:**\n\n• Temperatura: ${c.temperatura}°C (sensação ${c.sensacaoTermica}°)\n• Umidade: ${c.umidade}%\n• Condição: ${c.condicao}\n• Precipitação 24h: ${c.precipitacao24h} mm\n• Vento: ${c.ventoVelocidade} km/h ${c.ventoDirecao}\n• UV: ${c.indiceUV}\n\n_Fonte: ${c.fonteOrigem || 'Open-Meteo'}_`,
        sources: data?.fontes || ['Open-Meteo', 'IBGE'],
        toolsUsed: ['/api/clima/buscar', '/api/clima/municipio'],
      };
    } catch (err) {
      return { content: `Clima de "${cidade}" indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async climaPrevisao(cidade?: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    if (!cidade) return { content: 'Preciso do município pra previsão.', sources: [], toolsUsed: [] };
    try {
      const mun = await this.resolveMunicipio(cidade);
      if (!mun) throw new Error(`município "${cidade}" não encontrado no IBGE`);
      const data = await this.fetchInternal(`/api/clima/municipio/${mun.codigoIbge}`);
      const prev = data?.previsao || [];
      const m = data?.municipio || mun;
      if (prev.length === 0) throw new Error('sem previsão');
      const linhas = prev.slice(0, 7).map((d: any) =>
        `• **${d.diaSemana} ${d.data}**: ${d.tempMinima}°/${d.tempMaxima}°, ${d.condicao}, chuva ${d.precipitacaoMm}mm (${d.probabilidadeChuva}%)`
      ).join('\n');
      return {
        content: `**Previsão 7 dias em ${m?.nome}${m?.uf ? `/${m.uf}` : ''}:**\n\n${linhas}\n\n_Fonte: ${data?.fontes?.join(', ') || 'Open-Meteo'}_`,
        sources: data?.fontes || ['Open-Meteo', 'IBGE'],
        toolsUsed: ['/api/clima/buscar', '/api/clima/municipio'],
      };
    } catch (err) {
      return { content: `Previsão indisponível (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async fetchInternal(path: string): Promise<any> {
    const port = process.env.PORT || '3001';
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = await res.json() as any;
    return json?.data || json;
  }

  // ── Knowledge base ─────────────────────────────────────

  private sumula(numero?: number, termo?: string): { content: string; sources: string[]; toolsUsed: string[] } {
    if (numero) {
      const found = Object.values(SUMULAS_STJ).find(s => s.numero === numero);
      if (!found) return { content: `Súmula ${numero} não consta na base. Disponíveis: ${Object.values(SUMULAS_STJ).map(s => s.numero).join(', ')}.`, sources: [], toolsUsed: [] };
      return {
        content: `**Súmula STJ ${found.numero}** (${found.area}):\n\n> "${found.texto}"\n\n**Contexto:** ${found.contexto}\n\n**Aplicação ALETIS:** ${found.aplicacaoPratica}`,
        sources: [`STJ — Súmula ${found.numero}`],
        toolsUsed: ['knowledge.sumula'],
      };
    }
    if (termo) {
      const matches = buscarSumulaPorTema(termo);
      if (matches.length === 0) return { content: `Nenhuma súmula sobre "${termo}".`, sources: [], toolsUsed: [] };
      const linhas = matches.slice(0, 5).map(s => `• **Súmula ${s.numero}**: ${s.texto.slice(0, 140)}...`).join('\n');
      return { content: `${matches.length} súmula(s) relacionada(s) a "${termo}":\n\n${linhas}`, sources: ['STJ'], toolsUsed: ['knowledge.sumulaPorTema'] };
    }
    const lista = Object.values(SUMULAS_STJ).map(s => `• **${s.numero}** — ${s.texto.slice(0, 100)}...`).join('\n');
    return { content: `**${Object.keys(SUMULAS_STJ).length} súmulas na base:**\n\n${lista}`, sources: ['STJ'], toolsUsed: ['knowledge.sumulas'] };
  }

  private mcr(secao?: string, termo?: string): { content: string; sources: string[]; toolsUsed: string[] } {
    if (secao) {
      const found = Object.values(MCR_SECOES).find(s => s.numero === secao);
      if (!found) return { content: `MCR ${secao} não consta. Disponíveis: ${Object.values(MCR_SECOES).map(s => s.numero).join(', ')}.`, sources: [], toolsUsed: [] };
      return {
        content: `**MCR ${found.numero} — ${found.titulo}**\n\n${found.ementa}\n\n**Aplicação prática:** ${found.aplicacaoPratica}`,
        sources: [`BCB MCR — Seção ${found.numero}`],
        toolsUsed: ['knowledge.mcr'],
      };
    }
    if (termo) {
      const matches = buscarMCRPorTema(termo);
      if (matches.length === 0) return { content: `Nenhuma seção MCR sobre "${termo}".`, sources: [], toolsUsed: [] };
      const linhas = matches.slice(0, 5).map(s => `• **MCR ${s.numero}** — ${s.titulo}`).join('\n');
      return { content: `${matches.length} seção(ões) do MCR sobre "${termo}":\n\n${linhas}`, sources: ['BCB MCR'], toolsUsed: ['knowledge.mcrPorTema'] };
    }
    const lista = Object.values(MCR_SECOES).map(s => `• **MCR ${s.numero}** — ${s.titulo}`).join('\n');
    return { content: `**${Object.keys(MCR_SECOES).length} seções do MCR na base:**\n\n${lista}`, sources: ['BCB MCR'], toolsUsed: ['knowledge.mcr'] };
  }

  private planoSafra(programa?: 'pronaf' | 'pronamp' | 'empresarial'): { content: string; sources: string[]; toolsUsed: string[] } {
    if (programa === 'pronaf') {
      const linhas = PRONAF_LINHAS.slice(0, 8).map((l: any) => `• **${l.nome}** — ${l.taxaJuros}% a.a. — ${l.publico} — até ${l.limiteValor ? fmtBRL(l.limiteValor) : 's/ limite'}`).join('\n');
      return { content: `**Pronaf — Plano Safra 2025/26** (${PRONAF_LINHAS.length} linhas):\n\n${linhas}`, sources: ['Plano Safra 2025/26 — Pronaf'], toolsUsed: ['knowledge.planoSafra'] };
    }
    if (programa === 'pronamp') {
      const linhas = PRONAMP_LINHAS.slice(0, 8).map((l: any) => `• **${l.nome}** — ${l.taxaJuros}% a.a. — ${l.publico} — até ${l.limiteValor ? fmtBRL(l.limiteValor) : 's/ limite'}`).join('\n');
      return { content: `**Pronamp — Plano Safra 2025/26** (${PRONAMP_LINHAS.length} linhas):\n\n${linhas}`, sources: ['Plano Safra 2025/26 — Pronamp'], toolsUsed: ['knowledge.planoSafra'] };
    }
    if (programa === 'empresarial') {
      const linhas = EMPRESARIAL_LINHAS.slice(0, 8).map((l: any) => `• **${l.nome}** — ${l.taxaJuros}% a.a. — ${l.publico} — até ${l.limiteValor ? fmtBRL(l.limiteValor) : 's/ limite'}`).join('\n');
      return { content: `**Empresarial — Plano Safra 2025/26** (${EMPRESARIAL_LINHAS.length} linhas):\n\n${linhas}`, sources: ['Plano Safra 2025/26 — Empresarial'], toolsUsed: ['knowledge.planoSafra'] };
    }
    return {
      content: `**Plano Safra 2025/26** (R$ ${(PLANO_SAFRA_2025_26.totalDisponibilizado / 1e9).toFixed(1)} Bi):\n\n• Pronaf: ${PRONAF_LINHAS.length} linhas, taxa 0.5-4% a.a.\n• Pronamp: ${PRONAMP_LINHAS.length} linhas, taxa 10-10.5% a.a.\n• Empresarial: ${EMPRESARIAL_LINHAS.length} linhas, taxa 8.5-14% a.a.\n\nPergunte "Pronaf", "Pronamp" ou "Empresarial" pra detalhar.`,
      sources: ['Plano Safra 2025/26'],
      toolsUsed: ['knowledge.planoSafra'],
    };
  }

  private proagro(): { content: string; sources: string[]; toolsUsed: string[] } {
    const p: any = PROAGRO_REGRAS_2025_26;
    return {
      content: `**Proagro 2025/26**\n\n${p.descricao || 'Programa de Garantia da Atividade Agropecuária — cobre perdas por eventos naturais em operações de custeio'}\n\n• Adesão: ${p.adesao || 'obrigatória para Pronaf, opcional para demais'}\n• Cobertura máxima: ${p.coberturaMaxima || 'até 100% do custeio'}\n• Culturas cobertas: ${p.culturasCobertas?.slice(0, 5).join(', ') || 'soja, milho, arroz, feijão, trigo, algodão, café...'}`,
      sources: ['MCR 16 — Proagro / Res. CMN 5.190/2024'],
      toolsUsed: ['knowledge.proagro'],
    };
  }

  private precedentes(termo?: string): { content: string; sources: string[]; toolsUsed: string[] } {
    const list = termo
      ? PRECEDENTES.filter(p => p.ementa.toLowerCase().includes(termo.toLowerCase()) || p.tese.toLowerCase().includes(termo.toLowerCase()))
      : PRECEDENTES;
    if (list.length === 0) return { content: `Nenhum precedente sobre "${termo}".`, sources: [], toolsUsed: [] };
    const linhas = list.slice(0, 5).map(p => `• **${p.tribunal} ${p.classe} ${p.numero}** (${p.dataJulgamento}) — ${p.tese.slice(0, 160)}...`).join('\n');
    return { content: `${list.length} precedente(s)${termo ? ` sobre "${termo}"` : ''}:\n\n${linhas}`, sources: ['STJ/TJ precedentes'], toolsUsed: ['knowledge.precedentes'] };
  }

  private buscaGeral(termo: string): { content: string; sources: string[]; toolsUsed: string[] } {
    const hits = buscarConhecimento(termo);
    const partes: string[] = [];
    if (hits.sumulas.length > 0) {
      partes.push(`**Súmulas (${hits.sumulas.length}):**\n` + hits.sumulas.slice(0, 3).map(s => `• Súmula ${s.numero}: ${s.texto.slice(0, 100)}...`).join('\n'));
    }
    if (hits.mcr.length > 0) {
      partes.push(`**MCR (${hits.mcr.length}):**\n` + hits.mcr.slice(0, 3).map(m => `• MCR ${m.numero}: ${m.titulo}`).join('\n'));
    }
    if (hits.precedentes.length > 0) {
      partes.push(`**Precedentes (${hits.precedentes.length}):**\n` + hits.precedentes.slice(0, 3).map(p => `• ${p.tribunal} ${p.classe} ${p.numero}: ${p.tese.slice(0, 100)}...`).join('\n'));
    }
    if (partes.length === 0) return this.generico(termo);
    return {
      content: `Busca na base sobre "${termo}" — ${hits.totalMatches} resultado(s):\n\n${partes.join('\n\n')}`,
      sources: ['@aletis/knowledge-base'],
      toolsUsed: ['knowledge.buscarConhecimento'],
    };
  }

  // ── Market brief, sazonalidade, contratos ─────────────

  private async marketBrief(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    const { MarketBriefService } = await import('./MarketBriefService.js');
    const svc = new MarketBriefService(this.dsm);
    const brief = await svc.generateBrief();
    return {
      content: brief.narrativaExecutiva,
      sources: ['CEPEA/CONAB', 'BCB SGS', 'AwesomeAPI', 'BCB Focus', 'NASA FIRMS'],
      toolsUsed: ['MarketBriefService.generateBrief'],
    };
  }

  private async sazonalidade(commodity: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    const { SazonalidadeService } = await import('./SazonalidadeService.js');
    const svc = new SazonalidadeService();
    const perfil = svc.getPerfil(commodity);
    if (!perfil) {
      return {
        content: `Sazonalidade não disponível pra "${commodity}". Tenho perfis de: soja, milho, boi, cafe, algodao, trigo.`,
        sources: [],
        toolsUsed: [],
      };
    }
    const rec = svc.recomendacaoMesAtual(commodity);
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const linhas = perfil.indicesMensais.map((v, i) => `${meses[i]}: ${v}`).join('  ·  ');

    const content = `**Padrão sazonal — ${perfil.nomeExibicao}**

Índices mensais (base 100 = média anual, observado em 2015-2024):
${linhas}

• **Melhor mês pra vender:** ${perfil.melhorMesVenda.mes} (índice ${perfil.melhorMesVenda.indice})
• **Pior mês pra vender:** ${perfil.piorMesVenda.mes} (índice ${perfil.piorMesVenda.indice})
• **Pico de safra:** ${perfil.safraPico}

**Leitura prática:** ${perfil.observacao}

**Fundamento agronômico:** ${perfil.fundamentoAgronomico}

${rec ? `\n**Recomendação pra ${rec.mes}:** ${rec.acao.toUpperCase()} — ${rec.justificativa}` : ''}

_Fonte: ${perfil.fonteSerie}._`;
    return {
      content,
      sources: [perfil.fonteSerie],
      toolsUsed: ['SazonalidadeService.getPerfil'],
    };
  }

  private async contratosTipos(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    const { contratoGenerator } = await import('./ContratoGenerator.js');
    const tipos = contratoGenerator.listarTipos();
    const linhas = tipos.map((t, i) =>
      `${i + 1}. **${t.titulo}** (\`${t.tipo}\`)\n   _Quando usar:_ ${t.quando}\n   _Fundamento:_ ${t.fundamento.join(', ')}`
    );
    const content = `**Tipos de contrato que posso gerar**

${linhas.join('\n\n')}

Pra gerar, vá em **/contratos** no sistema ou me diga: "gerar CPR para João Silva, 1.000 sacas de soja, vencimento jun/2026".

_Todos os contratos são minutas pra revisão jurídica — não substituem advogado._`;
    return {
      content,
      sources: ['ContratoGenerator'],
      toolsUsed: ['ContratoGenerator.listarTipos'],
    };
  }

  private async contratoOrientacao(tipoContrato: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    const { contratoGenerator } = await import('./ContratoGenerator.js');
    const tipos = contratoGenerator.listarTipos();
    const t = tipos.find((x) => x.tipo === tipoContrato);
    if (!t) {
      return {
        content: `Tipo de contrato "${tipoContrato}" não reconhecido. Digita "tipos de contrato" pra ver a lista.`,
        sources: [],
        toolsUsed: [],
      };
    }
    const camposObrigatorios: Record<string, string[]> = {
      cpr_financeira: [
        'Devedor (nome completo, CPF/CNPJ, endereço)',
        'Credor (nome, CPF/CNPJ, endereço)',
        'Produto vinculado (ex: SOJA EM GRÃOS)',
        'Quantidade e unidade (ex: 1.000 sacas 60kg)',
        'Valor total da CPR',
        'Data de vencimento',
        'Imóvel rural (matrícula, cartório, área)',
        'Safra (ex: 2025/26)',
      ],
      cpr_fisica: [
        'Devedor e credor (qualificação completa)',
        'Produto, quantidade, padrão de qualidade',
        'Local de entrega',
        'Data de entrega',
        'Valor recebido pelo produtor',
        'Imóvel rural',
      ],
      confissao_divida: [
        'Devedor e credor',
        'Contratos/títulos originais (números, datas, valores)',
        'Valor total atualizado',
        'Cronograma de parcelas',
        'Eventuais dações em pagamento',
      ],
      termo_renegociacao: [
        'Banco credor e mutuário',
        'Operação originária (CCB/contrato, número, valor)',
        'Saldo devedor consolidado',
        'Nova taxa, prazo e cronograma',
        'Garantias mantidas',
      ],
      acordo_extrajudicial: [
        'Partes e qualificação completa',
        'Descrição do litígio (ação em curso ou pretensão)',
        'Valor transacionado',
        'Forma de pagamento',
      ],
      transacao_excepcional: [
        'Produtor e instituição credora',
        'Operação originária e saldo atualizado',
        'Desconto concedido pela instituição (se houver)',
        'Entrada + cronograma',
        'Declaração de adesão à modalidade',
      ],
    };
    const campos = camposObrigatorios[tipoContrato] ?? [];
    const content = `**Como gerar: ${t.titulo}**

**Quando usar:** ${t.quando}

**Fundamento legal:** ${t.fundamento.join(', ')}

**Informações necessárias:**
${campos.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**Próximo passo:** vá em **/contratos → Novo contrato → ${t.titulo}** no sistema. A minuta é preenchida automaticamente e exportada em PDF A4 formal.

_Lembre-se: toda minuta requer revisão jurídica antes da assinatura._`;
    return {
      content,
      sources: ['ContratoGenerator'],
      toolsUsed: ['ContratoGenerator.listarTipos'],
    };
  }

  // ── Generic fallback ───────────────────────────────────

  private generico(raw: string): { content: string; sources: string[]; toolsUsed: string[] } {
    return {
      content: `Não entendi completamente "${raw.slice(0, 80)}". Posso ajudar com:\n\n• Cotações (dólar, euro, soja, milho, selic, ipca)\n• Clima e previsão de qualquer município BR\n• CRM (buscar cliente, listar propostas)\n• Súmulas STJ e MCR\n• Plano Safra 2025/26, Proagro\n\nDigita "ajuda" pra exemplos ou tenta reformular.`,
      sources: [],
      toolsUsed: [],
    };
  }
}

// ── Store accessors (set via registerStores) ───────────────

let _getClientes: () => any[] = () => [];
let _getPropostas: () => any[] = () => [];
let _getPropostasInteligentes: () => any[] = () => [];

export function registerStores(accessors: {
  clientes: () => any[];
  propostas: () => any[];
  propostasInteligentes: () => any[];
}) {
  _getClientes = accessors.clientes;
  _getPropostas = accessors.propostas;
  _getPropostasInteligentes = accessors.propostasInteligentes;
}

function getClientesStore(): any[] { return _getClientes(); }
function getPropostasStore(): any[] { return _getPropostas(); }
function getPropostasInteligentesList(): any[] { return _getPropostasInteligentes(); }
