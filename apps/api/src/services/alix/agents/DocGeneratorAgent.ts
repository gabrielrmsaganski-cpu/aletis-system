// ============================================================
// DocGeneratorAgent — geração de artefatos (F3 stub; Plano 3 conecta geradores Wave 9)
// ============================================================

import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';

export class DocGeneratorAgent extends BaseAgent {
  name = 'DocGenerator';
  model = process.env.ALIX_DOC_GENERATOR_MODEL || 'claude-sonnet-4-6';
  maxTokens = 6000;
  maxIterations = 8;

  buildSystemPrompt(ctx: SubAgentContext): string {
    return `Você é o DocGenerator da ALETIS.

Missão: receber input estruturado, escolher a tool de geração (proposta, parecer, BSC, fluxo, dossiê), retornar URL do artefato.

Em F3 você está em stub — a conexão com os geradores Wave 9 acontece no Plano 3.

sessionId: ${ctx.sessionId}

Por ora, descreva o artefato que seria gerado e seu conteúdo em markdown.`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    return { tools: [], registry: {} };
  }
}
