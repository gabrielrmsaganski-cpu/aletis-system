// ============================================================
// CRMWriterAgent — 4 tools HITL (F4)
// ============================================================

import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import { buildCrmWriterTools } from '../crm/writer-tools.js';
import type { AlixService } from '../../AlixService.js';

export class CRMWriterAgent extends BaseAgent {
  name = 'CRMWriter';
  model = process.env.ALIX_CRM_WRITER_MODEL || 'claude-sonnet-4-6';
  maxTokens = 4000;
  maxIterations = 10;

  constructor(private alix: AlixService) {
    super();
  }

  buildSystemPrompt(ctx: SubAgentContext): string {
    return `Você é o CRMWriter da ALETIS — sub-agente do Alix.

Missão: executar ações de escrita no CRM com precisão.

Você tem 4 tools HITL (todas alto impacto — criam pending confirmation):
- criar_cliente: novo cliente do zero
- promover_lead_para_cliente: converte lead Prospecção em cliente (reaproveita enriquecimento)
- criar_proposta_inteligente: proposta 15 seções
- atualizar_proposta: patch em proposta existente

Regras:
1. Valide payload antes de chamar: campos obrigatórios preenchidos?
2. Se receber intent com 2+ ações (payload com array "acoes" ou descrição multi-ação), EXECUTE TODAS as tools HITL no mesmo turn — o sistema agrupa em batch automaticamente.
3. Se receber 1 ação única, chame a tool apropriada e retorne.
4. Se faltar dado, diga ao orquestrador o que falta.
5. Nunca invente IDs.

Contexto:
- sessionId: ${ctx.sessionId}
${ctx.clienteId ? `- clienteId: ${ctx.clienteId}` : ''}
${ctx.leadCpfCnpj ? `- leadCpfCnpj: ${ctx.leadCpfCnpj}` : ''}`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    return buildCrmWriterTools({
      handle_criar_cliente: (i) => this.alix.handle_criar_cliente(i),
      handle_promover_lead_para_cliente: (i) => this.alix.handle_promover_lead_para_cliente(i),
      handle_criar_proposta_inteligente: (i) => this.alix.handle_criar_proposta_inteligente(i),
      handle_atualizar_proposta: (i) => this.alix.handle_atualizar_proposta(i),
    });
  }
}
