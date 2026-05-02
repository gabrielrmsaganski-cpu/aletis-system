/**
 * Decomposição Dupont (3 e 5 fatores) e modelo dinâmico Fleuriet.
 *
 * Reimplementa em TS a lógica das fórmulas LAMBDA do arquivo
 * `99_98 - Formula Dupont e Fleuriet.xlsx` (74 named ranges,
 * 644 fórmulas, sheet "Indicadores").
 *
 * - Dupont 3 fatores: ROE = Margem Líquida × Giro do Ativo × Alavancagem.
 * - Dupont 5 fatores: ROE = (LL/EBT) × (EBT/EBIT) × (EBIT/Receita) ×
 *   Giro × Alavancagem.
 * - Fleuriet: ACO − PCO = NCG; ACF − PCF = T; T + NCG = CDG.
 *
 * Tudo é funcional/imutável e seguro a divisão por zero.
 */

export interface DREInput {
  receitaLiquida: number
  cogs: number // custo dos produtos vendidos
  despesasOperacionais: number
  receitasFinanceiras?: number
  despesasFinanceiras: number
  outrasReceitas?: number
  outrasDespesas?: number
  impostoDeRenda: number // CSLL + IRPJ
  jurosCapitalProprio?: number
}

export interface BPInput {
  // Ativo
  caixaEDisponibilidades: number
  ativoFinanceiroCirculante?: number // títulos de curto prazo, aplicações
  contasAReceber: number
  estoques: number
  outroAtivoCirculante?: number
  ativoNaoCirculante: number // imobilizado + intangível + investimentos LP

  // Passivo
  fornecedores: number
  obrigacoesTrabalhistas?: number
  obrigacoesTributarias?: number
  outroPassivoCirculanteOperacional?: number
  emprestimosCurtoPrazo: number
  emprestimosLongoPrazo: number
  outroPassivoNaoCirculante?: number

  // Patrimônio
  patrimonioLiquido: number
}

export interface DupontResult {
  receita: number
  lucroLiquido: number
  ativoTotal: number
  patrimonioLiquido: number
  ebit: number
  ebitda?: number
  // Indicadores derivados
  margemLiquida: number // LL/Receita
  giroDoAtivo: number // Receita/Ativo
  alavancagem: number // Ativo/PL
  roe: number // ROE = margem × giro × alavancagem
  roa: number // LL/Ativo
  margemEbit: number // EBIT/Receita
  efeitoFinanceiro: number // EBT/EBIT
  efeitoFiscal: number // LL/EBT
  // Decomposições
  dupont3: { margem: number; giro: number; alavancagem: number; roe: number }
  dupont5: {
    efeitoFiscal: number
    efeitoFinanceiro: number
    margemOperacional: number
    giro: number
    alavancagem: number
    roe: number
  }
}

export interface FleurietResult {
  // Camadas operacionais
  ativoCirculanteOperacional: number // ACO
  passivoCirculanteOperacional: number // PCO
  necessidadeCapitalGiro: number // NCG = ACO − PCO

  // Camadas financeiras
  ativoCirculanteFinanceiro: number // ACF
  passivoCirculanteFinanceiro: number // PCF
  tesouraria: number // T = ACF − PCF

  // Estrutura
  capitalGiro: number // CDG = T + NCG = (PNC + PL) − ANC
  passivoNaoCirculante: number
  ativoNaoCirculante: number

  // Diagnóstico tipológico Fleuriet
  tipo: FleurietTipo
  efeitoTesoura: boolean
  diagnostico: string
}

export type FleurietTipo =
  | 'I-excelente' // CDG > 0, NCG < 0, T > 0
  | 'II-solida' // CDG > 0, NCG > 0, T > 0
  | 'III-insatisfatoria' // CDG > 0, NCG > 0, T < 0
  | 'IV-pessima' // CDG < 0, NCG > 0, T < 0
  | 'V-alto-risco' // CDG < 0, NCG < 0, T < 0
  | 'VI-arriscada' // CDG < 0, NCG < 0, T > 0

export interface DupontFleurietResult {
  dupont: DupontResult
  fleuriet: FleurietResult
  liquidez: {
    corrente: number
    seca: number
    geral: number
    imediata: number
  }
  endividamento: {
    geral: number // (PC + PNC) / Ativo
    composicao: number // PC / (PC + PNC)
    onerosoSobrePL: number // (Empréstimos CP + LP) / PL
    coberturaJuros: number // EBIT / Juros
  }
}

const safeDiv = (n: number, d: number): number => {
  if (!Number.isFinite(n) || !Number.isFinite(d)) return 0
  return d === 0 ? 0 : n / d
}

export function calcularDupont(dre: DREInput, bp: BPInput): DupontResult {
  const ebit =
    dre.receitaLiquida -
    dre.cogs -
    dre.despesasOperacionais +
    (dre.outrasReceitas ?? 0) -
    (dre.outrasDespesas ?? 0)
  const ebt = ebit + (dre.receitasFinanceiras ?? 0) - dre.despesasFinanceiras
  const lucroLiquido = ebt - dre.impostoDeRenda

  const ativoCirculante =
    bp.caixaEDisponibilidades +
    (bp.ativoFinanceiroCirculante ?? 0) +
    bp.contasAReceber +
    bp.estoques +
    (bp.outroAtivoCirculante ?? 0)
  const ativoTotal = ativoCirculante + bp.ativoNaoCirculante

  const margemLiquida = safeDiv(lucroLiquido, dre.receitaLiquida)
  const giroDoAtivo = safeDiv(dre.receitaLiquida, ativoTotal)
  const alavancagem = safeDiv(ativoTotal, bp.patrimonioLiquido)
  const roe = margemLiquida * giroDoAtivo * alavancagem
  const roa = safeDiv(lucroLiquido, ativoTotal)
  const margemEbit = safeDiv(ebit, dre.receitaLiquida)
  const efeitoFinanceiro = safeDiv(ebt, ebit)
  const efeitoFiscal = safeDiv(lucroLiquido, ebt)

  return {
    receita: dre.receitaLiquida,
    lucroLiquido,
    ativoTotal,
    patrimonioLiquido: bp.patrimonioLiquido,
    ebit,
    margemLiquida,
    giroDoAtivo,
    alavancagem,
    roe,
    roa,
    margemEbit,
    efeitoFinanceiro,
    efeitoFiscal,
    dupont3: { margem: margemLiquida, giro: giroDoAtivo, alavancagem, roe },
    dupont5: {
      efeitoFiscal,
      efeitoFinanceiro,
      margemOperacional: margemEbit,
      giro: giroDoAtivo,
      alavancagem,
      roe: efeitoFiscal * efeitoFinanceiro * margemEbit * giroDoAtivo * alavancagem,
    },
  }
}

export function calcularFleuriet(bp: BPInput): FleurietResult {
  const aco =
    bp.contasAReceber +
    bp.estoques +
    (bp.outroAtivoCirculante ?? 0)
  const pco =
    bp.fornecedores +
    (bp.obrigacoesTrabalhistas ?? 0) +
    (bp.obrigacoesTributarias ?? 0) +
    (bp.outroPassivoCirculanteOperacional ?? 0)
  const ncg = aco - pco

  const acf =
    bp.caixaEDisponibilidades + (bp.ativoFinanceiroCirculante ?? 0)
  const pcf = bp.emprestimosCurtoPrazo
  const t = acf - pcf

  const pnc = bp.emprestimosLongoPrazo + (bp.outroPassivoNaoCirculante ?? 0)
  const cdg = t + ncg

  return {
    ativoCirculanteOperacional: aco,
    passivoCirculanteOperacional: pco,
    necessidadeCapitalGiro: ncg,
    ativoCirculanteFinanceiro: acf,
    passivoCirculanteFinanceiro: pcf,
    tesouraria: t,
    capitalGiro: cdg,
    passivoNaoCirculante: pnc,
    ativoNaoCirculante: bp.ativoNaoCirculante,
    tipo: classificarFleuriet(cdg, ncg, t),
    efeitoTesoura: t < 0 && ncg > 0 && cdg > 0,
    diagnostico: textoDiagnosticoFleuriet(cdg, ncg, t),
  }
}

function classificarFleuriet(cdg: number, ncg: number, t: number): FleurietTipo {
  if (cdg > 0 && ncg < 0 && t > 0) return 'I-excelente'
  if (cdg > 0 && ncg > 0 && t > 0) return 'II-solida'
  if (cdg > 0 && ncg > 0 && t < 0) return 'III-insatisfatoria'
  if (cdg < 0 && ncg > 0 && t < 0) return 'IV-pessima'
  if (cdg < 0 && ncg < 0 && t < 0) return 'V-alto-risco'
  return 'VI-arriscada'
}

function textoDiagnosticoFleuriet(cdg: number, ncg: number, t: number): string {
  const tipo = classificarFleuriet(cdg, ncg, t)
  switch (tipo) {
    case 'I-excelente':
      return 'Estrutura excelente: CDG positivo, NCG negativa (giro financia operação) e tesouraria positiva. Empresa com folga financeira e operação eficiente em capital de giro.'
    case 'II-solida':
      return 'Estrutura sólida: CDG cobre a NCG e ainda sobra tesouraria. Há necessidade operacional, mas financiada por capital de longo prazo.'
    case 'III-insatisfatoria':
      return 'Insatisfatória: NCG cresceu mais que o CDG e a tesouraria virou negativa — sintoma clássico de efeito tesoura iminente. Reforçar capital de longo prazo ou reduzir prazos de recebimento.'
    case 'IV-pessima':
      return 'Péssima: o CDG é negativo e a operação está sendo financiada por dívida de curto prazo. Risco alto de inadimplência.'
    case 'V-alto-risco':
      return 'Alto risco: tudo negativo. Operação altamente dependente de crédito de curto prazo, com sinal de rompimento de capacidade de pagamento.'
    case 'VI-arriscada':
      return 'Arriscada: tesouraria positiva mas CDG e NCG negativos — caixa está cobrindo desfalque estrutural; insustentável no médio prazo.'
  }
}

export function calcularDupontFleuriet(
  dre: DREInput,
  bp: BPInput,
): DupontFleurietResult {
  const dupont = calcularDupont(dre, bp)
  const fleuriet = calcularFleuriet(bp)

  const ativoCirculante =
    bp.caixaEDisponibilidades +
    (bp.ativoFinanceiroCirculante ?? 0) +
    bp.contasAReceber +
    bp.estoques +
    (bp.outroAtivoCirculante ?? 0)
  const passivoCirculante =
    bp.fornecedores +
    (bp.obrigacoesTrabalhistas ?? 0) +
    (bp.obrigacoesTributarias ?? 0) +
    (bp.outroPassivoCirculanteOperacional ?? 0) +
    bp.emprestimosCurtoPrazo
  const passivoNaoCirculante =
    bp.emprestimosLongoPrazo + (bp.outroPassivoNaoCirculante ?? 0)
  const ativoTotal = ativoCirculante + bp.ativoNaoCirculante
  const passivoExigivelTotal = passivoCirculante + passivoNaoCirculante

  return {
    dupont,
    fleuriet,
    liquidez: {
      corrente: safeDiv(ativoCirculante, passivoCirculante),
      seca: safeDiv(ativoCirculante - bp.estoques, passivoCirculante),
      geral: safeDiv(ativoCirculante + bp.ativoNaoCirculante, passivoExigivelTotal),
      imediata: safeDiv(
        bp.caixaEDisponibilidades + (bp.ativoFinanceiroCirculante ?? 0),
        passivoCirculante,
      ),
    },
    endividamento: {
      geral: safeDiv(passivoExigivelTotal, ativoTotal),
      composicao: safeDiv(passivoCirculante, passivoExigivelTotal),
      onerosoSobrePL: safeDiv(
        bp.emprestimosCurtoPrazo + bp.emprestimosLongoPrazo,
        bp.patrimonioLiquido,
      ),
      coberturaJuros: safeDiv(dupont.ebit, dre.despesasFinanceiras),
    },
  }
}
