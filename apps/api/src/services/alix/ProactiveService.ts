// ============================================================
// ProactiveService — Alix proativa (Alix Insano F8)
// ============================================================
// Dois responsabilidades:
//
// 1. AGENDAR INGESTS — roda periodicamente:
//    - Ingest DOU (diário)
//    - Ingest sócios (semanal, rate-limited)
//
// 2. DETECTAR INSIGHTS — varre leads/clientes e identifica:
//    - Janela crítica: lead com último ato < 60 dias → urgência
//    - Novos leads "quente" desde última varredura
//    - Clientes sem contato há >15 dias
//    - Leads em batch DOU (crise ativa)
//
// Os insights ficam em storage/alix-insights/YYYY-MM-DD.jsonl
// e são surfaceados pelo Orchestrator na próxima conversa ("Novidades").
//
// Rodar: chamado de server.ts no boot (se ALIX_PROACTIVE_ENABLED=true).
// ============================================================

import { promises as fs, existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import type { ProspeccaoService } from '../prospeccao/ProspeccaoService.js';
import { ingestDOUOnce } from '../prospeccao/sources/DOUSource.js';
import { expandSociosFromPJs } from '../prospeccao/sources/SocioExpansionSource.js';

export type InsightTipo =
  | 'janela-critica'
  | 'novo-lead-quente'
  | 'cliente-sem-contato'
  | 'crise-dou'
  | 'ingest-concluido';

export interface Insight {
  id: string;
  ts: string;
  tipo: InsightTipo;
  urgencia: 'info' | 'importante' | 'critico';
  titulo: string;
  detalhes: string;
  /** Dados úteis pra Alix agir (cpfCnpj, clienteId, etc). */
  payload?: Record<string, unknown>;
}

const INSIGHTS_DIR = 'alix-insights';

function insightsFileFor(storageDir: string, date: Date = new Date()): string {
  const ymd = date.toISOString().slice(0, 10);
  return join(storageDir, INSIGHTS_DIR, `${ymd}.jsonl`);
}

export class ProactiveService {
  private douTimer: NodeJS.Timeout | null = null;
  private sociosTimer: NodeJS.Timeout | null = null;
  private insightsTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prospeccao: ProspeccaoService,
    private readonly storageDir: string,
  ) {}

  /**
   * Inicia os jobs periódicos (chame 1x no boot).
   * Intervalos pensados para dev (minutos) — em prod use env vars para ajustar.
   */
  start(opts: { douIntervalMs?: number; sociosIntervalMs?: number; insightsIntervalMs?: number } = {}): void {
    const douInterval = opts.douIntervalMs ?? (Number(process.env.ALIX_PROACTIVE_DOU_MS) || 24 * 60 * 60_000); // 24h
    const sociosInterval = opts.sociosIntervalMs ?? (Number(process.env.ALIX_PROACTIVE_SOCIOS_MS) || 7 * 24 * 60 * 60_000); // 7d
    const insightsInterval = opts.insightsIntervalMs ?? (Number(process.env.ALIX_PROACTIVE_INSIGHTS_MS) || 60 * 60_000); // 1h

    // DOU ingest diário
    this.douTimer = setInterval(() => this.runDOUIngest(), douInterval);
    if (this.douTimer.unref) this.douTimer.unref();

    // Sócios semanal
    this.sociosTimer = setInterval(() => this.runSociosIngest(), sociosInterval);
    if (this.sociosTimer.unref) this.sociosTimer.unref();

    // Insights engine horário
    this.insightsTimer = setInterval(() => this.detectInsights(), insightsInterval);
    if (this.insightsTimer.unref) this.insightsTimer.unref();

    console.log(`[ProactiveService] Iniciado — DOU a cada ${douInterval / 60000}min, sócios ${sociosInterval / 3600000}h, insights ${insightsInterval / 60000}min`);

    // Warm-up: roda insights imediatamente para povoar o dia
    setTimeout(() => this.detectInsights().catch(err => console.warn('[ProactiveService] warm-up insights falhou:', err.message)), 5_000);
  }

  stop(): void {
    if (this.douTimer) clearInterval(this.douTimer);
    if (this.sociosTimer) clearInterval(this.sociosTimer);
    if (this.insightsTimer) clearInterval(this.insightsTimer);
  }

  async runDOUIngest(): Promise<void> {
    try {
      const result = await ingestDOUOnce(this.prospeccao.dou);
      this.recordInsight({
        tipo: 'ingest-concluido',
        urgencia: 'info',
        titulo: 'Ingest DOU concluído',
        detalhes: `${result.agroMatched} atos agro+crise encontrados, ${result.newLeads} leads novos extraídos`,
        payload: result as unknown as Record<string, unknown>,
      });
    } catch (err) {
      console.warn('[ProactiveService] DOU ingest falhou:', (err as Error).message);
    }
  }

  async runSociosIngest(): Promise<void> {
    try {
      const result = this.prospeccao.buscar({ pageSize: 100, sortBy: 'score' as any });
      const pjs = result.leads
        .filter(l => l.tipoPessoa === 'PJ' && l.cpfCnpj?.length >= 14)
        .slice(0, 50)
        .map(l => ({ cnpj: l.cpfCnpj, nome: l.nome, uf: l.uf }));
      const ret = await expandSociosFromPJs(pjs, { maxPerRun: 50, delayMs: 800 });
      this.prospeccao.socios.saveSocios(ret.socios, {
        pjsScanned: ret.pjsScanned,
        sociosExtracted: ret.sociosExtracted,
        uniqueSocios: ret.uniqueSocios,
      });
      this.recordInsight({
        tipo: 'ingest-concluido',
        urgencia: 'info',
        titulo: 'Ingest sócios concluído',
        detalhes: `${ret.pjsScanned} PJs processadas, ${ret.uniqueSocios} sócios PF novos`,
      });
    } catch (err) {
      console.warn('[ProactiveService] sócios ingest falhou:', (err as Error).message);
    }
  }

  /**
   * Detecta insights varrendo leads recentes e cruzando com estado atual.
   */
  async detectInsights(): Promise<Insight[]> {
    const insights: Insight[] = [];
    try {
      // 1. Novos leads "quente" (classificacao=quente) com score >=85 (nova régua F4)
      const quentes = this.prospeccao.buscar({ pageSize: 50, sortBy: 'score' as any }).leads;
      for (const lead of quentes.slice(0, 10)) {
        if (lead.score?.classificacao === 'quente' && lead.score.total >= 85) {
          insights.push(this.recordInsight({
            tipo: 'novo-lead-quente',
            urgencia: 'importante',
            titulo: `Lead quente: ${lead.nome.slice(0, 60)}`,
            detalhes: `${lead.uf} · R$ ${lead.totalDivida.toLocaleString('pt-BR')} · score ${lead.score.total}`,
            payload: { cpfCnpj: lead.cpfCnpj, score: lead.score.total, uf: lead.uf, divida: lead.totalDivida },
          }));
        }
      }

      // 2. Janela crítica: leads com ultimaInscricao nos últimos 60 dias (dívida quentinha)
      const hoje = new Date();
      const limite = new Date(hoje.getTime() - 60 * 86400_000);
      for (const lead of quentes) {
        const ultima = lead.ultimaInscricao ? new Date(lead.ultimaInscricao) : null;
        if (ultima && ultima > limite && lead.totalDivida > 500_000) {
          const dias = Math.floor((hoje.getTime() - ultima.getTime()) / 86400_000);
          insights.push(this.recordInsight({
            tipo: 'janela-critica',
            urgencia: dias < 30 ? 'critico' : 'importante',
            titulo: `Janela curta: ${lead.nome.slice(0, 50)}`,
            detalhes: `Última inscrição há ${dias} dias · R$ ${lead.totalDivida.toLocaleString('pt-BR')} ainda sem ajuizamento final. Contato em <30 dias pra travar antes da execução fiscal.`,
            payload: { cpfCnpj: lead.cpfCnpj, dias, divida: lead.totalDivida },
          }));
        }
      }

      // 3. Crise DOU — leads com signal DOU: (cruza PGFN + DOU = ouro)
      for (const lead of quentes) {
        if (Array.isArray(lead.agroSignals) && lead.agroSignals.some(s => s.startsWith('DOU:'))) {
          insights.push(this.recordInsight({
            tipo: 'crise-dou',
            urgencia: 'critico',
            titulo: `Crise pública: ${lead.nome.slice(0, 50)}`,
            detalhes: `Apareceu no DOU (${lead.agroSignals.filter(s => s.startsWith('DOU:')).join(', ')}) + tem dívida ativa PGFN. Intervenção urgente.`,
            payload: { cpfCnpj: lead.cpfCnpj, signals: lead.agroSignals },
          }));
        }
      }
    } catch (err) {
      console.warn('[ProactiveService] detectInsights falhou:', (err as Error).message);
    }
    return insights;
  }

  /** Append-only ao JSONL do dia. */
  private recordInsight(partial: Omit<Insight, 'id' | 'ts'>): Insight {
    const insight: Insight = {
      id: `ins_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      ...partial,
    };
    try {
      const file = insightsFileFor(this.storageDir);
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, JSON.stringify(insight) + '\n');
    } catch (err) {
      console.warn('[ProactiveService] append insight falhou:', (err as Error).message);
    }
    return insight;
  }

  /** Retorna insights dos últimos N dias, mais recentes primeiro. */
  async getRecentInsights(days = 7): Promise<Insight[]> {
    const result: Insight[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 86400_000);
      const file = insightsFileFor(this.storageDir, date);
      if (!existsSync(file)) continue;
      try {
        const raw = readFileSync(file, 'utf-8').trim();
        if (!raw) continue;
        for (const line of raw.split('\n')) {
          if (!line) continue;
          try {
            result.push(JSON.parse(line));
          } catch {
            /* linha corrompida */
          }
        }
      } catch {
        /* dia sem insights */
      }
    }
    return result.sort((a, b) => b.ts.localeCompare(a.ts));
  }

  /**
   * Retorna só os insights "ainda não surfaceados" — os que o Orchestrator
   * deve mostrar ao Christian na próxima conversa. Usamos um flag em memória
   * (`surfacedIds`); em prod pode persistir em arquivo.
   */
  private surfacedIds = new Set<string>();
  async getUnsurfacedInsights(days = 2): Promise<Insight[]> {
    const recent = await this.getRecentInsights(days);
    const fresh = recent.filter(i => !this.surfacedIds.has(i.id));
    for (const i of fresh) this.surfacedIds.add(i.id);
    return fresh;
  }
}

let _instance: ProactiveService | null = null;
export function getProactiveService(prospeccao: ProspeccaoService, storageDir: string): ProactiveService {
  if (!_instance) {
    _instance = new ProactiveService(prospeccao, storageDir);
  }
  return _instance;
}
