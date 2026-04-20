import axios from 'axios'
import type { ClimaAgro } from './types'

/**
 * NASA POWER — Prediction Of Worldwide Energy Resources.
 * API pública, gratuita, sem chave: https://power.larc.nasa.gov/api/
 *
 * Usamos o endpoint `temporal/daily/point` com a community "AG"
 * (agroclimatologia). Retorna séries diárias para lat/lng — que resumimos
 * em médias mensais úteis para contextualizar a realidade agroclimática
 * do produtor rural: temperatura média, precipitação total, radiação solar,
 * umidade relativa.
 *
 * Parâmetros usados (community AG):
 *  • T2M            — Temperatura do ar a 2m (°C)
 *  • PRECTOTCORR    — Precipitação corrigida (mm/dia)
 *  • ALLSKY_SFC_SW_DWN — Radiação solar de onda curta (MJ/m²/dia)
 *  • RH2M           — Umidade relativa a 2m (%)
 *
 * Rate limit: ~2 req/s por IP. Cache 7 dias por ponto arredondado.
 */

interface PowerResponse {
  properties?: {
    parameter?: {
      T2M?: Record<string, number>
      PRECTOTCORR?: Record<string, number>
      ALLSKY_SFC_SW_DWN?: Record<string, number>
      RH2M?: Record<string, number>
    }
  }
  messages?: string[]
}

const CACHE = new Map<string, { data: ClimaAgro; at: number }>()
const TTL_MS = 7 * 24 * 60 * 60 * 1000

/** NASA POWER usa -999 para missing. */
function validValues(m: Record<string, number> | undefined): number[] {
  if (!m) return []
  return Object.values(m).filter((v) => typeof v === 'number' && v > -900)
}
function avg(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined
  return nums.reduce((s, n) => s + n, 0) / nums.length
}
function sum(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined
  return nums.reduce((s, n) => s + n, 0)
}

function fmtYYYYMMDD(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export class NasaPowerSource {
  /**
   * Consulta as médias dos últimos 12 meses para o ponto (lat, lng).
   * Arredondamos para 2 casas decimais no cache key (~1km) pois a API
   * faz interpolação da grade global em qualquer ponto.
   */
  async enrich(lat: number, lng: number): Promise<ClimaAgro | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
    const cached = CACHE.get(key)
    if (cached && Date.now() - cached.at < TTL_MS) return cached.data

    const end = new Date()
    end.setUTCDate(end.getUTCDate() - 5) // dados costumam ter 3-5 dias de defasagem
    const start = new Date(end)
    start.setUTCFullYear(end.getUTCFullYear() - 1)

    try {
      const { data } = await axios.get<PowerResponse>(
        'https://power.larc.nasa.gov/api/temporal/daily/point',
        {
          params: {
            parameters: 'T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M',
            community: 'AG',
            longitude: lng.toFixed(4),
            latitude: lat.toFixed(4),
            start: fmtYYYYMMDD(start),
            end: fmtYYYYMMDD(end),
            format: 'JSON',
          },
          timeout: 20_000,
          headers: { 'User-Agent': 'ALETIS-CRM/1.0 (agro-risk)' },
        },
      )

      const p = data?.properties?.parameter
      if (!p) return null

      const tempValues = validValues(p.T2M)
      const chuvaValues = validValues(p.PRECTOTCORR)
      const radValues = validValues(p.ALLSKY_SFC_SW_DWN)
      const umidValues = validValues(p.RH2M)

      // Resumo mensal — agrupa por YYYYMM
      const groupByMonth = (m: Record<string, number> | undefined) => {
        const out = new Map<string, number[]>()
        if (!m) return out
        for (const [ymd, v] of Object.entries(m)) {
          if (typeof v !== 'number' || v <= -900) continue
          const ym = ymd.slice(0, 6)
          const arr = out.get(ym) || []
          arr.push(v)
          out.set(ym, arr)
        }
        return out
      }
      const tempMensal = groupByMonth(p.T2M)
      const chuvaMensal = groupByMonth(p.PRECTOTCORR)

      const mensais: ClimaAgro['mensais'] = []
      const meses = Array.from(
        new Set([...tempMensal.keys(), ...chuvaMensal.keys()]),
      ).sort()
      for (const ym of meses) {
        mensais.push({
          anoMes: `${ym.slice(0, 4)}-${ym.slice(4, 6)}`,
          tempMediaC: avg(tempMensal.get(ym) || []) ?? null,
          chuvaMmTotal: sum(chuvaMensal.get(ym) || []) ?? null,
        })
      }

      const result: ClimaAgro = {
        lat,
        lng,
        periodo: {
          inicio: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`,
          fim: `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`,
        },
        tempMediaAnualC: avg(tempValues) ?? null,
        chuvaAcumuladaAnualMm: sum(chuvaValues) ?? null,
        radiacaoMediaDiariaMjM2: avg(radValues) ?? null,
        umidadeRelativaMediaPct: avg(umidValues) ?? null,
        mensais,
        fonte: 'NASA POWER (AG community)',
        enriquecidoEm: new Date().toISOString(),
      }

      CACHE.set(key, { data: result, at: Date.now() })
      return result
    } catch (err: any) {
      console.warn('[NasaPower] falha em', key, err?.message || err)
      return null
    }
  }
}

let _instance: NasaPowerSource | null = null
export function getNasaPowerSource(): NasaPowerSource {
  if (!_instance) _instance = new NasaPowerSource()
  return _instance
}
