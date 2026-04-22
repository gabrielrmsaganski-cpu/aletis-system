/**
 * FunruralService — calculadora de opção Funrural 2026.
 *
 * Produtor PF pode optar entre recolher sobre:
 *   (a) receita bruta da comercialização (1,8%)
 *   (b) folha de pagamento (20% prev + RAT × 1% + 0,25% SENAR)
 *
 * Agroindústria e PJ empregador rural têm alíquotas próprias, e
 * agroindústria não pode optar por folha (Lei 8.212/91 art. 22-A).
 *
 * Base legal:
 *   - Lei 8.212/91 art. 25 (base: receita bruta da comercialização)
 *   - Lei 10.256/2001 (empregador rural PJ)
 *   - Lei 13.606/2018 (consolidou a alíquota PF de 1,5% prev)
 *   - STF Tema 916 (constitucionalidade da contribuição sobre
 *     receita bruta do produtor rural PF)
 */
import type {
  CenarioFunrural,
  OpcaoFunrural,
  ResultadoFunrural,
  TipoContribuinte,
} from '@aletis/shared-types/src/funrural.js'

// ── Alíquotas por componente (fração) ──────────────────────

/** PF: previdência 1,5% + RAT 0,1% + SENAR 0,2% = 1,8% sobre receita. */
const PF_RECEITA = { previdencia: 0.015, rat: 0.001, senar: 0.002 }

/** PJ empregador rural: prev 2,5% + RAT 0,1% + SENAR 0,25% = 2,85%. */
const PJ_RECEITA = { previdencia: 0.025, rat: 0.001, senar: 0.0025 }

/** Agroindústria: prev 1,7% + RAT 0,1% + SENAR 0,25% = 2,05%. */
const AGROINDUSTRIA_RECEITA = { previdencia: 0.017, rat: 0.001, senar: 0.0025 }

/** Adquirente retém 1,8% na fonte ao pagar o produtor PF. */
const ADQUIRENTE_RECEITA = { previdencia: 0.015, rat: 0.001, senar: 0.002 }

/** Opção folha (comum): prev 20% + RAT(mult × 1%) + SENAR 0,25%. */
const FOLHA_PREV = 0.2
const FOLHA_SENAR = 0.0025
const RAT_BASE = 0.01 // multiplicado por 1/2/3 conforme grau de risco

function arredondar(n: number): number {
  return Math.round(n * 100) / 100
}

function somaAliquotas(detalhe: {
  previdencia: number
  rat: number
  senar: number
}): number {
  return detalhe.previdencia + detalhe.rat + detalhe.senar
}

export class FunruralService {
  private static instance: FunruralService | null = null

  static getInstance(): FunruralService {
    if (!this.instance) this.instance = new FunruralService()
    return this.instance
  }

  /**
   * Calcula Funrural pelos dois caminhos e recomenda o melhor.
   * Para agroindústria e adquirente, sempre retorna `receita`.
   */
  calcular(cenario: CenarioFunrural): ResultadoFunrural {
    const { tipo, receitaBrutaAnual, folhaPagamentoAnual, ratMultiplicador } =
      cenario
    const ratMult = [1, 2, 3].includes(ratMultiplicador) ? ratMultiplicador : 1
    const ano = new Date().getFullYear()

    const observacoes: string[] = []
    const baseLegal = this.explicarBaseLegal()

    // ── Opção receita ──
    const detalheReceita = this.detalheReceita(tipo)
    const aliqReceita = somaAliquotas(detalheReceita)
    const opcaoReceita: OpcaoFunrural = {
      base: receitaBrutaAnual,
      aliquotaTotal: aliqReceita,
      aliquotaDetalhe: detalheReceita,
      total: arredondar(receitaBrutaAnual * aliqReceita),
    }

    // ── Opção folha ──
    // Só faz sentido para PF e PJ_empregador_rural. Agroindústria e
    // adquirente sempre recolhem sobre receita; aqui calculamos a
    // folha com alíquotas cheias apenas como comparação ilustrativa
    // mas marcaremos na decisão que não há opção efetiva.
    const ratAliq = RAT_BASE * ratMult
    const detalheFolha = {
      previdencia: FOLHA_PREV,
      rat: ratAliq,
      senar: FOLHA_SENAR,
    }
    const aliqFolha = somaAliquotas(detalheFolha)
    const opcaoFolha: OpcaoFunrural = {
      base: folhaPagamentoAnual,
      aliquotaTotal: aliqFolha,
      aliquotaDetalhe: detalheFolha,
      total: arredondar(folhaPagamentoAnual * aliqFolha),
    }

    // ── Decisão ──
    let melhorOpcao: 'receita' | 'folha'
    if (tipo === 'agroindustria') {
      melhorOpcao = 'receita'
      observacoes.push(
        'Agroindústria: Lei 8.212/91 art. 22-A impõe recolhimento sobre a ' +
          'receita bruta; a opção folha NÃO é permitida. Comparativo ' +
          'com folha é apenas ilustrativo.',
      )
    } else if (tipo === 'adquirente') {
      melhorOpcao = 'receita'
      observacoes.push(
        'Adquirente (frigorífico, cooperativa, laticínio) é responsável ' +
          'tributário: retém 1,8% na fonte ao pagar o produtor PF. Não ' +
          'há opção de folha.',
      )
    } else {
      // PF ou PJ empregador rural — pode optar anualmente
      if (cenario.optouFolha === true) {
        melhorOpcao = 'folha'
        observacoes.push(
          'Opção por folha foi forçada via parâmetro `optouFolha: true`. ' +
            'O produtor pode formalizar a opção anualmente na GFIP/eSocial.',
        )
      } else {
        melhorOpcao = opcaoFolha.total < opcaoReceita.total ? 'folha' : 'receita'
      }
    }

    const economia = Math.abs(opcaoReceita.total - opcaoFolha.total)

    // ── Observações ──
    if (tipo === 'PF') {
      observacoes.push(
        'Produtor rural PF pode optar anualmente entre receita ou folha ' +
          '(Lei 13.606/2018). A opção é irretratável durante o exercício.',
      )
    }
    if (tipo === 'PJ_empregador_rural') {
      observacoes.push(
        'Empregador rural PJ: regime padrão é sobre receita bruta da ' +
          'comercialização (Lei 10.256/2001); pode optar por folha em ' +
          'casos específicos.',
      )
    }
    if (melhorOpcao === 'folha' && folhaPagamentoAnual === 0) {
      observacoes.push(
        'Folha de pagamento zerada — cálculo da opção folha resulta em ' +
          'R$ 0, mas atenção: produtor sem folha declarada dificilmente ' +
          'consegue migrar para esse regime.',
      )
    }
    if (receitaBrutaAnual === 0 && tipo !== 'adquirente') {
      observacoes.push(
        'Receita bruta zerada — cálculo meramente ilustrativo.',
      )
    }

    return {
      tipo,
      ano,
      opcaoReceita,
      opcaoFolha,
      melhorOpcao,
      economia: arredondar(economia),
      observacoes,
      baseLegal,
    }
  }

  /** Texto das principais citações legais para resposta. */
  explicarBaseLegal(): string[] {
    return [
      'Lei 8.212/91 art. 25 — contribuição sobre receita bruta da comercialização rural',
      'Lei 10.256/2001 — empregador rural PJ',
      'Lei 13.606/2018 — consolida alíquota PF em 1,5% previdência',
      'STF Tema 916 — constitucionalidade reconhecida (contribuição sobre receita PF)',
    ]
  }

  /** Retorna o detalhe de alíquotas sobre receita por tipo de contribuinte. */
  private detalheReceita(tipo: TipoContribuinte): {
    previdencia: number
    rat: number
    senar: number
  } {
    switch (tipo) {
      case 'PF':
        return { ...PF_RECEITA }
      case 'PJ_empregador_rural':
        return { ...PJ_RECEITA }
      case 'agroindustria':
        return { ...AGROINDUSTRIA_RECEITA }
      case 'adquirente':
        return { ...ADQUIRENTE_RECEITA }
      default:
        return { ...PF_RECEITA }
    }
  }
}

export function getFunruralService(): FunruralService {
  return FunruralService.getInstance()
}
