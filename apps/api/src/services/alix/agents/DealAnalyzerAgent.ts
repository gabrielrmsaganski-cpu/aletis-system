// ============================================================
// DealAnalyzerAgent — análise estratégica profunda (Opus 4.7)
// ============================================================

import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import { buildProspeccaoTools } from '../tools/prospeccao.js';
import { buildCalculatorTools } from '../tools/calculators.js';
import { buildCrmReadTools } from '../tools/crm-read.js';
// Memory disponível ao agente via tool `memoria_cliente` do Orchestrator;
// aqui apenas hintamos no prompt quando há clienteId.

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
    // Nota: render() é async — preenchimento em memoriaBloco aqui seria Promise.
    // Para manter buildSystemPrompt síncrono, apenas sinalizamos que memória está
    // disponível via tool memoria_cliente. O LLM chama a tool se precisar.
    const memoriaHint = ctx.clienteId
      ? `\nObs: memória persistente disponível — chame **memoria_cliente(clienteId="${ctx.clienteId}")** na primeira iteração.`
      : ''

    return `Você é o DealAnalyzer da ALETIS — consultoria financeira agro do Christian Kohler.

Missão: dado um cliente ou lead, produzir um ESTUDO DE CASO OODA COMPLETO.

Estrutura obrigatória:
1. **OBSERVE** — fatos (dívidas, garantias, produção, cadastro, sócios, situação fiscal).
   Use **buscar_cliente / listar_propostas_cliente** se for cliente ALETIS, senão
   **buscar_lead / enriquecer_lead** para trazer CNPJ/CAR/área.
2. **ORIENT** — contexto: macro (use **simular_reforma_tributaria** se fizer sentido,
   **calcular_funrural** para avaliar carga), jurídico (MCR/STJ/Proagro), climático.
3. **DECIDE** — estratégia recomendada COM NÚMEROS. Se houver dívida PGFN/RFB rural
   pós-2023, use **simular_desenrola_rural** e traga desconto/cronograma EXPLÍCITOS.
4. **ACT** — próximas ações concretas que o Christian deve tomar.

Use tools para puxar TUDO — NUNCA invente números. Se faltar contexto externo, sinalize no ACT.

Contexto:
- sessionId: ${ctx.sessionId}
${ctx.clienteId ? `- clienteId alvo: ${ctx.clienteId}` : ''}
${ctx.leadCpfCnpj ? `- leadCpfCnpj alvo: ${ctx.leadCpfCnpj}` : ''}
${memoriaHint}

Data de hoje: ${new Date().toISOString().slice(0, 10)}

Entregue markdown estruturado. Cite fontes (tools e URLs). Seja cirúrgico.`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    const tools: ClaudeTool[] = [];
    const registry: ClaudeToolRegistry = {};

    // Prospecção completa (6 tools: buscar, listar, enriquecer, stats, top, registrar contato)
    const prospec = buildProspeccaoTools();
    tools.push(...prospec.tools);
    Object.assign(registry, prospec.registry);

    // Calculadoras (Desenrola, Reforma, Funrural, Custeio, DRE)
    const calc = buildCalculatorTools();
    tools.push(...calc.tools);
    Object.assign(registry, calc.registry);

    // CRM read — ver se lead já é cliente, checar propostas existentes
    const crm = buildCrmReadTools();
    tools.push(...crm.tools);
    Object.assign(registry, crm.registry);

    return { tools, registry };
  }
}
