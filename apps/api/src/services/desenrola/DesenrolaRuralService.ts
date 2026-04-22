/**
 * DesenrolaRuralService — elegibilidade + simulação do programa
 * federal de renegociação de débitos rurais com PGFN / Receita
 * Federal.
 *
 * Base legal:
 *   - MP 1208/2024 (institui o programa)
 *   - Lei 14.973/2024 (consolida e autoriza transição excepcional)
 *   - Portaria PGFN/ME (transação por adesão)
 *
 * Regras de desconto por faixa de capacidade de pagamento:
 *   Faixa A: 50% juros, 25% multa, entrada 10%, 60 meses
 *   Faixa B: 70% juros, 40% multa, entrada 8%, 84 meses
 *   Faixa C: 85% juros, 55% multa, entrada 5%, 120 meses
 *   Faixa D: 100% juros, 65% multa, entrada 5%, 145 meses
 *
 * Prazo de adesão: 31/12/2026.
 *
 * Elegibilidade:
 *   - Débito inscrito em dívida ativa até 2023-12-31
 *   - Origem PGFN / Receita Federal (bancos públicos/privados
 *     não entram neste programa)
 *   - Produtor rural (modalidade custeio, investimento ou
 *     comercialização)
 *   - Capacidade de pagamento ≤ 70% (ratio dívida/ativos > 0,3
 *     ou receita baixa)
 */
import type {
  DividaRural,
  FaixaCapacidadePagamento,
  ParcelaCronograma,
  PerfilProdutor,
  SimulacaoDesenrolaRural,
} from '@aletis/shared-types/src/desenrola-rural.js'

/** Prazo final de adesão definido pela MP 1208/2024 + regulamentações. */
const PRAZO_ADESAO = '2026-12-31'

/** Data-limite para o débito estar inscrito em DA. */
const DATA_LIMITE_INSCRICAO = '2023-12-31'

/** Estrutura de desconto por faixa. */
interface RegraFaixa {
  descontoJurosPct: number
  descontoMultaPct: number
  descontoEncargosLegaisPct: number
  entradaMinimaPct: number
  parcelamentoMaximoMeses: number
}

const REGRAS_FAIXA: Record<FaixaCapacidadePagamento, RegraFaixa> = {
  A: {
    descontoJurosPct: 0.5,
    descontoMultaPct: 0.25,
    descontoEncargosLegaisPct: 0.25,
    entradaMinimaPct: 0.1,
    parcelamentoMaximoMeses: 60,
  },
  B: {
    descontoJurosPct: 0.7,
    descontoMultaPct: 0.4,
    descontoEncargosLegaisPct: 0.4,
    entradaMinimaPct: 0.08,
    parcelamentoMaximoMeses: 84,
  },
  C: {
    descontoJurosPct: 0.85,
    descontoMultaPct: 0.55,
    descontoEncargosLegaisPct: 0.5,
    entradaMinimaPct: 0.05,
    parcelamentoMaximoMeses: 120,
  },
  D: {
    descontoJurosPct: 1.0,
    descontoMultaPct: 0.65,
    descontoEncargosLegaisPct: 0.65,
    entradaMinimaPct: 0.05,
    parcelamentoMaximoMeses: 145,
  },
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100
}

function isoAddMonths(baseIso: string, meses: number): string {
  const d = new Date(baseIso)
  if (Number.isNaN(d.getTime())) {
    const hoje = new Date()
    d.setTime(hoje.getTime())
  }
  d.setMonth(d.getMonth() + meses)
  return d.toISOString().slice(0, 10)
}

export class DesenrolaRuralService {
  private static instance: DesenrolaRuralService | null = null

  static getInstance(): DesenrolaRuralService {
    if (!this.instance) this.instance = new DesenrolaRuralService()
    return this.instance
  }

  /**
   * Classifica o produtor em faixa A/B/C/D conforme:
   *   - ratio dívida/ativos
   *   - ratio dívida/receita
   *
   * Heurística (alinhada à prática PGFN de capacidade de pagamento):
   *   - dividasTotal / ativosDeclarados   ≤ 0,3 E receita > dividasTotal/2 → A
   *   - ratio entre 0,3 e 0,6                                              → B
   *   - ratio entre 0,6 e 1,0                                              → C
   *   - ratio > 1,0 OU receita ≤ dividasTotal/4                            → D
   */
  classificarFaixa(perfil: PerfilProdutor): FaixaCapacidadePagamento {
    const { receitaBrutaAnual, ativosDeclarados, dividasTotal } = perfil
    const ativos = Math.max(1, ativosDeclarados) // evita divisão por zero
    const ratio = dividasTotal / ativos
    const receitaRatio = receitaBrutaAnual > 0 ? dividasTotal / receitaBrutaAnual : Infinity

    if (ratio > 1.0 || receitaRatio > 4) return 'D'
    if (ratio > 0.6 || receitaRatio > 2) return 'C'
    if (ratio > 0.3 || receitaRatio > 1) return 'B'
    return 'A'
  }

  /**
   * Verifica se a dívida + perfil são elegíveis ao programa.
   * Retorna lista de motivos (tanto positivos quanto impeditivos).
   */
  elegibilidade(
    divida: DividaRural,
    perfil: PerfilProdutor,
  ): { elegivel: boolean; motivos: string[] } {
    const motivos: string[] = []
    let elegivel = true

    // 1. Origem do débito
    const origensAceitas = ['pgfn', 'receita_federal']
    if (!origensAceitas.includes(divida.origem)) {
      elegivel = false
      motivos.push(
        `Origem "${divida.origem}" fora do escopo do programa — ` +
          `Desenrola Rural trata apenas débitos inscritos em PGFN/RFB. ` +
          `Débitos com bancos públicos/cooperativas têm outros programas (FEAP, Pronamp).`,
      )
    } else {
      motivos.push(`Origem "${divida.origem}" aceita pelo programa.`)
    }

    // 2. Data de inscrição ≤ 2023-12-31
    if (divida.dataInscricao > DATA_LIMITE_INSCRICAO) {
      elegivel = false
      motivos.push(
        `Débito inscrito em ${divida.dataInscricao}: fora do corte do ` +
          `programa (aceita apenas inscrições até ${DATA_LIMITE_INSCRICAO}).`,
      )
    } else {
      motivos.push(
        `Débito inscrito em ${divida.dataInscricao}: dentro do corte (≤ ${DATA_LIMITE_INSCRICAO}).`,
      )
    }

    // 3. Modalidade rural
    const modalidadesRurais = ['custeio', 'investimento', 'comercializacao']
    if (!modalidadesRurais.includes(divida.modalidade)) {
      elegivel = false
      motivos.push(
        `Modalidade "${divida.modalidade}" não é rural — fora do escopo.`,
      )
    } else {
      motivos.push(`Modalidade "${divida.modalidade}" é rural.`)
    }

    // 4. Capacidade de pagamento ≤ 70% (ratio dívida/ativos > 0,3)
    const faixa = perfil.capacidadePagamento
    if (faixa === 'A') {
      // Faixa A com baixa dívida pode ser inelegível (capacidade total)
      const ratio =
        perfil.dividasTotal / Math.max(1, perfil.ativosDeclarados)
      if (ratio < 0.2) {
        elegivel = false
        motivos.push(
          `Capacidade de pagamento > 80% (ratio dívida/ativos = ${(ratio * 100).toFixed(1)}%): ` +
            `produtor com alta capacidade não se enquadra (programa é para ` +
            `produtores em dificuldade financeira).`,
        )
      } else {
        motivos.push('Faixa A elegível com descontos reduzidos.')
      }
    } else {
      motivos.push(`Faixa ${faixa} elegível — capacidade de pagamento reduzida.`)
    }

    // 5. Prazo de adesão
    const hoje = new Date().toISOString().slice(0, 10)
    if (hoje > PRAZO_ADESAO) {
      elegivel = false
      motivos.push(
        `Prazo de adesão encerrado em ${PRAZO_ADESAO}. ` +
          `Hoje: ${hoje}. Aguarde renovação do programa.`,
      )
    }

    return { elegivel, motivos }
  }

  /**
   * Simula o enquadramento, desconto e cronograma proposto de
   * quitação.
   */
  simular(
    divida: DividaRural,
    perfil: PerfilProdutor,
  ): SimulacaoDesenrolaRural {
    const { elegivel, motivos } = this.elegibilidade(divida, perfil)
    const regra = REGRAS_FAIXA[perfil.capacidadePagamento]

    // Decomposição do valor atualizado — premissas comuns à PGFN:
    //   principal ≈ valor inscrito
    //   juros     ≈ 70% do acréscimo (valor_atualizado - valor_inscrito)
    //   multa     ≈ 20% do acréscimo
    //   encargos legais (honorários) ≈ 10% do acréscimo
    const acrescimo = Math.max(0, divida.valorAtualizado - divida.valorInscrito)
    const principal = divida.valorInscrito
    const juros = acrescimo * 0.7
    const multa = acrescimo * 0.2
    const encargosLegais = acrescimo * 0.1

    // Aplica descontos
    const descontoJurosVal = juros * regra.descontoJurosPct
    const descontoMultaVal = multa * regra.descontoMultaPct
    const descontoEncargosVal = encargosLegais * regra.descontoEncargosLegaisPct

    const jurosLiquido = juros - descontoJurosVal
    const multaLiquida = multa - descontoMultaVal
    const encargosLiquidos = encargosLegais - descontoEncargosVal

    const valorAPagar = arredondar(
      principal + jurosLiquido + multaLiquida + encargosLiquidos,
    )
    const economia = arredondar(divida.valorAtualizado - valorAPagar)

    // Entrada e parcelamento
    const entradaMinima = arredondar(valorAPagar * regra.entradaMinimaPct)
    const saldoParcelado = Math.max(0, valorAPagar - entradaMinima)
    const parcelas = regra.parcelamentoMaximoMeses
    const valorParcela = parcelas > 0 ? arredondar(saldoParcelado / parcelas) : 0

    // Cronograma (entrada + parcelas mensais)
    const cronograma: ParcelaCronograma[] = []
    const hojeIso = new Date().toISOString().slice(0, 10)
    cronograma.push({ parcela: 0, valor: entradaMinima, data: hojeIso })
    for (let i = 1; i <= parcelas; i++) {
      cronograma.push({
        parcela: i,
        valor: valorParcela,
        data: isoAddMonths(hojeIso, i),
      })
    }

    return {
      divida,
      perfil,
      elegivel,
      motivos,
      valorAtualizado: divida.valorAtualizado,
      descontoJurosPct: regra.descontoJurosPct,
      descontoMultaPct: regra.descontoMultaPct,
      descontoEncargosLegaisPct: regra.descontoEncargosLegaisPct,
      entradaMinima,
      parcelamentoMaximoMeses: parcelas,
      valorAPagar,
      economia,
      cronogramaProposto: cronograma,
      prazoAdesao: PRAZO_ADESAO,
      baseLegal: [
        'MP 1208/2024',
        'Lei 14.973/2024',
        'Portaria PGFN/ME (transação por adesão — Desenrola Rural)',
      ],
    }
  }
}

export function getDesenrolaRuralService(): DesenrolaRuralService {
  return DesenrolaRuralService.getInstance()
}
