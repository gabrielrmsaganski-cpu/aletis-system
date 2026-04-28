// ============================================================
// OrchestratorService — o Alix principal
// Roteia para 4 sub-agentes via delegate_* tools; responde direto
// perguntas factuais com tools leves.
// ============================================================

import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { DataSourceManager } from '../DataSourceManager.js';
import { AlixService, type ChatSession, type ChatMessage } from '../AlixService.js';
import { runClaude, type ClaudeTool, type ClaudeToolRegistry, type ClaudeMessage, isLLMEnabled, pingFoundryThinking } from '../llm/ClaudeFoundryClient.js';
import { DealAnalyzerAgent } from './agents/DealAnalyzerAgent.js';
import { WebResearcherAgent } from './agents/WebResearcherAgent.js';
import { CRMWriterAgent } from './agents/CRMWriterAgent.js';
import { DocGeneratorAgent } from './agents/DocGeneratorAgent.js';
import type { SubAgent, SubAgentContext, SubAgentResult } from './agents/types.js';
import { buildProspeccaoTools } from './tools/prospeccao.js';
import { safeWrapRegistry } from './tools/safe-handler.js';
import { buildCalculatorTools } from './tools/calculators.js';
import { buildCrmReadTools } from './tools/crm-read.js';
import { buildAlixPowerTools } from './tools/alix-power.js';
import { buildProactiveInsightsTools } from './tools/proactive-insights.js';
import { buildAlertRulesTools } from './tools/alert-rules.js';
import { buildContratosOficiaisTools } from './tools/contratos-oficiais.js';
import { buildNewsTools } from './tools/news.js';
import { buildCalendarioSafraTools } from './tools/calendario-safra.js';
import { buildOnboardingTools } from './tools/onboarding.js';
import { buildFeedbackTools } from './tools/feedback.js';
import { getFeedbackService } from './learning/FeedbackService.js';
import { buildPlaybooksTools } from './tools/playbooks.js';
import { buildSimilaridadeTools } from './tools/similaridade.js';
import { buildClimaTools } from './tools/clima.js';
import { buildSicarLiveTools } from './tools/sicar-live.js';
import { buildTjProcessosTools } from './tools/tj-processos.js';
import { buildIncraSigefTools } from './tools/incra-sigef.js';
import { buildInventarioTools } from './tools/inventario.js';
import { getAlixConfirmationStore } from './AlixConfirmationStore.js';
import { appendTelemetry, estimateCostUsd, type TelemetryRecord } from './telemetry.js';
import { getProactiveService } from './ProactiveService.js';
import { getProspeccaoService } from '../prospeccao/ProspeccaoService.js';
import { MarketBriefService } from '../MarketBriefService.js';
import { getAlixMemoryService } from './memory/AlixMemoryService.js';
import { getAlixAuditTrailService } from './AlixAuditTrailService.js';
import { getDocumentIntakeService } from './intake/DocumentIntakeService.js';

export interface OrchestratorOpts {
  thinkingSupported?: boolean;
  alix?: AlixService;
}

export class OrchestratorService {
  private dealAnalyzer: DealAnalyzerAgent;
  private webResearcher: WebResearcherAgent;
  private crmWriter: CRMWriterAgent;
  private docGenerator: DocGeneratorAgent;
  private alix: AlixService;

  constructor(private dsm: DataSourceManager, private storageDir: string, opts: OrchestratorOpts = {}) {
    this.alix = opts.alix ?? new AlixService(dsm, storageDir);
    this.dealAnalyzer = new DealAnalyzerAgent({ thinkingSupported: opts.thinkingSupported });
    this.webResearcher = new WebResearcherAgent();
    this.crmWriter = new CRMWriterAgent(this.alix);
    this.docGenerator = new DocGeneratorAgent(this.alix);
  }

  static async create(dsm: DataSourceManager, storageDir: string): Promise<OrchestratorService> {
    let thinkingSupported = false;
    try {
      if (isLLMEnabled()) {
        const ping = await pingFoundryThinking();
        thinkingSupported = ping.supported;
        console.log('[Orchestrator] extended thinking supported:', thinkingSupported);
      }
    } catch (err) {
      console.warn('[Orchestrator] ping thinking falhou:', (err as Error).message);
    }
    await fs.mkdir(storageDir, { recursive: true });
    return new OrchestratorService(dsm, storageDir, { thinkingSupported });
  }

  get model(): string {
    return process.env.ALIX_ORCHESTRATOR_MODEL || 'claude-sonnet-4-6';
  }

  private buildSystemPrompt(): string {
    const hoje = new Date().toISOString().slice(0, 10);
    return `Você é o ALIX — cérebro da ALETIS, consultoria financeira agro do Christian Kohler.

# Quem é o Christian
Sócio-fundador. Vende reestruturação de dívidas rurais para produtores e cooperativas
(casos vivos: Paulo Luciano/Fertiflora, Ailton/Sicoob). Trabalha 1:1, sem time grande.
Precisa de você como braço direito analítico E EXECUTOR — não como chatbot educado.

# Seu papel REAL
Você é um **consultor sênior agro** operando dentro do sistema ALETIS. Quando o
Christian pergunta algo, seu trabalho é:

1. **OBSERVAR** — quais dados reais existem (CRM, prospecção, dossiês, web)
2. **ORIENTAR** — contextualizar (macro, jurídico, climático, competitivo)
3. **DECIDIR** — recomendar estratégia COM NÚMEROS, explicitamente
4. **AGIR** — executar no sistema (HITL em ações de alto impacto)

Se falta dado, você busca (tool ou delega WebResearcher). Se falta capacidade,
você delega a sub-agentes.

# Sub-agentes à disposição
- **delegate_deal_analyzer** — estudo de caso profundo, estruturação, recomendação (Opus 4.7)
- **delegate_web_researcher** — due-diligence externa (CVM, Jusbrasil, Receita, notícias)
- **delegate_crm_writer** — escrita no CRM (criar/promover/atualizar cliente, proposta) — HITL
- **delegate_doc_generator** — gerar PDF/DOCX/XLSX

Você é PM dos sub-agentes. Eles reportam a você. Você sintetiza para o Christian.

# Tools leves diretas (responda sem delegar)
**Prospecção:** buscar_lead, listar_leads_filtrados, stats_prospeccao, top_leads_by_score
**CRM (leitura):** buscar_cliente, listar_clientes, listar_propostas_cliente, resumo_portfolio_crm
**Mercado/contexto:** cotacoes_hoje — panorama diário (commodities, câmbio, macro)
**Cálculo agro-financeiro:**
  - simular_desenrola_rural (MP 1208/2024 — descontos PGFN/RFB rural)
  - simular_reforma_tributaria (LC 214/2025 — comparativo atual × CBS/IBS)
  - calcular_funrural (receita × folha)
  - avaliar_projeto_custeio (VPL, TIR, payback)
  - financeiro_interno_dashboard / projecao_caixa / margens_clientes (ALETIS própria)
**Clientes:** briefing_cliente, memoria_cliente — leia SEMPRE antes de recomendar ação
  sobre um cliente que o Christian mencionar (por id ou por nome)
**Operação:** agenda_casos — o que está em andamento agora (insights críticos,
  confirmações HITL pendentes). Use proativamente quando o Christian abre a conversa
  sem contexto específico.

# Quando NÃO delegar — pipeline completo com tools leves
Se a pergunta é "estrutura para esse lead", **CHAME onboarding_lead_blueprint** — ela
faz enriquecimento + Desenrola + Funrural + blueprint de ações de uma vez só. Depois
apresente o resumo ao Christian e, se ele confirmar execução, delegue as ações
recomendadas ao sub-agente indicado no blueprint (CRMWriter/DocGenerator) em UMA
ÚNICA delegação composta — o sistema agrupa em batch HITL.

Para timing comercial correto (plantio/colheita/venda), use **calendario_safra** com
a cultura predominante da UF do lead.

SÓ DELEGUE ao DealAnalyzer se precisar de análise macro profunda (>5 tools cruzados,
cenários múltiplos, due-diligence web).

# Como o Christian pensa
- Números com fonte, não frases vagas
- Recomendação explícita ("faria X porque Y"), não lista neutra
- Próxima ação concreta ao final de cada resposta
- Markdown com bullets quando há 3+ itens; texto corrido quando é 1 ideia
- Sem "claro!", "com certeza!"; sem emoji no corpo do texto (emoji de dados OK)
- Aceita discordância técnica se bem fundamentada

# Quando delegar vs responder direto
- Factual rápida ("lista top MT", "busca cliente X", "cotação dólar") → tool leve
- "Analisa", "estuda caso", "recomenda", "estrutura", "vale a pena" → DealAnalyzer
- "Procura", "no Google", "no CVM", "notícias", "processo de" → WebResearcher
- "Cria", "promove", "atualiza", "envia" → CRMWriter
- "Gera PDF/documento" → DocGenerator

# Pipeline canônico: "estuda esse lead"
1. DealAnalyzer com goal="estudo de caso completo" → produz análise OODA
2. Apresenta resumo executivo no chat + oferece próximo passo
3. Pergunta: "Quer que eu execute o onboarding? (promover lead → cliente, criar
   proposta, gerar dossiê, criar tarefa de follow-up)"
4. Se sim → CRMWriter com 1 delegação composta → batch HITL

# MULTI-AÇÃO CRM
Quando o user pede 2+ escritas no CRM na mesma mensagem, faça UMA ÚNICA delegação
ao CRMWriter com intent descrevendo TODAS as ações e payload contendo array "acoes".
O sistema agrupa em batch para confirmação unificada. NÃO faça 2 delegações separadas.

# Regras de voz
- Direto, técnico, SEM floreio. BRL R$ 1.234,56. Datas pt-BR.
- SEMPRE cite fontes (tools ou URLs)
- Tool falhou → diga exatamente o que falhou, não simule
- 3-8 linhas quando possível; bullets quando listar 3+ itens

# NUNCA
- Invente números — sempre puxe da tool
- Prometa garantia ("vai funcionar 100%") — diga "historicamente X% similares deram Y"
- Exponha dados sensíveis de outros clientes em caso específico
- Responda "vou fazer X" e não fazer — se vai executar, execute agora

# REGRAS ANTI-ALUCINAÇÃO (OBRIGATÓRIAS)
1. **Antes de afirmar um número:** você tem que ter chamado uma tool que o produziu. Se não chamou, ou diga "não tenho o dado ainda" ou chame a tool agora.
2. **Se uma tool retornou \`{ error: ... }\`:** trate como dado indisponível, informe o usuário do erro de forma objetiva e proponha alternativa. NÃO finja que a tool funcionou.
3. **Se uma tool retornou timeout:** explique ao usuário que a fonte externa está lenta e ofereça tentar novamente ou seguir sem ela. Nunca invente o que ela teria retornado.
4. **CNPJ, CPF, datas, valores:** só cite se vieram de tool. Se o usuário digitou, confirme antes de usar em decisão.
5. **Precedentes e "casos similares":** só use se \`casos_similares\` retornou dados reais. Nunca mencione "caso X que resolvemos" sem base.
6. **Legislação citada:** só cite artigo/lei quando tiver certeza. Em dúvida, diga "base legal: verificar com advogado" — é melhor que inventar MP que não existe.
7. **Quando não sabe:** responda exatamente isso. "Não tenho essa informação agora" é SEMPRE melhor que texto genérico e impreciso.
8. **Formatação markdown:** tabelas com pipe \`|\`, listas com \`-\`, negrito com \`**\`. Nada de HTML cru. Não use cercas triplas \`\`\` dentro de código inline — quebra o render.

# Quando a tool falhar
Resposta-padrão: "\`[tool_name]\` não retornou dado ([motivo curto]). Posso tentar [alternativa] ou seguir sem essa informação?"
Nunca deixe a mensagem vazia. Nunca travesse.

Data de hoje: ${hoje}`;
  }

  private buildTools(sessionId: string, history: ChatMessage[]): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    const tools: ClaudeTool[] = [];
    const registry: ClaudeToolRegistry = {};

    // Tools leves: só consultas, sem delegar
    const prospec = buildProspeccaoTools();
    const lightNames = new Set(['buscar_lead', 'listar_leads_filtrados', 'stats_prospeccao', 'top_leads_by_score']);
    for (const t of prospec.tools) {
      if (lightNames.has(t.name)) {
        tools.push(t);
        registry[t.name] = prospec.registry[t.name];
      }
    }

    // Calculadoras agro-financeiras (Desenrola, Reforma, Funrural, Custeio, DRE interna)
    const calc = buildCalculatorTools();
    for (const t of calc.tools) {
      tools.push(t);
      registry[t.name] = calc.registry[t.name];
    }

    // CRM read-only (evitar duplicatas, ver portfólio antes de escrever)
    const crmRead = buildCrmReadTools();
    for (const t of crmRead.tools) {
      tools.push(t);
      registry[t.name] = crmRead.registry[t.name];
    }

    // Notícias agro com cache 30min (Fase A.4)
    const news = buildNewsTools();
    for (const t of news.tools) {
      tools.push(t);
      registry[t.name] = news.registry[t.name];
    }

    // Calendário safra (Fase B.3) — timing comercial correto
    const safra = buildCalendarioSafraTools();
    for (const t of safra.tools) {
      tools.push(t);
      registry[t.name] = safra.registry[t.name];
    }

    // Onboarding macro-receita (Fase B.2) — lead → blueprint de pipeline
    const onb = buildOnboardingTools();
    for (const t of onb.tools) {
      tools.push(t);
      registry[t.name] = onb.registry[t.name];
    }

    // Feedback loop (Fase C.1) — tool learnings_recentes
    const fb = buildFeedbackTools();
    for (const t of fb.tools) {
      tools.push(t);
      registry[t.name] = fb.registry[t.name];
    }

    // Playbooks por situação (Fase C.2) — receitas opinativas
    const pb = buildPlaybooksTools();
    for (const t of pb.tools) {
      tools.push(t);
      registry[t.name] = pb.registry[t.name];
    }

    // Similaridade entre casos (Fase C.3) — precedentes por feature-hash
    const sim = buildSimilaridadeTools();
    for (const t of sim.tools) {
      tools.push(t);
      registry[t.name] = sim.registry[t.name];
    }

    // Clima/ambiental INPE/CEMADEN/FIRMS/DETER (Fase D.1)
    const clima = buildClimaTools();
    for (const t of clima.tools) { tools.push(t); registry[t.name] = clima.registry[t.name]; }

    // SICAR individual com captcha (Fase D.2)
    const sicar = buildSicarLiveTools();
    for (const t of sicar.tools) { tools.push(t); registry[t.name] = sicar.registry[t.name]; }

    // Processos TJ (Fase D.3)
    const tjs = buildTjProcessosTools();
    for (const t of tjs.tools) { tools.push(t); registry[t.name] = tjs.registry[t.name]; }

    // INCRA/SIGEF (Fase D.4)
    const incra = buildIncraSigefTools();
    for (const t of incra.tools) { tools.push(t); registry[t.name] = incra.registry[t.name]; }

    // Inventário patrimonial + custo operacional por cultura
    const inv = buildInventarioTools();
    for (const t of inv.tools) { tools.push(t); registry[t.name] = inv.registry[t.name]; }

    // Power tools — CusteioService write, DSCR, simular reestruturação,
    // contratos, magic-link/pendência/WhatsApp on-demand, extração de docs
    const pw = buildAlixPowerTools();
    for (const t of pw.tools) { tools.push(t); registry[t.name] = pw.registry[t.name]; }

    // Wave A5 — fechamento do loop proativo: listar insights pendentes +
    // responder (ack/done/snooze/descartar). Permite ALIX acompanhar o que
    // Christian já agiu e não repetir.
    const pi = buildProactiveInsightsTools();
    for (const t of pi.tools) { tools.push(t); registry[t.name] = pi.registry[t.name]; }

    // Wave B1 — alertas de mercado por cliente (CRUD + ListAll).
    const ar = buildAlertRulesTools();
    for (const t of ar.tools) { tools.push(t); registry[t.name] = ar.registry[t.name]; }

    // Wave Documentos — 10 contratos/anexos oficiais ALETIS preservando
    // formatação. Tools: listar/preview/gerar contrato oficial.
    const cof = buildContratosOficiaisTools();
    for (const t of cof.tools) { tools.push(t); registry[t.name] = cof.registry[t.name]; }

    // Delegações
    const ctxBase = (): SubAgentContext => ({
      sessionId,
      orchestratorHistory: history.slice(-10),
      parentToolCalls: ['orchestrator'],
      hitl: true,
    });

    const runSubAgent = async (agent: SubAgent, goal: string, extra?: Partial<SubAgentContext>): Promise<SubAgentResult> => {
      const ctx: SubAgentContext = { ...ctxBase(), ...extra };
      return agent.run(goal, ctx);
    };

    const dealAnalyzerTool: ClaudeTool = {
      name: 'delegate_deal_analyzer',
      description: 'Delega análise estratégica profunda (estudo de caso, estruturação, recomendação) ao DealAnalyzer. Use para qualquer pedido de analisar/estudar/recomendar sobre cliente ou lead.',
      input_schema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Objetivo concreto da análise' },
          clienteId: { type: 'string' },
          leadCpfCnpj: { type: 'string' },
        },
        required: ['goal'],
      },
    };
    tools.push(dealAnalyzerTool);
    registry['delegate_deal_analyzer'] = {
      spec: dealAnalyzerTool,
      handler: async (i) => runSubAgent(this.dealAnalyzer, String(i.goal), {
        clienteId: i.clienteId as string | undefined,
        leadCpfCnpj: i.leadCpfCnpj as string | undefined,
      }),
    };

    const webResearcherTool: ClaudeTool = {
      name: 'delegate_web_researcher',
      description: 'Delega due-diligence externa (web, CVM, Jusbrasil, Receita, notícias) ao WebResearcher.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    };
    tools.push(webResearcherTool);
    registry['delegate_web_researcher'] = {
      spec: webResearcherTool,
      handler: async (i) => runSubAgent(this.webResearcher, String(i.query)),
    };

    const crmWriterTool: ClaudeTool = {
      name: 'delegate_crm_writer',
      description: 'Delega ação de escrita ao CRMWriter. Em F3, apenas planeja a ação — execução real chega em F4.',
      input_schema: {
        type: 'object',
        properties: { intent: { type: 'string' }, payload: { type: 'object' } },
        required: ['intent'],
      },
    };
    tools.push(crmWriterTool);
    registry['delegate_crm_writer'] = {
      spec: crmWriterTool,
      handler: async (i) => {
        const sub = await runSubAgent(this.crmWriter, `${i.intent}\n\nPayload:\n${JSON.stringify(i.payload, null, 2)}`);
        // Se sub-agente criou 2+ pendings, agrupa em batch (heurística: N depende de N-1)
        if (sub.pendingConfirmations && sub.pendingConfirmations.length >= 2) {
          const store = getAlixConfirmationStore();
          const individuals = sub.pendingConfirmations
            .map(id => store.get(id))
            .filter((p): p is NonNullable<typeof p> => Boolean(p));
          if (individuals.length >= 2) {
            const items = individuals.map((p, idx) => ({
              toolName: p.toolName,
              description: p.description,
              payload: p.payload,
              dependsOn: idx > 0 ? idx - 1 : undefined,
            }));
            for (const id of sub.pendingConfirmations) store.consume(id);
            const batch = store.createBatch(sessionId, `Pipeline ${sub.agent}`, items);
            return { ...sub, batch: { batchId: batch.batchId, pendingCount: batch.pendings.length } };
          }
        }
        return sub;
      },
    };

    const docGenTool: ClaudeTool = {
      name: 'delegate_doc_generator',
      description: 'Delega geração de artefato ao DocGenerator.',
      input_schema: {
        type: 'object',
        properties: { tipo: { type: 'string' }, input: { type: 'object' } },
        required: ['tipo'],
      },
    };
    tools.push(docGenTool);
    registry['delegate_doc_generator'] = {
      spec: docGenTool,
      handler: async (i) => runSubAgent(this.docGenerator, `Tipo: ${i.tipo}\n\nInput:\n${JSON.stringify(i.input, null, 2)}`),
    };

    // ────────────────────────────────────────────────────────────
    // Tools leves PROATIVAS — permitem resposta direta sem delegar.
    // Essenciais para o perfil "consultor sênior sempre contextualizado".
    // ────────────────────────────────────────────────────────────

    const cotacoesTool: ClaudeTool = {
      name: 'cotacoes_hoje',
      description: 'Retorna panorama de mercado do dia: commodities (soja, milho, boi), câmbio (USD/EUR), macro (Selic, CDI, IPCA), incêndios agro e alertas. Use SEMPRE que o Christian pedir cotação, câmbio, preços, alerta de mercado.',
      input_schema: { type: 'object', properties: {} },
    };
    tools.push(cotacoesTool);
    registry['cotacoes_hoje'] = {
      spec: cotacoesTool,
      handler: async () => {
        try {
          const brief = await new MarketBriefService(this.dsm).generateBrief()
          return {
            data: brief.data,
            macro: brief.macro,
            cambio: brief.cambio,
            topAltas: brief.topAltas.slice(0, 5),
            topBaixas: brief.topBaixas.slice(0, 5),
            alertas: brief.alertas?.slice(0, 5) ?? [],
            narrativa: brief.narrativaExecutiva || brief.narrativaCurta,
          }
        } catch (err) {
          return { error: `cotações falharam: ${(err as Error).message}` }
        }
      },
    };

    const briefingClienteTool: ClaudeTool = {
      name: 'briefing_cliente',
      description: 'Retorna briefing completo de um cliente ALETIS (memória + análise + BSC + próximas ações). Use sempre que o Christian mencionar um cliente específico — antes de analisar, leia a memória.',
      input_schema: {
        type: 'object',
        properties: { clienteId: { type: 'string', description: 'ID do cliente no CRM' } },
        required: ['clienteId'],
      },
    };
    tools.push(briefingClienteTool);
    registry['briefing_cliente'] = {
      spec: briefingClienteTool,
      handler: async (i) => {
        try {
          const { getBriefingService } = await import('./memory/BriefingService.js')
          const svc = getBriefingService()
          return await svc.gerar(String(i.clienteId))
        } catch (err) {
          return { error: `briefing falhou: ${(err as Error).message}` }
        }
      },
    };

    const agendaCasosTool: ClaudeTool = {
      name: 'agenda_casos',
      description: 'Lista os casos em andamento (clientes com propostas ativas) e últimos insights proativos. Use para o Christian saber "o que tá acontecendo agora".',
      input_schema: { type: 'object', properties: {} },
    };
    tools.push(agendaCasosTool);
    registry['agenda_casos'] = {
      spec: agendaCasosTool,
      handler: async () => {
        try {
          const proactive = getProactiveService(getProspeccaoService(), this.storageDir.includes('alix-sessions') ? this.storageDir.replace(/\/alix-sessions$/, '') : this.storageDir)
          const insightsRecentes = await proactive.getRecentInsights(3)
          // Pega pendings HITL abertos
          const store = getAlixConfirmationStore()
          const pendingsAll = (store as any).list ? (store as any).list() : []
          return {
            insightsTotal: insightsRecentes.length,
            insightsCriticos: insightsRecentes.filter(i => i.urgencia === 'critico').slice(0, 5),
            insightsImportantes: insightsRecentes.filter(i => i.urgencia === 'importante').slice(0, 5),
            confirmacoesPendentes: pendingsAll.length,
            hoje: new Date().toISOString().slice(0, 10),
          }
        } catch (err) {
          return { error: `agenda falhou: ${(err as Error).message}` }
        }
      },
    };

    const memoriaClienteTool: ClaudeTool = {
      name: 'memoria_cliente',
      description: 'Lê a memória persistente de um cliente (perfil, dívidas, decisões, alertas, histórico de interações Alix×Christian). Use antes de recomendar ação para não repetir o que já foi decidido.',
      input_schema: {
        type: 'object',
        properties: { clienteId: { type: 'string' } },
        required: ['clienteId'],
      },
    };
    tools.push(memoriaClienteTool);
    registry['memoria_cliente'] = {
      spec: memoriaClienteTool,
      handler: async (i) => {
        try {
          const mem = getAlixMemoryService()
          // mem.render() é async — sem await retornava Promise<unknown>
          // serializada como "[object Object]" no contexto Claude (bug histórico).
          const markdown = await mem.render(String(i.clienteId))
          return { markdown }
        } catch (err) {
          return { error: `memória falhou: ${(err as Error).message}` }
        }
      },
    };

    return { tools, registry };
  }

  /**
   * Monta um bloco de insights proativos para injetar no contexto do Alix.
   * Só retorna algo se houver insights ainda não surfaceados (últimas 48h).
   */
  private async buildInsightsContext(): Promise<string | null> {
    try {
      const proactive = getProactiveService(getProspeccaoService(), this.storageDir.includes('alix-sessions') ? this.storageDir.replace(/\/alix-sessions$/, '') : this.storageDir);
      const insights = await proactive.getUnsurfacedInsights(2);
      if (insights.length === 0) return null;
      const criticos = insights.filter(i => i.urgencia === 'critico').slice(0, 3);
      const importantes = insights.filter(i => i.urgencia === 'importante').slice(0, 3);
      if (criticos.length === 0 && importantes.length === 0) return null;

      const lines: string[] = ['**NOVIDADES DESDE NOSSA ÚLTIMA CONVERSA** (surfaceado automaticamente):'];
      if (criticos.length) {
        lines.push('\n🔴 **Crítico:**');
        for (const i of criticos) lines.push(`- ${i.titulo} — ${i.detalhes}`);
      }
      if (importantes.length) {
        lines.push('\n🟡 **Importante:**');
        for (const i of importantes) lines.push(`- ${i.titulo} — ${i.detalhes}`);
      }
      lines.push('\nSe o Christian perguntar sobre essas novidades, use as tools para aprofundar. Ele pode também ignorar e focar em outra coisa.');
      return lines.join('\n');
    } catch (err) {
      console.warn('[Orchestrator] buildInsightsContext falhou:', (err as Error).message);
      return null;
    }
  }

  async chat(
    sessionId: string | undefined,
    message: string,
    opts?: {
      onToolCall?: (name: string) => void;
      attachments?: string[];
      clienteId?: string;
    },
  ): Promise<{ reply: string; session: ChatSession }> {
    const session = await this.loadOrCreateSession(sessionId);
    const attachments = Array.isArray(opts?.attachments) ? opts!.attachments!.filter(Boolean) : [];
    const clienteId = typeof opts?.clienteId === 'string' && opts.clienteId.trim() ? opts.clienteId.trim() : undefined;
    const userMsg: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    if (attachments.length > 0 || clienteId) {
      (userMsg as ChatMessage).metadata = { attachments: attachments.length ? attachments : undefined, clienteId };
    }
    session.messages.push(userMsg);

    // ALIX Auditável — abre trail antes de executar (id da resposta pré-gerado)
    const assistantMessageId = randomUUID();
    const auditService = getAlixAuditTrailService(this.storageDir);
    const trailKey = `${session.id}:${assistantMessageId}`;
    auditService.startTrail(trailKey, session.id);

    const { tools, registry } = this.buildTools(session.id, session.messages);
    let system = this.buildSystemPrompt();

    // Alix proativa — injeta insights não-surfaceados
    const insightsContext = await this.buildInsightsContext();
    if (insightsContext) {
      system += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${insightsContext}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    }

    // Lições aprendidas recentes (Fase C.1) — evitar repetir erros
    try {
      const learnings = await getFeedbackService(this.storageDir).recentLearnings(8);
      if (learnings.length > 0) {
        const lines = ['**LIÇÕES RECENTES** (evite repetir esses padrões):'];
        for (const l of learnings) {
          const icon = l.rating === 'incorreto' ? '❌' : l.rating === 'off-tom' ? '🎭' : '⚠️';
          lines.push(`${icon} [${l.quando} · ${l.rating}] ${l.resumo}`);
        }
        system += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
      }
    } catch (err) {
      console.warn('[Orchestrator] learnings falhou:', (err as Error).message);
    }

    // Sliding window: só as N últimas mensagens vão pro Claude.
    // Sem isso, sessões de 30+ trocas mandavam 100k+ tokens por chamada,
    // crescimento linear ilimitado. Default: 30 mensagens (~15 trocas)
    // — suficiente para coerência local mantendo custo controlado.
    // O system prompt + memória persistente do cliente já carregam o
    // contexto longo; a janela só limita o "scrollback" do chat.
    const HISTORY_WINDOW = Number(process.env.ALIX_HISTORY_WINDOW) || 30;
    const allTurns = session.messages.filter(m => m.role !== 'system');
    const truncated = allTurns.length > HISTORY_WINDOW
      ? allTurns.slice(-HISTORY_WINDOW)
      : allTurns;
    const messages: ClaudeMessage[] = truncated
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Anexa documentos como blocos multimodais no último user turn.
    // Suporta: imagem (base64) e texto extraído (PDF, DOCX, XLSX, etc).
    if (attachments.length > 0) {
      try {
        const intake = getDocumentIntakeService();
        const blocks: Array<Record<string, unknown>> = [];
        for (const docId of attachments) {
          const doc = await intake.get(session.id, docId);
          if (!doc) continue;
          if (doc.kind === 'image' && doc.imageBase64 && doc.imageMediaType) {
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: doc.imageMediaType, data: doc.imageBase64 },
            });
            blocks.push({ type: 'text', text: `[Imagem anexada: ${doc.filename}]` });
          } else if (doc.extractedText && doc.extractedText.trim()) {
            const texto = doc.extractedText.length > 50000
              ? doc.extractedText.slice(0, 50000) + '\n…(truncado)'
              : doc.extractedText;
            blocks.push({
              type: 'text',
              text: `<document id="${doc.id}" filename="${doc.filename}" kind="${doc.kind}"${doc.pageCount ? ` pages="${doc.pageCount}"` : ''}>\n${texto}\n</document>`,
            });
          } else {
            blocks.push({
              type: 'text',
              text: `[Anexo "${doc.filename}" (${doc.kind}) sem texto extraído — ignore se irrelevante]`,
            });
          }
        }
        if (blocks.length > 0 && messages.length > 0) {
          blocks.push({ type: 'text', text: message });
          messages[messages.length - 1] = { role: 'user', content: blocks };
        }
      } catch (err) {
        console.warn('[Orchestrator] anexos falharam:', (err as Error).message);
      }
    }

    // Hint de cliente ativo via system text (sem mexer nas mensagens)
    if (clienteId) {
      system += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n**CLIENTE ATIVO** (foco da sessão): ${clienteId}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    }

    const toolsUsed: string[] = [];
    const startedAt = Date.now();
    // Envelopa todos os handlers com safeHandler — nunca propaga throw para o loop.
    // Tools externas (rede) ganham timeout maior; cálculos locais default.
    const safeRegistry = safeWrapRegistry(registry, {
      defaultTimeoutMs: 25_000,
      overrides: {
        consultar_car_individual: 60_000,   // 2captcha demora ~30s
        delegate_deal_analyzer: 120_000,    // Opus com thinking
        delegate_web_researcher: 90_000,
        delegate_crm_writer: 45_000,
        delegate_doc_generator: 60_000,
        enriquecer_lead: 45_000,             // BrasilAPI + SICAR
        onboarding_lead_blueprint: 60_000,  // compõe várias tools
        noticias_agro_hoje: 45_000,
        cotacoes_hoje: 20_000,
        alertas_climaticos_agro: 25_000,
        consultar_processos_tj: 45_000,
        consultar_sigef_por_proprietario: 30_000,
      },
    });
    const result = await runClaude(messages, {
      model: this.model,
      maxTokens: 4000,
      maxIterations: 10,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] as any,
      tools,
      toolRegistry: safeRegistry,
      onToolCall: (n, params, result, latencyMs) => {
        toolsUsed.push(n);
        try { opts?.onToolCall?.(n); } catch { /* stream pode ter fechado */ }
        try {
          auditService.recordToolCall(trailKey, n, params, result, latencyMs);
        } catch { /* audit é best-effort */ }
      },
    });
    const latencyMs = Date.now() - startedAt;

    // Telemetria
    const rec: TelemetryRecord = {
      ts: new Date().toISOString(),
      sessionId: session.id,
      agent: 'Orchestrator',
      model: this.model,
      iter: result.iterations ?? 1,
      toolCalls: toolsUsed,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
      cacheRead: result.usage?.cache_read_input_tokens ?? 0,
      cacheCreate: result.usage?.cache_creation_input_tokens ?? 0,
      latencyMs,
    };
    rec.costUsd = estimateCostUsd(rec);
    appendTelemetry(this.storageDir, rec);

    const assistant: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: result.text,
      timestamp: Date.now(),
      toolsUsed,
    };
    session.messages.push(assistant);
    session.updatedAt = Date.now();
    await this.saveSession(session);

    // Fecha o trail (gera totalLatency + persiste em jsonl)
    auditService.finishTrail(trailKey);

    return { reply: result.text, session };
  }

  private sessionPath(id: string): string {
    return join(this.storageDir, `${id}.json`);
  }

  async loadOrCreateSession(sessionId?: string): Promise<ChatSession> {
    if (sessionId) {
      try {
        const raw = await fs.readFile(this.sessionPath(sessionId), 'utf-8');
        return JSON.parse(raw);
      } catch {
        /* novo session */
      }
    }
    const now = Date.now();
    return {
      id: sessionId ?? randomUUID(),
      title: 'Nova conversa',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
  }

  private async saveSession(s: ChatSession): Promise<void> {
    await fs.writeFile(this.sessionPath(s.id), JSON.stringify(s, null, 2));
    // Dual-write best-effort: espelha sessão+mensagens no PG. Mantém disco
    // como source-of-truth runtime e PG como queryability/restart-safety.
    try {
      const { upsertSession } = await import('../../db/AlixSessionRepository.js');
      await upsertSession(s as unknown as Parameters<typeof upsertSession>[0]);
    } catch {
      /* best-effort */
    }
  }
}
