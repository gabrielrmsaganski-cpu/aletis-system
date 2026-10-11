import { createHash } from 'node:crypto'
import { RECALCULO_INDICES_REGISTRY, type RecalculoIndiceMensal } from '@aletis/financial-calc'
import { getRecalculoAcordoService } from './RecalculoAcordoService.js'
import { getPool, isPgEnabled } from '../../db/client.js'

type RawPoint = { periodo: string; taxa: string }
type SyncState = { lastAttempt?: string; lastSuccess?: string; error?: string; running: boolean }
const syncStates = new Map<string, SyncState>()

export function getIndexSyncState(code: string): SyncState {
  return syncStates.get(code) ?? { running: false }
}

export function isIndexStale(code: string, maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  const state = getIndexSyncState(code)
  return !state.lastSuccess || Date.now() - Date.parse(state.lastSuccess) > maxAgeMs
}

export function markIndexHydrated(code: string, fetchedAt: string): void {
  const current = getIndexSyncState(code)
  syncStates.set(code, { ...current, lastSuccess: fetchedAt, running: false, error: undefined })
}

function sidraUrl(table: string): string {
  return `https://apisidra.ibge.gov.br/values/t/${table}/n1/all/p/all`
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Fonte respondeu HTTP ${response.status}`)
  return response.json()
}

function parseSidra(payload: unknown, tableVariable?: string): RawPoint[] {
  if (!Array.isArray(payload)) throw new Error('Resposta SIDRA inválida.')
  return payload.slice(1).flatMap((row: Record<string, unknown>) => {
    const period = String(row.D2C ?? '')
    const variable = String(row.D3C ?? '')
    if ((tableVariable ?? '') && variable !== tableVariable) return []
    const value = String(row.V ?? '').replace(',', '.')
    if (!/^\d{6}$/.test(period) || !/^-?\d+(?:\.\d+)?$/.test(value)) return []
    return [{ periodo: `${period.slice(0, 4)}-${period.slice(4)}`, taxa: value }]
  })
}

async function fetchBcb(seriesId: string): Promise<RawPoint[]> {
  const end = new Date()
  const start = new Date(Date.UTC(end.getUTCFullYear() - 10, end.getUTCMonth(), end.getUTCDate()))
  const fmt = (date: Date) => `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`
  const payload = await fetchJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesId}/dados?formato=json&dataInicial=${fmt(start)}&dataFinal=${fmt(end)}`)
  if (!Array.isArray(payload)) throw new Error('Resposta SGS inválida.')
  return payload.flatMap((row: Record<string, unknown>) => {
    const date = String(row.data ?? '')
    const value = String(row.valor ?? '').replace(',', '.')
    const parts = date.split('/')
    if (parts.length !== 3 || !/^-?\d+(?:\.\d+)?$/.test(value)) return []
    return [{ periodo: `${parts[2]}-${parts[1]}`, taxa: value }]
  })
}

function monthlySeries(points: RawPoint[], source: string, sourceUrl: string): RecalculoIndiceMensal[] {
  const SCALE = 1_000_000_000_000_000_000n
  const parse = (value: string): bigint => {
    const [whole, fraction = ''] = value.replace(',', '.').split('.')
    const negative = whole.startsWith('-')
    const absWhole = negative ? whole.slice(1) : whole
    return (negative ? -1n : 1n) * (BigInt(absWhole) * SCALE + BigInt(fraction.padEnd(18, '0').slice(0, 18)))
  }
  const format = (value: bigint, decimals = 18): string => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / SCALE}.${(((value < 0n ? -value : value) % SCALE) * 10n ** BigInt(decimals) / SCALE).toString().padStart(decimals, '0')}`
  const grouped = new Map<string, string[]>()
  for (const point of points) grouped.set(point.periodo, [...(grouped.get(point.periodo) ?? []), point.taxa])
  let cumulative = SCALE
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([periodo, rates]) => {
    const factor = rates.reduce((acc, rate) => acc * (SCALE + parse(rate) / 100n) / SCALE, SCALE)
    cumulative = cumulative * factor / SCALE
    return { periodo, taxaMensal: format((factor - SCALE) * 100n), fatorMensal: format(factor), fatorAcumulado: format(cumulative), fonte: source, sourceUrl, fetchedAt: new Date().toISOString() }
  })
}

async function sincronizarIndiceInternal(code: string): Promise<{ code: string; count: number; revised: number }> {
  const config = RECALCULO_INDICES_REGISTRY.find((item) => item.code === code)
  if (!config) throw new Error(`Índice não cadastrado: ${code}`)
  if (config.provider === 'FGV_IBRE') throw new Error('A série IGP-M requer endpoint estruturado da FGV ainda não habilitado; nenhum valor foi inventado.')
  const [, sourceId, tableVariable] = config.providerSeriesId.split(':')
  const raw = config.provider === 'IBGE' ? parseSidra(await fetchJson(sidraUrl(sourceId)), tableVariable) : await fetchBcb(sourceId)
  const values = monthlySeries(raw, config.provider, config.sourceUrl)
  getRecalculoAcordoService().setSeries(code, values)
  if (isPgEnabled()) {
    const pool = getPool()
    const indexId = `idx-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    await pool.query(`INSERT INTO monetary_index (id,code,name,provider,provider_series_id,frequency,unit,calculation_method,source_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (code) DO UPDATE SET updated_at=now(), provider_series_id=EXCLUDED.provider_series_id`, [indexId, config.code, config.name, config.provider, config.providerSeriesId, config.frequency, config.unit, 'COMPOUND_MONTHLY_INDEX', config.sourceUrl])
    for (const value of values) {
      const revision = await pool.query('SELECT COALESCE(max(revision),0) AS revision, max(checksum) AS checksum FROM monetary_index_value WHERE monetary_index_id=$1 AND reference_period=$2', [indexId, value.periodo])
      const current = revision.rows[0]
      const pointChecksum = createHash('sha256').update(JSON.stringify(value)).digest('hex')
      if (current.checksum === pointChecksum) continue
      const nextRevision = Number(current.revision) + 1
      await pool.query('INSERT INTO monetary_index_value (id,monetary_index_id,reference_period,monthly_rate,cumulative_factor,provider,source,source_url,fetched_at,revision,checksum) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10)', [randomId(), indexId, value.periodo, value.taxaMensal, value.fatorAcumulado, config.provider, config.providerSeriesId, config.sourceUrl, nextRevision, pointChecksum])
    }
  }
  return { code, count: values.length, revised: 0 }
}

export async function sincronizarIndice(code: string): Promise<{ code: string; count: number; revised: number }> {
  const current = getIndexSyncState(code)
  if (current.running) throw new Error(`Sincronização de ${code} já está em andamento.`)
  const next: SyncState = { ...current, running: true, lastAttempt: new Date().toISOString(), error: undefined }
  syncStates.set(code, next)
  try {
    const result = await sincronizarIndiceInternal(code)
    syncStates.set(code, { ...next, running: false, lastSuccess: new Date().toISOString(), error: undefined })
    return result
  } catch (error) {
    syncStates.set(code, { ...next, running: false, error: (error as Error).message })
    throw error
  }
}

function randomId(): string { return `idxv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }

export async function sincronizarIndices(codes = RECALCULO_INDICES_REGISTRY.map((item) => item.code)) {
  const result: Array<{ code: string; ok: boolean; count?: number; error?: string }> = []
  for (const code of codes) {
    try { const synced = await sincronizarIndice(code); result.push({ code, ok: true, count: synced.count }) } catch (error) { result.push({ code, ok: false, error: (error as Error).message }) }
  }
  return result
}
