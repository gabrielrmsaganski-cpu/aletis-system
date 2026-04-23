// ============================================================
// ALETIS — BaseAgent (abstração comum a todos sub-agentes)
// ============================================================

import { runClaude, type ClaudeMessage, type ClaudeTool, type ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import {
  type SubAgent,
  type SubAgentContext,
  type SubAgentResult,
  MAX_DELEGATION_DEPTH,
  DelegationLoopError,
} from './types.js';

export abstract class BaseAgent implements SubAgent {
  abstract name: string;
  abstract model: string;
  abstract maxTokens: number;
  abstract maxIterations: number;
  thinking?: { type: 'enabled'; budget_tokens: number };

  abstract buildSystemPrompt(ctx: SubAgentContext): string;
  abstract buildTools(ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry };

  static guardDepth(parentToolCalls: string[]): void {
    if (parentToolCalls.length >= MAX_DELEGATION_DEPTH) {
      throw new DelegationLoopError(parentToolCalls);
    }
  }

  async run(goal: string, ctx: SubAgentContext): Promise<SubAgentResult> {
    BaseAgent.guardDepth(ctx.parentToolCalls);

    const system = this.buildSystemPrompt(ctx);
    const { tools, registry } = this.buildTools(ctx);
    const toolCalls: string[] = [];
    const startedAt = Date.now();

    const messages: ClaudeMessage[] = [{ role: 'user', content: goal }];

    const result = await runClaude(messages, {
      model: this.model,
      maxTokens: this.maxTokens,
      maxIterations: this.maxIterations,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] as any,
      tools,
      toolRegistry: registry,
      ...(this.thinking ? { thinking: this.thinking } : {}),
      onToolCall: (toolName) => {
        toolCalls.push(toolName);
      },
    });

    const latencyMs = Date.now() - startedAt;

    return {
      agent: this.name,
      summary: result.text,
      toolCalls,
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
