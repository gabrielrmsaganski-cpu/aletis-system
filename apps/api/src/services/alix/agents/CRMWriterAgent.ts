// ============================================================
// CRMWriterAgent — escrita no CRM (F3: stub; F4 adiciona tools HITL)
// ============================================================

import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';

export class CRMWriterAgent extends BaseAgent {
  name = 'CRMWriter';
  model = process.env.ALIX_CRM_WRITER_MODEL || 'claude-sonnet-4-6';
  maxTokens = 4000;
  maxIterations = 10;

  buildSystemPrompt(ctx: SubAgentContext): string {
    return `Você é o CRMWriter da ALETIS — sub-agente do Alix.

Missão: executar ações de escrita no CRM com precisão.

Em F3, stub: você não tem tools HITL ainda (F4 trará criar_cliente, criar_proposta, promover_lead, etc). Por ora, descreva o plano de ação ao orquestrador — quais payloads precisaria, o que validar antes, quais confirmações seriam criadas.

Contexto:
- sessionId: ${ctx.sessionId}
${ctx.clienteId ? `- clienteId alvo: ${ctx.clienteId}` : ''}

Regras:
1. Valide payload antes — se falta dado, explicite o que falta.
2. Retorne um mini-plano estruturado (JSON + markdown).
3. Nunca invente IDs.`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    return { tools: [], registry: {} };
  }
}
