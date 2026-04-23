// ============================================================
// Alix Telemetry — JSONL append-only por sessão
// ============================================================

import { appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

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
  /** Custo estimado USD (baseado em pricing atual Claude/Sonnet/Opus). */
  costUsd?: number;
}

// Pricing aproximado (USD por Mtok) — atualizado 2026-04
const PRICING: Record<string, { inputUsdPerM: number; outputUsdPerM: number }> = {
  'claude-opus-4-7': { inputUsdPerM: 15, outputUsdPerM: 75 },
  'claude-sonnet-4-6': { inputUsdPerM: 3, outputUsdPerM: 15 },
  'claude-haiku-4-5': { inputUsdPerM: 0.8, outputUsdPerM: 4 },
};

export function estimateCostUsd(rec: Pick<TelemetryRecord, 'model' | 'inputTokens' | 'outputTokens' | 'thinkingTokens' | 'cacheRead'>): number {
  const p = PRICING[rec.model] ?? PRICING['claude-sonnet-4-6'];
  const paidInput = Math.max(0, rec.inputTokens - (rec.cacheRead ?? 0));
  const cachedInput = rec.cacheRead ?? 0;
  // Cache read ≈ 10% do input cost
  const input = (paidInput / 1_000_000) * p.inputUsdPerM + (cachedInput / 1_000_000) * p.inputUsdPerM * 0.1;
  const output = ((rec.outputTokens + (rec.thinkingTokens ?? 0)) / 1_000_000) * p.outputUsdPerM;
  return Number((input + output).toFixed(6));
}

export function telemetryPath(storageDir: string, sessionId: string): string {
  return join(storageDir, sessionId, 'telemetry.jsonl');
}

export function appendTelemetry(storageDir: string, rec: TelemetryRecord): void {
  try {
    const path = telemetryPath(storageDir, rec.sessionId);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(rec) + '\n');
  } catch (err) {
    console.warn('[telemetry] append falhou:', (err as Error).message);
  }
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
