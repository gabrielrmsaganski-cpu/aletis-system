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

import { promises as fs, existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { EventEmitter } from 'events';
import type { ProspeccaoService } from '../prospeccao/ProspeccaoService.js';
import { ingestDOUOnce } from '../prospeccao/sources/DOUSource.js';
import { expandSociosFromPJs } from '../prospeccao/sources/SocioExpansionSource.js';
import { getAlixPushChannel } from './push/AlixPushChannel.js';

export type InsightTipo =
  | 'janela-critica'
  | 'novo-lead-quente'
  | 'cliente-sem-contato'
  | 'crise-dou'
  | 'ingest-concluido'
  | 'briefing-diario'
  | 'proposta-vencendo'
  | 'lead-enriquecido'      // Wave A2: score salto ≥20 após enrichment
  | 'stage-stuck'           // Wave A3: cliente CRM travado >14d em mesmo estágio
  | 'whatsapp-mudo'         // Wave A4: cliente parou de responder no WhatsApp >5d
  | 'alerta-preco-disparado' // Wave B1: regra de preço por cliente bateu threshold
  | 'macro-shift'           // Wave B2: shift macro (Selic/USD/IPCA/commodity) >|threshold|
  | 'doc-vencendo';         // Wave B6: contrato/CAR/LO vencendo em 30/15/7d

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
  private briefingTimer: NodeJS.Timeout | null = null;
  private rulesTimer: NodeJS.Timeout | null = null;
  private weeklyTimer: NodeJS.Timeout | null = null;
  private nextBriefingAt: Date | null = null;
  private nextWeeklyAt: Date | null = null;
  /** EventEmitter para broadcasts SSE — subscribers recebem cada novo insight. */
  readonly events = new EventEmitter();

  constructor(
    private readonly prospeccao: ProspeccaoService,
    private readonly storageDir: string,
  ) {
    this.loadSurfaced();
  }

  /**
   * Persiste `surfacedIds` entre restarts — evita ressurfacer insights que o
   * Christian já viu na sessão anterior. Arquivo pequeno, grava só ao marcar.
   */
  private surfacedFile(): string {
    return join(this.storageDir, '.surfaced.json');
  }

  private loadSurfaced(): void {
    try {
      const p = this.surfacedFile();
      if (!existsSync(p)) return;
      const raw = readFileSync(p, 'utf-8');
      const arr = JSON.parse(raw) as string[];
      for (const id of arr) this.surfacedIds.add(id);
    } catch (err) {
      console.warn('[ProactiveService] falha carregando surfacedIds:', (err as Error).message);
    }
  }

  private saveSurfaced(): void {
    try {
      // Limita a 500 últimos ids para o arquivo não crescer indefinidamente.
      const ids = Array.from(this.surfacedIds).slice(-500);
      writeFileSync(this.surfacedFile(), JSON.stringify(ids));
    } catch (err) {
      console.warn('[ProactiveService] falha salvando surfacedIds:', (err as Error).message);
    }
  }

  /**
   * Inicia os jobs periódicos (chame 1x no boot).
   * Intervalos pensados para dev (minutos) — em prod use env vars para ajustar.
   */
  start(opts: { douIntervalMs?: number; sociosIntervalMs?: number; insightsIntervalMs?: number; rulesIntervalMs?: number } = {}): void {
    const douInterval = opts.douIntervalMs ?? (Number(process.env.ALIX_PROACTIVE_DOU_MS) || 24 * 60 * 60_000); // 24h
    const sociosInterval = opts.sociosIntervalMs ?? (Number(process.env.ALIX_PROACTIVE_SOCIOS_MS) || 7 * 24 * 60 * 60_000); // 7d
    const insightsInterval = opts.insightsIntervalMs ?? (Number(process.env.ALIX_PROACTIVE_INSIGHTS_MS) || 60 * 60_000); // 1h
    const rulesInterval = opts.rulesIntervalMs ?? (Number(process.env.ALIX_PROACTIVE_RULES_MS) || 30 * 60_000); // 30min

    // DOU ingest diário
    this.douTimer = setInterval(() => this.runDOUIngest(), douInterval);
    if (this.douTimer.unref) this.douTimer.unref();

    // Sócios semanal
    this.sociosTimer = setInterval(() => this.runSociosIngest(), sociosInterval);
    if (this.sociosTimer.unref) this.sociosTimer.unref();

    // Insights engine horário
    this.insightsTimer = setInterval(() => this.detectInsights(), insightsInterval);
    if (this.insightsTimer.unref) this.insightsTimer.unref();

    // Wave B1 — Avaliação de regras de preço por cliente, a cada 30min.
    // Cruza AlertRulesService.listAll() com MarketBriefService.generateBrief().
    this.rulesTimer = setInterval(() => this.evaluateAlertRules().catch(() => {}), rulesInterval);
    if (this.rulesTimer.unref) this.rulesTimer.unref();

    console.log(`[ProactiveService] Iniciado — DOU a cada ${douInterval / 60000}min, sócios ${sociosInterval / 3600000}h, insights ${insightsInterval / 60000}min, regras ${rulesInterval / 60000}min`);

    // ── Status do canal de push (visibilidade no boot) ──
    try {
      const ch = getAlixPushChannel(this.storageDir);
      const h = ch.health();
      const allowImp = (process.env.ALIX_PUSH_ALLOW_IMPORTANTE || '').toLowerCase() === 'true';
      const dest = h.destination.kind === 'whatsapp' ? `WhatsApp → ${h.targetNumber}` : 'log-only (sem destino)';
      const mode = h.dryRun ? 'DRYRUN' : (h.enabled ? 'ARMED' : 'DESLIGADO');
      const flagAllow = allowImp ? '+importante' : 'só crítico';
      const ready = h.destination.kind === 'whatsapp' && !h.dryRun && h.enabled;
      const icon = ready ? '✅' : '⚠️ ';
      console.log(`${icon} [AlixPush] modo=${mode} destino=${dest} (${flagAllow})`);
      if (!ready) {
        console.log('   ↳ Para ativar push real defina:');
        console.log('     ALIX_PROACTIVE_PUSH_WHATSAPP=<E.164 ex: 5541999999999>');
        console.log('     WHATSAPP_ACCESS_TOKEN=<token Meta Cloud API>');
        console.log('     WHATSAPP_PHONE_NUMBER_ID=<id da Meta>');
        console.log('     ALIX_PUSH_ALLOW_IMPORTANTE=true   (opcional, libera urgência "importante")');
      }
    } catch (err) {
      console.warn('[ProactiveService] não consegui inspecionar AlixPushChannel:', (err as Error).message);
    }

    // Briefing diário ao amanhecer (cron lógico) — default 07:07 local
    const briefingEnabled = (process.env.ALIX_BRIEFING_ENABLED || 'true').toLowerCase() === 'true';
    if (briefingEnabled) {
      this.scheduleDailyBriefing();
    }

    // Wave B3 — Weekly executive report (segunda 08:03 local por default)
    const weeklyEnabled = (process.env.ALIX_WEEKLY_REPORT_ENABLED || 'true').toLowerCase() === 'true';
    if (weeklyEnabled) {
      this.scheduleWeeklyReport();
    }

    // Warm-up: roda insights imediatamente para povoar o dia
    setTimeout(() => this.detectInsights().catch(err => console.warn('[ProactiveService] warm-up insights falhou:', err.message)), 5_000);
  }

  stop(): void {
    if (this.douTimer) clearInterval(this.douTimer);
    if (this.sociosTimer) clearInterval(this.sociosTimer);
    if (this.insightsTimer) clearInterval(this.insightsTimer);
    if (this.rulesTimer) clearInterval(this.rulesTimer);
    if (this.briefingTimer) clearTimeout(this.briefingTimer);
    if (this.weeklyTimer) clearTimeout(this.weeklyTimer);
  }

  getNextWeeklyAt(): Date | null { return this.nextWeeklyAt; }

  /**
   * Wave B3 — agenda o weekly report para próxima segunda às 08:03 local
   * (configurável via env). Usa setTimeout recursivo: dispara, reagenda
   * para próxima semana.
   */
  private scheduleWeeklyReport(): void {
    const hour = Number(process.env.ALIX_WEEKLY_REPORT_HOUR ?? 8);
    const minute = Number(process.env.ALIX_WEEKLY_REPORT_MINUTE ?? 3);
    const dow = Number(process.env.ALIX_WEEKLY_REPORT_DOW ?? 1); // 0=dom, 1=seg, ..., 6=sab
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    // ajusta para o próximo `dow` desejado
    let diff = (dow - next.getDay() + 7) % 7;
    if (diff === 0 && next.getTime() <= now.getTime()) diff = 7;
    next.setDate(next.getDate() + diff);
    this.nextWeeklyAt = next;
    const delayMs = next.getTime() - now.getTime();
    this.weeklyTimer = setTimeout(async () => {
      try {
        const { getWeeklyReportService } = await import('./push/WeeklyReportService.js');
        const svc = getWeeklyReportService(this.storageDir);
        await svc.sendWeeklyReport();
      } catch (err) {
        console.warn('[ProactiveService] weekly report falhou:', (err as Error).message);
      } finally {
        this.scheduleWeeklyReport();
      }
    }, delayMs);
    if (this.weeklyTimer.unref) this.weeklyTimer.unref();
    const dias = Math.round(delayMs / 86400_000 * 10) / 10;
    console.log(`[ProactiveService] Weekly report agendado para ${next.toISOString()} (em ~${dias}d)`);
  }

  /**
   * Wave B1 — avalia todas as regras de alerta de mercado registradas
   * por cliente. Para cada regra que bate o threshold E não está em
   * cooldown, dispara insight `alerta-preco-disparado` e marca a regra
   * como disparada (atualiza ultimoDisparo).
   *
   * Roda a cada 30min via rulesTimer; também pode ser chamado manualmente
   * via endpoint POST /api/alix/rules/evaluate-now.
   */
  async evaluateAlertRules(): Promise<{ avaliadas: number; disparadas: number; shifts?: number }> {
    try {
      const { getAlertRulesService } = await import('./AlertRulesService.js');
      const svc = getAlertRulesService(this.storageDir);
      const rules = svc.listAll().filter(r => r.ativo);
      // Não retorna cedo se rules vazio — macro-shift roda independente

      // Gera brief uma vez e avalia regras + macro shifts contra ele
      const { MarketBriefService } = await import('../MarketBriefService.js');
      const { DataSourceManager } = await import('../DataSourceManager.js');
      const brief = await new MarketBriefService(DataSourceManager.getInstance()).generateBrief();

      let disparadas = 0;
      // Resolve nomes de cliente para títulos legíveis
      let clientesById = new Map<string, { nome: string; estagio?: string }>();
      try {
        const { alixGetClientes } = await import('../AlixService.js');
        for (const c of alixGetClientes()) {
          if (c?.id) clientesById.set(String(c.id), { nome: c.nome || String(c.id), estagio: c.estagio });
        }
      } catch {/* CRM pode estar vazio */}

      for (const rule of rules) {
        const ev = svc.evaluate(rule, brief);
        if (!ev.bateu || ev.emCooldown) continue;
        if (ev.valorAtual === null) continue;

        const cli = clientesById.get(rule.clienteId);
        const nomeCli = cli?.nome || rule.clienteId;
        const seta = rule.operador.startsWith('>') ? '↑' : '↓';
        const titulo = `${nomeCli.slice(0, 40)} · ${rule.simbolo.toUpperCase()} ${seta} ${rule.operador} ${rule.valor}`;
        const detalhes =
          `Regra "${rule.simbolo} ${rule.operador} ${rule.valor}" do cliente ${nomeCli} bateu. ` +
          `Valor atual: ${ev.valorAtual} ${ev.unidadeAtual ?? ''} (fonte ${ev.fonte ?? '?'}).` +
          (rule.motivo ? ` Motivo registrado: ${rule.motivo}.` : '') +
          ` Cooldown: ${rule.cooldownDias}d.`;

        this.recordInsight({
          tipo: 'alerta-preco-disparado',
          urgencia: 'critico',
          titulo,
          detalhes,
          payload: {
            ruleId: rule.id,
            clienteId: rule.clienteId,
            tipo: rule.tipo,
            simbolo: rule.simbolo,
            operador: rule.operador,
            threshold: rule.valor,
            valorAtual: ev.valorAtual,
            unidade: ev.unidadeAtual,
            fonte: ev.fonte,
          },
        });
        await svc.markFired(rule.id);
        disparadas++;
      }

      // ── Wave B2 — detecção de shifts macro com mesmo brief ──
      // Detecta ANTES de salvar snapshot do dia (caso contrário, t1=hoje
      // anularia o delta). Após detecção, salva snapshot se for o primeiro
      // run do dia.
      let shiftsCount = 0;
      try {
        const { getMacroShiftService } = await import('./MacroShiftService.js');
        const macro = getMacroShiftService(this.storageDir);
        const history = macro.loadHistory();
        const shifts = macro.detectShifts(brief, history);
        for (const s of shifts) {
          this.recordInsight({
            tipo: 'macro-shift',
            urgencia: s.urgencia,
            titulo: `${s.indicador} · shift ${s.janela} (${s.deltaPct != null ? (s.deltaPct >= 0 ? '+' : '') + s.deltaPct.toFixed(2) + '%' : s.delta.toFixed(0) + 'bp'})`,
            detalhes: s.descricao + ' Avalie impacto em DSCR/hedge da carteira de clientes expostos.',
            payload: {
              indicador: s.indicador,
              janela: s.janela,
              valorAtual: s.valorAtual,
              valorReferencia: s.valorReferencia,
              delta: s.delta,
              deltaPct: s.deltaPct,
            },
          });
          shiftsCount++;
        }
        // Snapshot do dia (idempotente — só persiste se não existe)
        await macro.snapshotIfNeeded(brief);
      } catch (err) {
        console.warn('[ProactiveService] macro-shift detect falhou:', (err as Error).message);
      }

      return { avaliadas: rules.length, disparadas, shifts: shiftsCount };
    } catch (err) {
      console.warn('[ProactiveService] evaluateAlertRules falhou:', (err as Error).message);
      return { avaliadas: 0, disparadas: 0, shifts: 0 };
    }
  }

  /**
   * Agenda o próximo disparo do briefing diário às HH:MM locais (default 07:07,
   * evitando minutos redondos para não sobrecarregar a API). Usa setTimeout
   * recursivo em vez de cron para ficar self-contained.
   */
  private scheduleDailyBriefing(): void {
    const hour = Number(process.env.ALIX_BRIEFING_HOUR ?? 7);
    const minute = Number(process.env.ALIX_BRIEFING_MINUTE ?? 7);
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    this.nextBriefingAt = next;
    const delayMs = next.getTime() - now.getTime();
    this.briefingTimer = setTimeout(async () => {
      try {
        await this.runDailyBriefing();
      } finally {
        // reagenda para o próximo dia
        this.scheduleDailyBriefing();
      }
    }, delayMs);
    if (this.briefingTimer.unref) this.briefingTimer.unref();
    console.log(`[ProactiveService] Briefing diário agendado para ${next.toISOString()} (${Math.round(delayMs / 60000)}min)`);
  }

  /**
   * Executa o briefing diário e registra um insight info para auditoria.
   */
  async runDailyBriefing(): Promise<void> {
    try {
      const { getDailyBriefingService } = await import('./push/DailyBriefingService.js');
      const svc = getDailyBriefingService(this.storageDir);
      const result = await svc.sendDailyBriefing();
      this.recordInsight({
        tipo: 'briefing-diario',
        urgencia: 'info',
        titulo: 'Briefing diário enviado',
        detalhes: 'skipped' in result
          ? `pulado: ${result.reason}`
          : `destino=${result.destination.kind}${'to' in result.destination ? ` to=${result.destination.to}` : ''} ok=${result.ok}`,
      });
    } catch (err) {
      console.warn('[ProactiveService] briefing falhou:', (err as Error).message);
    }
  }

  /** Próximo horário agendado do briefing — útil para healthcheck/admin. */
  getNextBriefingAt(): string | null {
    return this.nextBriefingAt ? this.nextBriefingAt.toISOString() : null;
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

      // 4. Propostas vencendo — watcher B.1
      try {
        const { alixGetPropostas, alixGetPropostasInteligentes, alixGetClientes } = await import('../AlixService.js');
        const clientesMap = new Map<string, any>();
        for (const c of alixGetClientes()) clientesMap.set(String(c.id), c);

        const todasPropostas = [
          ...alixGetPropostas().map((p: any) => ({ ...p, _tipo: 'padrao' })),
          ...alixGetPropostasInteligentes().map((p: any) => ({ ...p, _tipo: 'inteligente' })),
        ];
        for (const p of todasPropostas) {
          // prazoValidade pode estar no payload principal ou dentro de cenários.
          const validade = p.prazoValidade || p.dataValidade || p.validoAte;
          if (!validade) continue;
          const dt = new Date(validade);
          if (Number.isNaN(dt.getTime())) continue;
          const diasRestantes = Math.floor((dt.getTime() - hoje.getTime()) / 86400_000);
          if (diasRestantes < 0) continue; // já venceu, skip (outro insight futuro)
          if (diasRestantes > 7) continue; // só alertar quando <=7 dias
          const cli = p.clienteId ? clientesMap.get(String(p.clienteId)) : null;
          const nomeCli = cli?.nome || p.clienteNome || 'cliente';
          insights.push(this.recordInsight({
            tipo: 'proposta-vencendo',
            urgencia: diasRestantes <= 2 ? 'critico' : 'importante',
            titulo: `Proposta vencendo em ${diasRestantes}d: ${nomeCli.slice(0, 40)}`,
            detalhes: `Proposta ${p._tipo} (id=${p.id}) vence em ${dt.toLocaleDateString('pt-BR')} — contato urgente para conversão.`,
            payload: { propostaId: p.id, clienteId: p.clienteId, diasRestantes, validade },
          }));
        }
      } catch (err) {
        console.warn('[ProactiveService] watcher propostas-vencendo falhou:', (err as Error).message);
      }

      // 5. Clientes sem contato há >30 dias — watcher B.1
      try {
        const { alixGetClientes } = await import('../AlixService.js');
        const { getAlixMemoryService } = await import('./memory/AlixMemoryService.js');
        const mem = getAlixMemoryService();
        const limite30 = new Date(hoje.getTime() - 30 * 86400_000);
        for (const cliente of alixGetClientes()) {
          if (!cliente?.id) continue;
          // Lead em prospeccao não conta — só clientes efetivos em CRM.
          if (cliente.estagio === 'prospeccao' || cliente.estagio === 'arquivado') continue;
          let ultimaInteracao: Date | null = null;
          try {
            const m = await mem.get(String(cliente.id));
            if (m?.atualizadoEm) ultimaInteracao = new Date(m.atualizadoEm);
          } catch { /* memória pode não existir ainda */ }
          // Fallback: criadoEm/atualizadoEm do cliente
          if (!ultimaInteracao && cliente.atualizadoEm) ultimaInteracao = new Date(cliente.atualizadoEm);
          if (!ultimaInteracao) continue;
          if (ultimaInteracao > limite30) continue;
          const diasSem = Math.floor((hoje.getTime() - ultimaInteracao.getTime()) / 86400_000);
          insights.push(this.recordInsight({
            tipo: 'cliente-sem-contato',
            urgencia: diasSem >= 60 ? 'critico' : 'importante',
            titulo: `${cliente.nome?.slice(0, 40) || cliente.id} sem interação há ${diasSem}d`,
            detalhes: `Cliente em estágio "${cliente.estagio || '?'}" sem atualização há ${diasSem} dias. Risco de esfriar negociação.`,
            payload: { clienteId: cliente.id, estagio: cliente.estagio, diasSem },
          }));
        }
      } catch (err) {
        console.warn('[ProactiveService] watcher cliente-sem-contato falhou:', (err as Error).message);
      }

      // 6. Stage-stuck — Wave A3: cliente em estágio ativo travado >14d
      // Diferente de cliente-sem-contato: aqui foco é deal em estágios que
      // implicam ação iminente. Threshold mais agressivo (14d vs 30d).
      try {
        const { alixGetClientes } = await import('../AlixService.js');
        const ESTAGIOS_ATIVOS = new Set(['negociacao', 'proposta', 'fechamento', 'acordo']);
        const limite14 = new Date(hoje.getTime() - 14 * 86400_000);
        for (const cliente of alixGetClientes()) {
          if (!cliente?.id || !cliente.estagio) continue;
          if (!ESTAGIOS_ATIVOS.has(String(cliente.estagio).toLowerCase())) continue;
          // Usa atualizadoEm do cliente (proxy mais barato que ler memória)
          const upd = cliente.atualizadoEm ? new Date(cliente.atualizadoEm) : null;
          if (!upd || upd > limite14) continue;
          const diasParado = Math.floor((hoje.getTime() - upd.getTime()) / 86400_000);
          const urgencia = diasParado >= 21 ? 'critico' : 'importante';
          insights.push(this.recordInsight({
            tipo: 'stage-stuck',
            urgencia,
            titulo: `${(cliente.nome || cliente.id).slice(0, 40)} parado em "${cliente.estagio}" há ${diasParado}d`,
            detalhes: `Deal em estágio ativo "${cliente.estagio}" sem progresso há ${diasParado} dias. Sugestão: reabordar com pitch específico do estágio ou rebaixar para análise.`,
            payload: { clienteId: cliente.id, estagio: cliente.estagio, diasParado, atualizadoEm: cliente.atualizadoEm },
          }));
        }
      } catch (err) {
        console.warn('[ProactiveService] watcher stage-stuck falhou:', (err as Error).message);
      }

      // 8. Doc-vencendo — Wave B6: pendências do Portal cliente envelhecendo
      // Critério: portal_documento_pendente.status='pendente' AND solicitadoEm muito antiga.
      // 30d → importante, 60d → critico. Reforça follow-up de cobrança.
      try {
        if ((process.env.ALETIS_PG_ENABLED || '0') === '1') {
          const { getDb } = await import('../../db/client.js');
          const { portalDocumentoPendente } = await import('../../db/schema.js');
          const { eq, lt, and, sql: drizzleSql } = await import('drizzle-orm');
          const db = getDb();
          const limite30 = new Date(hoje.getTime() - 30 * 86400_000);
          const rows = await db
            .select()
            .from(portalDocumentoPendente)
            .where(and(eq(portalDocumentoPendente.status, 'pendente'), lt(portalDocumentoPendente.solicitadoEm, limite30)))
            .limit(50);

          // Resolve nomes de cliente para títulos legíveis
          let clientesById = new Map<string, string>();
          try {
            const { alixGetClientes } = await import('../AlixService.js');
            for (const c of alixGetClientes()) {
              if (c?.id) clientesById.set(String(c.id), c.nome || String(c.id));
            }
          } catch {/* CRM pode estar vazio */}

          for (const r of rows) {
            const solicitadoEm = r.solicitadoEm instanceof Date ? r.solicitadoEm : new Date(r.solicitadoEm);
            const diasAberta = Math.floor((hoje.getTime() - solicitadoEm.getTime()) / 86400_000);
            const urgencia = diasAberta >= 60 ? 'critico' : 'importante';
            const nomeCli = clientesById.get(String(r.clienteId)) || r.clienteId;
            insights.push(this.recordInsight({
              tipo: 'doc-vencendo',
              urgencia,
              titulo: `${nomeCli.slice(0, 30)} · "${(r.titulo || 'doc').slice(0, 30)}" pendente há ${diasAberta}d`,
              detalhes:
                `Cliente ${nomeCli} tem documento "${r.titulo}" (${r.categoria || 's/categoria'}) pendente desde ${solicitadoEm.toLocaleDateString('pt-BR')} — ${diasAberta} dias sem upload. ` +
                (r.obrigatorio ? 'Documento OBRIGATÓRIO. ' : 'Documento opcional. ') +
                `Sugestão: cobrar via WhatsApp ou reenviar magic-link.`,
              payload: {
                pendenciaId: r.id,
                clienteId: r.clienteId,
                categoria: r.categoria,
                obrigatorio: r.obrigatorio,
                solicitadoEm: solicitadoEm.toISOString(),
                diasAberta,
              },
            }));
          }
        }
      } catch (err) {
        console.warn('[ProactiveService] watcher doc-vencendo falhou:', (err as Error).message);
      }

      // 7. WhatsApp-mudo — Wave A4: contato ativo que parou de responder >5d
      // Critério: última msg do cliente (role=user) >5d, mas conversa estava
      // ativa (>=3 mensagens nos últimos 30d). Evita falso-positivo de
      // contato single-shot que nunca engajou.
      try {
        const { getWhatsAppBrainIfInitialized } = await import('../whatsapp/WhatsAppBrain.js');
        const brain = getWhatsAppBrainIfInitialized();
        if (brain) {
          const sessions = await brain.listSessions();
          const limite30dias = hoje.getTime() - 30 * 86400_000;
          const limite5dias = hoje.getTime() - 5 * 86400_000;
          for (const s of sessions) {
            if (!s?.mensagens || s.mensagens.length < 3) continue;
            // só conta se conversa estava ativa nos últimos 30d
            if (s.atualizadoEm < limite30dias) continue;
            // já escalado para humano? não dispara (Christian assumiu)
            if (s.escalouHumano) continue;
            // última mensagem do cliente (não da ALIX)
            const ultimaUser = [...s.mensagens].reverse().find(m => m.role === 'user');
            if (!ultimaUser) continue;
            if (ultimaUser.timestamp >= limite5dias) continue;
            const diasMudo = Math.floor((hoje.getTime() - ultimaUser.timestamp) / 86400_000);
            if (diasMudo > 30) continue; // muito antigo, deixa cliente-sem-contato pegar
            const urgencia = diasMudo >= 10 ? 'critico' : 'importante';
            const nome = s.nomeContato || s.lead?.nome || s.waId;
            insights.push(this.recordInsight({
              tipo: 'whatsapp-mudo',
              urgencia,
              titulo: `${nome.slice(0, 40)} parou de responder no WhatsApp há ${diasMudo}d`,
              detalhes: `Conversa ativa no WhatsApp com ${nome} (etapa "${s.etapa}") sem resposta há ${diasMudo} dias. Sugestão: msg curta de retomada ou template fora-da-janela 24h.`,
              payload: { waId: s.waId, etapa: s.etapa, diasMudo, totalMsgs: s.mensagens.length, ultimoTexto: ultimaUser.content?.slice(0, 100) },
            }));
          }
        }
      } catch (err) {
        console.warn('[ProactiveService] watcher whatsapp-mudo falhou:', (err as Error).message);
      }
    } catch (err) {
      console.warn('[ProactiveService] detectInsights falhou:', (err as Error).message);
    }
    return insights;
  }

  /**
   * Append-only ao JSONL do dia.
   * Público — usado por outros serviços (ProspeccaoService, WhatsAppBrain)
   * para emitir insights sem tight coupling ao watcher.
   */
  recordInsight(partial: Omit<Insight, 'id' | 'ts'>): Insight {
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

    // Wave B5 — broadcast em tempo real para SSE subscribers (toast em qualquer
    // tela do sistema). Cada subscriber recebe síncrono o evento "insight".
    try {
      this.events.emit('insight', insight);
    } catch {/* listener errors must not break record */}

    // Push assíncrono para canal unificado (WhatsApp/log). Só críticos por default.
    // Import dinâmico para evitar ciclo com AlixPushChannel.
    if (insight.urgencia === 'critico' || insight.urgencia === 'importante') {
      void (async () => {
        try {
          const { getAlixPushChannel } = await import('./push/AlixPushChannel.js');
          const ch = getAlixPushChannel(this.storageDir);
          await ch.sendInsight(insight, {
            allowImportante: (process.env.ALIX_PUSH_ALLOW_IMPORTANTE || 'false').toLowerCase() === 'true',
            silentIfNoDest: true,
          });
        } catch (err) {
          console.warn('[ProactiveService] push falhou:', (err as Error).message);
        }
      })();
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
    if (fresh.length > 0) {
      for (const i of fresh) this.surfacedIds.add(i.id);
      this.saveSurfaced();
    }
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
