import { test } from 'vitest';
import assert from 'node:assert';
import type { SubAgent, SubAgentContext, SubAgentResult } from '../../src/services/alix/agents/types.ts';

test('SubAgent tem shape esperado', () => {
  const fake: SubAgent = {
    name: 'FakeAgent',
    model: 'gpt-5.6-terra',
    buildSystemPrompt: () => 'prompt',
    buildTools: () => ({ tools: [], registry: {} }),
    run: async () => ({
      agent: 'FakeAgent',
      summary: 'ok',
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, iterations: 0 },
    }) as SubAgentResult,
  };
  assert.strictEqual(fake.name, 'FakeAgent');
});

test('SubAgentContext aceita parentToolCalls', () => {
  const ctx: SubAgentContext = {
    sessionId: 's1',
    orchestratorHistory: [],
    parentToolCalls: ['delegate_deal_analyzer'],
    hitl: true,
  };
  assert.deepStrictEqual(ctx.parentToolCalls, ['delegate_deal_analyzer']);
});
