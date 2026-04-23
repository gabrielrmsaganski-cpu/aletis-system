// ============================================================
// DealAnalyzerAgent — análise estratégica profunda (Opus 4.7)
// ============================================================

import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import { buildProspeccaoTools } from '../tools/prospeccao.js';

export class DealAnalyzerAgent extends BaseAgent {
  name = 'DealAnalyzer';
  model = process.env.ALIX_DEAL_ANALYZER_MODEL || 'claude-opus-4-7';
  maxTokens = 16000;
  maxIterations = 25;
  declare thinking: { type: 'enabled'; budget_tokens: number } | undefined;

  constructor(opts?: { thinkingSupported?: boolean }) {
    super();
    if (opts?.thinkingSupported) {
      this.thinking = { type: 'enabled', budget_tokens: 8000 };
    }
  }

  buildSystemPrompt(ctx: SubAgentContext): string {
    return `Você é o DealAnalyzer da ALETIS — consultoria financeira agro do Christian Kohler.

Missão: dado um cliente ou lead, produzir um ESTUDO DE CASO OODA COMPLETO.

Estrutura obrigatória:
1. **OBSERVE** — fatos (dívidas, garantias, produção, cadastro, sócios, situação fiscal)
2. **ORIENT** — contexto: macro, jurídico (MCR/STJ/Proagro), climático, competitivo
3. **DECIDE** — estratégia recomendada COM NÚMEROS e precedentes
4. **ACT** — próximas ações concretas que o Christian deve tomar

Use tools para puxar TUDO — não invente. Se faltar contexto externo, sinalize no ACT.

Contexto:
- sessionId: ${ctx.sessionId}
${ctx.clienteId ? `- clienteId alvo: ${ctx.clienteId}` : ''}
${ctx.leadCpfCnpj ? `- leadCpfCnpj alvo: ${ctx.leadCpfCnpj}` : ''}

Data de hoje: ${new Date().toISOString().slice(0, 10)}

Entregue markdown estruturado. Cite fontes (tools e URLs). Seja cirúrgico.`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    const tools: ClaudeTool[] = [];
    const registry: ClaudeToolRegistry = {};

    const prospec = buildProspeccaoTools();
    tools.push(...prospec.tools);
    Object.assign(registry, prospec.registry);

    // F3: tools adicionais (CRM/dossiê/KB/simuladores) serão conectadas
    // pelo Orchestrator via delegate_* em flows mais complexos. Aqui mantemos
    // foco na prospecção para provar delegação E2E.

    return { tools, registry };
  }
}
