import { test } from 'vitest';
import assert from 'node:assert';
import { estimateCostUsd, aggregateTelemetry, type TelemetryRecord } from '../../src/services/alix/telemetry.ts';

test('estimateCostUsd usa referência OpenAI Sol para contexto acima de 272 mil tokens', () => {
  const c = estimateCostUsd({
    model: 'gpt-5.6-sol',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  });
  // Tabela Standard oficial: US$ 8/M de entrada + US$ 30/M de saída no patamar longo.
  // Esta referência pública não representa cobrança verificada do Foundry.
  assert.strictEqual(c, 38);
});

test('estimateCostUsd aplica desconto de cache read', () => {
  const cheap = estimateCostUsd({
    model: 'gpt-5.6-terra',
    inputTokens: 100_000,
    outputTokens: 0,
    cacheRead: 100_000, // tudo cached
  });
  assert.strictEqual(cheap, 0.02);
});

test('aggregateTelemetry soma por agente + tools', () => {
  const records: TelemetryRecord[] = [
    { ts: 't1', sessionId: 's', agent: 'Orchestrator', model: 'gpt-5.6-terra', iter: 2, toolCalls: ['buscar_lead'], inputTokens: 100, outputTokens: 50, latencyMs: 1000, costUsd: 0.001 },
    { ts: 't2', sessionId: 's', agent: 'DealAnalyzer', model: 'gpt-5.6-sol', iter: 5, toolCalls: ['buscar_lead', 'simular_amortizacao'], inputTokens: 500, outputTokens: 300, latencyMs: 3000, costUsd: 0.03 },
  ];
  const agg = aggregateTelemetry(records);
  assert.strictEqual(agg.totalRequests, 2);
  assert.strictEqual(agg.byAgent.Orchestrator.requests, 1);
  assert.strictEqual(agg.byAgent.DealAnalyzer.requests, 1);
  assert.strictEqual(agg.toolsUsed.buscar_lead, 2);
  assert.strictEqual(agg.toolsUsed.simular_amortizacao, 1);
  assert.ok(agg.totalCostUsd > 0.029 && agg.totalCostUsd < 0.032);
});
