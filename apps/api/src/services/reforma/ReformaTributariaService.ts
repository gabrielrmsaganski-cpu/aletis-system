/**
 * ReformaTributariaService — Simulador CBS / IBS 2026+ pro
 * produtor rural e agroindústria.
 *
 * Base legal:
 *   - EC 132/2023 (reforma tributária do consumo)
 *   - LC 214/2025 (institui CBS + IBS)
 *   - LC 215/2025 (regulamenta CBS)
 *   - Art. 156-A §2º CF + LC 214/2025: imunidade ao produtor rural
 *     PF/PJ com receita bruta anual ≤ R$ 3.600.000,00.
 *
 * Alíquotas de transição (fonte: cronograma oficial divulgado pelo
 * Ministério da Fazenda / RFB em dez/2024, consolidado na LC
 * 214/2025 Anexo II). Podem sofrer ajustes anuais de calibragem do
 * Comitê Gestor do IBS (esperados em ago/2027 e ago/2030). Caso
 * haja atualização posterior, `aliquotasTransicao` deve ser
 * ajustada aqui.
 *
 * Comparativo:
 *   Sistema atual (tributos a revogar gradualmente):
 *     PIS/COFINS cumulativo (3,65% sobre receita — aproximação para
 *       o produtor rural não-optante), ICMS (cesta básica agro
 *       frequentemente 7%), IPI (0% para boa parte da produção
 *       rural in natura), Funrural (1,8% PF).
 *   Sistema novo (CBS + IBS pleno = 26,8% em 2033, com direito a
 *     crédito integral sobre insumos).
 *
 * Obs.: este simulador usa premissas conservadoras (ICMS 7%,
 * PIS/COFINS 3,65%, IPI 0%). Cenários municipais/estaduais
 * podem variar — cite as `observacoes` do resultado.
 */
import type {
  CenarioTributario,
  RegimeTributarioRural,
  ResultadoTributario,
} from '@aletis/shared-types/src/reforma-tributaria.js'

// ── Premissas do sistema atual (aproximações para agro) ────
/** PIS+COFINS cumulativo consolidado (0,65% + 3,0%). */
const PIS_COFINS_ALIQ = 0.0365
/** ICMS médio ponderado agro (cesta básica / convênios). */
const ICMS_ALIQ = 0.07
/** IPI para produção agrícola in natura (zero na maioria dos casos). */
const IPI_ALIQ = 0
/** Funrural PF — 1,8% consolidado (1,5% prev + 0,1% RAT + 0,2% SENAR). */
const FUNRURAL_PF = 0.018
/** Funrural PJ rural — 2,85% (2,5% prev + 0,1% RAT + 0,25% SENAR). */
const FUNRURAL_PJ = 0.0285
/** Funrural agroindústria — 2,05% (1,7% prev + 0,1% RAT + 0,25% SENAR). */
const FUNRURAL_AGROINDUSTRIA = 0.0205

/** Piso legal da imunidade (LC 214/2025). */
const PISO_IMUNIDADE_RECEITA = 3_600_000

/**
 * Tabela oficial de alíquotas de transição 2026-2033+.
 * Fonte: comunicado Ministério da Fazenda dez/2024 (LC 214/2025).
 * Chave = ano; valores = { cbs, ibs } em fração.
 */
const ALIQUOTAS_TRANSICAO: Record<number, { cbs: number; ibs: number }> = {
  2026: { cbs: 0.009, ibs: 0.001 },
  2027: { cbs: 0.077, ibs: 0.001 },
  2028: { cbs: 0.088, ibs: 0.001 },
  2029: { cbs: 0.088, ibs: 0.001 },
  2030: { cbs: 0.088, ibs: 0.04 },
  2031: { cbs: 0.088, ibs: 0.08 },
  2032: { cbs: 0.088, ibs: 0.14 },
  2033: { cbs: 0.088, ibs: 0.18 },
}

const REGIMES_IMUNES: RegimeTributarioRural[] = [
  'produtor_rural_pf_imune',
  'produtor_rural_pj_imune',
]

function arredondar(n: number): number {
  return Math.round(n * 100) / 100
}

export class ReformaTributariaService {
  private static instance: ReformaTributariaService | null = null

  static getInstance(): ReformaTributariaService {
    if (!this.instance) this.instance = new ReformaTributariaService()
    return this.instance
  }

  /**
   * Retorna alíquotas oficiais de CBS e IBS para o ano. Anos
   * anteriores a 2026 retornam zeros (sistema antigo ainda pleno).
   * Anos após 2033 retornam o regime pleno (0,088 / 0,18).
   */
  aliquotasTransicao(ano: number): { cbs: number; ibs: number } {
    if (ano < 2026) return { cbs: 0, ibs: 0 }
    if (ano >= 2033) return ALIQUOTAS_TRANSICAO[2033]
    return ALIQUOTAS_TRANSICAO[ano] ?? ALIQUOTAS_TRANSICAO[2033]
  }

  /** Texto descritivo da imunidade / tratamento tributário. */
  explicarImunidade(regime: RegimeTributarioRural): string {
    switch (regime) {
      case 'produtor_rural_pf_imune':
        return (
          'Produtor rural PF com receita bruta anual ≤ R$ 3.600.000 é ' +
          'imune à CBS e ao IBS (LC 214/2025, art. 156-A §2º CF). ' +
          'Continua devendo Funrural (1,8%) sobre a receita de ' +
          'comercialização. Não há direito a crédito de CBS/IBS sobre ' +
          'compras — custo do insumo entra integral no custeio.'
        )
      case 'produtor_rural_pj_imune':
        return (
          'Produtor rural PJ com receita bruta anual ≤ R$ 3.600.000 é ' +
          'imune à CBS e ao IBS (LC 214/2025, art. 156-A §2º CF). ' +
          'Continua devendo Funrural empregador rural (2,85%) sobre ' +
          'a receita de comercialização. Sem crédito de insumos.'
        )
      case 'produtor_rural_pf_normal':
        return (
          'Produtor rural PF com receita > R$ 3.600.000/ano: recolhe ' +
          'CBS/IBS no regime normal, com direito a crédito integral ' +
          'sobre compras. O Funrural (1,8%) segue devido enquanto não ' +
          'revogado pela regulamentação da LC 214/2025.'
        )
      case 'produtor_rural_pj_normal':
        return (
          'Produtor rural PJ com receita > R$ 3.600.000/ano: recolhe ' +
          'CBS/IBS no regime normal com crédito integral. Funrural PJ ' +
          '(2,85%) segue devido.'
        )
      case 'agroindustria':
        return (
          'Agroindústria: sempre no regime normal de CBS/IBS com ' +
          'crédito integral das compras. Funrural agroindústria (2,05% ' +
          'sobre receita de comercialização) segue devido por força do ' +
          'art. 22-A da Lei 8.212/91.'
        )
      default:
        return 'Regime tributário não reconhecido.'
    }
  }

  /**
   * Executa a simulação comparativa (atual × novo) para o cenário
   * informado. Retorna decomposição por tributo quando pedido e
   * recomendações qualitativas.
   */
  simular(cenario: CenarioTributario): ResultadoTributario {
    const { ano, regime, receitaBruta, comprasInsumos } = cenario
    const aliq = this.aliquotasTransicao(ano)
    const isImune = REGIMES_IMUNES.includes(regime)

    // Valida consistência entre regime e receita
    const observacoes: string[] = []
    const recomendacoes: string[] = []

    if (isImune && receitaBruta > PISO_IMUNIDADE_RECEITA) {
      observacoes.push(
        `Receita R$ ${receitaBruta.toLocaleString('pt-BR')} excede o piso ` +
          `da imunidade (R$ 3.600.000). Reconsidere o regime — o produtor ` +
          `deveria estar no regime normal (LC 214/2025).`,
      )
    }
    if (
      !isImune &&
      regime !== 'agroindustria' &&
      receitaBruta > 0 &&
      receitaBruta <= PISO_IMUNIDADE_RECEITA
    ) {
      recomendacoes.push(
        'Receita abaixo do piso — avalie enquadramento como imune ' +
          '(produtor_rural_pf_imune ou produtor_rural_pj_imune) para ' +
          'eliminar CBS/IBS.',
      )
    }

    // ── Sistema atual ──────────────────────────────────────
    const pisCofins = receitaBruta * PIS_COFINS_ALIQ
    const icms = receitaBruta * ICMS_ALIQ
    const ipi = receitaBruta * IPI_ALIQ
    const funruralAtual = this.calcularFunruralAtual(regime, receitaBruta)
    const totalAtual = pisCofins + icms + ipi + funruralAtual

    // ── Sistema novo ───────────────────────────────────────
    let cbs = 0
    let ibs = 0
    let creditosCompras = 0
    let funruralRemanescente = 0

    if (isImune) {
      // Imune: CBS/IBS zerados, sem crédito (não faz sentido creditar
      // tributo que não é devido). Funrural continua.
      funruralRemanescente = this.calcularFunruralAtual(regime, receitaBruta)
      observacoes.push(
        'Imunidade aplicada: CBS e IBS zerados (LC 214/2025 art. 156-A §2º CF).',
      )
      observacoes.push(
        'Imune não gera crédito sobre insumos — custo entra integral no custeio.',
      )
    } else {
      cbs = receitaBruta * aliq.cbs
      ibs = receitaBruta * aliq.ibs
      // Crédito integral sobre compras de insumos (LC 214/2025 art. 47)
      creditosCompras = comprasInsumos * (aliq.cbs + aliq.ibs)
      funruralRemanescente = this.calcularFunruralAtual(regime, receitaBruta)
    }

    const totalNovo = Math.max(
      0,
      cbs + ibs - creditosCompras + funruralRemanescente,
    )
    const diferencaAbsoluta = totalNovo - totalAtual
    const diferencaPercentual =
      totalAtual > 0 ? (diferencaAbsoluta / totalAtual) * 100 : 0

    // ── Recomendações qualitativas ─────────────────────────
    if (!isImune && comprasInsumos < receitaBruta * 0.3) {
      recomendacoes.push(
        'Compras de insumos representam menos de 30% da receita — o ' +
          'crédito de CBS/IBS tende a ser baixo. Planejar compras ' +
          'tributadas para maximizar o creditamento.',
      )
    }
    if (!isImune && ano < 2030) {
      recomendacoes.push(
        `Em ${ano} a IBS ainda opera em fase de teste (alíquota 0,1% ` +
          `compensável com ICMS). A transição completa acelera a partir ` +
          `de 2030; projete fluxo de caixa para 2033 (regime pleno).`,
      )
    }
    if (diferencaAbsoluta < 0) {
      recomendacoes.push(
        `Novo regime projeta economia de R$ ${Math.abs(diferencaAbsoluta).toLocaleString('pt-BR')} ` +
          `(${Math.abs(diferencaPercentual).toFixed(1)}%) em ${ano}.`,
      )
    } else if (diferencaAbsoluta > 0) {
      recomendacoes.push(
        `Novo regime projeta custo adicional de R$ ${diferencaAbsoluta.toLocaleString('pt-BR')} ` +
          `(${diferencaPercentual.toFixed(1)}%) em ${ano} — avalie ajuste ` +
          `de preço ou revisão de mix.`,
      )
    }

    // Base legal sempre presente nas observações
    observacoes.push(
      'Base legal: EC 132/2023 + LC 214/2025 (institui CBS+IBS) + LC 215/2025.',
    )
    if (funruralRemanescente > 0) {
      observacoes.push(
        'Funrural calculado conforme Lei 8.212/91 art. 25 e Lei 10.256/2001.',
      )
    }

    return {
      sistemaAtual: {
        pisCofins: arredondar(pisCofins),
        icms: arredondar(icms),
        ipi: arredondar(ipi),
        funrural: arredondar(funruralAtual),
        total: arredondar(totalAtual),
      },
      sistemaNovo: {
        cbs: arredondar(cbs),
        ibs: arredondar(ibs),
        creditosCompras: arredondar(creditosCompras),
        funruralRemanescente: arredondar(funruralRemanescente),
        total: arredondar(totalNovo),
      },
      diferencaAbsoluta: arredondar(diferencaAbsoluta),
      diferencaPercentual: arredondar(diferencaPercentual),
      aliquotasAno: aliq,
      observacoes,
      recomendacoes,
    }
  }

  /**
   * Calcula Funrural do sistema atual conforme regime.
   * Agroindústria: 2,05%; PJ rural: 2,85%; PF: 1,8%.
   */
  private calcularFunruralAtual(
    regime: RegimeTributarioRural,
    receitaBruta: number,
  ): number {
    if (regime === 'agroindustria') return receitaBruta * FUNRURAL_AGROINDUSTRIA
    if (regime.startsWith('produtor_rural_pj')) return receitaBruta * FUNRURAL_PJ
    return receitaBruta * FUNRURAL_PF
  }
}

export function getReformaTributariaService(): ReformaTributariaService {
  return ReformaTributariaService.getInstance()
}
