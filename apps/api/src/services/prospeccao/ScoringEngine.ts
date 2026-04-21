import type { LeadRaw, LeadScore, AreaEstimation } from './types'

/**
 * Score 0-100 — prioriza leads com:
 *  • Dívida alta mas não impagável (R$ 500k – R$ 50M sweet spot)
 *  • Já ajuizada (urgência = contato rápido)
 *  • Inscrita recentemente (cliente em momento de dor)
 *  • Sinais agro consistentes (não falso positivo)
 *  • Área estimada relevante
 *  • Velocity: passivo acelerando (muitas inscrições em janela curta)
 *  • Fit regional: UF core da mesa ALETIS (Cascavel/PR + cinturão agro)
 *
 * Distribuição dos pesos (total 100):
 *   divida 30 + ajuizamento 15 + recencia 10 + agroMatch 10 +
 *   hectares 10 + velocity 10 + fitRegional 15 = 100
 *
 * Thresholds classificação: ≥75 quente · ≥55 morno · ≥35 frio · <35 reativo
 */

/**
 * Ranking de UFs pela proximidade operacional da mesa ALETIS:
 *  15 = sede / alta capacidade local (PR)
 *  12 = cinturão agro principal com presença regular (SP/MG/GO/MT)
 *  10 = agro estratégico + acordos já recorrentes (MS/RS/SC/BA/DF)
 *   8 = agro relevante porém fora do raio imediato (TO/MA/PI/RO/MA)
 *   4 = demais UFs (operação possível mas custo logístico maior)
 */
const FIT_REGIONAL_POR_UF: Record<string, number> = {
  PR: 15,
  SP: 12, MG: 12, GO: 12, MT: 12,
  MS: 10, RS: 10, SC: 10, BA: 10, DF: 10,
  TO: 8, MA: 8, PI: 8, RO: 8, PA: 8,
  AC: 4, AL: 4, AM: 4, AP: 4, CE: 4, ES: 4, PB: 4, PE: 4, RJ: 4, RN: 4, RR: 4, SE: 4,
}

const FIT_REGIONAL_LABEL: Record<string, string> = {
  PR: 'Paraná — região sede, mesa local',
  SP: 'SP — cinturão agro prioritário',
  MG: 'MG — cinturão agro prioritário',
  GO: 'GO — cinturão agro prioritário',
  MT: 'MT — cinturão agro prioritário',
  MS: 'MS — agro estratégico',
  RS: 'RS — agro estratégico',
  SC: 'SC — agro estratégico',
  BA: 'BA — agro estratégico',
  DF: 'DF — agro estratégico',
  TO: 'TO — agro relevante (raio ampliado)',
  MA: 'MA — agro relevante (raio ampliado)',
  PI: 'PI — agro relevante (raio ampliado)',
  RO: 'RO — agro relevante (raio ampliado)',
  PA: 'PA — agro relevante (raio ampliado)',
}

export class ScoringEngine {
  /** Honorários ALETIS: 1% da dívida renegociada, piso R$ 15k, teto R$ 500k. */
  private estimarHonorarios(divida: number): number {
    const perc = divida * 0.01
    return Math.min(500_000, Math.max(15_000, perc))
  }

  score(lead: LeadRaw, area: AreaEstimation): LeadScore {
    // 1. Dívida (0-30)
    let pDivida = 0
    const mi = lead.totalDivida / 1_000_000
    if (mi >= 0.5 && mi <= 50) pDivida = 30 // sweet spot
    else if (mi > 50 && mi <= 500) pDivida = 22 // grande mas viável
    else if (mi > 500) pDivida = 11 // massiva, negociação complexa
    else if (mi >= 0.2) pDivida = 19
    else if (mi >= 0.05) pDivida = 9
    else pDivida = 2

    // 2. Ajuizamento (0-15) — urgência real
    let pAjuiz = 0
    if (lead.temAjuizada) {
      const ajuizadas = lead.debts.filter((d) => d.ajuizado).length
      const ratio = ajuizadas / Math.max(lead.debts.length, 1)
      pAjuiz = Math.round(7 + ratio * 8)
    }

    // 3. Recência (0-10) — inscrições nos últimos 24 meses valem mais
    let pRec = 0
    const ultima = this.parseDate(lead.ultimaInscricao)
    if (ultima) {
      const meses = (Date.now() - ultima.getTime()) / (1000 * 60 * 60 * 24 * 30.4)
      if (meses <= 6) pRec = 10
      else if (meses <= 12) pRec = 8
      else if (meses <= 24) pRec = 5
      else if (meses <= 60) pRec = 2
      else pRec = 1
    }

    // 4. Qualidade do sinal agro (0-10)
    const strong = ['AGROPECUARIA', 'AGRICOLA', 'AGROINDUSTRIAL', 'SOJA', 'GRÃOS', 'CEREALISTA']
    const mid = ['FAZENDA', 'PECUARIA', 'GADO', 'MILHO', 'CAFE']
    const nomeUp = lead.nome.toUpperCase()
    let pAgro = 0
    if (strong.some((s) => nomeUp.includes(s))) pAgro = 10
    else if (mid.some((s) => nomeUp.includes(s))) pAgro = 7
    else if (lead.agroSignals.length >= 2) pAgro = 5
    else pAgro = 2

    // 5. Hectares (0-10)
    let pHa = 0
    if (area.hectaresEstimados >= 5000) pHa = 10
    else if (area.hectaresEstimados >= 1000) pHa = 8
    else if (area.hectaresEstimados >= 500) pHa = 5
    else if (area.hectaresEstimados >= 100) pHa = 2

    // 6. Velocity (0-10) — aceleração do passivo
    // Quanto mais inscrições em janela curta, mais o passivo está bola-de-neve.
    // Janela = meses entre primeira e última inscrição; qtd = número de inscrições.
    const velocityResult = this.calcularVelocity(lead)
    const pVel = velocityResult.pontos

    // 7. Fit regional (0-15) — proximidade operacional da mesa ALETIS
    const uf = (lead.uf ?? '').toUpperCase()
    const pFit = FIT_REGIONAL_POR_UF[uf] ?? 4
    const labelFit = FIT_REGIONAL_LABEL[uf] ?? `${uf || 'UF desconhecida'} — fora do raio prioritário`

    const total = pDivida + pAjuiz + pRec + pAgro + pHa + pVel + pFit

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
        velocity: pVel,
        fitRegional: pFit,
      },
      motivos: {
        velocity: velocityResult.explicacao,
        fitRegional: labelFit,
      },
      classificacao,
      honorariosEstimados: this.estimarHonorarios(lead.totalDivida),
    }
  }

  /**
   * Velocity — mede se o passivo está acelerando.
   * Retorna 0-10 e explicação textual para handoff ao consultor.
   *
   * Ritmo = inscrições por mês dentro da janela [primeira, última].
   * Peso maior quando há muitas inscrições em pouco tempo E a última é recente.
   */
  private calcularVelocity(lead: LeadRaw): { pontos: number; explicacao: string } {
    const primeira = this.parseDate(lead.primeiraInscricao)
    const ultima = this.parseDate(lead.ultimaInscricao)
    if (!primeira || !ultima || lead.qtdInscricoes <= 0) {
      return { pontos: 0, explicacao: 'Sem dados suficientes para medir velocidade.' }
    }
    // Janela em meses (mínimo 1 mês — evita divisão por zero e inflar ritmo de caso único)
    const diasJanela = Math.max(
      1,
      (ultima.getTime() - primeira.getTime()) / (1000 * 60 * 60 * 24)
    )
    const mesesJanela = Math.max(1, diasJanela / 30.4)
    const ritmo = lead.qtdInscricoes / mesesJanela // inscrições por mês
    const diasDesdeUltima = Math.max(0, (Date.now() - ultima.getTime()) / (1000 * 60 * 60 * 24))

    // Frescor: última inscrição muito recente eleva peso — freio se passou muito tempo
    let frescor = 1.0
    if (diasDesdeUltima <= 90) frescor = 1.0
    else if (diasDesdeUltima <= 365) frescor = 0.75
    else if (diasDesdeUltima <= 730) frescor = 0.5
    else frescor = 0.25

    let pontos: number
    let label: string
    if (ritmo >= 1.0) { pontos = 10; label = 'acelerando forte' }
    else if (ritmo >= 0.5) { pontos = 8; label = 'acelerando' }
    else if (ritmo >= 0.25) { pontos = 6; label = 'ritmo moderado' }
    else if (ritmo >= 0.1) { pontos = 3; label = 'ritmo lento' }
    else { pontos = 1; label = 'passivo cristalizado' }

    pontos = Math.round(pontos * frescor)

    const mesesTxt = mesesJanela < 12
      ? `${Math.round(mesesJanela)} meses`
      : `${(mesesJanela / 12).toFixed(1)} anos`
    const recenciaTxt = diasDesdeUltima <= 90 ? 'última <3m' :
      diasDesdeUltima <= 365 ? 'última <1a' :
      diasDesdeUltima <= 730 ? 'última <2a' : 'última >2a'
    const explicacao = `${lead.qtdInscricoes} inscrições em ${mesesTxt} — ${label} (${recenciaTxt})`
    return { pontos, explicacao }
  }

  /** Parse dd/mm/yyyy — formato PGFN. */
  private parseDate(s: string): Date | null {
    if (!s) return null
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!m) return null
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  }
}
