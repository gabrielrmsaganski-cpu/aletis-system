import axios from 'axios'
import type { ProducaoMunicipal } from './types'

/**
 * IBGE SIDRA — Sistema IBGE de Recuperação Automática.
 * API pública gratuita (sem chave): https://apisidra.ibge.gov.br
 *
 * Tabelas usadas:
 *  • 1612 — Produção agrícola municipal (PAM) — lavoura temporária
 *           Variável 215 = Valor da produção (mil R$)
 *           Variável 214 = Quantidade produzida (toneladas)
 *           Variável 216 = Área plantada (hectares)
 *  • 1613 — Produção agrícola municipal (PAM) — lavoura permanente
 *  • 3939 — Efetivo dos rebanhos (pecuária municipal)
 *
 * Endpoint: /values/t/{tabela}/n6/{codMun}/v/{var}/p/{periodo}/c81/all
 *   n6 = nível município (7 dígitos IBGE)
 *   c81 = classificação por produto (all = todas as culturas)
 *
 * Cache 30 dias — produção municipal é atualizada anualmente.
 */

const CACHE = new Map<string, { data: ProducaoMunicipal; at: number }>()
const TTL_MS = 30 * 24 * 60 * 60 * 1000

type SidraRow = Record<string, string>

async function fetchSidra(tabela: number, codMun: number, variavel: number, ano?: number): Promise<SidraRow[]> {
  const periodo = ano ? String(ano) : 'last%202' // últimos 2 anos disponíveis
  const url = `https://apisidra.ibge.gov.br/values/t/${tabela}/n6/${codMun}/v/${variavel}/p/${periodo}/c81/all`
  const { data } = await axios.get<SidraRow[]>(url, {
    timeout: 15_000,
    headers: { 'User-Agent': 'ALETIS-CRM/1.0' },
  })
  // SIDRA retorna primeira linha como header (descrição dos campos); pulamos
  if (Array.isArray(data) && data.length > 1) return data.slice(1)
  return []
}

function parseValorSidra(v: string | undefined): number | null {
  if (!v || v === '-' || v === '..' || v === '...' || v === 'X') return null
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export class IbgeSidraSource {
  /**
   * Para um município (código IBGE 7-dígitos), retorna:
   *  • Top culturas da lavoura temporária + permanente (ordenadas por valor)
   *  • Rebanho (efetivo por espécie)
   *  • Ano de referência dos dados
   *
   * Valores em R$ (mil) e toneladas. Retorna null se município não tem
   * dados de produção (raro mas acontece em novas emancipações).
   */
  async enrich(codMun: number): Promise<ProducaoMunicipal | null> {
    if (!Number.isFinite(codMun) || String(codMun).length !== 7) return null
    const key = String(codMun)
    const cached = CACHE.get(key)
    if (cached && Date.now() - cached.at < TTL_MS) return cached.data

    try {
      // Executa as consultas em paralelo
      const [temp, perm, peco] = await Promise.all([
        fetchSidra(1612, codMun, 215).catch(() => [] as SidraRow[]),
        fetchSidra(1613, codMun, 215).catch(() => [] as SidraRow[]),
        fetchSidra(3939, codMun, 105).catch(() => [] as SidraRow[]),
      ])

      const mapCulturas = (rows: SidraRow[], tipo: 'temporaria' | 'permanente') => {
        const out: NonNullable<ProducaoMunicipal['culturas']> = []
        // Pega o ano mais recente disponível
        let anoMaisRecente = ''
        for (const r of rows) {
          const ano = r['D2C'] || r['D3C']
          if (ano && ano > anoMaisRecente) anoMaisRecente = ano
        }
        for (const r of rows) {
          const ano = r['D2C'] || r['D3C']
          if (ano !== anoMaisRecente) continue
          const cultura = r['D4N'] || r['D3N']
          const valor = parseValorSidra(r['V'])
          if (!cultura || valor == null) continue
          out.push({
            cultura,
            tipo,
            valorMilReais: valor,
            anoReferencia: anoMaisRecente,
          })
        }
        return out
      }

      const culturasTemp = mapCulturas(temp, 'temporaria')
      const culturasPerm = mapCulturas(perm, 'permanente')
      const culturas = [...culturasTemp, ...culturasPerm]
        .sort((a, b) => b.valorMilReais - a.valorMilReais)
        .slice(0, 10)

      // Rebanho
      const rebanho: NonNullable<ProducaoMunicipal['rebanho']> = []
      let anoReb = ''
      for (const r of peco) {
        const ano = r['D2C'] || r['D3C']
        if (ano && ano > anoReb) anoReb = ano
      }
      for (const r of peco) {
        const ano = r['D2C'] || r['D3C']
        if (ano !== anoReb) continue
        const especie = r['D4N'] || r['D3N']
        const cab = parseValorSidra(r['V'])
        if (!especie || cab == null) continue
        rebanho.push({ especie, cabecas: cab, anoReferencia: anoReb })
      }
      rebanho.sort((a, b) => b.cabecas - a.cabecas)

      if (culturas.length === 0 && rebanho.length === 0) return null

      const total = culturas.reduce((s, c) => s + c.valorMilReais, 0)

      const result: ProducaoMunicipal = {
        codigoMunicipioIbge: codMun,
        anoReferencia: culturas[0]?.anoReferencia || anoReb || '',
        culturas,
        rebanho,
        valorTotalLavouraMilReais: total,
        fonte: 'IBGE SIDRA (tabelas 1612, 1613, 3939)',
        enriquecidoEm: new Date().toISOString(),
      }

      CACHE.set(key, { data: result, at: Date.now() })
      return result
    } catch (err: any) {
      console.warn('[IbgeSidra] falha em', codMun, err?.message || err)
      return null
    }
  }
}

let _instance: IbgeSidraSource | null = null
export function getIbgeSidraSource(): IbgeSidraSource {
  if (!_instance) _instance = new IbgeSidraSource()
  return _instance
}
