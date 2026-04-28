// ============================================================
// ALETIS — SubAgent types (Alix Insano, multi-agent skeleton)
// ============================================================

import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import type { ChatMessage } from '../../AlixService.js';

export interface SubAgentContext {
  sessionId: string;
  clienteId?: string;
  leadCpfCnpj?: string;
  /** Últimas N mensagens do chat do orquestrador para contexto. */
  orchestratorHistory: ChatMessage[];
  /** Tools já invocadas na cadeia de delegação — evita recursão infinita. */
  parentToolCalls: string[];
  /** Se HITL é requerido para ações de alto impacto. Default true. */
  hitl: boolean;
  /**
   * Trail key do AlixAuditTrailService onde as tools deste sub-agent
   * devem ser registradas (compartilhado com o Orchestrator pai).
   * Quando definido, BaseAgent.run propaga (toolName, params, result,
   * latency) para o serviço de audit, prefixando toolName com o nome
   * do agente para distinção.
   */
  auditTrailKey?: string;
}

export interface SubAgentArtifact {
  type: 'pdf' | 'docx' | 'xlsx' | 'markdown' | 'json';
  url?: string;
  data?: unknown;
}

export interface SubAgentUsage {
  inputTokens: number;
  outputTokens: number;
  iterations: number;
  thinkingTokens?: number;
  cacheRead?: number;
  cacheCreate?: number;
  latencyMs?: number;
}

export interface SubAgentResult {
  agent: string;
  /** Markdown que o Orchestrator vai digerir e potencialmente entregar ao usuário. */
  summary: string;
  artifacts?: SubAgentArtifact[];
  toolCalls: string[];
  pendingConfirmations?: string[];
  usage: SubAgentUsage;
}

export interface SubAgent {
  name: string;
  model: string;
  buildSystemPrompt(ctx: SubAgentContext): string;
  buildTools(ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry };
  run(goal: string, ctx: SubAgentContext): Promise<SubAgentResult>;
}

/** Limite de aninhamento de delegações para evitar loop. */
export const MAX_DELEGATION_DEPTH = 3;

export class DelegationLoopError extends Error {
  constructor(chain: string[]) {
    super(`Delegation depth exceeded: ${chain.join(' → ')}`);
    this.name = 'DelegationLoopError';
  }
}
