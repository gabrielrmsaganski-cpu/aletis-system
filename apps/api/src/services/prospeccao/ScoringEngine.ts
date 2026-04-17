import type { LeadRaw, LeadScore, AreaEstimation } from './types'

/**
 * Score 0-100 — prioriza leads com:
 *  • Dívida alta mas não impagável (R$ 500k – R$ 50M sweet spot)
 *  • Já ajuizada (urgência = contato rápido)
 *  • Inscrita recentemente (cliente em momento de dor)
 *  • Sinais agro consistentes (não falso positivo)
 *  • Área estimada relevante
 */
export class ScoringEngine {
  /** Honorários ALETIS: 1% da dívida renegociada, piso R$ 15k, teto R$ 500k. */
  private estimarHonorarios(divida: number): number {
    const perc = divida * 0.01
    return Math.min(500_000, Math.max(15_000, perc))
  }

  score(lead: LeadRaw, area: AreaEstimation): LeadScore {
    // 1. Dívida (0-40)
    let pDivida = 0
    const mi = lead.totalDivida / 1_000_000
    if (mi >= 0.5 && mi <= 50) pDivida = 40 // sweet spot
    else if (mi > 50 && mi <= 500) pDivida = 30 // grande mas viável
    else if (mi > 500) pDivida = 15 // massiva, negociação complexa
    else if (mi >= 0.2) pDivida = 25
    else if (mi >= 0.05) pDivida = 12
    else pDivida = 3

    // 2. Ajuizamento (0-20) — urgência real
    let pAjuiz = 0
    if (lead.temAjuizada) {
      const ajuizadas = lead.debts.filter((d) => d.ajuizado).length
      const ratio = ajuizadas / lead.debts.length
      pAjuiz = Math.round(10 + ratio * 10)
    }

    // 3. Recência (0-15) — inscrições nos últimos 24 meses valem mais
    let pRec = 0
    const ultima = this.parseDate(lead.ultimaInscricao)
    if (ultima) {
      const meses = (Date.now() - ultima.getTime()) / (1000 * 60 * 60 * 24 * 30.4)
      if (meses <= 6) pRec = 15
      else if (meses <= 12) pRec = 12
      else if (meses <= 24) pRec = 8
      else if (meses <= 60) pRec = 4
      else pRec = 1
    }

    // 4. Qualidade do sinal agro (0-15)
    const strong = ['AGROPECUARIA', 'AGRICOLA', 'AGROINDUSTRIAL', 'SOJA', 'GRÃOS', 'CEREALISTA']
    const mid = ['FAZENDA', 'PECUARIA', 'GADO', 'MILHO', 'CAFE']
    const nomeUp = lead.nome.toUpperCase()
    let pAgro = 0
    if (strong.some((s) => nomeUp.includes(s))) pAgro = 15
    else if (mid.some((s) => nomeUp.includes(s))) pAgro = 10
    else if (lead.agroSignals.length >= 2) pAgro = 7
    else pAgro = 4

    // 5. Hectares (0-10)
    let pHa = 0
    if (area.hectaresEstimados >= 5000) pHa = 10
    else if (area.hectaresEstimados >= 1000) pHa = 8
    else if (area.hectaresEstimados >= 500) pHa = 5
    else if (area.hectaresEstimados >= 100) pHa = 2

    const total = pDivida + pAjuiz + pRec + pAgro + pHa

    let classificacao: LeadScore['classificacao']
    if (total >= 75) classificacao = 'quente'
    else if (total >= 55) classificacao = 'morno'
    else if (total >= 35) classificacao = 'frio'
    else classificacao = 'reativo'

    return {
      total,
      breakdown: {
        divida: pDivida,
        ajuizamento: pAjuiz,
        recencia: pRec,
        agroMatch: pAgro,
        hectares: pHa,
      },
      classificacao,
      honorariosEstimados: this.estimarHonorarios(lead.totalDivida),
    }
  }

  /** Parse dd/mm/yyyy — formato PGFN. */
  private parseDate(s: string): Date | null {
    if (!s) return null
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!m) return null
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  }
}
