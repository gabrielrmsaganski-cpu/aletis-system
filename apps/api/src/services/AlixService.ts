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
import {
  simular as simularAmortizacaoCalc,
  networkDays,
  FERIADOS_NACIONAIS,
  taxaNominalParaEfetiva,
  type ParametrosOperacao,
  type SistemaAmortizacao,
  type Periodicidade,
} from '@aletis/financial-calc';
import {
  runClaude,
  isLLMEnabled,
  CLAUDE_MODEL_SONNET,
  type ClaudeTool,
  type ClaudeToolRegistry,
  type ClaudeMessage,
} from './llm/ClaudeFoundryClient.js';
import { getDossieRepository } from './cliente/DossieRepository.js';
import { getCusteioService } from './custeio/CusteioService.js';
// ── Wave 7b — Simuladores regulatórios 2026 ──────────────────
import { getReformaTributariaService } from './reforma/ReformaTributariaService.js';
import { getFunruralService } from './funrural/FunruralService.js';
import { getDesenrolaRuralService } from './desenrola/DesenrolaRuralService.js';
// ── Wave 8 — BSC + RAG + SICOR ────────────────────────────────
import { getBscService } from './bsc/BscService.js';
import { getRagService } from '@aletis/knowledge-base';
import type {
  ContextoBSCCalculo,
  PerspectivaBSC,
  ModalidadeSicor,
} from '@aletis/shared-types';
// ── Wave 9 — Intake + Generators + Memory + Briefing ──────────
import { getDocumentIntakeService } from './alix/intake/DocumentIntakeService.js';
import { DocumentGeneratorService } from './alix/generators/DocumentGeneratorService.js';
import type {
  PropostaInput,
  ParecerInput,
  RelatorioBscInput,
  FluxoCaixaInput,
  MemoriaInput,
} from './alix/generators/types.js';
import { getAlixMemoryService } from './alix/memory/AlixMemoryService.js';
import { getBriefingService } from './alix/memory/BriefingService.js';
import type { MemoriaCliente, SecaoNota } from './alix/memory/types.js';
import {
  dossieAgroResumo,
  type DossieAgro,
  type PlanoCusteio,
  type StatusPlanoCusteio,
  type PlanoCusteioListFilters,
  type PlanoCusteioCreatePayload,
  type PlanoCusteioUpdatePayload,
  type DadosProponente,
  type Gleba,
  type ItemOrcamento,
  type RegimeTributarioRural,
  type TipoContribuinte,
  type FaixaCapacidadePagamento,
  type TipoSoloZarc,
  type CicloVariedade,
} from '@aletis/shared-types';
// ── Wave 6 — Alix Agente Executor ──────────────────────────
import {
  getAlixConfirmationStore,
  type PendingConfirmation,
} from './alix/AlixConfirmationStore.js';
// ── Alix Insano F1 — tools de prospecção ──────────────
import { buildProspeccaoTools } from './alix/tools/prospeccao.js';
// ── Alix Insano F2 — web search + scrapers ────────────
import { WebSearchProviderFactory } from './alix/tools/websearch/WebSearchProviderFactory.js';
import type { WebSearchProvider } from './alix/tools/websearch/types.js';
import { buildFetchUrlTool } from './alix/tools/websearch/fetchUrl.js';
import { buildCnpjTool } from './alix/tools/websearch/scrapers/cnpj.js';
import { buildCvmTool } from './alix/tools/websearch/scrapers/cvm.js';
import { buildJusbrasilTool } from './alix/tools/websearch/scrapers/jusbrasil.js';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname as _dirname } from 'path';
import { fileURLToPath as _fileURLToPath } from 'url';

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
  // Financeiro interno
  | { tipo: 'fin_dashboard' }
  | { tipo: 'fin_faturamento_mes'; competencia?: string }
  | { tipo: 'fin_despesas_mes'; competencia?: string }
  | { tipo: 'fin_das_previsto'; competencia?: string }
  | { tipo: 'fin_inadimplencia' }
  | { tipo: 'fin_fechamento_contador'; competencia?: string }
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

  // Financeiro interno do negócio — antes de intents mais genéricas
  // para evitar que "das" e "fechamento" sejam absorvidos por sumula/plano.
  const competenciaMatch = q.match(/(\d{4})-(\d{2})|(\d{2})\/(\d{4})/);
  const compDetectada = competenciaMatch
    ? (competenciaMatch[1] ? `${competenciaMatch[1]}-${competenciaMatch[2]}` : `${competenciaMatch[4]}-${competenciaMatch[3]}`)
    : undefined;
  if (/(fechamento.*(contador|mes|mensal)|pacote.*contador|enviar.*contador|zip.*contador|fechar.*(mes|mensal))/.test(q)) {
    return { tipo: 'fin_fechamento_contador', competencia: compDetectada };
  }
  if (/(faturamento.*(mes|mensal|atual)|receita.*(mes|do mes|desse mes|este mes)|quanto.*fatu(?:rei|rou)|receita bruta.*mes)/.test(q)) {
    return { tipo: 'fin_faturamento_mes', competencia: compDetectada };
  }
  if (/(despesas?.*(mes|mensal|atual|do mes|desse mes)|quanto.*gastei.*mes|gastos.*mes|custos.*mes)/.test(q)) {
    return { tipo: 'fin_despesas_mes', competencia: compDetectada };
  }
  if (/(\bdas\b.*(previsto|do mes|proximo|calcul)|quanto.*das|simples nacional.*(mes|proximo)|imposto.*simples)/.test(q)) {
    return { tipo: 'fin_das_previsto', competencia: compDetectada };
  }
  if (/(inadimpl|contas.*(atrasad|vencid)|receb.*atrasad|honorarios?.*atrasad|quem.*nao pagou)/.test(q)) {
    return { tipo: 'fin_inadimplencia' };
  }
  if (/(dashboard.*financ|kpi.*financ|resumo.*financ|painel.*financ|situacao.*financ|saude.*financ)/.test(q)) {
    return { tipo: 'fin_dashboard' };
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
  private webSearchProvider: WebSearchProvider | null = null;

  setWebSearchProvider(p: WebSearchProvider): void {
    this.webSearchProvider = p;
  }

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

  async chat(
    sessionId: string | undefined,
    userMessage: string,
    opts?: { attachments?: string[]; clienteId?: string },
  ): Promise<{ session: ChatSession; reply: ChatMessage }> {
    await this.ensureLoaded();
    let session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session) {
      session = await this.createSession(generateTitle(userMessage));
    }

    const now = Date.now();
    const attachments = Array.isArray(opts?.attachments) ? opts!.attachments!.filter(Boolean) : undefined;
    const clienteId = typeof opts?.clienteId === 'string' && opts!.clienteId.trim() ? opts!.clienteId.trim() : undefined;
    const userMsg: ChatMessage = {
      id: `msg_${randomUUID().slice(0, 6)}_${now.toString(36)}`,
      role: 'user',
      content: userMessage,
      timestamp: now,
      metadata: attachments || clienteId ? { attachments, clienteId } : undefined,
    };
    session.messages.push(userMsg);

    const intent = classify(userMessage);
    const response = await this.respond(intent, userMessage, session, { attachments, clienteId });

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
    opts?: { attachments?: string[]; clienteId?: string },
  ): Promise<{ content: string; sources?: string[]; toolsUsed?: string[]; metadata?: Record<string, unknown> }> {
    // Cérebro LLM (Claude Sonnet 4.6 via Foundry) é a primeira tentativa.
    // Se falhar por qualquer motivo (rede/auth/limite), cai para o switch
    // rule-based a seguir — garantia de que o Alix nunca fica mudo.
    if (isLLMEnabled()) {
      try {
        const llmResult = await this.runLLMPath(raw, session, opts);
        if (llmResult && llmResult.content) return llmResult;
      } catch (err) {
        console.warn('[Alix] LLM path falhou, usando regras:', (err as Error).message);
      }
    }

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

      case 'fin_dashboard': return this.finDashboard();
      case 'fin_faturamento_mes': return this.finFaturamentoMes(intent.competencia);
      case 'fin_despesas_mes': return this.finDespesasMes(intent.competencia);
      case 'fin_das_previsto': return this.finDasPrevisto(intent.competencia);
      case 'fin_inadimplencia': return this.finInadimplencia();
      case 'fin_fechamento_contador': return this.finFechamentoContador(intent.competencia);

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

  // ── Dossiê Agro (Daycoval 2025) ────────────────────────
  //
  // Três tools expostas ao Claude: visão geral, produção e dívidas.
  // Todas resolvem "clienteId ou nome" → id → dossiê. Retornam markdown
  // pronto para resposta do chat, seguindo o padrão dos outros handlers.

  /** Resolve uma string (id, CPF/CNPJ, nome) em um cliente do CRM. */
  private resolverClienteParaDossie(termo: string): { id: string; nome: string; cpfCnpj?: string } | null {
    if (!termo) return null;
    const list = getClientesStore();
    if (list.length === 0) return null;

    // 1) match direto por id
    const byId = list.find((c) => c?.id === termo);
    if (byId) return { id: byId.id, nome: byId.nome, cpfCnpj: byId.cpfCnpj ?? byId.cpf };

    // 2) match por CPF/CNPJ (só dígitos)
    const digits = termo.replace(/\D/g, '');
    if (digits.length >= 11) {
      const byDoc = list.find((c) => (c?.cpfCnpj || c?.cpf || '').replace(/\D/g, '') === digits);
      if (byDoc) return { id: byDoc.id, nome: byDoc.nome, cpfCnpj: byDoc.cpfCnpj ?? byDoc.cpf };
    }

    // 3) match por nome (case-insensitive, inclui substring)
    const t = termo.toLowerCase().trim();
    const byNome = list.find((c) => typeof c?.nome === 'string' && c.nome.toLowerCase().includes(t));
    if (byNome) return { id: byNome.id, nome: byNome.nome, cpfCnpj: byNome.cpfCnpj ?? byNome.cpf };

    return null;
  }

  private dossieParaTermo(termo: string): { cliente: { id: string; nome: string }; dossie: DossieAgro | null; erro?: string } {
    const cliente = this.resolverClienteParaDossie(termo);
    if (!cliente) {
      return { cliente: { id: '', nome: '' }, dossie: null, erro: `Cliente "${termo}" não encontrado no CRM.` };
    }
    const dossie = getDossieRepository().get(cliente.id);
    if (!dossie) {
      return { cliente: { id: cliente.id, nome: cliente.nome }, dossie: null, erro: `Cliente ${cliente.nome} ainda não tem dossiê agro cadastrado.` };
    }
    return { cliente: { id: cliente.id, nome: cliente.nome }, dossie };
  }

  private async dossieBuscar(termo: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    const { cliente, dossie, erro } = this.dossieParaTermo(termo);
    if (!dossie) return { content: erro || 'Dossiê indisponível.', sources: ['/api/clientes/:id/dossie'], toolsUsed: [] };

    const resumo = dossieAgroResumo(dossie);
    const linhas: string[] = [
      `**Dossiê Agro — ${cliente.nome}** (v${resumo.versao}, data-base ${dossie.dataBase})`,
      '',
      `• **Grupo econômico:** ${resumo.totais.pessoasFisicas} PF + ${resumo.totais.pessoasJuridicas} PJ`,
      `• **Imóveis:** ${resumo.totais.imoveis} propriedade(s) — ${resumo.totais.areaTotalHa.toLocaleString('pt-BR')} ha — ${fmtBRL(resumo.totais.valorImoveisTotal)}`,
      `• **Produção:** ${resumo.totais.culturas} cultura(s) cadastrada(s) em ${new Set(dossie.producao.agricultura.map((a) => a.uf)).size} UF(s)`,
      `• **Dívidas bancárias:** ${resumo.totais.dividasBancarias} contrato(s) — saldo ${fmtBRL(resumo.totais.saldoDividasBancarias)}`,
    ];
    if (dossie.operacional.historia) {
      const hist = dossie.operacional.historia.slice(0, 220);
      linhas.push('', `**Contexto:** ${hist}${dossie.operacional.historia.length > 220 ? '…' : ''}`);
    }
    if (dossie.grupoEconomico.demandaTotal) {
      linhas.push(`• **Demanda declarada:** ${fmtBRL(dossie.grupoEconomico.demandaTotal)}`);
    }
    return {
      content: linhas.join('\n'),
      sources: [`/api/clientes/${cliente.id}/dossie`],
      toolsUsed: ['dossie.buscar'],
    };
  }

  private async dossieProducao(termo: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    const { cliente, dossie, erro } = this.dossieParaTermo(termo);
    if (!dossie) return { content: erro || 'Dossiê indisponível.', sources: [], toolsUsed: [] };

    const agri = dossie.producao.agricultura;
    const pec = dossie.producao.pecuaria;
    if (agri.length === 0 && pec.length === 0) {
      return { content: `Dossiê de **${cliente.nome}** não tem quadros de produção preenchidos.`, sources: [`/api/clientes/${cliente.id}/dossie`], toolsUsed: ['dossie.producao'] };
    }

    const linhas: string[] = [`**Produção — ${cliente.nome}** (data-base ${dossie.producao.dataBase || dossie.dataBase})`, ''];

    if (agri.length > 0) {
      linhas.push('**Agricultura:**');
      for (const a of agri.slice(0, 12)) {
        const atual = a.safras.find((s) => s.tipo === 'atual');
        const prevista = a.safras.find((s) => s.tipo === 'prevista');
        const nome = a.outroDescricao || a.cultura.replace(/_/g, ' ');
        const pieces: string[] = [`• ${nome} (${a.uf})`];
        if (atual) {
          pieces.push(`atual ${atual.safra}: ${atual.areaPlantadaHa ?? '?'} ha, ${atual.rendimentoScHa ?? '?'} sc/ha`);
        }
        if (prevista) {
          pieces.push(`prevista ${prevista.safra}: ${prevista.areaPlantadaHa ?? '?'} ha`);
        }
        linhas.push(pieces.join(' — '));
      }
      if (agri.length > 12) linhas.push(`_…e mais ${agri.length - 12} quadro(s)_`);
    }

    if (pec.length > 0) {
      linhas.push('', '**Pecuária:**');
      for (const p of pec.slice(0, 8)) {
        const nome = p.outroDescricao || p.atividade.replace(/_/g, ' ');
        linhas.push(`• ${nome} (${p.uf}): ${p.cabecas ?? '?'} cab — ${p.areaPastagemHa ?? '?'} ha de pasto`);
      }
      if (pec.length > 8) linhas.push(`_…e mais ${pec.length - 8} quadro(s)_`);
    }

    return { content: linhas.join('\n'), sources: [`/api/clientes/${cliente.id}/dossie`], toolsUsed: ['dossie.producao'] };
  }

  private async dossieDividas(termo: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    const { cliente, dossie, erro } = this.dossieParaTermo(termo);
    if (!dossie) return { content: erro || 'Dossiê indisponível.', sources: [], toolsUsed: [] };

    const b = dossie.dividas.bancarias;
    const f = dossie.dividas.fornecedores;
    const t = dossie.dividas.terras;
    if (b.length === 0 && f.length === 0 && t.length === 0) {
      return { content: `Dossiê de **${cliente.nome}** não tem estrutura de dívidas preenchida.`, sources: [`/api/clientes/${cliente.id}/dossie`], toolsUsed: ['dossie.dividas'] };
    }

    const totalBancaria = b.reduce((s, x) => s + (x.saldoTotal || 0), 0);
    const totalFornecedor = f.reduce((s, x) => s + (x.valorBRL || 0), 0);
    const totalTerras = t.reduce((s, x) => s + (x.totalVencer || 0), 0);

    const linhas: string[] = [
      `**Estrutura de Dívidas — ${cliente.nome}** (data-base ${dossie.dividas.dataBase || dossie.dataBase})`,
      '',
      `• **Bancárias:** ${b.length} contrato(s) — ${fmtBRL(totalBancaria)}`,
      `• **Fornecedores/Barter:** ${f.length} — ${fmtBRL(totalFornecedor)}`,
      `• **Terras:** ${t.length} — ${fmtBRL(totalTerras)} a vencer`,
    ];

    if (b.length > 0) {
      linhas.push('', '**Top bancárias (por saldo):**');
      const top = [...b].sort((x, y) => (y.saldoTotal || 0) - (x.saldoTotal || 0)).slice(0, 6);
      for (const d of top) {
        const taxa = d.taxaJuros ? `${(d.taxaJuros * 100).toFixed(2)}%` : 's/ taxa';
        linhas.push(`• ${d.instituicao} (${d.modalidade}) — ${fmtBRL(d.saldoTotal)} — ${taxa} — venc. ${d.dataVencimento ?? 's/ data'}`);
      }
    }

    return { content: linhas.join('\n'), sources: [`/api/clientes/${cliente.id}/dossie`], toolsUsed: ['dossie.dividas'] };
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

  // ── Financeiro interno ─────────────────────────────────

  private async finDashboard(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const { getFinanceiroService } = await import('./financeiro/FinanceiroService.js');
      const d = getFinanceiroService().calcularDashboard();
      const topCats = d.topCategoriasDespesa.slice(0, 3).map((c) => `• ${c.nome}: ${fmtBRL(c.valor)} (${fmtNum(c.pct, 1)}%)`).join('\n');
      const content = `**Painel financeiro — ${d.mesAtual}**\n\n` +
        `• Receita do mês: ${fmtBRL(d.dreAtual.receitaBruta)} (${d.dreAtual.contagens.receitas} receitas)\n` +
        `• Despesas + impostos: ${fmtBRL(d.dreAtual.totalDespesas + d.dreAtual.impostosApurados)}\n` +
        `• Resultado líquido: **${fmtBRL(d.dreAtual.resultadoLiquido)}** (margem ${fmtNum(d.dreAtual.margemLiquida, 1)}%)\n` +
        `• RBT12: ${fmtBRL(d.rbt12)} (${fmtNum((d.rbt12 / 4_800_000) * 100, 1)}% do limite Simples)\n` +
        `• A receber: ${fmtBRL(d.contasReceber.total)} (atrasadas: ${fmtBRL(d.contasReceber.atrasadas)})\n` +
        `• A pagar: ${fmtBRL(d.contasPagar.total)} (atrasadas: ${fmtBRL(d.contasPagar.atrasadas)})\n` +
        (d.dasProximo ? `• DAS previsto: ${fmtBRL(d.dasProximo.valorDAS)} — vence ${d.dasProximo.vencimento}\n` : '') +
        (topCats ? `\n**Top categorias de despesa (3 meses):**\n${topCats}` : '') +
        (d.alertas.length ? `\n\n**Alertas ativos:** ${d.alertas.length}\n${d.alertas.slice(0, 3).map((a) => `• ${a.titulo}`).join('\n')}` : '');
      return { content, sources: ['financeiro:db'], toolsUsed: ['FinanceiroService.calcularDashboard'] };
    } catch (err: any) {
      return { content: `Erro ao ler financeiro: ${err.message}`, sources: [], toolsUsed: [] };
    }
  }

  private async finFaturamentoMes(comp?: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const { getFinanceiroService } = await import('./financeiro/FinanceiroService.js');
      const svc = getFinanceiroService();
      const competencia = comp ?? new Date().toISOString().slice(0, 7);
      const dre = svc.calcularDREMensal(competencia);
      const receitas = svc.listarReceitas({ competencia });
      const recebido = receitas.filter((r) => r.status === 'recebida').reduce((s, r) => s + r.valorLiquido, 0);
      const aReceber = receitas.filter((r) => r.status !== 'recebida' && r.status !== 'cancelada').reduce((s, r) => s + r.valorLiquido, 0);
      const content = `**Faturamento — ${competencia}**\n\n` +
        `• Receita bruta: **${fmtBRL(dre.receitaBruta)}** (${dre.contagens.receitas} NF/receita)\n` +
        `• Retenções: ${fmtBRL(dre.retencoes)}\n` +
        `• Receita líquida: ${fmtBRL(dre.receitaLiquida)}\n` +
        `• Já recebido: ${fmtBRL(recebido)}\n` +
        `• Ainda a receber: ${fmtBRL(aReceber)}\n\n` +
        (receitas.length > 0 ? `**Maiores receitas:**\n${receitas.slice(0, 5).map((r) => `• ${r.cliente?.nome ?? r.descricao} — ${fmtBRL(r.valorBruto)} [${r.status}]`).join('\n')}` : '_Nenhuma receita no período._');
      return { content, sources: ['financeiro:db'], toolsUsed: ['FinanceiroService.calcularDREMensal'] };
    } catch (err: any) {
      return { content: `Erro: ${err.message}`, sources: [], toolsUsed: [] };
    }
  }

  private async finDespesasMes(comp?: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const { getFinanceiroService } = await import('./financeiro/FinanceiroService.js');
      const svc = getFinanceiroService();
      const competencia = comp ?? new Date().toISOString().slice(0, 7);
      const dre = svc.calcularDREMensal(competencia);
      const categorias = Object.entries(dre.despesasPorCategoria)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      const content = `**Despesas — ${competencia}**\n\n` +
        `• Total: **${fmtBRL(dre.totalDespesas)}** (${dre.contagens.despesas} lançamentos)\n` +
        `• Dedutíveis: ${fmtBRL(dre.despesasDedutiveis)}\n` +
        `• Não-dedutíveis: ${fmtBRL(dre.despesasNaoDedutiveis)}\n` +
        `• Impostos apurados: ${fmtBRL(dre.impostosApurados)}\n\n` +
        (categorias.length > 0 ? `**Por categoria:**\n${categorias.map(([cat, v]) => `• ${cat.replace(/_/g, ' ')}: ${fmtBRL(v as number)}`).join('\n')}` : '_Nenhuma despesa no período._');
      return { content, sources: ['financeiro:db'], toolsUsed: ['FinanceiroService.calcularDREMensal'] };
    } catch (err: any) {
      return { content: `Erro: ${err.message}`, sources: [], toolsUsed: [] };
    }
  }

  private async finDasPrevisto(comp?: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const { getFinanceiroService } = await import('./financeiro/FinanceiroService.js');
      const { calcularDAS, alertaLimiteSimples } = await import('./financeiro/simples-nacional.js');
      const svc = getFinanceiroService();
      const competencia = comp ?? new Date().toISOString().slice(0, 7);
      const config = svc.getConfig();
      const receita = svc.receitaBrutaMes(competencia);
      const rbt12 = svc.calcularRBT12(competencia);
      if (receita <= 0) {
        return {
          content: `Sem receita bruta em ${competencia} — DAS dispensado. RBT12 acumulado: ${fmtBRL(rbt12)}.`,
          sources: ['financeiro:db'],
          toolsUsed: ['FinanceiroService.receitaBrutaMes'],
        };
      }
      const calc = calcularDAS(receita, rbt12, config.anexoSimples, competencia);
      const alerta = alertaLimiteSimples(rbt12);
      const content = `**DAS previsto — ${competencia} (Anexo ${config.anexoSimples})**\n\n` +
        `• Receita do mês: ${fmtBRL(calc.receitaBrutaMes)}\n` +
        `• RBT12: ${fmtBRL(calc.rbt12)} (${fmtNum((rbt12 / 4_800_000) * 100, 1)}% do limite)\n` +
        `• Faixa: ${calc.faixa} — alíquota nominal ${fmtNum(calc.aliquotaNominal, 2)}%, PD ${fmtBRL(calc.valorDeduzir)}\n` +
        `• **Alíquota efetiva: ${fmtNum(calc.aliquotaEfetiva, 4)}%**\n` +
        `• **Valor DAS: ${fmtBRL(calc.valorDAS)}**\n` +
        `• Vencimento: ${calc.vencimento}\n\n` +
        `**Partilha:** IRPJ ${fmtBRL(calc.detalhamentoPartilha.irpj)} · CSLL ${fmtBRL(calc.detalhamentoPartilha.csll)} · COFINS ${fmtBRL(calc.detalhamentoPartilha.cofins)} · PIS ${fmtBRL(calc.detalhamentoPartilha.pis)} · CPP ${fmtBRL(calc.detalhamentoPartilha.cpp)} · ISS ${fmtBRL(calc.detalhamentoPartilha.iss)}` +
        (alerta.nivel !== 'ok' ? `\n\n⚠️ ${alerta.mensagem}` : '');
      return { content, sources: ['financeiro:db', 'LC 123/2006'], toolsUsed: ['calcularDAS'] };
    } catch (err: any) {
      return { content: `Erro: ${err.message}`, sources: [], toolsUsed: [] };
    }
  }

  private async finInadimplencia(): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const { getFinanceiroService } = await import('./financeiro/FinanceiroService.js');
      const svc = getFinanceiroService();
      const atrasadas = svc.listarReceitas({ status: 'atrasada' });
      if (atrasadas.length === 0) {
        return { content: 'Sem receitas atrasadas. ✅', sources: ['financeiro:db'], toolsUsed: ['FinanceiroService.listarReceitas'] };
      }
      const total = atrasadas.reduce((s, r) => s + r.valorLiquido, 0);
      const hoje = new Date().toISOString().slice(0, 10);
      const lista = atrasadas
        .sort((a, b) => (a.dataPrevisaoRecebimento ?? '').localeCompare(b.dataPrevisaoRecebimento ?? ''))
        .slice(0, 10)
        .map((r) => {
          const dias = r.dataPrevisaoRecebimento
            ? Math.round((new Date(hoje).getTime() - new Date(r.dataPrevisaoRecebimento).getTime()) / 86400000)
            : 0;
          return `• ${r.cliente?.nome ?? r.descricao}: ${fmtBRL(r.valorLiquido)} (${dias}d atrasado — vencia ${r.dataPrevisaoRecebimento ?? '-'})`;
        })
        .join('\n');
      return {
        content: `**${atrasadas.length} receita(s) atrasadas** — total ${fmtBRL(total)}:\n\n${lista}\n\nConsidere cobrança ou renegociação para desbloquear caixa.`,
        sources: ['financeiro:db'],
        toolsUsed: ['FinanceiroService.listarReceitas'],
      };
    } catch (err: any) {
      return { content: `Erro: ${err.message}`, sources: [], toolsUsed: [] };
    }
  }

  private async finFechamentoContador(comp?: string): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const { getFinanceiroService } = await import('./financeiro/FinanceiroService.js');
      const svc = getFinanceiroService();
      const competencia = comp ?? new Date().toISOString().slice(0, 7);
      const checklist = svc.gerarChecklistFechamento(competencia);
      const pendencias = checklist.itens.filter((i) => !i.ok);
      const content = `**Fechamento para o contador — ${competencia}**\n\n` +
        `Status: ${checklist.pronto ? '✅ **PRONTO PARA ENVIO**' : `⚠️ ${pendencias.length} pendência(s)`}\n\n` +
        checklist.itens.map((i) => `${i.ok ? '✅' : '○'} **${i.titulo}** — ${i.detalhe}`).join('\n') +
        `\n\n**Como gerar o pacote:**\n` +
        `• Acesse a aba "Fechamento" em /financeiro e clique em "Baixar ZIP completo"\n` +
        `• Via API: \`POST /api/financeiro/fechamento/${competencia}/gerar\`\n` +
        `• O pacote inclui: manifesto, DRE/CSVs, memória de cálculo do DAS, todos os anexos e o PDF formal`;
      return { content, sources: ['financeiro:db'], toolsUsed: ['FinanceiroService.gerarChecklistFechamento'] };
    } catch (err: any) {
      return { content: `Erro: ${err.message}`, sources: [], toolsUsed: [] };
    }
  }

  // ── LLM path (Claude Sonnet 4.6 via Foundry) ──────────

  /**
   * Constroi tools + system prompt + histórico e deixa o Claude orquestrar.
   * Tools retornam dados estruturados (strings prontas das handlers existentes,
   * que já vêm formatadas). Claude sintetiza a resposta final em linguagem natural.
   */
  private async runLLMPath(
    userMessage: string,
    session: ChatSession,
    opts?: { attachments?: string[]; clienteId?: string },
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    const { tools, registry } = this.buildAlixTools({ sessionId: session.id, clienteId: opts?.clienteId });
    const systemPrompt = await this.buildAlixSystemPrompt(opts?.clienteId);
    const convo = this.sessionToClaudeMessages(session);

    // Se a última mensagem ainda não é user (edge case onde push não aconteceu),
    // adiciona. Normalmente session.messages já inclui o userMessage atual.
    if (convo.length === 0 || convo[convo.length - 1].role !== 'user') {
      convo.push({ role: 'user', content: userMessage });
    }

    // Wave 9: Anexa documentos como blocos multimodais (imagens + texto extraído)
    if (opts?.attachments && opts.attachments.length > 0) {
      try {
        const intake = getDocumentIntakeService();
        const blocks: Array<Record<string, unknown>> = [];
        for (const docId of opts.attachments) {
          const doc = await intake.get(session.id, docId);
          if (!doc) continue;
          if (doc.kind === 'image' && doc.imageBase64 && doc.imageMediaType) {
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: doc.imageMediaType,
                data: doc.imageBase64,
              },
            });
            blocks.push({ type: 'text', text: `[Imagem anexada: ${doc.filename}]` });
          } else if (doc.extractedText && doc.extractedText.trim()) {
            // Trunca em ~50k chars por documento para não estourar contexto
            const texto = doc.extractedText.length > 50000
              ? doc.extractedText.slice(0, 50000) + '\n…(truncado)'
              : doc.extractedText;
            blocks.push({
              type: 'text',
              text: `<document id="${doc.id}" filename="${doc.filename}" kind="${doc.kind}"${doc.pageCount ? ` pages="${doc.pageCount}"` : ''}>\n${texto}\n</document>`,
            });
          }
        }
        if (blocks.length > 0) {
          blocks.push({ type: 'text', text: userMessage });
          // Substitui o último user turn (que hoje é string) pela versão multimodal
          if (convo.length > 0 && convo[convo.length - 1].role === 'user') {
            convo[convo.length - 1] = { role: 'user', content: blocks };
          } else {
            convo.push({ role: 'user', content: blocks });
          }
        }
      } catch (err) {
        console.warn('[Alix] Falha ao anexar documentos:', (err as Error).message);
      }
    }

    const toolsUsedAggregate: string[] = [];
    const sourcesAggregate = new Set<string>();
    const documentsAggregate: Array<Record<string, unknown>> = [];

    const result = await runClaude(convo, {
      model: CLAUDE_MODEL_SONNET,
      maxTokens: 2048,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      tools,
      toolRegistry: registry,
      maxIterations: 6,
      temperature: 0.2,
      onToolCall: (name, _input, result: any) => {
        toolsUsedAggregate.push(name);
        if (result && typeof result === 'object') {
          if (Array.isArray((result as any).sources)) {
            for (const s of (result as any).sources) sourcesAggregate.add(String(s));
          }
          // Wave 10: coleta docs gerados ou lidos para o frontend renderizar chips
          const md = (result as any).metadata;
          if (md && typeof md === 'object') {
            if (md.document && typeof md.document === 'object') {
              documentsAggregate.push({ ...(md.document as Record<string, unknown>), tool: name });
            }
            if (md.documento && typeof md.documento === 'object') {
              documentsAggregate.push({ ...(md.documento as Record<string, unknown>), tool: name });
            }
          }
          // HITL handlers devolvem `{ ok, document }` no topo (sem metadata wrapper)
          const topDoc = (result as any).document;
          if (topDoc && typeof topDoc === 'object' && typeof (topDoc as Record<string, unknown>).downloadUrl === 'string') {
            documentsAggregate.push({ ...(topDoc as Record<string, unknown>), tool: name });
          }
        }
      },
    });

    return {
      content: result.text || '[Alix sem resposta]',
      sources: Array.from(sourcesAggregate),
      toolsUsed: Array.from(new Set(toolsUsedAggregate)),
      metadata: {
        llm: true,
        model: CLAUDE_MODEL_SONNET,
        iterations: result.iterations,
        stopReason: result.stopReason,
        tokens: result.usage,
        documents: documentsAggregate.length > 0 ? documentsAggregate : undefined,
      },
    };
  }

  /**
   * Converte histórico de sessão em mensagens no formato Anthropic.
   * Ignora mensagens 'system' (o Alix usa system prompt separado) e compacta
   * metadata pra economizar contexto.
   */
  private sessionToClaudeMessages(session: ChatSession): ClaudeMessage[] {
    // Limita a últimas 20 mensagens pra não estourar contexto
    const recent = session.messages.slice(-20);
    const out: ClaudeMessage[] = [];
    for (const m of recent) {
      if (m.role === 'system') continue;
      if (!m.content || !m.content.trim()) continue;
      out.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      });
    }
    return out;
  }

  private async buildAlixSystemPrompt(clienteId?: string): Promise<string> {
    const base = this.buildAlixSystemPromptBase();
    if (!clienteId) return base;
    try {
      const mem = getAlixMemoryService();
      const rendered = await mem.render(clienteId);
      if (!rendered) return base;
      return `${base}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n**MEMÓRIA PERSISTENTE DO CLIENTE** (clienteId=${clienteId}). Use como contexto prioritário. Se decidir algo novo/relevante, atualize via tool memoria_cliente_adicionar_nota ou memoria_cliente_atualizar.\n\n${rendered}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    } catch (err) {
      console.warn('[Alix] Falha ao injetar memória do cliente:', (err as Error).message);
      return base;
    }
  }

  private buildAlixSystemPromptBase(): string {
    const hoje = new Date().toISOString().slice(0, 10);
    return `Você é a **ALIX** — Agente de Leitura e Inteligência Estratégica da ALETIS, consultoria financeira agro do Christian Kohler.

**Quem é o Christian:** sócio-fundador da ALETIS, reestrutura dívidas de produtores rurais e cooperativas (casos como Paulo Luciano / Fertiflora, Ailton / Sicoob). Atua 100% no agronegócio brasileiro.

**Data de hoje:** ${hoje}.

**Sua missão:** responder com precisão cirúrgica usando SEMPRE as ferramentas disponíveis para buscar dados reais (cotações, indicadores, clima, CRM, súmulas, MCR, financeiro interno). Nunca invente números — sempre puxe da tool.

**Regras de voz:**
- Linguagem direta, técnica, SEM floreio. Sem "claro!", "com prazer!", sem emojis salvo quando a ferramenta retornar um.
- Valores em BRL formatados (R$ 1.234,56). Datas em YYYY-MM-DD ou pt-BR.
- Sempre cite as fontes que a tool retornar.
- Se a tool falhar, diga exatamente o que falhou — não simule sucesso.
- Quando o usuário pedir análise ("o que fazer?"), cite dados + precedentes + recomendação. Ancore em súmulas STJ, MCR, ou o Plano Safra vigente.
- Respostas curtas quando possível (2-6 linhas). Use bullets quando listar 3+ itens.

**Contexto ALETIS (pano de fundo):**
- Base jurídica: ${Object.keys(SUMULAS_STJ).length} súmulas STJ, ${Object.keys(MCR_SECOES).length} seções do MCR, Plano Safra 2025/26, Proagro.
- Fontes live: BCB (Selic/IPCA/IGPM/CDI/PTAX), AwesomeAPI (câmbio), CONAB (commodities), ANP (combustível), NASA FIRMS (incêndios), Open-Meteo (clima), SICOR (crédito rural), Focus (expectativas).
- CRM interno: clientes, propostas (padrão e inteligentes de 15 seções).
- Financeiro da ALETIS: DRE mensal, DAS Simples Nacional, contas a receber/pagar, fechamento pro contador.

**Priorize:**
1. Se o usuário faz pergunta que requer dado vivo → chama a tool apropriada.
2. Se é pergunta jurídica → busca súmula/MCR/precedente.
3. Se é pergunta sobre cliente/proposta → consulta CRM.
4. Se é ambígua → faz UMA pergunta de clareza curta, não duas.

**O que NÃO fazer:**
- Não dar conselho jurídico final sem citar a base legal.
- Não prometer garantias ("vai funcionar 100%"). Diga "historicamente funciona em X% dos casos similares".
- Não expor dados sensíveis de outros clientes quando falando de um caso específico.`;
  }

  /**
   * Define todas as tools expostas ao Claude e seus handlers.
   * Handlers delegam para métodos existentes do AlixService — zero duplicação.
   */
  private buildAlixTools(ctx?: { sessionId?: string; clienteId?: string }): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    const sessionId = ctx?.sessionId ?? 'anon';
    const ctxClienteId = ctx?.clienteId;
    const specs: Array<{ spec: ClaudeTool; handler: (input: Record<string, unknown>) => any }> = [
      // ── Câmbio ─────────────────────────────────────────
      {
        spec: {
          name: 'cambio_atual',
          description: 'Retorna cotação atual de moeda(s) (USD, EUR, GBP, CNY, ARS, JPY). Se moeda omitida, retorna todas.',
          input_schema: {
            type: 'object',
            properties: {
              moeda: { type: 'string', description: 'Código da moeda (USD, EUR, etc). Omita para listar todas.' },
            },
          },
        },
        handler: (i) => this.cambioAtual(i.moeda as string | undefined),
      },
      {
        spec: {
          name: 'cambio_historico',
          description: 'Histórico diário de uma moeda nos últimos N dias. Use para comparar variação, máxima, mínima.',
          input_schema: {
            type: 'object',
            properties: {
              moeda: { type: 'string', description: 'Código da moeda (USD, EUR...)' },
              dias: { type: 'number', description: 'Quantidade de dias (1-90). Default 30.' },
            },
            required: ['moeda'],
          },
        },
        handler: (i) => this.cambioHistorico(String(i.moeda), Number(i.dias || 30)),
      },

      // ── Indicadores ────────────────────────────────────
      {
        spec: {
          name: 'indicadores_macro',
          description: 'Indicadores macro brasileiros: Selic, IPCA, IGP-M, CDI, PTAX, crédito rural. Sempre retorna o conjunto.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.todosIndicadores(),
      },
      {
        spec: {
          name: 'indicador_especifico',
          description: 'Um indicador específico do BCB: Selic, IPCA, IGP-M ou CDI.',
          input_schema: {
            type: 'object',
            properties: {
              nome: { type: 'string', enum: ['selic', 'ipca', 'igpm', 'cdi'] },
            },
            required: ['nome'],
          },
        },
        handler: (i) => {
          const n = String(i.nome).toLowerCase() as 'selic' | 'ipca' | 'igpm' | 'cdi';
          const label = { selic: 'Selic', ipca: 'IPCA', igpm: 'IGP-M', cdi: 'CDI' }[n] || n;
          return this.indicador(label, n);
        },
      },
      {
        spec: {
          name: 'expectativas_focus',
          description: 'Relatório Focus (BCB) — expectativas de mercado para Selic, IPCA, PIB, câmbio. Indicador opcional filtra um.',
          input_schema: {
            type: 'object',
            properties: { indicador: { type: 'string', description: 'ex: Selic, IPCA, PIB Total, Câmbio' } },
          },
        },
        handler: (i) => this.expectativas(i.indicador as string | undefined),
      },
      {
        spec: {
          name: 'icbr',
          description: 'ICBR (Índice Commodities Brasil) — agro, metal, energia. Publicado pelo BCB.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.icbr(),
      },
      {
        spec: {
          name: 'sicor_agregado',
          description: 'SICOR agregado — crédito rural no Brasil (últimos 12 meses). Total, contratos, top produtos, top UFs.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.sicorAgregado(),
      },
      {
        spec: {
          name: 'diesel_atual',
          description: 'Preço do diesel no Brasil (ANP) — média nacional, min, max.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.combustivel(),
      },
      {
        spec: {
          name: 'incendios_brasil',
          description: 'Focos de incêndio no Brasil (NASA FIRMS) últimas 24h por UF.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.incendios(),
      },

      // ── Commodities ────────────────────────────────────
      {
        spec: {
          name: 'commodity_preco',
          description: 'Preço CONAB semanal de um produto agro (soja, milho, cafe, algodao, trigo, arroz, feijao).',
          input_schema: {
            type: 'object',
            properties: { produto: { type: 'string', description: 'soja | milho | cafe_arabica | algodao | trigo | arroz | feijao' } },
            required: ['produto'],
          },
        },
        handler: (i) => this.commodityPreco(String(i.produto)),
      },
      {
        spec: {
          name: 'commodity_todos',
          description: 'Cotações CONAB de todos os produtos agro da semana corrente.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.commodityTodos(),
      },
      {
        spec: {
          name: 'commodity_por_uf',
          description: 'Preços de todas as commodities em um UF específico (MT, GO, PR, RS, MS...).',
          input_schema: {
            type: 'object',
            properties: { uf: { type: 'string', description: 'Sigla do estado (2 letras)' } },
            required: ['uf'],
          },
        },
        handler: (i) => this.commodityPorUF(String(i.uf).toUpperCase()),
      },

      // ── Clima ─────────────────────────────────────────
      {
        spec: {
          name: 'clima_atual',
          description: 'Condição climática atual em um município brasileiro (usa Open-Meteo + IBGE).',
          input_schema: {
            type: 'object',
            properties: { cidade: { type: 'string', description: 'Nome do município' } },
            required: ['cidade'],
          },
        },
        handler: (i) => this.climaAtual(String(i.cidade)),
      },
      {
        spec: {
          name: 'clima_previsao',
          description: 'Previsão 7 dias para um município brasileiro.',
          input_schema: {
            type: 'object',
            properties: { cidade: { type: 'string' } },
            required: ['cidade'],
          },
        },
        handler: (i) => this.climaPrevisao(String(i.cidade)),
      },

      // ── CRM ──────────────────────────────────────────
      {
        spec: {
          name: 'buscar_cliente',
          description: 'Busca cliente no CRM da ALETIS por nome, CPF, cidade. Retorna o primeiro match.',
          input_schema: {
            type: 'object',
            properties: { termo: { type: 'string', description: 'Nome, CPF ou cidade do cliente' } },
            required: ['termo'],
          },
        },
        handler: (i) => this.clienteBuscar(String(i.termo)),
      },
      {
        spec: {
          name: 'listar_clientes',
          description: 'Lista os clientes cadastrados no CRM (primeiros 10).',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.clientesListar(),
      },
      {
        spec: {
          name: 'listar_propostas',
          description: 'Lista propostas do CRM, com filtro opcional por status (ex: aprovada, pendente).',
          input_schema: {
            type: 'object',
            properties: { status: { type: 'string', description: 'Filtro opcional: aprovada, pendente, rejeitada...' } },
          },
        },
        handler: (i) => this.propostasListar(i.status as string | undefined),
      },
      {
        spec: {
          name: 'listar_propostas_inteligentes',
          description: 'Lista propostas inteligentes (15-seções) já geradas pelo sistema.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.propostasInteligentesListar(),
      },

      // ── Dossiê Agro (padrão Daycoval 2025) ───────────
      {
        spec: {
          name: 'buscar_dossie',
          description:
            'Retorna sumário estruturado do Dossiê Agro Canônico do cliente (grupo econômico, imóveis, produção, dívidas — visão geral). Aceita id do cliente, CPF/CNPJ ou nome.',
          input_schema: {
            type: 'object',
            properties: {
              clienteIdOuNome: {
                type: 'string',
                description: 'Id do cliente (ex: cli-001), CPF/CNPJ ou nome (parcial).',
              },
            },
            required: ['clienteIdOuNome'],
          },
        },
        handler: (i) => this.dossieBuscar(String(i.clienteIdOuNome)),
      },
      {
        spec: {
          name: 'dossie_producao',
          description:
            'Detalha as culturas agrícolas e pecuária do dossiê agro: UF, área plantada, rendimento, safras atual e prevista. Aceita id, CPF/CNPJ ou nome.',
          input_schema: {
            type: 'object',
            properties: {
              clienteIdOuNome: { type: 'string' },
            },
            required: ['clienteIdOuNome'],
          },
        },
        handler: (i) => this.dossieProducao(String(i.clienteIdOuNome)),
      },
      {
        spec: {
          name: 'dossie_dividas',
          description:
            'Foca na estrutura de dívidas do dossiê agro: bancárias (com instituição, taxa, vencimento), fornecedores/barter e terras. Aceita id, CPF/CNPJ ou nome.',
          input_schema: {
            type: 'object',
            properties: {
              clienteIdOuNome: { type: 'string' },
            },
            required: ['clienteIdOuNome'],
          },
        },
        handler: (i) => this.dossieDividas(String(i.clienteIdOuNome)),
      },

      // ── Base de conhecimento ──────────────────────────
      {
        spec: {
          name: 'sumula_stj',
          description: 'Consulta súmula STJ por número OU por termo (palavra-chave). Use número quando conhecer; termo para pesquisa.',
          input_schema: {
            type: 'object',
            properties: {
              numero: { type: 'number', description: 'Número da súmula (ex: 298)' },
              termo: { type: 'string', description: 'Palavra-chave (ex: "juros capitalizados")' },
            },
          },
        },
        handler: (i) => this.sumula(i.numero as number | undefined, i.termo as string | undefined),
      },
      {
        spec: {
          name: 'mcr_secao',
          description: 'Consulta seção do Manual de Crédito Rural (MCR/BCB) por número (ex: 2-6-4) ou termo.',
          input_schema: {
            type: 'object',
            properties: {
              secao: { type: 'string', description: 'Número da seção (ex: "2-6-4")' },
              termo: { type: 'string', description: 'Palavra-chave' },
            },
          },
        },
        handler: (i) => this.mcr(i.secao as string | undefined, i.termo as string | undefined),
      },
      {
        spec: {
          name: 'plano_safra',
          description: 'Linhas de crédito do Plano Safra 2025/26 por programa. Se omitido, retorna resumo geral.',
          input_schema: {
            type: 'object',
            properties: { programa: { type: 'string', enum: ['pronaf', 'pronamp', 'empresarial'] } },
          },
        },
        handler: (i) => this.planoSafra(i.programa as any),
      },
      {
        spec: {
          name: 'precedentes_busca',
          description: 'Busca precedentes do STJ/TJ por tema. Omita termo para listar todos.',
          input_schema: {
            type: 'object',
            properties: { termo: { type: 'string' } },
          },
        },
        handler: (i) => this.precedentes(i.termo as string | undefined),
      },
      {
        spec: {
          name: 'busca_conhecimento',
          description: 'Busca geral na base de conhecimento (súmulas + MCR + precedentes) por termo livre. Use quando não souber onde está a resposta.',
          input_schema: {
            type: 'object',
            properties: { termo: { type: 'string' } },
            required: ['termo'],
          },
        },
        handler: (i) => this.buscaGeral(String(i.termo)),
      },
      {
        spec: {
          name: 'proagro_regras',
          description: 'Regras do Proagro 2025/26 — cobertura, adesão, culturas cobertas.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.proagro(),
      },

      // ── Market intelligence ───────────────────────────
      {
        spec: {
          name: 'market_brief',
          description: 'Boletim executivo de mercado (câmbio + commodities + macro + clima crítico). Use para abrir o dia ou resumir condições.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.marketBrief(),
      },
      {
        spec: {
          name: 'sazonalidade',
          description: 'Padrão sazonal histórico de uma commodity (índices mensais, melhor/pior mês pra vender).',
          input_schema: {
            type: 'object',
            properties: { commodity: { type: 'string', description: 'soja | milho | boi | cafe | algodao | trigo' } },
            required: ['commodity'],
          },
        },
        handler: (i) => this.sazonalidade(String(i.commodity)),
      },
      {
        spec: {
          name: 'contratos_tipos',
          description: 'Lista os tipos de contrato que o sistema ALETIS gera (CPR financeira/física, confissão dívida, termo renegociação, acordo extrajudicial, transação excepcional).',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.contratosTipos(),
      },

      // ── Financeiro interno ALETIS ─────────────────────
      {
        spec: {
          name: 'financeiro_dashboard',
          description: 'Painel financeiro da ALETIS: receita do mês, despesas, resultado, DAS, contas a receber/pagar, RBT12.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.finDashboard(),
      },
      {
        spec: {
          name: 'financeiro_faturamento',
          description: 'Faturamento da ALETIS em uma competência (YYYY-MM). Default = mês atual.',
          input_schema: {
            type: 'object',
            properties: { competencia: { type: 'string', description: 'YYYY-MM (ex: 2026-04)' } },
          },
        },
        handler: (i) => this.finFaturamentoMes(i.competencia as string | undefined),
      },
      {
        spec: {
          name: 'financeiro_despesas',
          description: 'Despesas da ALETIS em uma competência (YYYY-MM). Default = mês atual.',
          input_schema: {
            type: 'object',
            properties: { competencia: { type: 'string' } },
          },
        },
        handler: (i) => this.finDespesasMes(i.competencia as string | undefined),
      },
      {
        spec: {
          name: 'financeiro_das_previsto',
          description: 'DAS (Simples Nacional) previsto para a competência informada. Detalha partilha, alíquota, vencimento.',
          input_schema: {
            type: 'object',
            properties: { competencia: { type: 'string' } },
          },
        },
        handler: (i) => this.finDasPrevisto(i.competencia as string | undefined),
      },
      {
        spec: {
          name: 'financeiro_inadimplencia',
          description: 'Receitas atrasadas da ALETIS — lista clientes com pagamento pendente e dias de atraso.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.finInadimplencia(),
      },
      {
        spec: {
          name: 'financeiro_fechamento',
          description: 'Checklist do fechamento mensal para envio ao contador (ALETIS). Pendências e status.',
          input_schema: {
            type: 'object',
            properties: { competencia: { type: 'string' } },
          },
        },
        handler: (i) => this.finFechamentoContador(i.competencia as string | undefined),
      },

      // ── Operacional ───────────────────────────────────
      {
        spec: {
          name: 'status_fontes',
          description: 'Status de todas as fontes de dados (BCB, CONAB, ANP, NASA...) — online/offline/degradadas.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.reportFontes(),
      },

      // ── Cálculo financeiro (biblioteca de métodos Sisbr 2.0) ──
      {
        spec: {
          name: 'simular_amortizacao',
          description:
            'Simula uma operação de crédito com os métodos Sisbr 2.0/Sicredi. Suporta SAC (pré/pós), Price (pré/pós), SAC Especial, Americano, Alemão e Misto. Retorna totais, taxa efetiva implícita e as 3 primeiras + 3 últimas parcelas.',
          input_schema: {
            type: 'object',
            properties: {
              valor: { type: 'number', description: 'Valor principal em BRL (ex: 100000)' },
              prazoMeses: { type: 'number', description: 'Número de parcelas (1..360). Para periodicidade anual, use o número de anos.' },
              taxaMensal: { type: 'number', description: 'Taxa pré-fixada ao mês em % (ex: 0.35 = 0,35% a.m.)' },
              taxaPosAnual: { type: 'number', description: 'Taxa pós-fixada ao ano em % (opcional, ex: 14.15)' },
              sistema: {
                type: 'string',
                enum: ['SAC_PRE', 'SAC_POS', 'PRICE_PRE', 'PRICE_POS', 'SAC_ESPECIAL', 'AMERICANO', 'ALEMAO', 'MISTO'],
                description: 'Sistema de amortização',
              },
              periodicidade: {
                type: 'string',
                enum: ['MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'],
                description: 'Intervalo entre parcelas (default MENSAL)',
              },
              dataInicio: { type: 'string', description: 'Data da operação (YYYY-MM-DD). Default = hoje.' },
              primeiroVencimento: { type: 'string', description: 'Primeiro vencimento (YYYY-MM-DD). Se omitido, calculado a partir da data da operação + 1 período.' },
              diaVencimento: { type: 'number', description: 'Dia do mês de vencimento (1..31). Default = dia da dataInicio.' },
              carenciaMeses: { type: 'number', description: 'Meses de carência (reservado para uso futuro).' },
            },
            required: ['valor', 'prazoMeses', 'taxaMensal', 'sistema'],
          },
        },
        handler: (i) =>
          this.calcSimularAmortizacao(
            Number(i.valor),
            Number(i.prazoMeses),
            Number(i.taxaMensal),
            String(i.sistema) as SistemaAmortizacao,
            {
              taxaPosAnual: i.taxaPosAnual !== undefined ? Number(i.taxaPosAnual) : undefined,
              periodicidade: i.periodicidade ? (String(i.periodicidade) as Periodicidade) : undefined,
              dataInicio: i.dataInicio ? String(i.dataInicio) : undefined,
              primeiroVencimento: i.primeiroVencimento ? String(i.primeiroVencimento) : undefined,
              diaVencimento: i.diaVencimento !== undefined ? Number(i.diaVencimento) : undefined,
              carenciaMeses: i.carenciaMeses !== undefined ? Number(i.carenciaMeses) : undefined,
            },
          ),
      },
      {
        spec: {
          name: 'dias_uteis_entre',
          description:
            'Quantidade de dias úteis entre duas datas (ISO YYYY-MM-DD), usando a tabela de feriados nacionais do Sisbr 2.0 (597 datas). Equivalente ao NETWORKDAYS do Excel.',
          input_schema: {
            type: 'object',
            properties: {
              dataInicio: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
              dataFim: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
            },
            required: ['dataInicio', 'dataFim'],
          },
        },
        handler: (i) => this.calcDiasUteis(String(i.dataInicio), String(i.dataFim)),
      },
      {
        spec: {
          name: 'taxa_efetiva',
          description:
            'Converte uma taxa nominal em taxa efetiva, dado o número de períodos por ano (ex: 12 = mensal). Retorna a taxa efetiva anual.',
          input_schema: {
            type: 'object',
            properties: {
              taxaNominal: { type: 'number', description: 'Taxa nominal em % (ex: 12 = 12% a.a.)' },
              periodosAno: { type: 'number', description: 'Capitalizações por ano (ex: 12, 252, 365)' },
            },
            required: ['taxaNominal', 'periodosAno'],
          },
        },
        handler: (i) => this.calcTaxaEfetiva(Number(i.taxaNominal), Number(i.periodosAno)),
      },

      // ── Plano Simples de Custeio Agrícola 2026 ──────────────
      {
        spec: {
          name: 'listar_planos_custeio',
          description:
            'Lista Planos Simples de Custeio Agrícola. Filtros opcionais por cliente, safra e status (rascunho | em_analise | aprovado | rejeitado).',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string', description: 'Filtra por id do cliente (ex: cli-001)' },
              safra: { type: 'string', description: 'Filtra pela safra (ex: "2025/26")' },
              status: {
                type: 'string',
                enum: ['rascunho', 'em_analise', 'aprovado', 'rejeitado'],
                description: 'Filtra pelo status do plano',
              },
            },
          },
        },
        handler: (i) =>
          this.custeioListar({
            clienteId: i.clienteId ? String(i.clienteId) : undefined,
            safra: i.safra ? String(i.safra) : undefined,
            status: i.status ? (String(i.status) as StatusPlanoCusteio) : undefined,
          }),
      },
      {
        spec: {
          name: 'buscar_plano_custeio',
          description:
            'Retorna os detalhes de um plano de custeio específico: proponente, safra, orçamento total, cronograma, glebas e indicadores (se calculados).',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Id do plano (ex: custeio_abc123)' },
            },
            required: ['id'],
          },
        },
        handler: (i) => this.custeioBuscar(String(i.id)),
      },
      {
        spec: {
          name: 'custeio_indicadores',
          description:
            'Calcula (ou recalcula) os indicadores financeiros do plano: VPL, TIR anual, payback, margem líquida, necessidade de capital de giro. Taxa de desconto padrão = 12% a.a.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Id do plano' },
              taxaAnual: { type: 'number', description: 'Taxa de desconto anual em % (default 12)' },
            },
            required: ['id'],
          },
        },
        handler: (i) =>
          this.custeioIndicadores(
            String(i.id),
            i.taxaAnual !== undefined ? Number(i.taxaAnual) : undefined,
          ),
      },
      {
        spec: {
          name: 'gerar_plano_custeio_pdf',
          description:
            'Gera o PDF do Plano Simples de Custeio (formato Sicredi). Retorna o link para download via /api/custeio/:id/pdf.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Id do plano' },
            },
            required: ['id'],
          },
        },
        handler: (i) => this.custeioGerarPdf(String(i.id)),
      },
      {
        spec: {
          name: 'duplicar_plano_custeio',
          description:
            'Duplica um plano de custeio existente para uma nova safra. Preserva proponente, imóveis e glebas; zera indicadores; status volta a "rascunho".',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Id do plano de origem' },
              novaSafra: { type: 'string', description: 'Safra destino (ex: "2026/27")' },
            },
            required: ['id', 'novaSafra'],
          },
        },
        handler: (i) => this.custeioDuplicar(String(i.id), String(i.novaSafra)),
      },
      {
        spec: {
          name: 'resumo_financeiro_custeio',
          description:
            'Resumo financeiro consolidado dos planos de custeio de um cliente: total solicitado, total por safra, VPL e TIR médios, distribuição por status.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string', description: 'Id do cliente (ex: cli-001)' },
            },
            required: ['clienteId'],
          },
        },
        handler: (i) => this.custeioResumoFinanceiro(String(i.clienteId)),
      },

      // ── Wave 7a — Dados externos agro 2026 ──────────────
      {
        spec: {
          name: 'consultar_desmatamento_municipio',
          description:
            'Busca alertas DETER/INPE de desmatamento para um município pelo código IBGE. Retorna alertas, área total, bloqueios CMN 5.081/2023 e fonte (api/cache/fallback). Essencial para checar compliance antes de Pronaf/Pronamp.',
          input_schema: {
            type: 'object',
            properties: {
              codigoIbge: { type: 'string', description: 'Código IBGE do município (7 dígitos, ex: "5103403").' },
              dataInicio: { type: 'string', description: 'Data ISO opcional (YYYY-MM-DD).' },
              dataFim: { type: 'string', description: 'Data ISO opcional (YYYY-MM-DD).' },
            },
            required: ['codigoIbge'],
          },
        },
        handler: (i) => this.consultarDesmatamentoMunicipio(String(i.codigoIbge), i.dataInicio as string | undefined, i.dataFim as string | undefined),
      },
      {
        spec: {
          name: 'consultar_desmatamento_nacional',
          description:
            'Retorna o resumo nacional DETER (área total, alertas por bioma, por UF e top municípios). Use para painel de overview ou para comparar a região do cliente com o quadro macro.',
          input_schema: {
            type: 'object',
            properties: {
              periodo: { type: 'string', description: 'Período (ex: "2025-01-01/2025-12-31") — opcional.' },
            },
          },
        },
        handler: (i) => this.consultarDesmatamentoNacional(i.periodo as string | undefined),
      },
      {
        spec: {
          name: 'validar_zarc_plano',
          description:
            'Valida um plano de plantio (cultura + UF + município + data + solo + ciclo) contra o ZARC safra 2025/26. Retorna se habilita Proagro/Proagro-Mais e a janela mais próxima caso fora da janela. Base: Portarias SPA/MAPA 2025.',
          input_schema: {
            type: 'object',
            properties: {
              cultura: { type: 'string', description: 'Cultura (ex: "soja", "milho", "algodao", "feijao").' },
              uf: { type: 'string', description: 'UF (ex: "MT").' },
              codigoIbge: { type: 'string', description: 'Código IBGE do município.' },
              dataPlantio: { type: 'string', description: 'Data de plantio ISO YYYY-MM-DD.' },
              tipoSolo: { type: 'string', enum: ['I', 'II', 'III'], description: 'Tipo de solo ZARC (default I).' },
              cicloVariedade: { type: 'string', enum: ['precoce', 'medio', 'tardio'], description: 'Ciclo da variedade (default medio).' },
            },
            required: ['cultura', 'uf', 'codigoIbge', 'dataPlantio'],
          },
        },
        handler: (i) => this.validarZarcPlano(
          String(i.cultura),
          String(i.uf),
          String(i.codigoIbge),
          String(i.dataPlantio),
          (i.tipoSolo as TipoSoloZarc | undefined) ?? 'I',
          (i.cicloVariedade as CicloVariedade | undefined) ?? 'medio',
        ),
      },
      {
        spec: {
          name: 'consultar_moratoria_soja',
          description:
            'Consulta o status da Moratória da Soja (ABIOVE/ANEC/GTS). Se `codigoIbge` informado, devolve também a elegibilidade do município para comercialização com tradings signatárias.',
          input_schema: {
            type: 'object',
            properties: {
              codigoIbge: { type: 'string', description: 'Código IBGE do município (opcional).' },
              dataDesmatamento: { type: 'string', description: 'Data ISO opcional de desmatamento detectado.' },
            },
          },
        },
        handler: (i) => this.consultarMoratoriaSoja(
          i.codigoIbge as string | undefined,
          i.dataDesmatamento as string | undefined,
        ),
      },

      // ── Wave 7b — Simuladores regulatórios 2026 ──────────
      {
        spec: {
          name: 'simular_reforma_tributaria',
          description:
            'Simula o impacto da Reforma Tributária (CBS + IBS, LC 214/2025) comparando sistema atual × novo para o ano informado. Aplica imunidade (LC 214/2025 art. 156-A §2º CF) para receita ≤ R$ 3.6M.',
          input_schema: {
            type: 'object',
            properties: {
              ano: { type: 'number', description: 'Ano-base da simulação (2026..2033).' },
              regime: {
                type: 'string',
                enum: [
                  'produtor_rural_pf_imune',
                  'produtor_rural_pf_normal',
                  'produtor_rural_pj_imune',
                  'produtor_rural_pj_normal',
                  'agroindustria',
                ],
                description: 'Regime tributário rural do contribuinte.',
              },
              receitaBruta: { type: 'number', description: 'Receita bruta anual (BRL).' },
              comprasInsumos: { type: 'number', description: 'Compras de insumos no ano (BRL) — base para crédito CBS/IBS.' },
            },
            required: ['ano', 'regime', 'receitaBruta', 'comprasInsumos'],
          },
        },
        handler: (i) => this.simularReformaTributaria(
          Number(i.ano),
          String(i.regime) as RegimeTributarioRural,
          Number(i.receitaBruta),
          Number(i.comprasInsumos),
        ),
      },
      {
        spec: {
          name: 'calcular_funrural',
          description:
            'Calcula o Funrural 2026 pelos dois caminhos (receita bruta × folha) e recomenda a melhor opção. Base legal: Lei 8.212/91 art. 25, Lei 10.256/2001, Lei 13.606/2018, STF Tema 916.',
          input_schema: {
            type: 'object',
            properties: {
              tipo: {
                type: 'string',
                enum: ['PF', 'PJ_empregador_rural', 'agroindustria', 'adquirente'],
                description: 'Tipo de contribuinte.',
              },
              receitaBrutaAnual: { type: 'number', description: 'Receita bruta anual de comercialização rural (BRL).' },
              folhaPagamentoAnual: { type: 'number', description: 'Folha de pagamento anual (BRL).' },
              ratMultiplicador: { type: 'number', enum: [1, 2, 3], description: 'Grau de risco (1 leve, 2 médio, 3 grave).' },
              optouFolha: { type: 'boolean', description: 'Se PF optou explicitamente por folha (default false).' },
            },
            required: ['tipo', 'receitaBrutaAnual', 'folhaPagamentoAnual', 'ratMultiplicador'],
          },
        },
        handler: (i) => this.calcularFunrural(
          String(i.tipo) as TipoContribuinte,
          Number(i.receitaBrutaAnual),
          Number(i.folhaPagamentoAnual),
          (Number(i.ratMultiplicador) as 1 | 2 | 3) || 1,
          Boolean(i.optouFolha),
        ),
      },
      {
        spec: {
          name: 'simular_desenrola_rural',
          description:
            'Simula o programa Desenrola Rural (MP 1208/2024 + Lei 14.973/2024) para dívidas PGFN/Receita Federal. Classifica faixa A-D, aplica descontos (até 100% juros + 65% multa) e devolve cronograma proposto.',
          input_schema: {
            type: 'object',
            properties: {
              dividaId: { type: 'string', description: 'Id interno da dívida (ex: "div-001").' },
              valorInscrito: { type: 'number', description: 'Valor originalmente inscrito em DA (BRL).' },
              valorAtualizado: { type: 'number', description: 'Valor atualizado com juros e multa (BRL).' },
              dataInscricao: { type: 'string', description: 'Data ISO de inscrição em DA (≤ 2023-12-31).' },
              origem: { type: 'string', enum: ['pgfn', 'receita_federal', 'banco_publico', 'banco_cooperativa', 'outro'], description: 'Origem do débito.' },
              modalidade: { type: 'string', enum: ['custeio', 'investimento', 'comercializacao', 'outra'], description: 'Modalidade da operação.' },
              tipoProdutor: { type: 'string', enum: ['PF', 'PJ'], description: 'Tipo do produtor.' },
              receitaBrutaAnual: { type: 'number', description: 'Receita bruta anual do produtor (BRL).' },
              ativosDeclarados: { type: 'number', description: 'Ativos declarados: terras, maquinário, estoque (BRL).' },
              dividasTotal: { type: 'number', description: 'Total de dívidas do produtor somando todas as fontes (BRL).' },
              faixa: { type: 'string', enum: ['A', 'B', 'C', 'D'], description: 'Faixa forçada (opcional; se omitida, classifica automaticamente).' },
            },
            required: ['dividaId', 'valorInscrito', 'valorAtualizado', 'dataInscricao', 'origem', 'modalidade', 'tipoProdutor', 'receitaBrutaAnual', 'ativosDeclarados', 'dividasTotal'],
          },
        },
        handler: (i) => this.simularDesenrolaRural(i),
      },

      // ── Wave 8a — Balanced Scorecard Agro ────────────────
      {
        spec: {
          name: 'listar_kpis_bsc',
          description:
            'Lista o catálogo de KPIs do Balanced Scorecard agro (13 indicadores em 4 perspectivas: financeira, clientes, processos_internos, aprendizado_crescimento). Pode filtrar por perspectiva.',
          input_schema: {
            type: 'object',
            properties: {
              perspectiva: {
                type: 'string',
                enum: ['financeira', 'clientes', 'processos_internos', 'aprendizado_crescimento'],
                description: 'Perspectiva opcional para filtrar.',
              },
            },
          },
        },
        handler: (i) => this.listarKpisBsc(i as { perspectiva?: PerspectivaBSC }),
      },
      {
        spec: {
          name: 'calcular_bsc',
          description:
            'Calcula o Balanced Scorecard agro a partir do contexto financeiro e operacional do produtor (receita, EBITDA, dívidas, área plantada, NPS, etc.). Devolve score geral 0-100, score por perspectiva e recomendações.',
          input_schema: {
            type: 'object',
            properties: {
              receitaBruta: { type: 'number' },
              receitaLiquida: { type: 'number' },
              custosProducao: { type: 'number' },
              despesasOperacionais: { type: 'number' },
              ebitda: { type: 'number' },
              lucroLiquido: { type: 'number' },
              ativoTotal: { type: 'number' },
              passivoCirculante: { type: 'number' },
              ativoCirculante: { type: 'number' },
              estoque: { type: 'number' },
              contasReceber: { type: 'number' },
              dividasTotal: { type: 'number' },
              patrimonioLiquido: { type: 'number' },
              investimentoCapital: { type: 'number' },
              areaPlantadaHa: { type: 'number' },
              producaoTotalTon: { type: 'number' },
              custoHectare: { type: 'number' },
              numeroColaboradores: { type: 'number' },
              horasTreinamento: { type: 'number' },
              turnoverPct: { type: 'number' },
              npsCliente: { type: 'number' },
              prazoMedioRecebimentoDias: { type: 'number' },
              percInadimplencia: { type: 'number' },
              tempoCicloProducao: { type: 'number' },
              periodo: { type: 'string', description: 'Período de referência (ex: "2026-Q1").' },
              metasOverride: {
                type: 'object',
                description: 'Overrides de meta por kpiId (ex: { roic: 0.18 }).',
              },
            },
            required: [
              'receitaBruta',
              'receitaLiquida',
              'custosProducao',
              'despesasOperacionais',
              'ebitda',
              'lucroLiquido',
              'ativoTotal',
              'passivoCirculante',
              'ativoCirculante',
              'estoque',
              'contasReceber',
              'dividasTotal',
              'patrimonioLiquido',
              'investimentoCapital',
              'areaPlantadaHa',
              'producaoTotalTon',
              'periodo',
            ],
          },
        },
        handler: (i) => this.calcularBscHandler(i as unknown as ContextoBSCCalculo),
      },

      // ── Wave 8b — RAG Knowledge Base ─────────────────────
      {
        spec: {
          name: 'buscar_documentos_rag',
          description:
            'Consulta a base de documentos PDF indexados (BM25) — apostilas BPO Financeiro, artigos sobre TIR, slides de Gestão Profissional de Fazendas, etc. Retorna os k trechos mais relevantes com score e fonte.',
          input_schema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Consulta em linguagem natural.' },
              k: { type: 'number', description: 'Número de resultados (default 5).' },
            },
            required: ['query'],
          },
        },
        handler: (i) => this.buscarDocumentosRag(i as { query: string; k?: number }),
      },

      // ── Wave 8c — SICOR Bacen OData ──────────────────────
      {
        spec: {
          name: 'consultar_sicor_resumo_uf',
          description:
            'Resumo consolidado do SICOR (Sistema de Operações do Crédito Rural do Bacen) para uma UF e ano: volume total, nº de contratos, ticket médio, quebra por modalidade (custeio/investimento/comercialização) e top 10 produtos. Dados oficiais OData OLINDA/Bacen.',
          input_schema: {
            type: 'object',
            properties: {
              uf: { type: 'string', description: 'Sigla da UF (ex: "MT", "PR", "RS").' },
              ano: { type: 'number', description: 'Ano de emissão (ex: 2025).' },
            },
            required: ['uf', 'ano'],
          },
        },
        handler: (i) => this.consultarSicorResumoUf(i as { uf: string; ano: number }),
      },
      {
        spec: {
          name: 'consultar_sicor_contratos',
          description:
            'Busca contratos agregados do SICOR por modalidade (custeio/investimento/comercialização), UF, produto e janela AAAAMM. Retorna lista de registros com nºcontratos, valor, área e programa.',
          input_schema: {
            type: 'object',
            properties: {
              modalidade: {
                type: 'string',
                enum: ['custeio', 'investimento', 'comercializacao'],
                description: 'Modalidade do crédito rural.',
              },
              uf: { type: 'string', description: 'Sigla da UF (opcional).' },
              produto: { type: 'string', description: 'Nome do produto (opcional, ex: "SOJA").' },
              anoMesInicial: { type: 'string', description: 'Início AAAAMM (ex: "202501").' },
              anoMesFinal: { type: 'string', description: 'Fim AAAAMM (ex: "202512").' },
              top: { type: 'number', description: 'Limite de registros (default 100, máx 5000).' },
            },
            required: ['modalidade'],
          },
        },
        handler: (i) =>
          this.consultarSicorContratos(
            i as {
              modalidade: ModalidadeSicor;
              uf?: string;
              produto?: string;
              anoMesInicial?: string;
              anoMesFinal?: string;
              top?: number;
            },
          ),
      },

      // ── Executor tools (HITL) ────────────────────────────
      // Mutation-capable tools. NENHUMA delas grava/altera estado
      // diretamente — todas registram um intent no
      // AlixConfirmationStore e retornam um payload `pendingConfirmation`.
      // A execução real só ocorre em
      // POST /api/alix/confirmations/:id/approve.
      {
        spec: {
          name: 'criar_plano_custeio',
          description:
            'Cria um RASCUNHO de plano de custeio agrícola. Não grava imediatamente: registra intent e aguarda aprovação humana. Use para novos projetos/safras.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string', description: 'Id do cliente (ex: cli-001).' },
              safra: { type: 'string', description: 'Safra (ex: "2025/26").' },
              proponente: {
                type: 'object',
                description: 'Dados do proponente: { nome, tipo ("PF"|"PJ"), cpfCnpj, email?, telefone1?, grupo? }',
              },
              orcamento: {
                type: 'array',
                description: 'Itens de orçamento (opcional) — objetos com { descricao, quantidade, valorUnitario, valorTotal, ... }.',
              },
              glebas: {
                type: 'array',
                description: 'Glebas (opcional) — objetos com { id, nome, areaHa, ... }.',
              },
              observacoes: { type: 'string', description: 'Observações livres (opcional).' },
            },
            required: ['clienteId', 'safra', 'proponente'],
          },
        },
        handler: (i) => this.handle_criar_plano_custeio(i),
      },
      {
        spec: {
          name: 'atualizar_plano_custeio',
          description:
            'Atualiza parcialmente (PATCH) um plano de custeio existente. Não grava imediatamente: registra intent e aguarda aprovação.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Id do plano a atualizar (ex: custeio_abc123).' },
              patch: {
                type: 'object',
                description: 'Subconjunto dos campos do plano (proponente, projeto, orcamento, cronograma, status, observacoes, ...).',
              },
            },
            required: ['id', 'patch'],
          },
        },
        handler: (i) => this.handle_atualizar_plano_custeio(i),
      },
      {
        spec: {
          name: 'duplicar_e_ajustar_custeio',
          description:
            'Duplica um plano de custeio para uma nova safra e ajusta o orçamento em um percentual (ex: +15% para reajuste de insumos). HITL.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Id do plano de origem.' },
              novaSafra: { type: 'string', description: 'Safra destino (ex: "2026/27").' },
              ajustePercentual: {
                type: 'number',
                description: 'Ajuste a aplicar ao orçamento (ex: 15 = +15%, -5 = -5%). Default 0.',
              },
            },
            required: ['id', 'novaSafra'],
          },
        },
        handler: (i) => this.handle_duplicar_e_ajustar_custeio(i),
      },
      {
        spec: {
          name: 'criar_evento_cliente',
          description:
            'Registra uma entrada na TIMELINE do cliente (reunião realizada, contato por telefone, decisão tomada, etc.). HITL antes de gravar.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string', description: 'Id do cliente.' },
              tipo: { type: 'string', description: 'Tipo do evento (ex: "reuniao", "ligacao", "decisao", "nota").' },
              titulo: { type: 'string', description: 'Título curto do evento.' },
              descricao: { type: 'string', description: 'Descrição detalhada.' },
            },
            required: ['clienteId', 'tipo', 'titulo'],
          },
        },
        handler: (i) => this.handle_criar_evento_cliente(i),
      },
      {
        spec: {
          name: 'criar_tarefa',
          description:
            'Cria uma TAREFA / follow-up vinculada a um cliente. Ex: "preparar proposta até sexta". HITL antes de gravar.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string', description: 'Id do cliente.' },
              titulo: { type: 'string', description: 'Título da tarefa.' },
              prazo: { type: 'string', description: 'Prazo no formato YYYY-MM-DD (opcional).' },
              prioridade: {
                type: 'string',
                description: 'Prioridade: "baixa" | "media" | "alta" (opcional, default "media").',
              },
            },
            required: ['clienteId', 'titulo'],
          },
        },
        handler: (i) => this.handle_criar_tarefa(i),
      },
      {
        spec: {
          name: 'agendar_reuniao',
          description:
            'Agenda uma REUNIÃO com um cliente. Grava no histórico de agendamentos. HITL antes de gravar.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string', description: 'Id do cliente.' },
              data: { type: 'string', description: 'Data/hora ISO (ex: 2026-04-25T14:00:00).' },
              duracaoMin: { type: 'number', description: 'Duração em minutos.' },
              assunto: { type: 'string', description: 'Assunto / pauta.' },
            },
            required: ['clienteId', 'data', 'assunto'],
          },
        },
        handler: (i) => this.handle_agendar_reuniao(i),
      },
      {
        spec: {
          name: 'enviar_mensagem_whatsapp_intent',
          description:
            'PREPARA uma mensagem de WhatsApp para o cliente. IMPORTANTE: NÃO dispara a mensagem — apenas registra na fila de envio manual. HITL obrigatório.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string', description: 'Id do cliente destinatário.' },
              telefone: { type: 'string', description: 'Telefone com DDI/DDD (ex: 5534999998888).' },
              mensagem: { type: 'string', description: 'Texto da mensagem.' },
            },
            required: ['clienteId', 'telefone', 'mensagem'],
          },
        },
        handler: (i) => this.handle_enviar_mensagem_whatsapp_intent(i),
      },
      {
        spec: {
          name: 'gerar_proposta_renegociacao_intent',
          description:
            'Registra INTENT de geração de proposta de renegociação de dívidas (não gera a proposta final — só enfileira). HITL obrigatório.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string', description: 'Id do cliente.' },
              dividaIds: {
                type: 'array',
                description: 'Lista de ids de dívidas a incluir na proposta.',
              },
              parametros: {
                type: 'object',
                description: 'Parâmetros livres (prazo, carência, taxa-alvo, estratégia, etc.).',
              },
            },
            required: ['clienteId', 'dividaIds'],
          },
        },
        handler: (i) => this.handle_gerar_proposta_renegociacao_intent(i),
      },

      // ══════════════════════════════════════════════════════════
      // ── Wave 9 — Intake (leitura de documentos enviados) ──────
      // ══════════════════════════════════════════════════════════
      {
        spec: {
          name: 'listar_documentos_sessao',
          description:
            'Lista documentos que o usuário anexou nesta sessão (PDFs, planilhas, imagens, Word, CSV, TXT). Use SEMPRE que o usuário mencionar "o arquivo", "o documento", "a planilha", "a foto" etc.',
          input_schema: { type: 'object', properties: {} },
        },
        handler: () => this.tool_listar_documentos_sessao(sessionId),
      },
      {
        spec: {
          name: 'ler_documento_sessao',
          description:
            'Retorna o texto extraído de um documento anexado (ou previews tabulares no caso de planilhas). Use após listar_documentos_sessao ou quando o usuário indicar um id. Retorna até 50k caracteres.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'ID do documento (uuid) retornado por listar_documentos_sessao ou upload.' },
            },
            required: ['id'],
          },
        },
        handler: (i) => this.tool_ler_documento_sessao(sessionId, String(i.id)),
      },

      // ══════════════════════════════════════════════════════════
      // ── Wave 9 — Geradores REAIS (PDF/DOCX/XLSX) ──────────────
      // ══════════════════════════════════════════════════════════
      {
        spec: {
          name: 'gerar_proposta_reestruturacao',
          description:
            'Gera PDF REAL de proposta de reestruturação de dívida (layout corporativo ALETIS, cronograma Price com carência). Retorna downloadUrl para envio imediato.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string' },
              clienteNome: { type: 'string' },
              credorNome: { type: 'string' },
              dividaAtualBRL: { type: 'number', description: 'Saldo devedor atual em R$.' },
              parcelasMeses: { type: 'number', description: 'Número de parcelas após a carência.' },
              taxaMensalPct: { type: 'number', description: 'Taxa de juros mensal em % (ex: 0.85 para 0,85% a.m.).' },
              carenciaMeses: { type: 'number', description: 'Meses só de juros antes das parcelas regulares.' },
              observacoes: { type: 'string' },
              consultor: { type: 'string' },
            },
            required: ['clienteId', 'clienteNome', 'credorNome', 'dividaAtualBRL', 'parcelasMeses', 'taxaMensalPct', 'carenciaMeses'],
          },
        },
        handler: (i) => this.tool_gerar_proposta_reestruturacao(i),
      },
      {
        spec: {
          name: 'gerar_parecer_tecnico',
          description: 'Gera PDF REAL de parecer técnico (diagnóstico + viabilidade + recomendação + anexos).',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string' },
              clienteNome: { type: 'string' },
              assunto: { type: 'string' },
              diagnostico: { type: 'string' },
              viabilidade: { type: 'string' },
              recomendacao: { type: 'string' },
              anexos: { type: 'array', description: 'Lista textual de anexos (strings).' },
              consultor: { type: 'string' },
            },
            required: ['clienteId', 'clienteNome', 'assunto', 'diagnostico', 'viabilidade', 'recomendacao'],
          },
        },
        handler: (i) => this.tool_gerar_parecer_tecnico(i),
      },
      {
        spec: {
          name: 'gerar_relatorio_bsc',
          description: 'Gera PDF REAL de relatório BSC Kaplan-Norton (4 perspectivas com KPIs e semáforo verde/amarelo/vermelho).',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string' },
              clienteNome: { type: 'string' },
              periodo: { type: 'string', description: 'Ex: "safra 2025/26" ou "2026-Q1".' },
              perspectivas: {
                type: 'array',
                description: 'Array de 4 perspectivas (Financeira, Cliente, Processos, Aprendizado) cada uma com kpis[].',
              },
              observacoes: { type: 'string' },
              consultor: { type: 'string' },
            },
            required: ['clienteId', 'clienteNome', 'periodo', 'perspectivas'],
          },
        },
        handler: (i) => this.tool_gerar_relatorio_bsc(i),
      },
      {
        spec: {
          name: 'gerar_fluxo_caixa_xlsx',
          description: 'Gera PLANILHA XLSX REAL de fluxo de caixa 12 meses (receita produção, custo operacional, parcela crédito, saldo, saldo acumulado).',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string' },
              clienteNome: { type: 'string' },
              periodoReferencia: { type: 'string', description: 'Ex: "Safra 2025/26".' },
              meses: {
                type: 'array',
                description: 'Array de 12 meses com receitaProducao, custoOperacional, parcelaCredito.',
              },
              observacoes: { type: 'string' },
            },
            required: ['clienteId', 'clienteNome', 'periodoReferencia', 'meses'],
          },
        },
        handler: (i) => this.tool_gerar_fluxo_caixa_xlsx(i),
      },
      {
        spec: {
          name: 'gerar_memoria_calculo_docx',
          description: 'Gera DOCX REAL (Word editável) de memória de cálculo com premissas, itens de cálculo e conclusão.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string' },
              clienteNome: { type: 'string' },
              titulo: { type: 'string' },
              premissas: { type: 'array', description: 'Lista de strings com as premissas utilizadas.' },
              itens: {
                type: 'array',
                description: 'Lista de { titulo, descricao, formula?, resultado? }.',
              },
              conclusao: { type: 'string' },
              consultor: { type: 'string' },
            },
            required: ['clienteId', 'clienteNome', 'titulo', 'premissas', 'itens'],
          },
        },
        handler: (i) => this.tool_gerar_memoria_calculo_docx(i),
      },

      // ══════════════════════════════════════════════════════════
      // ── Wave 9 — Memória por cliente + Briefing proativo ──────
      // ══════════════════════════════════════════════════════════
      {
        spec: {
          name: 'memoria_cliente_ler',
          description: 'Lê a memória persistente de um cliente (perfil, dívidas, decisões, próximas ações, alertas, histórico).',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string', description: 'Se omitido, usa o clienteId desta sessão.' },
            },
          },
        },
        handler: (i) => this.tool_memoria_cliente_ler(String(i.clienteId || ctxClienteId || '')),
      },
      {
        spec: {
          name: 'memoria_cliente_atualizar',
          description:
            'Atualiza a memória do cliente fazendo MERGE por append (não sobrescreve). Envie apenas os campos que quer acrescentar.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string' },
              clienteNome: { type: 'string' },
              perfil: { type: 'array' },
              dividasAtivas: { type: 'array' },
              decisoes: { type: 'array' },
              proximasAcoes: { type: 'array' },
              alertas: { type: 'array' },
            },
          },
        },
        handler: (i) => this.tool_memoria_cliente_atualizar(i, ctxClienteId),
      },
      {
        spec: {
          name: 'memoria_cliente_adicionar_nota',
          description: 'Atalho para acrescentar uma nota rápida em uma seção específica da memória.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string' },
              secao: { type: 'string', enum: ['proximas-acoes', 'alertas', 'historico', 'decisoes'] },
              texto: { type: 'string' },
            },
            required: ['secao', 'texto'],
          },
        },
        handler: (i) => this.tool_memoria_cliente_adicionar_nota(i, ctxClienteId),
      },
      {
        spec: {
          name: 'briefing_cliente',
          description:
            'Gera briefing proativo DETERMINÍSTICO (sem LLM) de um cliente: resumo executivo, destaques, dívidas, BSC, próximas ações, sugestão de primeira ação.',
          input_schema: {
            type: 'object',
            properties: {
              clienteId: { type: 'string' },
            },
          },
        },
        handler: (i) => this.tool_briefing_cliente(String(i.clienteId || ctxClienteId || '')),
      },
    ];

    // ── Alix Insano F1 — tools de prospecção ────────────
    const prospeccaoKit = buildProspeccaoTools();
    for (const t of prospeccaoKit.tools) {
      specs.push({
        spec: t,
        handler: prospeccaoKit.registry[t.name].handler as any,
      });
    }

    // ── Alix Insano F2 — web_search + fetch_url + scrapers ──
    if (this.webSearchProvider) {
      const provider = this.webSearchProvider;
      const nativeTool = provider.asClaudeTool();
      if (nativeTool) {
        specs.push({
          spec: nativeTool,
          handler: async (input) => {
            // Para TavilyWebSearch, o handler é chamado com { query, ... }.
            // Para ClaudeNativeWebSearch, o LLM executa — o handler é stub.
            if (provider.name === 'tavily') {
              return provider.search(String(input.query || ''), input as any);
            }
            return { note: 'web_search nativa é executada pelo LLM (Claude)' };
          },
        });
      }
    }
    const webToolkits = [buildFetchUrlTool(), buildCnpjTool(), buildCvmTool(), buildJusbrasilTool()];
    for (const kit of webToolkits) {
      for (const t of kit.tools) {
        specs.push({ spec: t, handler: kit.registry[t.name].handler as any });
      }
    }

    const tools: ClaudeTool[] = specs.map((s) => s.spec);
    const registry: ClaudeToolRegistry = {};
    for (const s of specs) {
      registry[s.spec.name] = {
        spec: s.spec,
        handler: async (input) => {
          const r = await Promise.resolve(s.handler(input));
          return r ?? { content: 'Tool retornou vazio', sources: [], toolsUsed: [] };
        },
      };
    }
    return { tools, registry };
  }

  // ── Cálculo financeiro (financial-calc) ───────────────

  private calcSimularAmortizacao(
    valor: number,
    prazoMeses: number,
    taxaMensalPct: number,
    sistema: SistemaAmortizacao,
    opts: {
      taxaPosAnual?: number;
      periodicidade?: Periodicidade;
      dataInicio?: string;
      primeiroVencimento?: string;
      diaVencimento?: number;
      carenciaMeses?: number;
    } = {},
  ): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      if (!Number.isFinite(valor) || valor <= 0) throw new Error('valor inválido');
      if (!Number.isFinite(prazoMeses) || prazoMeses <= 0) throw new Error('prazoMeses inválido');
      if (!Number.isFinite(taxaMensalPct)) throw new Error('taxaMensal inválida');

      const hoje = new Date().toISOString().slice(0, 10);
      const dataInicio = opts.dataInicio || hoje;
      const diaVenc = opts.diaVencimento ?? (Number(dataInicio.slice(8, 10)) || 15);
      const periodicidade = opts.periodicidade || 'MENSAL';

      const params: ParametrosOperacao = {
        valor,
        dataOperacao: dataInicio,
        numeroParcelas: prazoMeses,
        periodicidade,
        taxaMensal: taxaMensalPct / 100,
        taxaPosAnual:
          opts.taxaPosAnual !== undefined && Number.isFinite(opts.taxaPosAnual)
            ? opts.taxaPosAnual / 100
            : undefined,
        diaVencimento: diaVenc,
        primeiroVencimento: opts.primeiroVencimento,
        sistema,
        carenciaMeses: opts.carenciaMeses,
      };

      const r = simularAmortizacaoCalc(params);
      const ind = r.indicadores;
      const primeiras = r.tabela.slice(0, 3);
      const ultimas = r.tabela.slice(-3);

      const fmtLinha = (l: typeof r.tabela[number]) =>
        `  ${String(l.parcela).padStart(3)} | ${l.data} | ${fmtBRL(l.pagamento)} | amort ${fmtBRL(
          l.amortizacao,
        )} | juros ${fmtBRL(l.jurosPre + l.jurosPos)} | saldo ${fmtBRL(l.saldoFinal)}`;

      let content = `**Simulação ${sistema}** — ${fmtBRL(valor)} em ${prazoMeses} parcela(s) ${periodicidade.toLowerCase()}\n\n`;
      content += `• Taxa pré: ${fmtNum(taxaMensalPct, 4)}% a.m.\n`;
      if (params.taxaPosAnual) content += `• Taxa pós: ${fmtNum(params.taxaPosAnual * 100, 2)}% a.a.\n`;
      content += `• Total pago: **${fmtBRL(ind.totalPago)}**\n`;
      content += `• Total juros: ${fmtBRL(ind.totalJuros)} (pré ${fmtBRL(ind.totalJurosPre)} + pós ${fmtBRL(ind.totalJurosPos)})\n`;
      content += `• Taxa efetiva implícita: ${fmtNum(ind.taxaEfetivaMensal * 100, 4)}% a.m. (${fmtNum(
        ind.taxaEfetivaAnual * 100,
        2,
      )}% a.a.)\n`;
      content += `• Duração: ${fmtNum(ind.duracao, 2)} meses | Prazo médio: ${fmtNum(ind.prazoMedio, 2)} meses\n\n`;
      content += `**Primeiras parcelas:**\n\`\`\`\n`;
      content += primeiras.map(fmtLinha).join('\n') + '\n';
      content += `\`\`\`\n`;
      if (r.tabela.length > 6) {
        content += `**Últimas parcelas:**\n\`\`\`\n`;
        content += ultimas.map(fmtLinha).join('\n') + '\n';
        content += `\`\`\`\n`;
      }
      return {
        content,
        sources: ['@aletis/financial-calc', 'Planilha MÉTODOS DE CÁLCULO.xlsm (Sisbr 2.0)'],
        toolsUsed: ['financial-calc.simular'],
      };
    } catch (err) {
      return {
        content: `Não consegui simular (${(err as Error).message}). Confira os parâmetros.`,
        sources: [],
        toolsUsed: [],
      };
    }
  }

  private calcDiasUteis(
    dataInicio: string,
    dataFim: string,
  ): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const n = networkDays(dataInicio, dataFim, FERIADOS_NACIONAIS);
      const absN = Math.abs(n);
      return {
        content: `Entre **${dataInicio}** e **${dataFim}** há **${absN} dia(s) útil(eis)** ${n < 0 ? '(intervalo invertido)' : ''}.\n\n_Calculado sobre tabela de 597 feriados nacionais Sisbr 2.0 (NETWORKDAYS)._`,
        sources: ['@aletis/financial-calc', 'FERIADOS_NACIONAIS (Sisbr 2.0)'],
        toolsUsed: ['financial-calc.networkDays'],
      };
    } catch (err) {
      return {
        content: `Não foi possível calcular dias úteis (${(err as Error).message}).`,
        sources: [],
        toolsUsed: [],
      };
    }
  }

  private calcTaxaEfetiva(
    taxaNominalPct: number,
    periodosAno: number,
  ): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const efetiva = taxaNominalParaEfetiva(taxaNominalPct, periodosAno);
      return {
        content:
          `**Taxa nominal** ${fmtNum(taxaNominalPct, 4)}% capitalizada ${periodosAno}x/ano` +
          `\n→ **Taxa efetiva anual**: ${fmtNum(efetiva, 4)}%\n\n` +
          `_Spread efetivo-nominal: ${fmtNum(efetiva - taxaNominalPct, 4)} p.p._`,
        sources: ['@aletis/financial-calc'],
        toolsUsed: ['financial-calc.taxaNominalParaEfetiva'],
      };
    } catch (err) {
      return {
        content: `Não foi possível converter a taxa (${(err as Error).message}).`,
        sources: [],
        toolsUsed: [],
      };
    }
  }

  // ── Plano Simples de Custeio Agrícola 2026 ──────────────

  private fmtPlanoLinha(p: PlanoCusteio): string {
    const total = p.orcamento.reduce((acc, it) => acc + (it.valorTotal || 0), 0);
    const tir = p.resultadoEsperado?.tirAnual;
    const extras: string[] = [];
    if (tir !== undefined) extras.push(`TIR ${fmtNum(tir, 2)}% a.a.`);
    const sufixo = extras.length ? ` — ${extras.join(' · ')}` : '';
    return `• **${p.id}** (${p.safra}) — ${p.proponente?.nome || '?'} — ${p.status} — ${fmtBRL(total)}${sufixo}`;
  }

  private custeioListar(filtros: PlanoCusteioListFilters): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const service = getCusteioService();
      const lista = service.listar(filtros);
      if (lista.length === 0) {
        return {
          content: 'Nenhum plano de custeio encontrado com esses filtros.',
          sources: ['/api/custeio'],
          toolsUsed: ['custeio.listar'],
        };
      }
      const linhas: string[] = [
        `**${lista.length} plano(s) de custeio encontrado(s):**`,
        '',
        ...lista.slice(0, 20).map((p) => this.fmtPlanoLinha(p)),
      ];
      if (lista.length > 20) linhas.push(`_…e mais ${lista.length - 20} plano(s)_`);
      return {
        content: linhas.join('\n'),
        sources: ['/api/custeio'],
        toolsUsed: ['custeio.listar'],
      };
    } catch (err) {
      return { content: `Falha ao listar planos (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private custeioBuscar(id: string): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const plano = getCusteioService().buscar(id);
      if (!plano) {
        return {
          content: `Plano "${id}" não encontrado.`,
          sources: ['/api/custeio/:id'],
          toolsUsed: ['custeio.buscar'],
        };
      }
      const custoTotal = plano.orcamento.reduce((acc, it) => acc + (it.valorTotal || 0), 0);
      const areaTotal = plano.glebas.reduce((acc, g) => acc + (g.areaHa || 0), 0);
      const linhas: string[] = [
        `**Plano Custeio ${plano.id}** (v${plano.versao} — ${plano.status})`,
        '',
        `• **Proponente:** ${plano.proponente?.nome || '?'} (${plano.proponente?.tipo || '?'} ${plano.proponente?.cpfCnpj || ''})`,
        `• **Safra:** ${plano.safra} — ciclo ${plano.projeto?.ciclo || '?'}`,
        `• **Imóveis:** ${plano.imoveis.length} — **Glebas:** ${plano.glebas.length} (${fmtNum(areaTotal, 2)} ha)`,
        `• **Orçamento:** ${plano.orcamento.length} itens — ${fmtBRL(custoTotal)}`,
        `• **Cronograma:** ${plano.cronograma.length} parcela(s) de desembolso`,
      ];
      if (plano.projeto?.valorSolicitado) linhas.push(`• **Valor solicitado:** ${fmtBRL(plano.projeto.valorSolicitado)}`);
      if (plano.projeto?.valorContrapartida) linhas.push(`• **Contrapartida:** ${fmtBRL(plano.projeto.valorContrapartida)}`);
      if (plano.resultadoEsperado) {
        const ind = plano.resultadoEsperado;
        linhas.push(
          '',
          '**Indicadores:**',
          `• VPL: ${fmtBRL(ind.vpl)} — TIR: ${fmtNum(ind.tirAnual, 2)}% a.a.`,
          `• Payback: ${ind.paybackMeses} mês(es) — Margem líquida: ${fmtNum(ind.margemLiquida * 100, 2)}%`,
          `• Necessidade de K: ${fmtBRL(ind.necessidadeCapitalGiro)}`,
        );
      } else {
        linhas.push('', '_Indicadores ainda não calculados — use `custeio_indicadores` para gerar._');
      }
      if (plano.observacoes) linhas.push('', `**Observações:** ${plano.observacoes}`);
      return {
        content: linhas.join('\n'),
        sources: [`/api/custeio/${plano.id}`],
        toolsUsed: ['custeio.buscar'],
      };
    } catch (err) {
      return { content: `Falha ao buscar plano (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private custeioIndicadores(id: string, taxaAnual?: number): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const service = getCusteioService();
      const plano = service.calcularESalvar(id, taxaAnual !== undefined ? { taxaAnual } : {});
      if (!plano || !plano.resultadoEsperado) {
        return {
          content: `Plano "${id}" não encontrado ou sem dados suficientes para calcular indicadores.`,
          sources: ['/api/custeio/:id/indicadores'],
          toolsUsed: ['custeio.calcularIndicadores'],
        };
      }
      const ind = plano.resultadoEsperado;
      const linhas: string[] = [
        `**Indicadores — Plano ${plano.id}** (safra ${plano.safra})`,
        '',
        `• **VPL:** ${fmtBRL(ind.vpl)} @ taxa desc. ${fmtNum(ind.taxaDescontoAnual, 2)}% a.a.`,
        `• **TIR anual:** ${fmtNum(ind.tirAnual, 2)}%`,
        `• **Payback:** ${ind.paybackMeses} mês(es)`,
        `• **Margem líquida:** ${fmtNum(ind.margemLiquida * 100, 2)}%`,
        `• **Receita bruta projetada:** ${fmtBRL(ind.receitaBrutaTotal)}`,
        `• **Custo total:** ${fmtBRL(ind.custoTotal)}`,
        `• **Necessidade de capital de giro:** ${fmtBRL(ind.necessidadeCapitalGiro)}`,
      ];
      if (ind.avisos?.length) {
        linhas.push('', '**Avisos:**');
        for (const a of ind.avisos) linhas.push(`• ${a}`);
      }
      return {
        content: linhas.join('\n'),
        sources: [`/api/custeio/${plano.id}`],
        toolsUsed: ['custeio.calcularIndicadores'],
      };
    } catch (err) {
      return { content: `Falha no cálculo (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private custeioGerarPdf(id: string): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const plano = getCusteioService().buscar(id);
      if (!plano) {
        return {
          content: `Plano "${id}" não encontrado — não é possível gerar PDF.`,
          sources: [],
          toolsUsed: ['custeio.pdf'],
        };
      }
      const url = `/api/custeio/${plano.id}/pdf`;
      const filename = `plano-custeio-${plano.id}-${plano.safra.replace(/\//g, '-')}.pdf`;
      return {
        content:
          `PDF do plano **${plano.id}** (safra ${plano.safra}) pronto para download.\n\n` +
          `• **Link:** ${url}\n` +
          `• **Arquivo:** \`${filename}\`\n\n` +
          `_O PDF é gerado sob demanda no servidor (pdf-lib). Abra o link para baixar._`,
        sources: [url],
        toolsUsed: ['custeio.pdf'],
      };
    } catch (err) {
      return { content: `Falha ao preparar PDF (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private custeioDuplicar(id: string, novaSafra: string): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const novo = getCusteioService().duplicar(id, novaSafra);
      if (!novo) {
        return {
          content: `Plano "${id}" não encontrado — nada a duplicar.`,
          sources: [],
          toolsUsed: ['custeio.duplicar'],
        };
      }
      return {
        content:
          `Plano duplicado com sucesso.\n\n` +
          `• **Origem:** ${id}\n` +
          `• **Novo plano:** ${novo.id} (v${novo.versao}, safra ${novo.safra}, status ${novo.status})\n` +
          `• **Proponente/imóveis/glebas preservados** — orçamento e cronograma prontos para ajuste.`,
        sources: [`/api/custeio/${novo.id}`],
        toolsUsed: ['custeio.duplicar'],
      };
    } catch (err) {
      return { content: `Falha ao duplicar plano (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private custeioResumoFinanceiro(clienteId: string): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const lista = getCusteioService().listarPorCliente(clienteId);
      if (lista.length === 0) {
        return {
          content: `Cliente **${clienteId}** não tem planos de custeio cadastrados.`,
          sources: [`/api/custeio?clienteId=${clienteId}`],
          toolsUsed: ['custeio.resumo'],
        };
      }
      let totalSolicitado = 0;
      let totalOrcamento = 0;
      const porSafra = new Map<string, { count: number; total: number }>();
      const porStatus = new Map<string, number>();
      const tirs: number[] = [];
      const vpls: number[] = [];
      for (const p of lista) {
        totalSolicitado += p.projeto?.valorSolicitado || 0;
        const orc = p.orcamento.reduce((acc, it) => acc + (it.valorTotal || 0), 0);
        totalOrcamento += orc;
        const bucket = porSafra.get(p.safra) || { count: 0, total: 0 };
        bucket.count += 1;
        bucket.total += orc;
        porSafra.set(p.safra, bucket);
        porStatus.set(p.status, (porStatus.get(p.status) || 0) + 1);
        if (p.resultadoEsperado) {
          tirs.push(p.resultadoEsperado.tirAnual);
          vpls.push(p.resultadoEsperado.vpl);
        }
      }
      const tirMedia = tirs.length ? tirs.reduce((a, b) => a + b, 0) / tirs.length : 0;
      const vplMedio = vpls.length ? vpls.reduce((a, b) => a + b, 0) / vpls.length : 0;

      const linhas: string[] = [
        `**Resumo de Custeio — cliente ${clienteId}**`,
        '',
        `• **Planos:** ${lista.length}`,
        `• **Valor solicitado (total):** ${fmtBRL(totalSolicitado)}`,
        `• **Orçamento total (consolidado):** ${fmtBRL(totalOrcamento)}`,
      ];
      if (tirs.length > 0) linhas.push(`• **TIR média:** ${fmtNum(tirMedia, 2)}% a.a. (em ${tirs.length} plano(s) calculados)`);
      if (vpls.length > 0) linhas.push(`• **VPL médio:** ${fmtBRL(vplMedio)}`);

      linhas.push('', '**Por safra:**');
      for (const [safra, b] of porSafra) linhas.push(`• ${safra} — ${b.count} plano(s) — ${fmtBRL(b.total)}`);

      linhas.push('', '**Por status:**');
      for (const [status, n] of porStatus) linhas.push(`• ${status}: ${n}`);

      return {
        content: linhas.join('\n'),
        sources: [`/api/custeio?clienteId=${clienteId}`],
        toolsUsed: ['custeio.resumo'],
      };
    } catch (err) {
      return { content: `Falha ao montar resumo (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  // ── Wave 7a — Dados externos agro 2026 ──────────────────

  private async consultarDesmatamentoMunicipio(
    codigoIbge: string,
    dataInicio?: string,
    dataFim?: string,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const svc = this.dsm.getDeterService();
      const r = await svc.buscarAlertasPorMunicipio(codigoIbge, dataInicio, dataFim);
      const linhas = [
        `**Desmatamento — município IBGE ${codigoIbge}** (fonte: ${r.fonte})`,
        '',
        `• **Alertas:** ${r.total}`,
        `• **Área total:** ${fmtNum(r.areaTotalHa, 2)} ha`,
        `• **Atualizado:** ${r.atualizadoEm}`,
      ];
      if (r.bloqueios.length) {
        linhas.push('', '**Bloqueios/compliance:**');
        for (const b of r.bloqueios) linhas.push(`• ${b}`);
      }
      if (r.alertas.length) {
        linhas.push('', `**Últimos alertas (até 5):**`);
        for (const a of r.alertas.slice(0, 5)) {
          linhas.push(`• ${a.dataDeteccao} — ${a.classe} — ${fmtNum(a.areaHa, 2)} ha — ${a.bioma} — ${a.fonte}`);
        }
      }
      return {
        content: linhas.join('\n'),
        sources: [`/api/desmatamento/municipio/${codigoIbge}`],
        toolsUsed: ['deter.municipio'],
      };
    } catch (err) {
      return { content: `Falha ao consultar DETER (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async consultarDesmatamentoNacional(
    periodo?: string,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const svc = this.dsm.getDeterService();
      const r = await svc.resumoNacional(periodo);
      const linhas = [
        `**Desmatamento — panorama nacional** (período ${r.periodo}, fonte ${r.fonte})`,
        '',
        `• **Alertas totais:** ${r.totalAlertas}`,
        `• **Área total:** ${fmtNum(r.areaTotalHa, 2)} ha`,
        `• **Atualizado:** ${r.atualizadoEm}`,
        '',
        '**Por bioma:**',
      ];
      for (const b of r.porBioma) linhas.push(`• ${b.bioma}: ${fmtNum(b.areaHa, 2)} ha — ${b.alertas} alerta(s)`);
      linhas.push('', '**Top municípios:**');
      for (const m of r.topMunicipios.slice(0, 5)) {
        linhas.push(`• ${m.municipio}/${m.uf} (IBGE ${m.codigoIbge}): ${fmtNum(m.areaHa, 2)} ha`);
      }
      return {
        content: linhas.join('\n'),
        sources: ['/api/desmatamento/nacional'],
        toolsUsed: ['deter.nacional'],
      };
    } catch (err) {
      return { content: `Falha ao consultar resumo DETER (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async validarZarcPlano(
    cultura: string,
    uf: string,
    codigoIbge: string,
    dataPlantio: string,
    solo: TipoSoloZarc,
    ciclo: CicloVariedade,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const svc = this.dsm.getZarcService();
      const r = await svc.validarPlano(cultura, uf, codigoIbge, dataPlantio, solo, ciclo);
      const linhas = [
        `**Validação ZARC — ${cultura} / ${uf.toUpperCase()}**`,
        '',
        `• **Status:** ${r.valido ? 'VÁLIDO' : 'FORA DA JANELA'}`,
        `• **Decêndio de plantio:** ${r.decendio}`,
        `• **Proagro/Proagro-Mais:** ${r.proagroElegivel ? 'HABILITADO' : 'NÃO HABILITADO'}`,
      ];
      if (typeof r.risco === 'number') linhas.push(`• **Risco climático:** ${(r.risco * 100).toFixed(0)}%`);
      if (r.janelaMaisProxima) {
        linhas.push(
          `• **Janela mais próxima:** decêndio ${r.janelaMaisProxima.decendio} (${r.janelaMaisProxima.dataInicio} a ${r.janelaMaisProxima.dataFim}, risco ${(r.janelaMaisProxima.risco * 100).toFixed(0)}%)`,
        );
      }
      linhas.push('', r.mensagem);
      return {
        content: linhas.join('\n'),
        sources: [`/api/zarc/validar`],
        toolsUsed: ['zarc.validar'],
      };
    } catch (err) {
      return { content: `Falha ao validar ZARC (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async consultarMoratoriaSoja(
    codigoIbge?: string,
    dataDesmatamento?: string,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const svc = this.dsm.getAbioveService();
      const status = svc.statusMoratoriaSoja();
      const linhas = [
        `**Moratória da Soja — status**`,
        '',
        `• **Vigente:** ${status.vigente ? 'SIM' : 'NÃO'} (desde ${status.desde})`,
        `• **Última revisão:** ${status.ultimaRevisao}`,
        `• **Data-corte:** ${status.dataLimite}`,
        `• **Signatários:** ${status.signatarios.join(', ')}`,
      ];
      if (status.observacoes) linhas.push(`• **Obs.:** ${status.observacoes}`);
      const sources: string[] = ['/api/abiove/moratoria/status'];
      if (codigoIbge) {
        const eleg = svc.elegibilidadeImovel(codigoIbge, dataDesmatamento);
        linhas.push(
          '',
          `**Elegibilidade — ${eleg.municipio}/${eleg.uf} (IBGE ${codigoIbge})**`,
          `• **Bioma Amazônia:** ${eleg.noBiomaAmazonia ? 'SIM' : 'NÃO'}`,
          `• **Pode comprar soja:** ${eleg.elegivelAComprarSoja ? 'SIM' : 'NÃO'}`,
        );
        if (eleg.restricoes.length) {
          linhas.push('', '**Restrições:**');
          for (const r of eleg.restricoes) linhas.push(`• ${r}`);
        }
        if (eleg.alternativas.length) {
          linhas.push('', '**Alternativas:**');
          for (const a of eleg.alternativas) linhas.push(`• ${a}`);
        }
        sources.push(`/api/abiove/moratoria/elegibilidade/${codigoIbge}`);
      }
      return {
        content: linhas.join('\n'),
        sources,
        toolsUsed: ['abiove.moratoria'],
      };
    } catch (err) {
      return { content: `Falha ao consultar Moratória da Soja (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  // ── Wave 7b — Simuladores regulatórios 2026 ─────────────

  private simularReformaTributaria(
    ano: number,
    regime: RegimeTributarioRural,
    receitaBruta: number,
    comprasInsumos: number,
  ): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const svc = getReformaTributariaService();
      const r = svc.simular({ ano, regime, receitaBruta, comprasInsumos });
      const sinal = r.diferencaAbsoluta < 0 ? 'ECONOMIA' : r.diferencaAbsoluta > 0 ? 'CUSTO ADICIONAL' : 'NEUTRO';
      const linhas = [
        `**Reforma Tributária — simulação ${ano} (${regime})**`,
        '',
        `• **Alíquotas do ano:** CBS ${(r.aliquotasAno.cbs * 100).toFixed(2)}% / IBS ${(r.aliquotasAno.ibs * 100).toFixed(2)}%`,
        '',
        '**Sistema atual:**',
        `• PIS/COFINS: ${fmtBRL(r.sistemaAtual.pisCofins)}`,
        `• ICMS: ${fmtBRL(r.sistemaAtual.icms)}`,
        `• IPI: ${fmtBRL(r.sistemaAtual.ipi)}`,
        `• Funrural: ${fmtBRL(r.sistemaAtual.funrural)}`,
        `• **Total atual:** ${fmtBRL(r.sistemaAtual.total)}`,
        '',
        '**Sistema novo (CBS + IBS):**',
        `• CBS: ${fmtBRL(r.sistemaNovo.cbs)}`,
        `• IBS: ${fmtBRL(r.sistemaNovo.ibs)}`,
        `• Créditos sobre compras: −${fmtBRL(r.sistemaNovo.creditosCompras)}`,
        `• Funrural remanescente: ${fmtBRL(r.sistemaNovo.funruralRemanescente)}`,
        `• **Total novo:** ${fmtBRL(r.sistemaNovo.total)}`,
        '',
        `**${sinal}:** ${fmtBRL(Math.abs(r.diferencaAbsoluta))} (${fmtPct(r.diferencaPercentual)})`,
      ];
      if (r.observacoes.length) {
        linhas.push('', '**Observações:**');
        for (const o of r.observacoes) linhas.push(`• ${o}`);
      }
      if (r.recomendacoes.length) {
        linhas.push('', '**Recomendações:**');
        for (const rec of r.recomendacoes) linhas.push(`• ${rec}`);
      }
      return {
        content: linhas.join('\n'),
        sources: ['/api/reforma/simular'],
        toolsUsed: ['reforma.simular'],
      };
    } catch (err) {
      return { content: `Falha na simulação CBS/IBS (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private calcularFunrural(
    tipo: TipoContribuinte,
    receitaBrutaAnual: number,
    folhaPagamentoAnual: number,
    ratMultiplicador: 1 | 2 | 3,
    optouFolha: boolean,
  ): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const svc = getFunruralService();
      const r = svc.calcular({ tipo, receitaBrutaAnual, folhaPagamentoAnual, ratMultiplicador, optouFolha });
      const linhas = [
        `**Funrural ${r.ano} — ${tipo}**`,
        '',
        `• **Opção receita:** ${fmtBRL(r.opcaoReceita.total)} (alíq. ${(r.opcaoReceita.aliquotaTotal * 100).toFixed(2)}%)`,
        `• **Opção folha:** ${fmtBRL(r.opcaoFolha.total)} (alíq. ${(r.opcaoFolha.aliquotaTotal * 100).toFixed(2)}%, RAT×${ratMultiplicador})`,
        `• **Melhor opção:** ${r.melhorOpcao.toUpperCase()}`,
        `• **Economia:** ${fmtBRL(r.economia)}`,
      ];
      if (r.observacoes.length) {
        linhas.push('', '**Observações:**');
        for (const o of r.observacoes) linhas.push(`• ${o}`);
      }
      if (r.baseLegal.length) {
        linhas.push('', '**Base legal:**');
        for (const b of r.baseLegal) linhas.push(`• ${b}`);
      }
      return {
        content: linhas.join('\n'),
        sources: ['/api/funrural/calcular'],
        toolsUsed: ['funrural.calcular'],
      };
    } catch (err) {
      return { content: `Falha no cálculo Funrural (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private simularDesenrolaRural(
    input: Record<string, unknown>,
  ): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const svc = getDesenrolaRuralService();
      const divida = {
        id: String(input.dividaId),
        valorInscrito: Number(input.valorInscrito),
        valorAtualizado: Number(input.valorAtualizado),
        dataInscricao: String(input.dataInscricao),
        origem: String(input.origem) as 'pgfn' | 'receita_federal' | 'banco_publico' | 'banco_cooperativa' | 'outro',
        modalidade: String(input.modalidade) as 'custeio' | 'investimento' | 'comercializacao' | 'outra',
      };
      const faixaSolicitada = input.faixa ? (String(input.faixa) as FaixaCapacidadePagamento) : undefined;
      const perfilBase = {
        tipo: String(input.tipoProdutor) as 'PF' | 'PJ',
        receitaBrutaAnual: Number(input.receitaBrutaAnual),
        ativosDeclarados: Number(input.ativosDeclarados),
        dividasTotal: Number(input.dividasTotal),
        capacidadePagamento: 'D' as FaixaCapacidadePagamento,
      };
      const faixaAuto = svc.classificarFaixa(perfilBase);
      const perfil = { ...perfilBase, capacidadePagamento: faixaSolicitada ?? faixaAuto };
      const r = svc.simular(divida, perfil);
      const linhas = [
        `**Desenrola Rural — simulação dívida ${divida.id}**`,
        '',
        `• **Faixa:** ${perfil.capacidadePagamento}${faixaSolicitada ? ' (forçada)' : ` (auto — calculada de ratio dívida/ativos)`}`,
        `• **Elegível:** ${r.elegivel ? 'SIM' : 'NÃO'}`,
        `• **Prazo de adesão:** ${r.prazoAdesao}`,
        '',
        '**Descontos aplicados:**',
        `• Juros: ${(r.descontoJurosPct * 100).toFixed(0)}%`,
        `• Multa: ${(r.descontoMultaPct * 100).toFixed(0)}%`,
        `• Encargos legais: ${(r.descontoEncargosLegaisPct * 100).toFixed(0)}%`,
        '',
        '**Quitação proposta:**',
        `• Valor atualizado: ${fmtBRL(r.valorAtualizado)}`,
        `• Valor a pagar: ${fmtBRL(r.valorAPagar)}`,
        `• Economia: ${fmtBRL(r.economia)}`,
        `• Entrada mínima: ${fmtBRL(r.entradaMinima)}`,
        `• Parcelamento: até ${r.parcelamentoMaximoMeses} meses`,
      ];
      if (r.motivos.length) {
        linhas.push('', '**Motivos (elegibilidade):**');
        for (const m of r.motivos) linhas.push(`• ${m}`);
      }
      linhas.push('', `**Base legal:** ${r.baseLegal.join(' | ')}`);
      return {
        content: linhas.join('\n'),
        sources: ['/api/desenrola/simular'],
        toolsUsed: ['desenrola.simular'],
      };
    } catch (err) {
      return { content: `Falha na simulação Desenrola Rural (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  // ── Wave 8a — Balanced Scorecard Agro ──────────────────────

  private listarKpisBsc(
    input: { perspectiva?: PerspectivaBSC },
  ): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const svc = getBscService();
      const kpis = input.perspectiva ? svc.listarPorPerspectiva(input.perspectiva) : svc.listarKpis();
      const linhas = [`**BSC Agro — catálogo${input.perspectiva ? ` (${input.perspectiva})` : ''}** (${kpis.length} KPIs)`, ''];
      const porPersp = new Map<PerspectivaBSC, typeof kpis>();
      for (const k of kpis) {
        const arr = porPersp.get(k.perspectiva) ?? [];
        arr.push(k);
        porPersp.set(k.perspectiva, arr);
      }
      for (const [p, list] of porPersp) {
        linhas.push(`**${p}:**`);
        for (const k of list) {
          const meta = k.meta !== undefined ? ` — meta ${k.meta}${k.unidade}` : '';
          linhas.push(`• **${k.nome}** (\`${k.id}\`, ${k.tendencia})${meta} — ${k.formula}`);
        }
        linhas.push('');
      }
      return {
        content: linhas.join('\n'),
        sources: ['/api/bsc/kpis'],
        toolsUsed: ['bsc.listar_kpis'],
      };
    } catch (err) {
      return { content: `Falha ao listar KPIs BSC (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private calcularBscHandler(
    input: ContextoBSCCalculo,
  ): { content: string; sources: string[]; toolsUsed: string[] } {
    try {
      const svc = getBscService();
      const r = svc.calcular(input);
      const linhas = [
        `**Balanced Scorecard — ${r.periodo}**`,
        '',
        `🎯 **Score Geral:** ${r.scoreGeral.toFixed(1)} / 100`,
        '',
        '**Por perspectiva:**',
      ];
      for (const p of r.porPerspectiva) {
        linhas.push(`• **${p.perspectiva}:** ${p.score.toFixed(1)} (${p.kpis.length} KPIs)`);
        for (const k of p.kpis.slice(0, 4)) {
          const icon = k.status === 'acima_meta' ? '🟢' : k.status === 'na_meta' ? '🟡' : k.status === 'abaixo_meta' ? '🔴' : '⚪';
          linhas.push(`   ${icon} ${k.kpiId}: ${k.valor.toFixed(2)} (score ${(k.score * 100).toFixed(0)}%)`);
        }
      }
      if (r.observacoes.length) {
        linhas.push('', '**Observações:**');
        for (const o of r.observacoes) linhas.push(`• ${o}`);
      }
      if (r.recomendacoes.length) {
        linhas.push('', '**Recomendações:**');
        for (const rec of r.recomendacoes) linhas.push(`• ${rec}`);
      }
      return {
        content: linhas.join('\n'),
        sources: ['/api/bsc/calcular'],
        toolsUsed: ['bsc.calcular'],
      };
    } catch (err) {
      return { content: `Falha no cálculo BSC (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  // ── Wave 8b — RAG Knowledge Base ──────────────────────────

  private async buscarDocumentosRag(
    input: { query: string; k?: number },
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const rag = getRagService();
      const k = Math.min(Math.max(input.k ?? 5, 1), 15);
      const hits = await rag.search(input.query, k);
      if (hits.length === 0) {
        return {
          content: `Nenhum trecho relevante encontrado na base RAG para "${input.query}". Verifique se os PDFs estão indexados (rodar \`pnpm -F @aletis/knowledge-base run rag:build\`).`,
          sources: [],
          toolsUsed: ['rag.search'],
        };
      }
      const linhas = [`**RAG — top ${hits.length} trechos para: "${input.query}"**`, ''];
      for (const h of hits) {
        const pg = h.metadata?.page ? ` p${h.metadata.page}` : '';
        const excerpt = h.text.length > 350 ? h.text.slice(0, 350) + '…' : h.text;
        linhas.push(`**[${h.score.toFixed(2)}] ${h.source}${pg}**`);
        linhas.push(excerpt);
        linhas.push('');
      }
      const fontesUnicas = [...new Set(hits.map((h) => h.source))];
      return {
        content: linhas.join('\n'),
        sources: fontesUnicas.map((s) => `inbox/documentos/${s}`),
        toolsUsed: ['rag.search'],
      };
    } catch (err) {
      return { content: `Falha na busca RAG (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  // ── Wave 8c — SICOR Bacen OData ───────────────────────────

  private async consultarSicorResumoUf(
    input: { uf: string; ano: number },
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const svc = this.dsm.getSicorService();
      const r = await svc.resumoUfAno(input.uf, input.ano);
      const linhas = [
        `**SICOR — ${r.uf} / ${r.ano}** (fonte: ${r.fonte})`,
        '',
        `• **Volume total:** ${fmtBRL(r.valorTotalBRL)}`,
        `• **Contratos:** ${r.totalContratos.toLocaleString('pt-BR')}`,
        `• **Ticket médio:** ${fmtBRL(r.ticketMedioBRL)}`,
        '',
        '**Por modalidade:**',
      ];
      for (const m of r.porModalidade) {
        linhas.push(`• ${m.modalidade}: ${fmtBRL(m.valorBRL)} (${m.participacaoPercentual.toFixed(1)}%, ${m.contratos.toLocaleString('pt-BR')} contratos)`);
      }
      if (r.topProdutos.length > 0) {
        linhas.push('', '**Top produtos:**');
        for (const p of r.topProdutos.slice(0, 8)) {
          linhas.push(`• ${p.produto}: ${fmtBRL(p.valorBRL)} (${p.participacaoPercentual.toFixed(1)}%)`);
        }
      }
      if (r.observacoes) linhas.push('', `_${r.observacoes}_`);
      return {
        content: linhas.join('\n'),
        sources: [`/api/sicor/resumo/${r.uf}/${r.ano}`, 'olinda.bcb.gov.br/SICOR v2'],
        toolsUsed: ['sicor.resumoUfAno'],
      };
    } catch (err) {
      return { content: `Falha na consulta SICOR resumo (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  private async consultarSicorContratos(
    input: {
      modalidade: ModalidadeSicor;
      uf?: string;
      produto?: string;
      anoMesInicial?: string;
      anoMesFinal?: string;
      top?: number;
    },
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[] }> {
    try {
      const svc = this.dsm.getSicorService();
      const params = {
        uf: input.uf,
        produto: input.produto,
        anoMesInicial: input.anoMesInicial,
        anoMesFinal: input.anoMesFinal,
        top: input.top ?? 100,
      };
      const r =
        input.modalidade === 'custeio'
          ? await svc.buscarContratosCusteio(params)
          : input.modalidade === 'investimento'
            ? await svc.buscarContratosInvestimento(params)
            : await svc.buscarContratosComercializacao(params);
      const linhas = [
        `**SICOR — ${r.modalidade}** (fonte: ${r.fonte})`,
        `Filtros: UF=${input.uf ?? 'todas'}, produto=${input.produto ?? 'todos'}, janela=${input.anoMesInicial ?? '…'}→${input.anoMesFinal ?? '…'}`,
        '',
        `• **Contratos:** ${r.total.toLocaleString('pt-BR')}`,
        `• **Valor total:** ${fmtBRL(r.valorTotal)}`,
        `• **Ticket médio:** ${fmtBRL(r.ticketMedio)}`,
      ];
      if (r.areaTotalHa > 0) linhas.push(`• **Área total:** ${r.areaTotalHa.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ha`);
      if (r.contratos.length > 0) {
        linhas.push('', `**Top registros (${Math.min(8, r.contratos.length)} de ${r.contratos.length}):**`);
        for (const c of r.contratos.slice(0, 8)) {
          linhas.push(`• ${c.nomeUF}/${c.nomeProduto} ${c.anoEmissao}-${c.mesEmissao}: ${fmtBRL(c.valorContratado)} (${c.qtdContratos} contratos)`);
        }
      }
      return {
        content: linhas.join('\n'),
        sources: [`/api/sicor/${r.modalidade}`, 'olinda.bcb.gov.br/SICOR v2'],
        toolsUsed: [`sicor.${r.modalidade}`],
      };
    } catch (err) {
      return { content: `Falha na consulta SICOR (${(err as Error).message}).`, sources: [], toolsUsed: [] };
    }
  }

  // ── Executor tools (HITL) ────────────────────────────────
  // Cada `handle_*` valida input, grava intent no
  // AlixConfirmationStore e retorna um payload pendingConfirmation.
  // Cada `exec_*` é o que roda quando o usuário aprova via
  // POST /api/alix/confirmations/:id/approve.

  /** Map de executor real — expõe para a rota de aprovação. */
  public getExecutor(
    toolName: string,
  ): ((payload: unknown) => Promise<unknown>) | null {
    const map: Record<string, (payload: unknown) => Promise<unknown>> = {
      criar_plano_custeio: (p) => this.exec_criar_plano_custeio(p as Record<string, unknown>),
      atualizar_plano_custeio: (p) => this.exec_atualizar_plano_custeio(p as Record<string, unknown>),
      duplicar_e_ajustar_custeio: (p) => this.exec_duplicar_e_ajustar_custeio(p as Record<string, unknown>),
      criar_evento_cliente: (p) => this.exec_criar_evento_cliente(p as Record<string, unknown>),
      criar_tarefa: (p) => this.exec_criar_tarefa(p as Record<string, unknown>),
      agendar_reuniao: (p) => this.exec_agendar_reuniao(p as Record<string, unknown>),
      enviar_mensagem_whatsapp_intent: (p) => this.exec_enviar_mensagem_whatsapp_intent(p as Record<string, unknown>),
      gerar_proposta_renegociacao_intent: (p) => this.exec_gerar_proposta_renegociacao_intent(p as Record<string, unknown>),
    };
    return map[toolName] ?? null;
  }

  /**
   * Gera a resposta padrão de um handler de executor:
   * cria o intent no store e retorna o payload que o Claude
   * vai surfaceirar ao usuário.
   */
  private buildPendingResponse(
    toolName: string,
    description: string,
    payload: Record<string, unknown>,
    preview: Record<string, unknown>,
  ): { content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> } {
    const entry = getAlixConfirmationStore().create(toolName, description, payload);
    return {
      content:
        `**Aguardando confirmação:** ${description}\n\n` +
        `Confirma que posso prosseguir? (ID \`${entry.id}\`)`,
      sources: [],
      toolsUsed: [`${toolName}.pending`],
      metadata: {
        pendingConfirmation: true,
        confirmationId: entry.id,
        toolName,
        description,
        preview,
        expiresAt: new Date(entry.expiresAt).toISOString(),
      },
    };
  }

  private alixStorageDir(bucket: string): string {
    // apps/api/src/services/AlixService.ts → ../../storage/{bucket}
    const here = _dirname(_fileURLToPath(import.meta.url));
    const dir = `${here}/../../storage/${bucket}`;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ── 1. criar_plano_custeio ───────────────────────────────
  private handle_criar_plano_custeio(
    input: Record<string, unknown>,
  ): { content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> } {
    const clienteId = String(input.clienteId || '').trim();
    const safra = String(input.safra || '').trim();
    const proponente = input.proponente as DadosProponente | undefined;
    if (!clienteId || !safra || !proponente || !proponente.nome) {
      return {
        content: 'Faltam campos obrigatórios: clienteId, safra, proponente.nome.',
        sources: [],
        toolsUsed: [],
        metadata: { pendingConfirmation: false, error: 'invalid_input' },
      };
    }
    const orcamento = Array.isArray(input.orcamento) ? (input.orcamento as ItemOrcamento[]) : [];
    const glebas = Array.isArray(input.glebas) ? (input.glebas as Gleba[]) : [];
    const totalOrc = orcamento.reduce((acc, it) => acc + (Number((it as any).valorTotal) || 0), 0);

    const description =
      `Criar rascunho de plano de custeio para cliente ${clienteId} (${proponente.nome}), safra ${safra}. ` +
      `Serão escritos ${orcamento.length} item(ns) de orçamento totalizando ${fmtBRL(totalOrc)} e ${glebas.length} gleba(s).`;

    return this.buildPendingResponse(
      'criar_plano_custeio',
      description,
      {
        clienteId,
        safra,
        proponente,
        orcamento,
        glebas,
        observacoes: input.observacoes,
      },
      {
        clienteId,
        safra,
        proponenteNome: proponente.nome,
        proponenteTipo: proponente.tipo,
        orcamentoItens: orcamento.length,
        orcamentoTotal: totalOrc,
        glebas: glebas.length,
      },
    );
  }

  private async exec_criar_plano_custeio(payload: Record<string, unknown>): Promise<unknown> {
    const createPayload: PlanoCusteioCreatePayload = {
      clienteId: String(payload.clienteId),
      safra: String(payload.safra),
      proponente: payload.proponente as DadosProponente,
      orcamento: (payload.orcamento as ItemOrcamento[] | undefined) ?? [],
      glebas: (payload.glebas as Gleba[] | undefined) ?? [],
      observacoes: payload.observacoes as string | undefined,
    };
    const plano = getCusteioService().criar(createPayload);
    return { ok: true, plano };
  }

  // ── 2. atualizar_plano_custeio ───────────────────────────
  private handle_atualizar_plano_custeio(
    input: Record<string, unknown>,
  ): { content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> } {
    const id = String(input.id || '').trim();
    const patch = (input.patch || {}) as PlanoCusteioUpdatePayload;
    if (!id || typeof patch !== 'object') {
      return {
        content: 'Faltam campos: id e patch (objeto).',
        sources: [],
        toolsUsed: [],
        metadata: { pendingConfirmation: false, error: 'invalid_input' },
      };
    }
    const plano = getCusteioService().buscar(id);
    if (!plano) {
      return {
        content: `Plano "${id}" não encontrado — nada a atualizar.`,
        sources: [],
        toolsUsed: [],
        metadata: { pendingConfirmation: false, error: 'not_found' },
      };
    }
    const campos = Object.keys(patch);
    const description =
      `Atualizar plano de custeio ${id} (cliente ${plano.clienteId}, safra ${plano.safra}). ` +
      `Campos a modificar: ${campos.length ? campos.join(', ') : '(nenhum)'}.`;

    return this.buildPendingResponse(
      'atualizar_plano_custeio',
      description,
      { id, patch },
      {
        id,
        clienteId: plano.clienteId,
        safra: plano.safra,
        camposAfetados: campos,
      },
    );
  }

  private async exec_atualizar_plano_custeio(payload: Record<string, unknown>): Promise<unknown> {
    const id = String(payload.id);
    const patch = payload.patch as PlanoCusteioUpdatePayload;
    const plano = getCusteioService().atualizar(id, patch);
    if (!plano) return { ok: false, error: 'not_found' };
    return { ok: true, plano };
  }

  // ── 3. duplicar_e_ajustar_custeio ────────────────────────
  private handle_duplicar_e_ajustar_custeio(
    input: Record<string, unknown>,
  ): { content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> } {
    const id = String(input.id || '').trim();
    const novaSafra = String(input.novaSafra || '').trim();
    const ajustePercentual = Number(input.ajustePercentual ?? 0);
    if (!id || !novaSafra) {
      return {
        content: 'Faltam campos: id e novaSafra.',
        sources: [],
        toolsUsed: [],
        metadata: { pendingConfirmation: false, error: 'invalid_input' },
      };
    }
    const origem = getCusteioService().buscar(id);
    if (!origem) {
      return {
        content: `Plano "${id}" não encontrado — nada a duplicar.`,
        sources: [],
        toolsUsed: [],
        metadata: { pendingConfirmation: false, error: 'not_found' },
      };
    }
    const orcTotal = origem.orcamento.reduce((acc, it) => acc + (it.valorTotal || 0), 0);
    const orcNovo = orcTotal * (1 + ajustePercentual / 100);

    const description =
      `Duplicar plano ${id} (cliente ${origem.clienteId}, safra ${origem.safra}) para safra ${novaSafra} ` +
      `e aplicar ajuste de ${ajustePercentual >= 0 ? '+' : ''}${ajustePercentual}% no orçamento ` +
      `(${fmtBRL(orcTotal)} → ${fmtBRL(orcNovo)}).`;

    return this.buildPendingResponse(
      'duplicar_e_ajustar_custeio',
      description,
      { id, novaSafra, ajustePercentual },
      {
        idOrigem: id,
        clienteId: origem.clienteId,
        safraOrigem: origem.safra,
        novaSafra,
        ajustePercentual,
        orcamentoAntes: orcTotal,
        orcamentoDepois: orcNovo,
      },
    );
  }

  private async exec_duplicar_e_ajustar_custeio(payload: Record<string, unknown>): Promise<unknown> {
    const id = String(payload.id);
    const novaSafra = String(payload.novaSafra);
    const ajuste = Number(payload.ajustePercentual ?? 0);
    const service = getCusteioService();
    const novo = service.duplicar(id, novaSafra);
    if (!novo) return { ok: false, error: 'not_found' };
    // Aplica ajuste percentual ao orçamento e ao cronograma.
    const fator = 1 + ajuste / 100;
    const orcamentoAjustado: ItemOrcamento[] = novo.orcamento.map((it) => ({
      ...it,
      precoUnitario: Number(((it.precoUnitario || 0) * fator).toFixed(2)),
      valorTotal: Number(((it.valorTotal || 0) * fator).toFixed(2)),
    }));
    const cronogramaAjustado = novo.cronograma.map((p) => ({
      ...p,
      valor: Number(((p.valor || 0) * fator).toFixed(2)),
    }));
    const atualizado = service.atualizar(novo.id, {
      orcamento: orcamentoAjustado,
      cronograma: cronogramaAjustado,
    });
    return { ok: true, plano: atualizado ?? novo };
  }

  // ── 4. criar_evento_cliente ──────────────────────────────
  private handle_criar_evento_cliente(
    input: Record<string, unknown>,
  ): { content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> } {
    const clienteId = String(input.clienteId || '').trim();
    const tipo = String(input.tipo || '').trim();
    const titulo = String(input.titulo || '').trim();
    const descricao = String(input.descricao || '').trim();
    if (!clienteId || !tipo || !titulo) {
      return {
        content: 'Faltam campos: clienteId, tipo, titulo.',
        sources: [],
        toolsUsed: [],
        metadata: { pendingConfirmation: false, error: 'invalid_input' },
      };
    }
    const description =
      `Registrar evento "${titulo}" (tipo: ${tipo}) na timeline do cliente ${clienteId}.`;
    return this.buildPendingResponse(
      'criar_evento_cliente',
      description,
      { clienteId, tipo, titulo, descricao },
      { clienteId, tipo, titulo },
    );
  }

  private async exec_criar_evento_cliente(payload: Record<string, unknown>): Promise<unknown> {
    const clienteId = String(payload.clienteId).replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = this.alixStorageDir('eventos');
    const file = `${dir}/${clienteId}.jsonl`;
    const entry = {
      id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      clienteId,
      tipo: payload.tipo,
      titulo: payload.titulo,
      descricao: payload.descricao || '',
      criadoEm: new Date().toISOString(),
      origem: 'alix',
    };
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    return { ok: true, evento: entry };
  }

  // ── 5. criar_tarefa ──────────────────────────────────────
  private handle_criar_tarefa(
    input: Record<string, unknown>,
  ): { content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> } {
    const clienteId = String(input.clienteId || '').trim();
    const titulo = String(input.titulo || '').trim();
    const prazo = input.prazo ? String(input.prazo) : undefined;
    const prioridade = input.prioridade ? String(input.prioridade) : 'media';
    if (!clienteId || !titulo) {
      return {
        content: 'Faltam campos: clienteId e titulo.',
        sources: [],
        toolsUsed: [],
        metadata: { pendingConfirmation: false, error: 'invalid_input' },
      };
    }
    const description =
      `Criar tarefa "${titulo}" para cliente ${clienteId}` +
      (prazo ? ` (prazo ${prazo})` : '') +
      ` — prioridade ${prioridade}.`;
    return this.buildPendingResponse(
      'criar_tarefa',
      description,
      { clienteId, titulo, prazo, prioridade },
      { clienteId, titulo, prazo, prioridade },
    );
  }

  private async exec_criar_tarefa(payload: Record<string, unknown>): Promise<unknown> {
    const clienteId = String(payload.clienteId).replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = this.alixStorageDir('tarefas');
    const file = `${dir}/${clienteId}.json`;
    let arr: unknown[] = [];
    if (existsSync(file)) {
      try {
        arr = JSON.parse(readFileSync(file, 'utf8'));
        if (!Array.isArray(arr)) arr = [];
      } catch {
        arr = [];
      }
    }
    const entry = {
      id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      clienteId,
      titulo: payload.titulo,
      prazo: payload.prazo,
      prioridade: payload.prioridade || 'media',
      status: 'pendente',
      criadoEm: new Date().toISOString(),
      origem: 'alix',
    };
    arr.push(entry);
    writeFileSync(file, JSON.stringify(arr, null, 2), 'utf8');
    return { ok: true, tarefa: entry };
  }

  // ── 6. agendar_reuniao ───────────────────────────────────
  private handle_agendar_reuniao(
    input: Record<string, unknown>,
  ): { content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> } {
    const clienteId = String(input.clienteId || '').trim();
    const data = String(input.data || '').trim();
    const assunto = String(input.assunto || '').trim();
    const duracaoMin = Number(input.duracaoMin ?? 30);
    if (!clienteId || !data || !assunto) {
      return {
        content: 'Faltam campos: clienteId, data, assunto.',
        sources: [],
        toolsUsed: [],
        metadata: { pendingConfirmation: false, error: 'invalid_input' },
      };
    }
    const description =
      `Agendar reunião com cliente ${clienteId} em ${data} (${duracaoMin} min) — assunto: ${assunto}.`;
    return this.buildPendingResponse(
      'agendar_reuniao',
      description,
      { clienteId, data, duracaoMin, assunto },
      { clienteId, data, duracaoMin, assunto },
    );
  }

  private async exec_agendar_reuniao(payload: Record<string, unknown>): Promise<unknown> {
    // Grava como um evento do tipo "reuniao_agendada" para reaproveitar
    // a timeline de eventos. Também registra em tarefas como follow-up.
    const clienteId = String(payload.clienteId).replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = this.alixStorageDir('eventos');
    const file = `${dir}/${clienteId}.jsonl`;
    const entry = {
      id: `reu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      clienteId,
      tipo: 'reuniao_agendada',
      titulo: `Reunião — ${payload.assunto}`,
      data: payload.data,
      duracaoMin: payload.duracaoMin ?? 30,
      assunto: payload.assunto,
      criadoEm: new Date().toISOString(),
      origem: 'alix',
    };
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    return { ok: true, reuniao: entry };
  }

  // ── 7. enviar_mensagem_whatsapp_intent ───────────────────
  private handle_enviar_mensagem_whatsapp_intent(
    input: Record<string, unknown>,
  ): { content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> } {
    const clienteId = String(input.clienteId || '').trim();
    const telefone = String(input.telefone || '').trim();
    const mensagem = String(input.mensagem || '').trim();
    if (!clienteId || !telefone || !mensagem) {
      return {
        content: 'Faltam campos: clienteId, telefone, mensagem.',
        sources: [],
        toolsUsed: [],
        metadata: { pendingConfirmation: false, error: 'invalid_input' },
      };
    }
    const preview = mensagem.length > 200 ? `${mensagem.slice(0, 200)}…` : mensagem;
    const description =
      `Preparar mensagem WhatsApp para cliente ${clienteId} (${telefone}). ` +
      `Não será disparada automaticamente — vai para fila de envio manual. ` +
      `Texto: "${preview}".`;
    return this.buildPendingResponse(
      'enviar_mensagem_whatsapp_intent',
      description,
      { clienteId, telefone, mensagem },
      { clienteId, telefone, mensagemPreview: preview, caracteres: mensagem.length },
    );
  }

  private async exec_enviar_mensagem_whatsapp_intent(
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    // SEGURANÇA: NÃO dispara WhatsApp. Apenas enfileira.
    const clienteId = String(payload.clienteId).replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = this.alixStorageDir('mensagens_pendentes');
    const file = `${dir}/${clienteId}.jsonl`;
    const entry = {
      id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      clienteId,
      telefone: payload.telefone,
      mensagem: payload.mensagem,
      status: 'aguardando_envio_manual',
      criadoEm: new Date().toISOString(),
      origem: 'alix',
    };
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    return { ok: true, queued: true, mensagem: entry };
  }

  // ── 8. gerar_proposta_renegociacao_intent ────────────────
  private handle_gerar_proposta_renegociacao_intent(
    input: Record<string, unknown>,
  ): { content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> } {
    const clienteId = String(input.clienteId || '').trim();
    const dividaIds = Array.isArray(input.dividaIds) ? (input.dividaIds as unknown[]).map(String) : [];
    const parametros = (input.parametros || {}) as Record<string, unknown>;
    if (!clienteId || dividaIds.length === 0) {
      return {
        content: 'Faltam campos: clienteId e dividaIds (array não vazio).',
        sources: [],
        toolsUsed: [],
        metadata: { pendingConfirmation: false, error: 'invalid_input' },
      };
    }
    const description =
      `Enfileirar intent de proposta de renegociação para cliente ${clienteId} ` +
      `sobre ${dividaIds.length} dívida(s). A geração final ocorre em pipeline separado.`;
    return this.buildPendingResponse(
      'gerar_proposta_renegociacao_intent',
      description,
      { clienteId, dividaIds, parametros },
      { clienteId, dividas: dividaIds.length, parametrosKeys: Object.keys(parametros) },
    );
  }

  private async exec_gerar_proposta_renegociacao_intent(
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const clienteId = String(payload.clienteId).replace(/[^a-zA-Z0-9_-]/g, '');
    const params = (payload.parametros || {}) as Record<string, unknown>;
    const dir = this.alixStorageDir('propostas_pendentes');
    const file = `${dir}/${clienteId}.jsonl`;

    // Se os parâmetros necessários estão presentes, gera PDF REAL (Wave 9).
    // Caso contrário, mantém o comportamento antigo (enfileirar intent).
    const clienteNome = String(params.clienteNome || payload.clienteNome || clienteId);
    const credorNome = String(params.credorNome || payload.credorNome || '');
    const dividaAtualBRL = Number(params.dividaAtualBRL ?? payload.dividaAtualBRL ?? 0);
    const parcelasMeses = Number(params.parcelasMeses ?? payload.parcelasMeses ?? 0);
    const taxaMensalPct = Number(params.taxaMensalPct ?? payload.taxaMensalPct ?? 0);
    const carenciaMeses = Number(params.carenciaMeses ?? payload.carenciaMeses ?? 0);

    if (credorNome && dividaAtualBRL > 0 && parcelasMeses > 0) {
      try {
        const svc = DocumentGeneratorService.getInstance();
        const doc = await svc.generateProposta({
          clienteId,
          clienteNome,
          credorNome,
          dividaAtualBRL,
          parcelasMeses,
          taxaMensalPct,
          carenciaMeses,
          observacoes: typeof params.observacoes === 'string' ? params.observacoes : undefined,
          consultor: typeof params.consultor === 'string' ? params.consultor : undefined,
        });
        const entry = {
          id: doc.id,
          clienteId,
          dividaIds: payload.dividaIds,
          parametros: params,
          status: 'gerado',
          criadoEm: doc.createdAt,
          origem: 'alix',
          documento: { filename: doc.filename, downloadUrl: doc.downloadUrl, sizeBytes: doc.sizeBytes },
        };
        appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
        console.log('[Alix][proposta] PDF gerado:', doc.filename, 'cliente', clienteId);
        return { ok: true, queued: false, generated: true, document: doc };
      } catch (err) {
        console.warn('[Alix][proposta] Falha ao gerar PDF, enfileirando intent:', (err as Error).message);
      }
    }

    const entry = {
      id: `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      clienteId,
      dividaIds: payload.dividaIds,
      parametros: payload.parametros || {},
      status: 'enfileirado',
      criadoEm: new Date().toISOString(),
      origem: 'alix',
    };
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    console.log('[Alix][proposta_intent] enfileirado:', entry.id, 'cliente', clienteId);
    return { ok: true, queued: true, intent: entry };
  }

  // ══════════════════════════════════════════════════════════
  // ── Wave 9 — Tool handlers (intake + generators + memory) ──
  // ══════════════════════════════════════════════════════════

  private async tool_listar_documentos_sessao(
    sessionId: string,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    const intake = getDocumentIntakeService();
    const docs = await intake.list(sessionId);
    if (docs.length === 0) {
      return {
        content: 'Nenhum documento anexado nesta sessão.',
        sources: [],
        toolsUsed: ['DocumentIntakeService.list'],
        metadata: { total: 0 },
      };
    }
    const linhas = docs
      .map(
        (d) =>
          `• ${d.filename} — ${d.kind} · ${Math.round(d.sizeBytes / 1024)} KB · id=${d.id}${d.pageCount ? ` · ${d.pageCount} pág` : ''}`,
      )
      .join('\n');
    return {
      content: `**Documentos da sessão (${docs.length}):**\n${linhas}`,
      sources: [`intake:session:${sessionId}`],
      toolsUsed: ['DocumentIntakeService.list'],
      metadata: { total: docs.length, ids: docs.map((d) => d.id) },
    };
  }

  private async tool_ler_documento_sessao(
    sessionId: string,
    id: string,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    const intake = getDocumentIntakeService();
    const doc = await intake.get(sessionId, id);
    if (!doc) {
      return {
        content: `Documento id=${id} não encontrado nesta sessão.`,
        sources: [],
        toolsUsed: ['DocumentIntakeService.get'],
        metadata: { found: false },
      };
    }
    const texto = doc.extractedText && doc.extractedText.length > 50000
      ? doc.extractedText.slice(0, 50000) + '\n…(truncado)'
      : doc.extractedText || '[sem texto extraído]';
    const header = `**${doc.filename}** (${doc.kind}${doc.pageCount ? `, ${doc.pageCount} pág` : ''}, ${Math.round(doc.sizeBytes / 1024)} KB)`;
    return {
      content: `${header}\n\n${texto}`,
      sources: [`intake:${doc.id}`],
      toolsUsed: ['DocumentIntakeService.get'],
      metadata: {
        id: doc.id,
        kind: doc.kind,
        pageCount: doc.pageCount,
        sheets: doc.metadata?.sheets,
      },
    };
  }

  private async tool_gerar_proposta_reestruturacao(
    i: Record<string, unknown>,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    try {
      const svc = DocumentGeneratorService.getInstance();
      const input: PropostaInput = {
        clienteId: String(i.clienteId),
        clienteNome: String(i.clienteNome),
        credorNome: String(i.credorNome),
        dividaAtualBRL: Number(i.dividaAtualBRL),
        parcelasMeses: Number(i.parcelasMeses),
        taxaMensalPct: Number(i.taxaMensalPct),
        carenciaMeses: Number(i.carenciaMeses),
        observacoes: i.observacoes ? String(i.observacoes) : undefined,
        consultor: i.consultor ? String(i.consultor) : undefined,
      };
      const doc = await svc.generateProposta(input);
      return {
        content: `**Proposta gerada (PDF):** ${doc.filename}\nTamanho: ${Math.round(doc.sizeBytes / 1024)} KB\nDownload: ${doc.downloadUrl}`,
        sources: [`generator:proposta:${doc.id}`],
        toolsUsed: ['DocumentGeneratorService.generateProposta'],
        metadata: { document: doc },
      };
    } catch (err) {
      return {
        content: `Erro ao gerar proposta: ${(err as Error).message}`,
        sources: [],
        toolsUsed: ['DocumentGeneratorService.generateProposta'],
        metadata: { error: true },
      };
    }
  }

  private async tool_gerar_parecer_tecnico(
    i: Record<string, unknown>,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    try {
      const svc = DocumentGeneratorService.getInstance();
      const input: ParecerInput = {
        clienteId: String(i.clienteId),
        clienteNome: String(i.clienteNome),
        assunto: String(i.assunto),
        diagnostico: String(i.diagnostico),
        viabilidade: String(i.viabilidade),
        recomendacao: String(i.recomendacao),
        anexos: Array.isArray(i.anexos) ? (i.anexos as unknown[]).map(String) : undefined,
        consultor: i.consultor ? String(i.consultor) : undefined,
      };
      const doc = await svc.generateParecer(input);
      return {
        content: `**Parecer gerado (PDF):** ${doc.filename}\nTamanho: ${Math.round(doc.sizeBytes / 1024)} KB\nDownload: ${doc.downloadUrl}`,
        sources: [`generator:parecer:${doc.id}`],
        toolsUsed: ['DocumentGeneratorService.generateParecer'],
        metadata: { document: doc },
      };
    } catch (err) {
      return {
        content: `Erro ao gerar parecer: ${(err as Error).message}`,
        sources: [],
        toolsUsed: ['DocumentGeneratorService.generateParecer'],
        metadata: { error: true },
      };
    }
  }

  private async tool_gerar_relatorio_bsc(
    i: Record<string, unknown>,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    try {
      const svc = DocumentGeneratorService.getInstance();
      const input = i as unknown as RelatorioBscInput;
      const doc = await svc.generateRelatorioBsc(input);
      return {
        content: `**Relatório BSC gerado (PDF):** ${doc.filename}\nTamanho: ${Math.round(doc.sizeBytes / 1024)} KB\nDownload: ${doc.downloadUrl}`,
        sources: [`generator:bsc:${doc.id}`],
        toolsUsed: ['DocumentGeneratorService.generateRelatorioBsc'],
        metadata: { document: doc },
      };
    } catch (err) {
      return {
        content: `Erro ao gerar relatório BSC: ${(err as Error).message}`,
        sources: [],
        toolsUsed: ['DocumentGeneratorService.generateRelatorioBsc'],
        metadata: { error: true },
      };
    }
  }

  private async tool_gerar_fluxo_caixa_xlsx(
    i: Record<string, unknown>,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    try {
      const svc = DocumentGeneratorService.getInstance();
      const input = i as unknown as FluxoCaixaInput;
      const doc = await svc.generateFluxoCaixaXlsx(input);
      return {
        content: `**Fluxo de caixa gerado (XLSX):** ${doc.filename}\nTamanho: ${Math.round(doc.sizeBytes / 1024)} KB\nDownload: ${doc.downloadUrl}`,
        sources: [`generator:fluxo:${doc.id}`],
        toolsUsed: ['DocumentGeneratorService.generateFluxoCaixaXlsx'],
        metadata: { document: doc },
      };
    } catch (err) {
      return {
        content: `Erro ao gerar fluxo de caixa: ${(err as Error).message}`,
        sources: [],
        toolsUsed: ['DocumentGeneratorService.generateFluxoCaixaXlsx'],
        metadata: { error: true },
      };
    }
  }

  private async tool_gerar_memoria_calculo_docx(
    i: Record<string, unknown>,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    try {
      const svc = DocumentGeneratorService.getInstance();
      const input = i as unknown as MemoriaInput;
      const doc = await svc.generateMemoriaCalculo(input);
      return {
        content: `**Memória de cálculo gerada (DOCX):** ${doc.filename}\nTamanho: ${Math.round(doc.sizeBytes / 1024)} KB\nDownload: ${doc.downloadUrl}`,
        sources: [`generator:memoria:${doc.id}`],
        toolsUsed: ['DocumentGeneratorService.generateMemoriaCalculo'],
        metadata: { document: doc },
      };
    } catch (err) {
      return {
        content: `Erro ao gerar memória de cálculo: ${(err as Error).message}`,
        sources: [],
        toolsUsed: ['DocumentGeneratorService.generateMemoriaCalculo'],
        metadata: { error: true },
      };
    }
  }

  private async tool_memoria_cliente_ler(
    clienteId: string,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    if (!clienteId) {
      return {
        content: 'clienteId é obrigatório.',
        sources: [],
        toolsUsed: ['AlixMemoryService.get'],
        metadata: { error: 'missing_clienteId' },
      };
    }
    const mem = getAlixMemoryService();
    const rendered = await mem.render(clienteId);
    if (!rendered) {
      return {
        content: `Sem memória persistente para clienteId=${clienteId}.`,
        sources: [],
        toolsUsed: ['AlixMemoryService.render'],
        metadata: { exists: false },
      };
    }
    return {
      content: rendered,
      sources: [`memory:${clienteId}`],
      toolsUsed: ['AlixMemoryService.render'],
      metadata: { exists: true, chars: rendered.length },
    };
  }

  private async tool_memoria_cliente_atualizar(
    i: Record<string, unknown>,
    fallbackClienteId: string | undefined,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    const clienteId = String(i.clienteId || fallbackClienteId || '').trim();
    if (!clienteId) {
      return {
        content: 'clienteId é obrigatório.',
        sources: [],
        toolsUsed: ['AlixMemoryService.upsert'],
        metadata: { error: 'missing_clienteId' },
      };
    }
    try {
      const mem = getAlixMemoryService();
      const patch: Partial<MemoriaCliente> = {};
      if (typeof i.clienteNome === 'string') patch.clienteNome = i.clienteNome;
      for (const k of ['perfil', 'dividasAtivas', 'decisoes', 'proximasAcoes', 'alertas'] as const) {
        const v = i[k];
        if (Array.isArray(v)) {
          (patch[k] as string[] | undefined) = (v as unknown[]).map(String).filter((s) => s.trim().length > 0);
        }
      }
      const updated = await mem.upsert(clienteId, patch);
      return {
        content: `Memória atualizada para ${updated.clienteNome} (${clienteId}). Perfil: ${updated.perfil.length}, dívidas: ${updated.dividasAtivas.length}, próximas ações: ${updated.proximasAcoes.length}, alertas: ${updated.alertas.length}.`,
        sources: [`memory:${clienteId}`],
        toolsUsed: ['AlixMemoryService.upsert'],
        metadata: { clienteId, atualizadoEm: updated.atualizadoEm },
      };
    } catch (err) {
      return {
        content: `Erro ao atualizar memória: ${(err as Error).message}`,
        sources: [],
        toolsUsed: ['AlixMemoryService.upsert'],
        metadata: { error: true },
      };
    }
  }

  private async tool_memoria_cliente_adicionar_nota(
    i: Record<string, unknown>,
    fallbackClienteId: string | undefined,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    const clienteId = String(i.clienteId || fallbackClienteId || '').trim();
    const secao = String(i.secao || '') as SecaoNota;
    const texto = String(i.texto || '').trim();
    if (!clienteId || !secao || !texto) {
      return {
        content: 'clienteId, secao e texto são obrigatórios.',
        sources: [],
        toolsUsed: ['AlixMemoryService.appendNota'],
        metadata: { error: 'missing_fields' },
      };
    }
    try {
      const mem = getAlixMemoryService();
      await mem.appendNota(clienteId, secao, texto);
      return {
        content: `Nota registrada em "${secao}" da memória de ${clienteId}.`,
        sources: [`memory:${clienteId}`],
        toolsUsed: ['AlixMemoryService.appendNota'],
        metadata: { clienteId, secao },
      };
    } catch (err) {
      return {
        content: `Erro ao adicionar nota: ${(err as Error).message}`,
        sources: [],
        toolsUsed: ['AlixMemoryService.appendNota'],
        metadata: { error: true },
      };
    }
  }

  private async tool_briefing_cliente(
    clienteId: string,
  ): Promise<{ content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> }> {
    if (!clienteId) {
      return {
        content: 'clienteId é obrigatório.',
        sources: [],
        toolsUsed: ['BriefingService.gerar'],
        metadata: { error: 'missing_clienteId' },
      };
    }
    try {
      const svc = getBriefingService();
      const briefing = await svc.gerar(clienteId);
      return {
        content: briefing.markdown,
        sources: [`briefing:${clienteId}`],
        toolsUsed: ['BriefingService.gerar'],
        metadata: {
          clienteId,
          geradoEm: briefing.geradoEm,
          destaques: briefing.destaques.length,
          dividasAtivas: briefing.dividasAtivas.length,
          sugestaoPrimeiraAcao: briefing.sugestaoPrimeiraAcao,
        },
      };
    } catch (err) {
      return {
        content: `Erro ao gerar briefing: ${(err as Error).message}`,
        sources: [],
        toolsUsed: ['BriefingService.gerar'],
        metadata: { error: true },
      };
    }
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
