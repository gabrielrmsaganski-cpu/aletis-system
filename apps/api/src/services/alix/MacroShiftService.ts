// Compara somente observações de mesma fonte, base, unidade e período.
import { createHash } from 'node:crypto'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { MarketBrief } from '../MarketBriefService.js'

const observationSchema = z.object({ fonte: z.string().min(1), base: z.string().min(1), unidade: z.string().min(1), referencia: z.string().min(1), estado: z.enum(['disponivel', 'atrasado']), praca: z.string().optional() })
export type MacroObservation = z.infer<typeof observationSchema>
const nullableValue = z.number().finite().nullable()
const snapshotSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ts: z.string(), schemaVersion: z.literal(2).optional(), observacoes: z.record(observationSchema).optional(),
  selic: nullableValue, ipca12m: nullableValue, cdi: nullableValue, igpm12m: nullableValue, usd: nullableValue, eur: nullableValue, commodities: z.record(z.number().finite()),
})
export type MacroSnapshot = z.infer<typeof snapshotSchema>
const pointSchema = z.object({ data: z.string(), valor: z.number().finite(), observacao: observationSchema })
const evidenceSchema = z.object({ version: z.literal(2), atual: pointSchema, referencia: pointSchema })
export interface MacroShift {
  indicador: string; valorAtual: number; valorReferencia: number; delta: number; deltaPct: number | null
  janela: '24h' | '7d'; urgencia: 'info' | 'importante' | 'critico'; descricao: string
  unidadeDelta: 'bp' | '%'; comparisonId: string; evidence: z.infer<typeof evidenceSchema>
}

function dateKey(value: string): string | null {
  const day = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (day) {
    const parsed = new Date(`${day}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null
  }
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null
}
const daysBetween = (first: string, second: string) => (Date.parse(`${second}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000
const observationMatches = (current: MacroObservation, previous: MacroObservation) => current.estado === 'disponivel' && previous.estado === 'disponivel'
  && current.base === previous.base && current.fonte === previous.fonte && current.unidade === previous.unidade && current.praca === previous.praca

export function hasVerifiedMacroComparison(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const value = payload as Record<string, unknown>
  const result = evidenceSchema.safeParse(value.evidence)
  if (!result.success || typeof value.comparisonId !== 'string' || !value.comparisonId) return false
  const { atual, referencia } = result.data
  const currentDay = dateKey(atual.data), previousDay = dateKey(referencia.data)
  const currentReference = dateKey(atual.observacao.referencia), previousReference = dateKey(referencia.observacao.referencia)
  return Boolean(currentDay && previousDay && currentReference && previousReference && currentReference > previousReference
    && currentReference <= currentDay && previousReference <= previousDay
    && daysBetween(previousDay, currentDay) === (value.janela === '24h' ? 1 : value.janela === '7d' ? 7 : -1)
    && observationMatches(atual.observacao, referencia.observacao))
}

export function macroShiftLabel(shift: MacroShift): string {
  const change = shift.unidadeDelta === 'bp' ? shift.delta / 100 : shift.deltaPct!
  return `${change >= 0 ? '+' : ''}${change.toFixed(2).replace('.', ',')} ${shift.unidadeDelta === 'bp' ? 'p.p.' : '%'}`
}

/** Preços legados chegam como número; a diferença usa escala inteira e só
 * o percentual (sem unidade monetária) volta ao cálculo de thresholds. */
export function observedPriceChange(current: number, reference: number): { delta: string; percent: number } | null {
  const scaled = (value: number): bigint | null => {
    const match = String(value).match(/^(\d+)(?:\.(\d+))?$/)
    return match ? BigInt(match[1]) * 100_000_000n + BigInt((match[2] || '').padEnd(8, '0').slice(0, 8)) : null
  }
  const actual = scaled(current), previous = scaled(reference)
  if (actual == null || previous == null || actual <= 0n || previous <= 0n) return null
  const difference = actual - previous
  const absolute = difference < 0n ? -difference : difference
  const delta = `${difference < 0n ? '-' : ''}${absolute / 100_000_000n}.${String(absolute % 100_000_000n).padStart(8, '0')}`
  return { delta, percent: Number(difference * 10_000_000_000n / previous) / 100_000_000 }
}

const snapshotWrites = new Map<string, Promise<MacroSnapshot | null>>()
export class MacroShiftService {
  private readonly file: string
  constructor(storageDir: string) {
    this.file = join(storageDir, 'macro-history.jsonl')
    if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true })
  }

  loadHistory(): MacroSnapshot[] {
    if (!existsSync(this.file)) return []
    try {
      const rows: MacroSnapshot[] = []
      for (const line of readFileSync(this.file, 'utf8').split('\n').filter(Boolean).slice(-365)) {
        try {
          const parsed = snapshotSchema.safeParse(JSON.parse(line))
          if (parsed.success && dateKey(parsed.data.data) === parsed.data.data) rows.push(parsed.data)
        } catch { /* Uma linha inválida não apaga as demais observações. */ }
      }
      return rows
    } catch { return [] }
  }

  private fromBrief(brief: MarketBrief): MacroSnapshot {
    const observacoes: Record<string, MacroObservation> = {}
    for (const key of ['selic', 'ipca12m', 'cdi', 'igpm12m', 'usd', 'eur']) {
      const parsed = observationSchema.safeParse(brief.observacoesMacro?.[key])
      if (parsed.success && dateKey(parsed.data.referencia)) observacoes[key] = parsed.data
    }
    const commodities: Record<string, number> = {}
    for (const item of brief.commodities) {
      const key = `commodity:${item.simbolo.toLowerCase()}`
      commodities[item.simbolo.toLowerCase()] = item.preco
      if (!item.data || !dateKey(item.data) || !item.praca || !item.estado) continue
      observacoes[key] = { fonte: item.fonte.replace(/\s+\((?:disponivel|atrasado)\)$/, ''), base: key, unidade: item.unidade, praca: item.praca, referencia: item.data, estado: item.estado }
    }
    return snapshotSchema.parse({ data: brief.data, ts: brief.geradoEm, schemaVersion: 2, observacoes, selic: brief.macro.selic, ipca12m: brief.macro.ipca12m, cdi: brief.macro.cdi, igpm12m: brief.macro.igpm12m, usd: brief.cambio.usd, eur: brief.cambio.eur, commodities })
  }

  async snapshotIfNeeded(brief: MarketBrief): Promise<MacroSnapshot | null> {
    const previous = snapshotWrites.get(this.file) || Promise.resolve(null)
    const writing = previous.catch(() => null).then(async () => {
      if (this.loadHistory().some(row => row.data === brief.data && row.schemaVersion === 2)) return null
      const snapshot = this.fromBrief(brief)
      await appendFile(this.file, JSON.stringify(snapshot) + '\n')
      return snapshot
    })
    snapshotWrites.set(this.file, writing)
    try { return await writing } finally { if (snapshotWrites.get(this.file) === writing) snapshotWrites.delete(this.file) }
  }

  /** Sem amostra na data exata, não apresenta outro intervalo como 24h/7d. */
  comparableReference(brief: MarketBrief, history: MacroSnapshot[], key: string, window: '24h' | '7d'): MacroSnapshot | undefined {
    const current = this.fromBrief(brief)
    const observation = current.observacoes?.[key], currentDay = dateKey(current.data)
    if (!observation || !currentDay || observation.estado !== 'disponivel') return undefined
    const target = new Date(`${currentDay}T00:00:00Z`)
    target.setUTCDate(target.getUTCDate() - (window === '24h' ? 1 : 7))
    const previousDay = target.toISOString().slice(0, 10)
    return [...history].reverse().find(previous => {
      const before = previous.observacoes?.[key]
      const currentReference = dateKey(observation.referencia), previousReference = before ? dateKey(before.referencia) : null
      return previous.schemaVersion === 2 && previous.data === previousDay && before && currentReference && previousReference
        && currentReference > previousReference && currentReference <= currentDay && previousReference <= previousDay && observationMatches(observation, before)
    })
  }

  detectShifts(brief: MarketBrief, history: MacroSnapshot[]): MacroShift[] {
    const shifts: MacroShift[] = []
    if (!history.length) return shifts
    const current = this.fromBrief(brief)
    const threshold = (name: string, fallback: number) => { const value = Number(process.env[name]); return Number.isFinite(value) && value > 0 ? value : fallback }
    const add = (key: string, name: string, window: '24h' | '7d', actual: number | null, limit: number, multiplier: number, rate = false) => {
      const reference = this.comparableReference(brief, history, key, window)
      const previous = key.startsWith('commodity:') ? reference?.commodities[key.slice(10)] : reference?.[key as 'selic' | 'ipca12m' | 'usd']
      if (!reference || actual == null || previous == null || !Number.isFinite(actual) || !Number.isFinite(previous) || (!rate && previous <= 0)) return
      const priceChange = rate ? null : observedPriceChange(actual, previous)
      if (!rate && !priceChange) return
      const delta = rate ? (actual - previous) * 100 : Number(priceChange!.delta)
      const deltaPct = rate ? null : priceChange!.percent
      const change = rate ? delta : deltaPct!
      if (Math.abs(change) < limit) return
      const evidence = evidenceSchema.parse({ version: 2, atual: { data: current.data, valor: actual, observacao: current.observacoes![key] }, referencia: { data: reference.data, valor: previous, observacao: reference.observacoes![key] } })
      // A mesma publicação não gera outro alerta a cada avaliação do timer.
      const comparisonId = createHash('sha256').update(JSON.stringify({ key, actual, previous, atual: evidence.atual.observacao, referencia: evidence.referencia.observacao })).digest('hex')
      const shift: MacroShift = { indicador: name, valorAtual: actual, valorReferencia: previous, delta, deltaPct, janela: window, urgencia: Math.abs(change) >= limit * multiplier ? 'critico' : 'importante', descricao: '', unidadeDelta: rate ? 'bp' : '%', comparisonId, evidence }
      shift.descricao = `${name}: ${macroShiftLabel(shift)} entre as consultas de ${reference.data} e ${current.data}. Valores: ${previous.toFixed(4)} → ${actual.toFixed(4)} ${evidence.atual.observacao.unidade}. Referências: ${evidence.referencia.observacao.referencia} → ${evidence.atual.observacao.referencia}; fonte: ${evidence.atual.observacao.fonte}.`
      shifts.push(shift)
    }
    add('selic', 'Selic', '24h', current.selic, threshold('MACRO_TH_SELIC_BP', 50), 2, true)
    add('usd', 'USD/BRL', '24h', current.usd, threshold('MACRO_TH_USD_PCT', 3), 1.7)
    add('ipca12m', 'IPCA 12m', '7d', current.ipca12m, threshold('MACRO_TH_IPCA_BP', 50), 1.5, true)
    for (const item of brief.commodities) {
      const key = `commodity:${item.simbolo.toLowerCase()}`
      add(key, item.nome, this.comparableReference(brief, history, key, '7d') ? '7d' : '24h', item.preco, threshold('MACRO_TH_COMMODITY_PCT', 5), 2)
    }
    return shifts
  }
}

let instance: MacroShiftService | undefined
export function getMacroShiftService(storageDir?: string): MacroShiftService {
  return instance ||= new MacroShiftService(storageDir || process.env.ALIX_STORAGE_DIR || join(process.cwd(), 'storage'))
}
