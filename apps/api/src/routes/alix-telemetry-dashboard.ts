// ============================================================
// alix-telemetry-dashboard — agregação global + alertas (Fase C.4)
// ============================================================
// Varre storage/alix-sessions/*/telemetry.jsonl e agrega:
//   - custo total USD (mês corrente, dia corrente, geral)
//   - top tools
//   - latência p50/p95
//   - breakdown por agente/modelo
//   - alertas (ALIX_COST_ALERT_USD_MONTH / _DAY)
// ============================================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { aggregateTelemetry, type TelemetryRecord } from '../services/alix/telemetry.js'
import { getLLMProviderConfig } from '../services/llm/ProviderConfig.js'

function getStorageDir(): string {
  return process.env.ALIX_STORAGE_DIR || join(process.cwd(), 'storage')
}

function loadAllTelemetryRecords(opts: { since?: Date } = {}): TelemetryRecord[] {
  const sessionsDir = join(getStorageDir(), 'alix-sessions')
  if (!existsSync(sessionsDir)) return []
  const out: TelemetryRecord[] = []
  let dirs: string[] = []
  try { dirs = readdirSync(sessionsDir) } catch { return [] }
  for (const sid of dirs) {
    const tFile = join(sessionsDir, sid, 'telemetry.jsonl')
    if (!existsSync(tFile)) continue
    try {
      const raw = readFileSync(tFile, 'utf-8')
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try {
          const r = JSON.parse(line) as TelemetryRecord
          if (opts.since && new Date(r.ts).getTime() < opts.since.getTime()) continue
          out.push(r)
        } catch { /* skip malformed */ }
      }
    } catch { /* skip */ }
  }
  return out
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export default async function alixTelemetryDashboardRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/alix/telemetry-dashboard?period=day|month|all
  // (nome sem "/" interno para evitar conflito com /telemetry/:sessionId existente)
  fastify.get('/api/alix/telemetry-dashboard', async (
    req: FastifyRequest<{ Querystring: { period?: 'day' | 'month' | 'all' } }>,
    reply: FastifyReply,
  ) => {
    const period = req.query?.period ?? 'month'
    const now = new Date()
    let since: Date | undefined
    if (period === 'day') {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    } else if (period === 'month') {
      since = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
    }
    const records = loadAllTelemetryRecords({ since })
    const agg = aggregateTelemetry(records)

    // Latência percentil
    const latencias = records.map((r) => r.latencyMs).filter((n) => Number.isFinite(n) && n > 0)
    const p50 = percentile(latencias, 50)
    const p95 = percentile(latencias, 95)
    const p99 = percentile(latencias, 99)

    // Breakdown por modelo
    const byModel: Record<string, { requests: number; costUsd: number; inputTokens: number; outputTokens: number }> = {}
    for (const r of records) {
      const m = r.model || 'desconhecido'
      if (!byModel[m]) byModel[m] = { requests: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 }
      byModel[m].requests++
      byModel[m].costUsd += r.costUsd ?? 0
      byModel[m].inputTokens += r.inputTokens
      byModel[m].outputTokens += r.outputTokens
    }

    // Top tools ordenado
    const topTools = Object.entries(agg.toolsUsed)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tool, count]) => ({ tool, count }))

    // Alertas de custo
    const limitMonth = Number(process.env.ALIX_COST_ALERT_USD_MONTH) || 50
    const limitDay = Number(process.env.ALIX_COST_ALERT_USD_DAY) || 5
    const alerts: Array<{ level: 'info' | 'warn' | 'crit'; msg: string }> = []

    // Sempre calcula o custo do mês atual para comparar
    const recordsMonth = loadAllTelemetryRecords({ since: new Date(now.getFullYear(), now.getMonth(), 1) })
    const costMonth = recordsMonth.reduce((s, r) => s + (r.costUsd ?? 0), 0)
    const recordsDay = loadAllTelemetryRecords({ since: new Date(now.getFullYear(), now.getMonth(), now.getDate()) })
    const costDay = recordsDay.reduce((s, r) => s + (r.costUsd ?? 0), 0)
    const provider = getLLMProviderConfig().provider
    const costKnown = provider !== 'foundry' && [...records, ...recordsMonth].every(record => typeof record.costUsd === 'number' && Number.isFinite(record.costUsd))

    if (costDay > limitDay) {
      alerts.push({ level: 'crit', msg: `Custo do dia US$ ${costDay.toFixed(2)} ultrapassou limite US$ ${limitDay.toFixed(2)}` })
    } else if (costDay > limitDay * 0.8) {
      alerts.push({ level: 'warn', msg: `Custo do dia US$ ${costDay.toFixed(2)} a ${((costDay / limitDay) * 100).toFixed(0)}% do limite diário` })
    }
    if (costMonth > limitMonth) {
      alerts.push({ level: 'crit', msg: `Custo do mês US$ ${costMonth.toFixed(2)} ultrapassou limite US$ ${limitMonth.toFixed(2)}` })
    } else if (costMonth > limitMonth * 0.8) {
      alerts.push({ level: 'warn', msg: `Custo do mês US$ ${costMonth.toFixed(2)} a ${((costMonth / limitMonth) * 100).toFixed(0)}% do limite mensal` })
    }

    return reply.send({
      success: true,
      data: {
        period,
        provider,
        costKnown,
        costNote: costKnown ? 'Estimativa pela tabela pública do provedor; não é fatura.' : 'Cobrança do Foundry não verificada. Consulte o consumo no provedor; valores ausentes não significam custo zero.',
        since: since?.toISOString() ?? null,
        geradoEm: now.toISOString(),
        totals: {
          requests: agg.totalRequests,
          inputTokens: agg.totalInputTokens,
          outputTokens: agg.totalOutputTokens,
          cacheReadTokens: agg.totalCacheRead,
          thinkingTokens: agg.totalThinkingTokens,
          costUsd: costKnown ? agg.totalCostUsd : null,
          avgLatencyMs: agg.totalRequests > 0 ? Math.round(agg.totalLatencyMs / agg.totalRequests) : 0,
        },
        custoHoje: costKnown ? Number(costDay.toFixed(4)) : null,
        custoMes: costKnown ? Number(costMonth.toFixed(4)) : null,
        limites: { mensal: limitMonth, diario: limitDay },
        latencia: { p50, p95, p99 },
        byAgent: agg.byAgent,
        byModel,
        topTools,
        alerts: costKnown ? alerts : [],
        alertas: costKnown ? alerts : [],
      },
    })
  })

  console.log('[ALIX] Telemetry dashboard registrado: GET /api/alix/telemetry/dashboard')
}
