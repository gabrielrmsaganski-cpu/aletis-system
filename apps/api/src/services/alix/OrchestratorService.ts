// ============================================================
// OrchestratorService — o Alix principal
// Roteia para 4 sub-agentes via delegate_* tools; responde direto
// perguntas factuais com tools leves.
// ============================================================

import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { DataSourceManager } from '../DataSourceManager.js';
import type { ChatSession, ChatMessage } from '../AlixService.js';
import { runClaude, type ClaudeTool, type ClaudeToolRegistry, type ClaudeMessage, isLLMEnabled, pingFoundryThinking } from '../llm/ClaudeFoundryClient.js';
import { DealAnalyzerAgent } from './agents/DealAnalyzerAgent.js';
import { WebResearcherAgent } from './agents/WebResearcherAgent.js';
import { CRMWriterAgent } from './agents/CRMWriterAgent.js';
import { DocGeneratorAgent } from './agents/DocGeneratorAgent.js';
import type { SubAgent, SubAgentContext, SubAgentResult } from './agents/types.js';
import { buildProspeccaoTools } from './tools/prospeccao.js';

export interface OrchestratorOpts {
  thinkingSupported?: boolean;
}

export class OrchestratorService {
  private dealAnalyzer: DealAnalyzerAgent;
  private webResearcher: WebResearcherAgent;
  private crmWriter: CRMWriterAgent;
  private docGenerator: DocGeneratorAgent;

  constructor(private dsm: DataSourceManager, private storageDir: string, opts: OrchestratorOpts = {}) {
    this.dealAnalyzer = new DealAnalyzerAgent({ thinkingSupported: opts.thinkingSupported });
    this.webResearcher = new WebResearcherAgent();
    this.crmWriter = new CRMWriterAgent();
    this.docGenerator = new DocGeneratorAgent();
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

Você é o consultor sênior que o Christian usa como braço direito. Não é chatbot.

Você tem 4 sub-agentes que pode delegar:
- delegate_deal_analyzer: estudo de caso profundo, estruturação financeira, recomendação estratégica
- delegate_web_researcher: due-diligence externa (web, CVM, Jusbrasil, Receita, notícias)
- delegate_crm_writer: escrita no CRM (em F3 só low-impact; alto impacto chega em F4)
- delegate_doc_generator: gerar PDF/DOCX/XLSX (stub em F3)

Também tem tools leves para responder direto sem delegar (buscar_lead, listar_leads_filtrados, stats_prospeccao, top_leads_by_score).

Quando delegar vs responder direto:
- Pergunta factual rápida (ex: "lista top leads MT", "busca cliente X") → tool leve, SEM delegar
- "Analisa", "estuda caso", "recomenda estratégia", "estrutura", "vale a pena" → SEMPRE delega DealAnalyzer
- "Procura", "no Google", "no CVM", "notícias" → delega WebResearcher
- "Cria", "promove", "atualiza", "envia" → delega CRMWriter
- "Gera PDF/documento" → delega DocGenerator

Voz: direto, técnico, sem floreio. BRL R$ 1.234,56. Datas pt-BR. Sempre cite fontes.

Data: ${hoje}`;
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
      handler: async (i) => runSubAgent(this.crmWriter, `${i.intent}\n\nPayload:\n${JSON.stringify(i.payload, null, 2)}`),
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
    const result = await runClaude(messages, {
      model: this.model,
      maxTokens: 4000,
      maxIterations: 10,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] as any,
      tools,
      toolRegistry: registry,
      onToolCall: (n) => toolsUsed.push(n),
    });

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
