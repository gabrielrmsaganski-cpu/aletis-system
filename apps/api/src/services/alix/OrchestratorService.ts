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
import { getAlixConfirmationStore } from './AlixConfirmationStore.js';
import { appendTelemetry, estimateCostUsd, type TelemetryRecord } from './telemetry.js';

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
buscar_lead, listar_leads_filtrados, stats_prospeccao, top_leads_by_score — para
perguntas factuais rápidas.

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

    return { tools, registry };
  }

  async chat(sessionId: string | undefined, message: string): Promise<{ reply: string; session: ChatSession }> {
    const session = await this.loadOrCreateSession(sessionId);
    session.messages.push({ id: randomUUID(), role: 'user', content: message, timestamp: Date.now() });

    const { tools, registry } = this.buildTools(session.id, session.messages);
    const system = this.buildSystemPrompt();

    const messages: ClaudeMessage[] = session.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const toolsUsed: string[] = [];
    const startedAt = Date.now();
    const result = await runClaude(messages, {
      model: this.model,
      maxTokens: 4000,
      maxIterations: 10,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] as any,
      tools,
      toolRegistry: registry,
      onToolCall: (n) => toolsUsed.push(n),
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
      id: randomUUID(),
      role: 'assistant',
      content: result.text,
      timestamp: Date.now(),
      toolsUsed,
    };
    session.messages.push(assistant);
    session.updatedAt = Date.now();
    await this.saveSession(session);

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
  }
}
