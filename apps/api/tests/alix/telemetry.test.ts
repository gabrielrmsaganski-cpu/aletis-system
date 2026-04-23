import { test } from 'node:test';
import assert from 'node:assert';
import { estimateCostUsd, aggregateTelemetry, type TelemetryRecord } from '../../src/services/alix/telemetry.ts';

test('estimateCostUsd usa pricing Opus', () => {
  const c = estimateCostUsd({
    model: 'claude-opus-4-7',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  });
  // 15 (input) + 75 (output) = 90
  assert.strictEqual(c, 90);
});

test('estimateCostUsd aplica desconto de cache read', () => {
  const cheap = estimateCostUsd({
    model: 'claude-sonnet-4-6',
    inputTokens: 100_000,
    outputTokens: 0,
    cacheRead: 100_000, // tudo cached
  });
  // 100k cached @ 3*0.1 = $0.03
  assert.strictEqual(cheap, 0.03);
});

test('aggregateTelemetry soma por agente + tools', () => {
  const records: TelemetryRecord[] = [
    { ts: 't1', sessionId: 's', agent: 'Orchestrator', model: 'claude-sonnet-4-6', iter: 2, toolCalls: ['buscar_lead'], inputTokens: 100, outputTokens: 50, latencyMs: 1000, costUsd: 0.001 },
    { ts: 't2', sessionId: 's', agent: 'DealAnalyzer', model: 'claude-opus-4-7', iter: 5, toolCalls: ['buscar_lead', 'simular_amortizacao'], inputTokens: 500, outputTokens: 300, latencyMs: 3000, costUsd: 0.03 },
  ];
  const agg = aggregateTelemetry(records);
  assert.strictEqual(agg.totalRequests, 2);
  assert.strictEqual(agg.byAgent.Orchestrator.requests, 1);
  assert.strictEqual(agg.byAgent.DealAnalyzer.requests, 1);
  assert.strictEqual(agg.toolsUsed.buscar_lead, 2);
  assert.strictEqual(agg.toolsUsed.simular_amortizacao, 1);
  assert.ok(agg.totalCostUsd > 0.029 && agg.totalCostUsd < 0.032);
});
