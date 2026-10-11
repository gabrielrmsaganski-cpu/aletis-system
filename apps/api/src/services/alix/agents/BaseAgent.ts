// ============================================================
// ALETIS — BaseAgent (abstração comum a todos sub-agentes)
// ============================================================

import { runOpenAI, type LLMMessage, type LLMTool, type LLMToolRegistry } from '../../llm/OpenAIClient.js';
import {
  type SubAgent,
  type SubAgentContext,
  type SubAgentResult,
  MAX_DELEGATION_DEPTH,
  DelegationLoopError,
} from './types.js';
import { getAlixAuditTrailService } from '../AlixAuditTrailService.js';
import { observeToolRegistry } from '../tools/ToolOutcome.js';
import { getAlixTurnContext } from '../AlixTurnContext.js';
import { preparationRegistry } from '../tools/PreparationPolicy.js';

export abstract class BaseAgent implements SubAgent {
  abstract name: string;
  abstract model: string;
  abstract maxTokens: number;
  abstract maxIterations: number;
  thinking?: { type: 'enabled'; budget_tokens: number };

  abstract buildSystemPrompt(ctx: SubAgentContext): string;
  abstract buildTools(ctx: SubAgentContext): { tools: LLMTool[]; registry: LLMToolRegistry };

  static guardDepth(parentToolCalls: string[]): void {
    if (parentToolCalls.length >= MAX_DELEGATION_DEPTH) {
      throw new DelegationLoopError(parentToolCalls);
    }
  }

  async run(goal: string, ctx: SubAgentContext): Promise<SubAgentResult> {
    BaseAgent.guardDepth(ctx.parentToolCalls);

    const system = this.buildSystemPrompt(ctx);
    const built = this.buildTools(ctx);
    const registry = getAlixTurnContext()?.actionPolicy === 'prepare_only' ? preparationRegistry(built.registry, ctx.clienteId) : built.registry;
    const tools = built.tools.filter(tool => Boolean(registry[tool.name]));
    const toolCalls: string[] = [];
    const toolEvidence: unknown[] = [];
    const pendingConfirmations: string[] = [];
    const startedAt = Date.now();

    const messages: LLMMessage[] = [{ role: 'user', content: goal }];

    const result = await runOpenAI(messages, {
      model: this.model,
      maxTokens: this.maxTokens,
      maxIterations: this.maxIterations,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] as any,
      tools,
      toolRegistry: observeToolRegistry(registry, { agent: this.name, onProgress: ctx.onProgress, signal: ctx.signal }),
      signal: ctx.signal,
      ...(this.thinking ? { thinking: this.thinking } : {}),
      onToolCall: (toolName, input, out, latencyMs) => {
        toolCalls.push(toolName);
        toolEvidence.push({ tool: toolName, input, result: out });
        // Sub-agent audit propagation: registra cada tool no trail do
        // Orchestrator pai (prefixa com nome do agente para distinção).
        if (ctx.auditTrailKey) {
          try {
            getAlixAuditTrailService().recordToolCall(
              ctx.auditTrailKey,
              `${this.name}::${toolName}`,
              input,
              out,
              latencyMs,
            );
          } catch { /* audit é best-effort */ }
        }
        // Se a tool retornou um pending confirmation, captura o ID
        const meta = (out as { metadata?: { confirmationId?: string; pendingConfirmation?: boolean } } | undefined)?.metadata;
        if (meta?.pendingConfirmation && typeof meta.confirmationId === 'string') {
          pendingConfirmations.push(meta.confirmationId);
        }
      },
    });

    const latencyMs = Date.now() - startedAt;

    return {
      agent: this.name,
      summary: result.text,
      status: ['completed', 'stop', 'end_turn'].includes(result.stopReason) ? 'completed' : 'incomplete',
      stopReason: result.stopReason,
      toolCalls,
      toolEvidence,
      pendingConfirmations: pendingConfirmations.length > 0 ? pendingConfirmations : undefined,
      usage: {
        inputTokens: result.usage?.input_tokens ?? 0,
        outputTokens: result.usage?.output_tokens ?? 0,
        iterations: result.iterations ?? 1,
        cacheRead: result.usage?.cache_read_input_tokens ?? 0,
        cacheCreate: result.usage?.cache_creation_input_tokens ?? 0,
        latencyMs,
      },
    };
  }
}
