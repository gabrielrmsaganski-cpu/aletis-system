// ============================================================
// Alix Telemetry — JSONL append-only por sessão
// ============================================================

import { mkdirSync } from 'fs';
import { appendFile } from 'fs/promises';
import { join, dirname } from 'path';
import { estimateCost } from '../llm/LLMConfig.js';

export interface TelemetryRecord {
  ts: string;
  sessionId: string;
  agent: string;
  model: string;
  iter: number;
  toolCalls: string[];
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
  cacheRead?: number;
  cacheCreate?: number;
  latencyMs: number;
  responseId?: string;
  requestId?: string;
  /** Custo estimado pela tabela central de modelos OpenAI. */
  costUsd?: number;
}

export function estimateCostUsd(rec: Pick<TelemetryRecord, 'model' | 'inputTokens' | 'outputTokens' | 'thinkingTokens' | 'cacheRead' | 'cacheCreate'>): number {
  return estimateCost(rec.model, {
    input_tokens: rec.inputTokens,
    output_tokens: rec.outputTokens,
    reasoning_tokens: rec.thinkingTokens,
    cached_tokens: rec.cacheRead,
    cache_creation_input_tokens: rec.cacheCreate,
  });
}

export function telemetryPath(storageDir: string, sessionId: string): string {
  return join(storageDir, sessionId, 'telemetry.jsonl');
}

/**
 * Fire-and-forget append. Mantém assinatura sync para preservar callsites,
 * mas o I/O real acontece async sem bloquear o event loop.
 * `mkdirSync` é mantido (sync) porque é praticamente instantâneo se o
 * diretório já existe, e ainda precisa garantir o caminho antes do append.
 */
export function appendTelemetry(storageDir: string, rec: TelemetryRecord): void {
  const path = telemetryPath(storageDir, rec.sessionId);
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (err) {
    console.warn('[telemetry] mkdir falhou:', (err as Error).message);
    return;
  }
  appendFile(path, JSON.stringify(rec) + '\n').catch((err: Error) => {
    console.warn('[telemetry] append falhou:', err.message);
  });
}

export interface TelemetryAggregate {
  sessionId: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalThinkingTokens: number;
  totalCacheRead: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  byAgent: Record<string, { requests: number; costUsd: number; inputTokens: number; outputTokens: number }>;
  toolsUsed: Record<string, number>;
}

export function aggregateTelemetry(records: TelemetryRecord[]): TelemetryAggregate {
  const agg: TelemetryAggregate = {
    sessionId: records[0]?.sessionId ?? '',
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalThinkingTokens: 0,
    totalCacheRead: 0,
    totalCostUsd: 0,
    totalLatencyMs: 0,
    byAgent: {},
    toolsUsed: {},
  };
  for (const r of records) {
    agg.totalRequests++;
    agg.totalInputTokens += r.inputTokens;
    agg.totalOutputTokens += r.outputTokens;
    agg.totalThinkingTokens += r.thinkingTokens ?? 0;
    agg.totalCacheRead += r.cacheRead ?? 0;
    agg.totalCostUsd += r.costUsd ?? 0;
    agg.totalLatencyMs += r.latencyMs;
    if (!agg.byAgent[r.agent]) agg.byAgent[r.agent] = { requests: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    agg.byAgent[r.agent].requests++;
    agg.byAgent[r.agent].costUsd += r.costUsd ?? 0;
    agg.byAgent[r.agent].inputTokens += r.inputTokens;
    agg.byAgent[r.agent].outputTokens += r.outputTokens;
    for (const t of r.toolCalls) agg.toolsUsed[t] = (agg.toolsUsed[t] ?? 0) + 1;
  }
  agg.totalCostUsd = Number(agg.totalCostUsd.toFixed(6));
  return agg;
}
