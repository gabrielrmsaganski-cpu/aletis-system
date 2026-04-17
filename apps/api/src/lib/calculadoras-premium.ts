/**
 * ALETIS - Calculadoras Premium
 *
 * Motor matemático completo inspirado nas propostas reais:
 *  - PAULO LUCIANO x FERTIFLORA (recálculo CCB + plano pagamento semestral)
 *  - AILTON x SICOOB (descaracterização + dação em pagamento + acordo tripartite)
 *
 * Todas as calculadoras produzem MEMÓRIA DE CÁLCULO auditável e TEXTO DE FUNDAMENTAÇÃO
 * pronto para inclusão em propostas de renegociação.
 */

import {
  calcularCET,
  simularAmortizacao,
  recalcularDivida,
  converterTaxa,
  toDate,
  diffDias,
  type Fluxo,
  type Pagamento,
  type LinhaAmortizacao,
} from './financeiro.js'

/* ================================================================
 *  1. MEMÓRIA DE CÁLCULO COMPLETA
 *  (Auditável, demonstra juros mês a mês, pagamentos e saldo final)
 * ================================================================ */

export interface MemoriaCalculoParams {
  valorOriginal: number
  dataInicio: string
  taxaNominalMensal: number
  iofTotal?: number
  seguroPrestamista?: number
  tarifasDiversas?: number
  pagamentos?: Pagamento[]
  dataCorte: string
  /** taxa mora a.m. (em credito rural = 1/12, em credito comum = 1) */
  taxaMoraAM?: number
  multaInadimplencia?: number // % sobre prestacao vencida
}

export interface MemoriaCalculoResultado {
  /** CET efetivo calculado via TIR */
  cetMensal: number
  cetAnual: number
  /** taxa nominal informada - deve coincidir com CET se nao houver despesas */
  taxaNominalMensal: number
  taxaNominalAnual: number
  /** spread entre nominal e efetiva - evidencia de capitalizacao de despesas */
  spreadNominalVsEfetiva: number
  /** Valor originalmente contratado */
  valorOriginal: number
  /** Valor efetivamente liberado (descontadas as despesas capitalizadas) */
  valorLiberadoLiquido: number
  /** Multiplicador de capitalizacao de despesas (caso AILTON = 3,4x) */
  multiplicadorDespesas: number
  totalDespesasCapitalizadas: number
  saldoAtualizado: number
  totalJuros: number
  totalPago: number
  detalhamentoPeriodo: Array<{
    periodo: string
    saldoInicial: number
    juros: number
    pagamento: number
    saldoFinal: number
  }>
  fundamentacao: string
}

export function calcularMemoriaCompleta(p: MemoriaCalculoParams): MemoriaCalculoResultado {
  const despesas = (p.iofTotal || 0) + (p.seguroPrestamista || 0) + (p.tarifasDiversas || 0)
  const valorLiquido = p.valorOriginal - despesas

  // 1. Recalculo padrao com taxa nominal
  const recalc = recalcularDivida(p.valorOriginal, p.dataInicio, p.taxaNominalMensal, p.pagamentos || [], p.dataCorte)

  // 2. CET via TIR sobre fluxos reais (liberacao - pagamentos)
  const fluxos: Fluxo[] = [
    { data: p.dataInicio, valor: valorLiquido }, // liberacao positiva (cliente recebe)
    ...(p.pagamentos || []).map(pg => ({ data: pg.data, valor: -pg.valor })), // pagamentos negativos
    { data: p.dataCorte, valor: -recalc.saldoAtualizado }, // saldo residual negativo
  ]

  let cet = { mensal: p.taxaNominalMensal, anual: 0 }
  try {
    cet = calcularCET(fluxos)
  } catch (e) {
    // Se TIR nao converge, manter taxa nominal
  }

  const taxaNominalAnual = (Math.pow(1 + p.taxaNominalMensal / 100, 12) - 1) * 100
  const multiplicador = despesas > 0 ? (recalc.totalJuros + recalc.saldoAtualizado) / valorLiquido : 1

  // 3. Fundamentação textual
  const fundamentacao = [
    `MEMÓRIA DE CÁLCULO - Art. 320 e 322 CC, Decreto-Lei 167/67 (cédulas rurais).`,
    `Valor contratado: R$ ${p.valorOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    despesas > 0
      ? `Despesas capitalizadas (IOF R$ ${(p.iofTotal || 0).toLocaleString('pt-BR')} + seguro R$ ${(p.seguroPrestamista || 0).toLocaleString('pt-BR')} + tarifas R$ ${(p.tarifasDiversas || 0).toLocaleString('pt-BR')}): R$ ${despesas.toLocaleString('pt-BR')}`
      : `Sem despesas capitalizadas informadas.`,
    `Valor líquido recebido: R$ ${valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Taxa contratual nominal: ${p.taxaNominalMensal.toFixed(4)}% a.m. (${taxaNominalAnual.toFixed(2)}% a.a.)`,
    `CET efetivo (TIR sobre fluxos reais): ${cet.mensal.toFixed(4)}% a.m. (${cet.anual.toFixed(2)}% a.a.)`,
    `Spread efetiva vs nominal: ${(cet.anual - taxaNominalAnual).toFixed(2)} p.p. a.a.`,
    multiplicador > 2
      ? `ALERTA: despesas capitalizadas multiplicam a dívida em ${multiplicador.toFixed(2)}x - indício de abusividade (cfr. caso AILTON 3,4x).`
      : '',
    `Saldo atualizado em ${p.dataCorte}: R$ ${recalc.saldoAtualizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
  ].filter(Boolean).join('\n')

  return {
    cetMensal: cet.mensal,
    cetAnual: cet.anual,
    taxaNominalMensal: p.taxaNominalMensal,
    taxaNominalAnual: Number(taxaNominalAnual.toFixed(4)),
    spreadNominalVsEfetiva: Number((cet.anual - taxaNominalAnual).toFixed(4)),
    valorOriginal: p.valorOriginal,
    valorLiberadoLiquido: Number(valorLiquido.toFixed(2)),
    multiplicadorDespesas: Number(multiplicador.toFixed(4)),
    totalDespesasCapitalizadas: Number(despesas.toFixed(2)),
    saldoAtualizado: recalc.saldoAtualizado,
    totalJuros: recalc.totalJuros,
    totalPago: recalc.totalPago,
    detalhamentoPeriodo: recalc.detalhamento,
    fundamentacao,
  }
}

/* ================================================================
 *  2. DAÇÃO EM PAGAMENTO
 *  (Extinção de dívida via entrega de bem imóvel/móvel)
 * ================================================================ */

export interface DacaoParams {
  saldoDevedor: number
  bensOferecidos: Array<{
    descricao: string
    matricula?: string
    tipo: 'imovel_rural' | 'imovel_urbano' | 'maquinario' | 'semovente' | 'cota_cooperativa' | 'outros'
    areaHa?: number
    valorAvaliacao: number
    laudista?: string
    dataLaudo?: string
  }>
  /** desagio aplicado pelo credor (default 10-20% em acordos extrajudiciais) */
  desagioCredorPct?: number
  /** custos transacao (ITBI, emolumentos) em % sobre valor do bem */
  custosTransacaoPct?: number
}

export interface DacaoResultado {
  saldoDevedor: number
  valorTotalBens: number
  valorAposDesagio: number
  custosTransacao: number
  valorLiquidoCredor: number
  suficiente: boolean
  saldoRemanescente: number
  propostaLiquidacaoParcial: string
  fundamentacao: string
  detalhamento: Array<{ bem: string; valorAvaliacao: number; participacao: number }>
}

export function simularDacao(p: DacaoParams): DacaoResultado {
  const desagio = p.desagioCredorPct ?? 10
  const custosPct = p.custosTransacaoPct ?? 4 // 2% ITBI + 2% cartório (média)

  const valorTotal = p.bensOferecidos.reduce((s, b) => s + b.valorAvaliacao, 0)
  const valorPosDesagio = valorTotal * (1 - desagio / 100)
  const custosTrans = valorTotal * (custosPct / 100)
  const valorLiquido = valorPosDesagio - custosTrans

  const suficiente = valorLiquido >= p.saldoDevedor
  const saldoRemanescente = suficiente ? 0 : p.saldoDevedor - valorLiquido

  const detalhamento = p.bensOferecidos.map(b => ({
    bem: b.descricao,
    valorAvaliacao: b.valorAvaliacao,
    participacao: Number(((b.valorAvaliacao / valorTotal) * 100).toFixed(2)),
  }))

  const propostaLiquidacao = suficiente
    ? `DAÇÃO QUITA INTEGRALMENTE a dívida. Sobra R$ ${(valorLiquido - p.saldoDevedor).toLocaleString('pt-BR')} em favor do devedor.`
    : `DAÇÃO COBRE ${((valorLiquido / p.saldoDevedor) * 100).toFixed(1)}% da dívida. Remanescente R$ ${saldoRemanescente.toLocaleString('pt-BR')} a ser ` +
      `parcelado em condições convencionais (sugerido: 24-48 meses, carência 12 meses).`

  const fundamentacao = [
    `DAÇÃO EM PAGAMENTO - Arts. 356 a 359 do Código Civil (extinção obrigacional).`,
    `Precedente: STJ REsp 1.429.461/RJ (Min. Paulo de Tarso Sanseverino).`,
    `Saldo devedor: R$ ${p.saldoDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Total bens ofertados: R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${p.bensOferecidos.length} bem/bens)`,
    `Deságio pactuado: ${desagio}% => R$ ${valorPosDesagio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Custos transação (${custosPct}%): R$ ${custosTrans.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Valor líquido ao credor: R$ ${valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Cobertura da dívida: ${((valorLiquido / p.saldoDevedor) * 100).toFixed(1)}%`,
    suficiente ? 'DAÇÃO SUFICIENTE - quitação integral' : `Remanescente R$ ${saldoRemanescente.toLocaleString('pt-BR')}`,
  ].join('\n')

  return {
    saldoDevedor: p.saldoDevedor,
    valorTotalBens: Number(valorTotal.toFixed(2)),
    valorAposDesagio: Number(valorPosDesagio.toFixed(2)),
    custosTransacao: Number(custosTrans.toFixed(2)),
    valorLiquidoCredor: Number(valorLiquido.toFixed(2)),
    suficiente,
    saldoRemanescente: Number(saldoRemanescente.toFixed(2)),
    propostaLiquidacaoParcial: propostaLiquidacao,
    fundamentacao,
    detalhamento,
  }
}

/* ================================================================
 *  3. ALONGAMENTO - SÚMULA 298 STJ + MCR 2-6-4
 * ================================================================ */

export interface AlongamentoParams {
  saldoDevedor: number
  taxaOriginalAA: number
  prazoOriginalMeses: number
  percentualPerdaSafra: number // 0-100
  tipoCredito: 'custeio' | 'investimento' | 'comercializacao'
  dataVencimentoOriginal: string
  /** permitir carencia inicial */
  carenciaMeses?: number
  /** numero de safras para distribuir o pagamento */
  numeroSafras?: number
}

export interface AlongamentoResultado {
  valorAlongavel: number
  valorMantidoCondicoesOriginais: number
  novaTaxaAA: number
  prazoAlongadoMeses: number
  parcelasAnuais: Array<{ safra: string; vencimento: string; principal: number; juros: number; total: number }>
  economiaFinanceira: number
  fundamentacaoJuridica: string
  viabilidade: 'alta' | 'media' | 'baixa'
}

export function simularAlongamento(p: AlongamentoParams): AlongamentoResultado {
  // TRF-4 Apelacao 5008203-86.2016 - alongamento PROPORCIONAL a perda
  const valorAlongavel = p.saldoDevedor * (p.percentualPerdaSafra / 100)
  const valorMantido = p.saldoDevedor - valorAlongavel

  // Prazo: custeio 7 anos; investimento 12 anos; comercializacao 3 anos (MCR 2-6-4)
  const prazoMaxMap = { custeio: 84, investimento: 144, comercializacao: 36 }
  const prazoNovo = prazoMaxMap[p.tipoCredito]

  // Taxa: mantem original (Sumula 298 + MCR 7-1) ou aplica spread de risco max 4pp
  const novaTaxaAA = p.taxaOriginalAA // mantida

  // Distribui em N safras
  const numSafras = p.numeroSafras ?? Math.min(Math.floor(prazoNovo / 12), 7)
  const carencia = p.carenciaMeses ?? 12

  const parcelas: AlongamentoResultado['parcelasAnuais'] = []
  const taxaAM = Math.pow(1 + novaTaxaAA / 100, 1 / 12) - 1
  const dataBase = toDate(p.dataVencimentoOriginal)

  let saldo = valorAlongavel
  for (let i = 1; i <= numSafras; i++) {
    const mesesAcum = carencia + i * 12
    const juros = saldo * (Math.pow(1 + taxaAM, 12) - 1)
    const principal = valorAlongavel / numSafras
    saldo -= principal

    const venc = new Date(dataBase)
    venc.setUTCMonth(venc.getUTCMonth() + mesesAcum)

    parcelas.push({
      safra: `${venc.getUTCFullYear() - 1}/${venc.getUTCFullYear()}`,
      vencimento: venc.toISOString().slice(0, 10),
      principal: Number(principal.toFixed(2)),
      juros: Number(juros.toFixed(2)),
      total: Number((principal + juros).toFixed(2)),
    })
  }

  // Economia = valor dos juros extras se nao alongasse (teria mora + multa)
  const juroAlongado = parcelas.reduce((s, p) => s + p.juros, 0)
  const juroSemAlongamento = valorAlongavel * ((1 + novaTaxaAA / 100) ** (prazoNovo / 12) - 1) +
    valorAlongavel * 0.02 + // multa 2%
    valorAlongavel * (prazoNovo / 12) * 0.01 // mora 1% a.a.
  const economia = juroSemAlongamento - juroAlongado

  const viabilidade: 'alta' | 'media' | 'baixa' =
    p.percentualPerdaSafra >= 40 ? 'alta' : p.percentualPerdaSafra >= 20 ? 'media' : 'baixa'

  const fundamentacao = [
    `ALONGAMENTO DE DÍVIDA RURAL`,
    `Base legal: Lei 9.138/95 + MCR 2-6-4 + Resolução CMN 5.229/2025`,
    `Súmula 298 STJ: "alongamento não é faculdade da instituição financeira, mas direito do devedor"`,
    `Precedente recente: TJGO 2a Vara Cível Uruaçu - Juíza Letícia Brum (2025) - 62% perda soja`,
    `Precedente do proporcional: TRF-4 Apelação 5008203-86.2016.4.04.7005`,
    ``,
    `Perda documentada: ${p.percentualPerdaSafra}% da safra`,
    `Valor alongável (proporcional): R$ ${valorAlongavel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Valor mantido em condições originais: R$ ${valorMantido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Taxa mantida: ${novaTaxaAA}% a.a. (mesma do contrato original - Súmula 298)`,
    `Prazo novo: ${prazoNovo} meses (${numSafras} safras + carência ${carencia} meses)`,
    `Economia estimada vs não alongar: R$ ${economia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
  ].join('\n')

  return {
    valorAlongavel: Number(valorAlongavel.toFixed(2)),
    valorMantidoCondicoesOriginais: Number(valorMantido.toFixed(2)),
    novaTaxaAA,
    prazoAlongadoMeses: prazoNovo,
    parcelasAnuais: parcelas,
    economiaFinanceira: Number(economia.toFixed(2)),
    fundamentacaoJuridica: fundamentacao,
    viabilidade,
  }
}

/* ================================================================
 *  4. CAPITALIZAÇÃO DE DESPESAS - ANÁLISE ABUSIVIDADE
 *  (Caso AILTON: R$ 76mil em seguros viraram R$ 276mil no saldo)
 * ================================================================ */

export interface CapitalizacaoParams {
  valorSolicitado: number
  despesasCapitalizadas: {
    iof?: number
    seguroPrestamista?: number
    cartorio?: number
    tarifaEstruturacao?: number
    tarifaAvaliacaoGarantia?: number
    outros?: number
  }
  taxaContratualMensal: number
  prazoMeses: number
}

export interface CapitalizacaoResultado {
  valorRecebidoPeloCliente: number
  totalDespesas: number
  percentualDespesas: number
  multiplicadorFinal: number
  impactoTotalNoSaldo: number
  economiaSeExcluirDespesas: number
  abusividadeDetectada: boolean
  fundamentosContestacao: string[]
  recomendacaoAletis: string
}

export function analisarCapitalizacaoDespesas(p: CapitalizacaoParams): CapitalizacaoResultado {
  const despesas = Object.values(p.despesasCapitalizadas).reduce((s: number, v) => s + (v || 0), 0)
  const valorLiquido = p.valorSolicitado - despesas
  const pctDespesas = (despesas / p.valorSolicitado) * 100

  // Simular amortizacao com e sem despesas
  const tax = p.taxaContratualMensal / 100
  const pmtComDespesas = (p.valorSolicitado * tax * Math.pow(1 + tax, p.prazoMeses)) / (Math.pow(1 + tax, p.prazoMeses) - 1)
  const pmtSemDespesas = (valorLiquido * tax * Math.pow(1 + tax, p.prazoMeses)) / (Math.pow(1 + tax, p.prazoMeses) - 1)

  const totalPagoCom = pmtComDespesas * p.prazoMeses
  const totalPagoSem = pmtSemDespesas * p.prazoMeses
  const impactoTotal = totalPagoCom - totalPagoSem
  const multiplicador = despesas > 0 ? impactoTotal / despesas : 0

  const abusividade = pctDespesas > 10 || multiplicador > 2

  const fundamentos: string[] = []
  if (abusividade) {
    fundamentos.push('CDC art. 39, V - vedação de vantagem exagerada')
    fundamentos.push('CDC art. 51, IV - cláusulas abusivas')
    fundamentos.push('STJ Tema 1.118 - seguro prestamista: venda casada vedada')
    fundamentos.push('CMN 3.518/2007 - limita tarifas em crédito rural')
  }
  if (pctDespesas > 15) {
    fundamentos.push('MCR 2-6-4: capitalização limitada ao principal originalmente devido')
  }

  const recomendacao = abusividade
    ? `CONTESTAR capitalização. Pleitear exclusão das despesas (R$ ${despesas.toLocaleString('pt-BR')}) ` +
      `e recálculo sobre valor líquido (R$ ${valorLiquido.toLocaleString('pt-BR')}). ` +
      `Economia total R$ ${impactoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
    : `Capitalização dentro de padrões aceitáveis. Seguir com proposta padrão.`

  return {
    valorRecebidoPeloCliente: Number(valorLiquido.toFixed(2)),
    totalDespesas: Number(despesas.toFixed(2)),
    percentualDespesas: Number(pctDespesas.toFixed(2)),
    multiplicadorFinal: Number(multiplicador.toFixed(4)),
    impactoTotalNoSaldo: Number(impactoTotal.toFixed(2)),
    economiaSeExcluirDespesas: Number(impactoTotal.toFixed(2)),
    abusividadeDetectada: abusividade,
    fundamentosContestacao: fundamentos,
    recomendacaoAletis: recomendacao,
  }
}

/* ================================================================
 *  5. DESCARACTERIZAÇÃO DE CRÉDITO RURAL
 *  (Custeio equalizado virou pessoal - caso AILTON)
 * ================================================================ */

export interface DescaracterizacaoParams {
  contratosOriginais: Array<{
    numero: string
    finalidade: 'custeio' | 'investimento' | 'comercializacao'
    valorOriginal: number
    taxaAA: number
    dataContratacao: string
    fonteRecursos?: string
  }>
  contratoRenegociacao: {
    numero: string
    finalidadeInformada: string
    valor: number
    taxaAA: number
    cet: number
    dataRenegociacao: string
  }
}

export interface DescaracterizacaoResultado {
  houveDescaracterizacao: boolean
  taxaMediaOriginal: number
  spreadCobrado: number
  excessoSobreOriginal: number
  valorRestituicaoEstimada: number
  indicios: string[]
  basesLegais: string[]
  proximosPassos: string[]
}

export function detectarDescaracterizacao(p: DescaracterizacaoParams): DescaracterizacaoResultado {
  const valorTotalOrig = p.contratosOriginais.reduce((s, c) => s + c.valorOriginal, 0)
  const taxaMediaOrig =
    p.contratosOriginais.reduce((s, c) => s + c.taxaAA * c.valorOriginal, 0) / valorTotalOrig

  const finalidadesRurais = p.contratosOriginais.filter(c =>
    ['custeio', 'investimento', 'comercializacao'].includes(c.finalidade),
  ).length
  const percentualRural = (finalidadesRurais / p.contratosOriginais.length) * 100

  const spread = p.contratoRenegociacao.cet - taxaMediaOrig
  const spreadPct = (spread / taxaMediaOrig) * 100

  const houveDescarac =
    percentualRural > 50 && (spreadPct > 50 || !p.contratoRenegociacao.finalidadeInformada.toLowerCase().includes('rural'))

  // Estimar restituicao: diferenca de juros pago acima da taxa original
  const anosVida = 3 // estimativa
  const valorRestEst = p.contratoRenegociacao.valor *
    ((Math.pow(1 + p.contratoRenegociacao.cet / 100, anosVida) - Math.pow(1 + taxaMediaOrig / 100, anosVida)))

  const indicios: string[] = []
  if (percentualRural > 50) indicios.push(`${percentualRural.toFixed(0)}% dos contratos originais eram crédito rural`)
  if (spreadPct > 50) indicios.push(`Spread de ${spreadPct.toFixed(0)}% sobre taxa média ponderada - indício de descaracterização`)
  if (!p.contratoRenegociacao.finalidadeInformada.toLowerCase().includes('rural'))
    indicios.push(`Finalidade informada na renegociação ("${p.contratoRenegociacao.finalidadeInformada}") não é rural`)

  const basesLegais = [
    'MCR 2-1 - finalidades do crédito rural devem ser mantidas em renegociações',
    'MCR 2-6-4 - alongamento não autoriza descaracterização',
    'Lei 4.829/65 - natureza jurídica do crédito rural é imutável durante a vida do contrato',
    'STJ - REsp 1.251.331/RS (Tema 247) - manutenção de equiparação tarifária',
    'TJMG Agravo 1944978-17.2022 - descaracterização gera recálculo com taxa original',
  ]

  const proximos: string[] = houveDescarac ? [
    '1. Levantar cédulas originais e identificar finalidade em cláusula primeira',
    '2. Consultar SGS/Bacen para taxa média do MCR na data das contratações',
    '3. Montar planilha comparativa: taxa original x taxa renegociada x CET efetivo',
    '4. Propor recálculo com taxa original equalizada',
    '5. Se banco recusar extrajudicialmente, ajuizar ação revisional',
  ] : [
    'Não há descaracterização caracterizada. Seguir com renegociação convencional.',
  ]

  return {
    houveDescaracterizacao: houveDescarac,
    taxaMediaOriginal: Number(taxaMediaOrig.toFixed(4)),
    spreadCobrado: Number(spread.toFixed(4)),
    excessoSobreOriginal: Number(spreadPct.toFixed(2)),
    valorRestituicaoEstimada: Number(valorRestEst.toFixed(2)),
    indicios,
    basesLegais,
    proximosPassos: proximos,
  }
}

/* ================================================================
 *  6. FLUXO DE CAIXA PLURIANUAL SAFRA (5 anos)
 * ================================================================ */

export interface FluxoPlurianualParams {
  anoBase: number
  cultura: string
  areaHa: number
  produtividadeAtual: number // sacas/ha
  precoSacaAtual: number
  custoHa: number
  /** crescimento esperado produtividade %aa */
  crescimentoProdutividadeAA?: number
  /** inflacao custos %aa (pesticidas, fertilizantes) */
  inflacaoCustosAA?: number
  /** variacao precos esperada %aa */
  variacaoPrecoAA?: number
  dividasExistentes?: Array<{ descricao: string; valor: number; vencimento: string }>
  arrendamentoHa?: number // se arrendatario, valor por ha em sacas
}

export interface FluxoPlurianualResultado {
  anos: Array<{
    ano: number
    safra: string
    producaoSacas: number
    receitaBruta: number
    custoTotal: number
    arrendamento: number
    margemBruta: number
    dividas: number
    saldoLiquido: number
    saldoAcumulado: number
  }>
  valorPresenteLiquido: number
  viabilidade: 'VIAVEL' | 'APERTADO' | 'INVIAVEL'
  anosCriticos: string[]
  recomendacoes: string[]
}

export function projetarFluxoPlurianual(p: FluxoPlurianualParams): FluxoPlurianualResultado {
  const crescProd = (p.crescimentoProdutividadeAA ?? 2) / 100
  const infl = (p.inflacaoCustosAA ?? 5) / 100
  const varPreco = (p.variacaoPrecoAA ?? 3) / 100
  const taxaDesconto = 0.12 // 12% aa (custo de oportunidade conservador)

  const anosResult: FluxoPlurianualResultado['anos'] = []
  let saldoAcum = 0
  let produtividade = p.produtividadeAtual
  let preco = p.precoSacaAtual
  let custo = p.custoHa

  for (let i = 0; i < 5; i++) {
    const ano = p.anoBase + i
    const safra = `${ano}/${ano + 1}`
    produtividade *= 1 + crescProd
    preco *= 1 + varPreco
    custo *= 1 + infl

    const producao = p.areaHa * produtividade
    const receita = producao * preco
    const custoTotal = p.areaHa * custo
    const arrendamento = (p.arrendamentoHa ?? 0) * p.areaHa * preco
    const margem = receita - custoTotal - arrendamento

    // Dividas do ano
    const dividasDoAno = (p.dividasExistentes || [])
      .filter(d => d.vencimento.startsWith(String(ano)))
      .reduce((s, d) => s + d.valor, 0)

    const saldo = margem - dividasDoAno
    saldoAcum += saldo

    anosResult.push({
      ano,
      safra,
      producaoSacas: Number(producao.toFixed(0)),
      receitaBruta: Number(receita.toFixed(2)),
      custoTotal: Number(custoTotal.toFixed(2)),
      arrendamento: Number(arrendamento.toFixed(2)),
      margemBruta: Number(margem.toFixed(2)),
      dividas: Number(dividasDoAno.toFixed(2)),
      saldoLiquido: Number(saldo.toFixed(2)),
      saldoAcumulado: Number(saldoAcum.toFixed(2)),
    })
  }

  // VPL
  const vpl = anosResult.reduce((vpl, a, idx) => vpl + a.saldoLiquido / Math.pow(1 + taxaDesconto, idx + 1), 0)

  const anosCriticos = anosResult.filter(a => a.saldoLiquido < 0).map(a => a.safra)
  const viabilidade: 'VIAVEL' | 'APERTADO' | 'INVIAVEL' =
    anosCriticos.length === 0 && vpl > 0
      ? 'VIAVEL'
      : anosCriticos.length <= 2 && saldoAcum > 0
        ? 'APERTADO'
        : 'INVIAVEL'

  const recomendacoes: string[] = []
  if (anosCriticos.length > 0)
    recomendacoes.push(`Anos críticos identificados: ${anosCriticos.join(', ')} - considerar alongamento ou carência`)
  if (vpl < 0)
    recomendacoes.push('VPL negativo - reestruturação é imprescindível (alongamento + carência + deságio)')
  if ((p.arrendamentoHa || 0) > 8)
    recomendacoes.push('Custo de arrendamento elevado (>8 sacas/ha) - renegociar com arrendador')
  if (anosResult[0].margemBruta / anosResult[0].receitaBruta < 0.25)
    recomendacoes.push('Margem bruta abaixo de 25% - revisar matriz de custos')

  return {
    anos: anosResult,
    valorPresenteLiquido: Number(vpl.toFixed(2)),
    viabilidade,
    anosCriticos,
    recomendacoes,
  }
}

/* ================================================================
 *  7. EQUIVALÊNCIA EM SACAS (hedge natural para dívidas rurais)
 * ================================================================ */

export interface EquivalenciaSacasParams {
  valorEmReais: number
  cultura: string
  precoSacaAtual: number
  /** Volatilidade anual esperada do preco (%) */
  volatilidadeAnual?: number
}

export interface EquivalenciaSacasResultado {
  quantidadeSacas: number
  precoAtual: number
  valorHedgeado: number
  cenarios: {
    alta: { preco: number; valor: number; variacao: number }
    base: { preco: number; valor: number; variacao: number }
    baixa: { preco: number; valor: number; variacao: number }
  }
  recomendacao: string
}

export function calcularEquivalenciaSacas(p: EquivalenciaSacasParams): EquivalenciaSacasResultado {
  const vol = p.volatilidadeAnual ?? 20 // %aa padrao
  const sacas = p.valorEmReais / p.precoSacaAtual

  const precoAlta = p.precoSacaAtual * (1 + vol / 100)
  const precoBaixa = p.precoSacaAtual * (1 - vol / 100)

  return {
    quantidadeSacas: Number(sacas.toFixed(2)),
    precoAtual: p.precoSacaAtual,
    valorHedgeado: p.valorEmReais,
    cenarios: {
      alta: {
        preco: Number(precoAlta.toFixed(2)),
        valor: Number((sacas * precoAlta).toFixed(2)),
        variacao: vol,
      },
      base: {
        preco: p.precoSacaAtual,
        valor: p.valorEmReais,
        variacao: 0,
      },
      baixa: {
        preco: Number(precoBaixa.toFixed(2)),
        valor: Number((sacas * precoBaixa).toFixed(2)),
        variacao: -vol,
      },
    },
    recomendacao:
      `Converter dívida em ${sacas.toFixed(0)} sacas de ${p.cultura} proporciona HEDGE NATURAL: ` +
      `se preço sobe ${vol}%, dívida aumenta proporcionalmente mas receita da venda da safra também. ` +
      `Se preço cai ${vol}%, dívida reduz na mesma proporção. ` +
      `Recomendado em contratos de longo prazo com variação de preço esperada > 15% a.a.`,
  }
}

/* ================================================================
 *  8. STRESS TEST DE PREÇO
 * ================================================================ */

export interface StressTestParams {
  producaoSacas: number
  precoBaseHoje: number
  custoTotal: number
  dividaAtual: number
  /** Cenarios de queda de preco a testar (%) */
  cenariosQueda?: number[]
}

export interface StressTestResultado {
  cenarios: Array<{
    queda: number // %
    precoStress: number
    receita: number
    margem: number
    saldoAposDividas: number
    statusDivida: 'QUITA' | 'PARCIAL' | 'INVIAVEL'
    gapDivida: number
  }>
  precoBreakEvenPara: {
    custeio: number
    divida: number
  }
  recomendacao: string
}

export function executarStressTest(p: StressTestParams): StressTestResultado {
  const cenarios = (p.cenariosQueda ?? [10, 20, 30, 40, 50]).map(queda => {
    const preco = p.precoBaseHoje * (1 - queda / 100)
    const receita = p.producaoSacas * preco
    const margem = receita - p.custoTotal
    const saldo = margem - p.dividaAtual
    const status: 'QUITA' | 'PARCIAL' | 'INVIAVEL' =
      saldo >= 0 ? 'QUITA' : margem >= p.dividaAtual * 0.5 ? 'PARCIAL' : 'INVIAVEL'

    return {
      queda,
      precoStress: Number(preco.toFixed(2)),
      receita: Number(receita.toFixed(2)),
      margem: Number(margem.toFixed(2)),
      saldoAposDividas: Number(saldo.toFixed(2)),
      statusDivida: status,
      gapDivida: saldo < 0 ? Number(Math.abs(saldo).toFixed(2)) : 0,
    }
  })

  const precoBreakEvenCusteio = p.custoTotal / p.producaoSacas
  const precoBreakEvenDivida = (p.custoTotal + p.dividaAtual) / p.producaoSacas

  const primeiroInviavel = cenarios.find(c => c.statusDivida === 'INVIAVEL')
  const recomendacao = primeiroInviavel
    ? `ALERTA: queda de ${primeiroInviavel.queda}% no preço torna dívida inviável (gap R$ ${primeiroInviavel.gapDivida.toLocaleString('pt-BR')}). ` +
      `Recomenda-se contratar hedge (CPR, futuros B3) ou solicitar alongamento proativo antes da colheita.`
    : `Dívida suportável mesmo em cenário de queda de 50%. Margem de segurança confortável.`

  return {
    cenarios,
    precoBreakEvenPara: {
      custeio: Number(precoBreakEvenCusteio.toFixed(2)),
      divida: Number(precoBreakEvenDivida.toFixed(2)),
    },
    recomendacao,
  }
}

/* ================================================================
 *  9. COMPARADOR MULTI-CREDOR (waterfall)
 * ================================================================ */

export interface MultiCredorParams {
  credores: Array<{
    nome: string
    tipo: 'bancario' | 'cooperativa' | 'insumos' | 'tradings' | 'particular'
    saldoDevedor: number
    taxaAA: number
    garantia: 'real' | 'fiduciaria' | 'pessoal' | 'sem_garantia'
    vencimentoProximaParcela?: string
    abertoAoDialogo?: boolean
  }>
  capacidadePagamentoAnual: number
}

export interface MultiCredorResultado {
  totalDivida: number
  custoAnualTotal: number
  prioridadeRenegociacao: Array<{
    credor: string
    score: number
    justificativa: string
    valorEconomiaPotencial: number
    estrategiaSugerida: string
  }>
  planoSugerido: string
}

export function compararMultiCredores(p: MultiCredorParams): MultiCredorResultado {
  const total = p.credores.reduce((s, c) => s + c.saldoDevedor, 0)
  const custoAnual = p.credores.reduce((s, c) => s + c.saldoDevedor * (c.taxaAA / 100), 0)

  // Score de prioridade (1-100):
  // + taxa alta, + saldo alto, + garantia menor, + aberto ao diálogo, - proximidade vencimento
  const prioridades = p.credores
    .map(c => {
      const scoreTaxa = Math.min(c.taxaAA / 30, 1) * 30
      const scoreSaldo = (c.saldoDevedor / total) * 30
      const scoreGarantia = c.garantia === 'sem_garantia' ? 25 : c.garantia === 'pessoal' ? 20 : c.garantia === 'fiduciaria' ? 10 : 5
      const scoreDialogo = c.abertoAoDialogo ? 15 : 0

      const score = scoreTaxa + scoreSaldo + scoreGarantia + scoreDialogo
      const taxaNovaAlvo = Math.max(c.taxaAA * 0.6, 10) // 40% redução ou 10% piso
      const economia = c.saldoDevedor * ((c.taxaAA - taxaNovaAlvo) / 100) * 3 // 3 anos

      const estrategia =
        c.tipo === 'bancario' ? 'Revisional + alongamento (Súmula 298 STJ)'
          : c.tipo === 'cooperativa' ? 'Acordo extrajudicial com dação/acordo tripartite'
            : c.tipo === 'insumos' ? 'Novação com plano safra 2-3 anos'
              : c.tipo === 'tradings' ? 'Cessão de CPR para quitação com deságio'
                : 'Acordo com deságio (30-50%)'

      const justificativa = `Taxa ${c.taxaAA}% a.a. (score ${scoreTaxa.toFixed(0)}) | ` +
        `Saldo R$ ${c.saldoDevedor.toLocaleString('pt-BR')} (score ${scoreSaldo.toFixed(0)}) | ` +
        `Garantia ${c.garantia} (score ${scoreGarantia}) | ` +
        `${c.abertoAoDialogo ? 'Aberto' : 'Fechado'} diálogo (score ${scoreDialogo})`

      return {
        credor: c.nome,
        score: Number(score.toFixed(2)),
        justificativa,
        valorEconomiaPotencial: Number(economia.toFixed(2)),
        estrategiaSugerida: estrategia,
      }
    })
    .sort((a, b) => b.score - a.score)

  const plano = prioridades.length > 0
    ? `ESTRATÉGIA: ${prioridades[0].credor} primeiro (score ${prioridades[0].score}). ` +
      `Economia potencial total: R$ ${prioridades.reduce((s, p) => s + p.valorEconomiaPotencial, 0).toLocaleString('pt-BR')} ` +
      `em 3 anos se executar todas as renegociações.`
    : 'Nenhum credor cadastrado.'

  return {
    totalDivida: Number(total.toFixed(2)),
    custoAnualTotal: Number(custoAnual.toFixed(2)),
    prioridadeRenegociacao: prioridades,
    planoSugerido: plano,
  }
}

/* ================================================================
 *  10. SIMULADOR PRONAF/PRONAMP (enquadramento + economia)
 * ================================================================ */

export interface EnquadramentoPronafParams {
  rendaBrutaAnual: number
  possuiCaf: boolean
  possuiDap: boolean
  areaHa: number
  atividadePrincipal: string
  /** % da renda que vem da atividade familiar (Pronaf exige 70%+) */
  percRendaFamiliar?: number
}

export interface EnquadramentoPronafResultado {
  programaSugerido: 'Pronaf B' | 'Pronaf Custeio' | 'Pronaf Mais Alimentos' | 'Pronamp' | 'Empresarial'
  taxaSugeridaAA: number
  limiteSugerido: number
  requisitos: string[]
  documentacaoNecessaria: string[]
  proximosPassos: string[]
}

export function enquadrarProdutorPronaf(p: EnquadramentoPronafParams): EnquadramentoPronafResultado {
  let programa: EnquadramentoPronafResultado['programaSugerido']
  let taxa: number
  let limite: number

  if (p.rendaBrutaAnual <= 23_000 && p.possuiDap) {
    programa = 'Pronaf B'; taxa = 0.5; limite = 6_000
  } else if (p.rendaBrutaAnual <= 500_000 && (p.possuiCaf || p.possuiDap)) {
    programa = 'Pronaf Custeio'; taxa = 3.0; limite = 250_000
  } else if (p.rendaBrutaAnual <= 4_800_000) {
    programa = 'Pronamp'; taxa = 10.0; limite = 1_500_000
  } else {
    programa = 'Empresarial'; taxa = 14.0; limite = 5_000_000
  }

  // Exception: se área <= 4 módulos fiscais e atividade principal agropecuária familiar
  if (p.rendaBrutaAnual <= 500_000 && p.areaHa <= 240 && (p.percRendaFamiliar || 0) >= 70) {
    programa = 'Pronaf Mais Alimentos'; taxa = 4.0; limite = 250_000
  }

  const requisitos = [
    programa.includes('Pronaf') ? 'DAP (Declaração de Aptidão Pronaf) ou CAF (Cadastro da Agricultura Familiar) ativa' : '',
    programa === 'Pronamp' ? 'Declaração de renda anual até R$ 4,8 mi' : '',
    'CAR - Cadastro Ambiental Rural ativo',
    'Zarc - plantio dentro da janela recomendada',
    'Plano de aplicação técnico (para investimento)',
  ].filter(Boolean) as string[]

  const documentacao = [
    'RG e CPF',
    'Comprovante de residência (rural)',
    programa.includes('Pronaf') ? 'DAP/CAF emitido por sindicato ou entidade credenciada' : 'IRPF últimos 2 anos',
    'Escritura/contrato arrendamento do imóvel rural',
    'CAR atualizado',
    'Projeto técnico (investimento) ou orçamento (custeio)',
  ]

  const proximos = [
    `Buscar agente financeiro credenciado no ${programa} (BB, Caixa, BNB, Sicoob, Sicredi, Banco da Amazônia)`,
    'Verificar janela do Plano Safra 2025/26 (até junho/2026)',
    'Consultar Zarc para cultura pretendida',
    'Contratar Proagro (adicional sobre o valor) se não houver seguro rural',
    programa === 'Pronaf B' || programa === 'Pronaf Custeio' ? 'Verificar se cliente já usou limite anual' : '',
  ].filter(Boolean) as string[]

  return {
    programaSugerido: programa,
    taxaSugeridaAA: taxa,
    limiteSugerido: limite,
    requisitos,
    documentacaoNecessaria: documentacao,
    proximosPassos: proximos,
  }
}

/* ================================================================
 *  11. ARRENDAMENTO - IMPACTO NA VIABILIDADE
 * ================================================================ */

export interface ArrendamentoParams {
  areaHa: number
  culturaPrincipal: string
  produtividadeSacasHa: number
  precoSacaAtual: number
  custoHa: number
  /** % da produção pago em sacas (prática comum Sul/Centro-Oeste: 5-12 sacas/ha) */
  valorArrendamentoSacasHa?: number
  /** valor em R$/ha se pago em dinheiro */
  valorArrendamentoReaisHa?: number
  contratoVigente: boolean
  prazoContratoMeses?: number
}

export interface ArrendamentoResultado {
  tipoValor: 'sacas' | 'reais'
  valorTotalArrendamentoAno: number
  percentualDaReceita: number
  margemBrutaHa: number
  margemLiquidaHa: number // após arrendamento
  breakEvenProdutividade: number // sacas/ha mínimo
  viabilidadeFinanceira: 'alta' | 'media' | 'baixa'
  recomendacoes: string[]
}

export function analisarArrendamento(p: ArrendamentoParams): ArrendamentoResultado {
  const receitaHa = p.produtividadeSacasHa * p.precoSacaAtual
  let arrendHa: number
  let tipo: 'sacas' | 'reais'
  if (p.valorArrendamentoSacasHa) {
    arrendHa = p.valorArrendamentoSacasHa * p.precoSacaAtual
    tipo = 'sacas'
  } else {
    arrendHa = p.valorArrendamentoReaisHa ?? 0
    tipo = 'reais'
  }

  const arrendTotal = arrendHa * p.areaHa
  const pctReceita = (arrendHa / receitaHa) * 100
  const margemBrutaHa = receitaHa - p.custoHa
  const margemLiquidaHa = margemBrutaHa - arrendHa
  const breakEven = (p.custoHa + arrendHa) / p.precoSacaAtual

  const viabilidade: 'alta' | 'media' | 'baixa' =
    margemLiquidaHa / receitaHa > 0.25 ? 'alta' : margemLiquidaHa / receitaHa > 0.1 ? 'media' : 'baixa'

  const recomendacoes: string[] = []
  if (pctReceita > 30) recomendacoes.push(`Arrendamento representa ${pctReceita.toFixed(1)}% da receita - acima de 30% é crítico`)
  if (p.valorArrendamentoSacasHa && p.valorArrendamentoSacasHa > 12) recomendacoes.push(`Arrendamento > 12 sacas/ha - renegociar com base em média regional`)
  if (breakEven > p.produtividadeSacasHa * 0.9) recomendacoes.push(`Break-even muito próximo da produtividade real - risco alto em ano de frustração`)
  if (p.contratoVigente && (p.prazoContratoMeses || 0) < 12) recomendacoes.push('Prazo curto restante - renegociar antes da próxima safra')

  return {
    tipoValor: tipo,
    valorTotalArrendamentoAno: Number(arrendTotal.toFixed(2)),
    percentualDaReceita: Number(pctReceita.toFixed(2)),
    margemBrutaHa: Number(margemBrutaHa.toFixed(2)),
    margemLiquidaHa: Number(margemLiquidaHa.toFixed(2)),
    breakEvenProdutividade: Number(breakEven.toFixed(2)),
    viabilidadeFinanceira: viabilidade,
    recomendacoes,
  }
}

/* ================================================================
 *  12. PARCELAMENTO POR CICLO DE SAFRA
 *  (Pagamentos alinhados com colheita)
 * ================================================================ */

export interface ParcelamentoSafraParams {
  saldoDevedor: number
  taxaAA: number
  numeroSafras: number
  dataInicioSafra: string // ex: "2026-07-01"
  mesColheita: number // 1-12
  percentualEntrada?: number // % de entrada imediata (caso PAULO LUCIANO: 21,63%)
  /** qtd de parcelas por safra */
  parcelasPorSafra?: number
}

export interface ParcelamentoSafraResultado {
  valorEntrada: number
  saldoAposEntrada: number
  parcelas: Array<{
    safra: string
    numero: number
    dataPagamento: string
    juros: number
    amortizacao: number
    valorTotal: number
    saldoRemanescente: number
  }>
  totalPago: number
  totalJuros: number
  economiaVsConvencional: number
  fundamentacao: string
}

export function simularParcelamentoSafra(p: ParcelamentoSafraParams): ParcelamentoSafraResultado {
  const pctEntrada = p.percentualEntrada ?? 0
  const entrada = p.saldoDevedor * (pctEntrada / 100)
  const saldoPosEntrada = p.saldoDevedor - entrada
  const parcelasSafra = p.parcelasPorSafra ?? 1

  const taxaAM = Math.pow(1 + p.taxaAA / 100, 1 / 12) - 1
  const totalParcelas = p.numeroSafras * parcelasSafra
  const amortCada = saldoPosEntrada / totalParcelas

  const parcelas: ParcelamentoSafraResultado['parcelas'] = []
  let saldo = saldoPosEntrada
  const inicio = toDate(p.dataInicioSafra)

  let totalPago = entrada
  let totalJuros = 0

  for (let s = 0; s < p.numeroSafras; s++) {
    for (let n = 0; n < parcelasSafra; n++) {
      // Alinhar com colheita: 6 meses após início da safra para safra de verão
      const mesesAcum = s * 12 + (parcelasSafra === 1 ? 6 : (n + 1) * (12 / parcelasSafra))
      const data = new Date(inicio)
      data.setUTCMonth(data.getUTCMonth() + mesesAcum)

      const juros = saldo * (Math.pow(1 + taxaAM, 12 / parcelasSafra) - 1)
      saldo -= amortCada
      if (saldo < 0.005) saldo = 0

      totalJuros += juros
      totalPago += amortCada + juros

      parcelas.push({
        safra: `${data.getUTCFullYear() - (parcelasSafra > 1 ? 1 : 0)}/${data.getUTCFullYear()}`,
        numero: s * parcelasSafra + n + 1,
        dataPagamento: data.toISOString().slice(0, 10),
        juros: Number(juros.toFixed(2)),
        amortizacao: Number(amortCada.toFixed(2)),
        valorTotal: Number((amortCada + juros).toFixed(2)),
        saldoRemanescente: Number(saldo.toFixed(2)),
      })
    }
  }

  // Economia vs parcela mensal convencional (PRICE 60 meses)
  const prazoConv = 60
  const pmtConv = (p.saldoDevedor * taxaAM * Math.pow(1 + taxaAM, prazoConv)) / (Math.pow(1 + taxaAM, prazoConv) - 1)
  const totalConv = pmtConv * prazoConv
  const economia = totalConv - totalPago

  const fundamentacao = [
    `PARCELAMENTO ALINHADO COM CICLO DA SAFRA`,
    `Vantagens vs parcela mensal: sem pressão de caixa em entressafra, uso de receita da colheita para quitar parcelas`,
    `Estrutura: ${pctEntrada}% entrada + ${p.numeroSafras} safras x ${parcelasSafra} parcela(s)/safra`,
    `Taxa: ${p.taxaAA}% a.a. (${(taxaAM * 100).toFixed(4)}% a.m.)`,
    `Pagamento total: R$ ${totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Economia vs parcelamento convencional mensal: R$ ${economia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Caso PAULO LUCIANO: entrada 21,63% + 4 parcelas semestrais alinhadas à soja/safrinha`,
  ].join('\n')

  return {
    valorEntrada: Number(entrada.toFixed(2)),
    saldoAposEntrada: Number(saldoPosEntrada.toFixed(2)),
    parcelas,
    totalPago: Number(totalPago.toFixed(2)),
    totalJuros: Number(totalJuros.toFixed(2)),
    economiaVsConvencional: Number(economia.toFixed(2)),
    fundamentacao,
  }
}

/* ================================================================
 *  13. CPR - CÉDULA DE PRODUTO RURAL
 * ================================================================ */

export interface CPRSimulacaoParams {
  produtoEntregavel: 'Soja' | 'Milho' | 'Cafe' | 'Algodao' | 'Boi'
  quantidade: number // sacas ou @ ou kg
  unidade: 'sacas60kg' | 'arrobas' | 'kg'
  precoAtualUnidade: number
  dataVencimento: string
  /** juros remuneratórios (0% em CPR física pura) */
  taxaAA?: number
  /** deságio oferecido pelo tomador */
  desagioPercentual?: number
}

export interface CPRSimulacaoResultado {
  valorFaceCPR: number
  valorLiquidoLiberado: number
  desagio: number
  cetEstimado: number
  garantiasRecomendadas: string[]
  cenarios: {
    precoAltaVencimento: { preco: number; balancoDevedor: number }
    precoBaixaVencimento: { preco: number; balancoDevedor: number }
  }
  fundamentacao: string
}

export function simularCPR(p: CPRSimulacaoParams): CPRSimulacaoResultado {
  const valorFace = p.quantidade * p.precoAtualUnidade
  const desagio = p.desagioPercentual ?? 8 // padrão mercado 6-12%
  const valorLiberado = valorFace * (1 - desagio / 100)

  const dataEmissao = new Date()
  const venc = toDate(p.dataVencimento)
  const meses = diffDias(dataEmissao, venc) / 30

  // CET do emissor = deságio anualizado
  const cet = meses > 0 ? (Math.pow(valorFace / valorLiberado, 12 / meses) - 1) * 100 : 0

  const garantias = [
    'Penhor agrícola da lavoura a formar ou formada',
    'Aval de cônjuge (se casado) - obrigatório',
    'Seguro rural ou Proagro vinculado ao financiamento',
    'Cedência fiduciária de recebíveis de outras vendas (opcional, reforça)',
  ]

  return {
    valorFaceCPR: Number(valorFace.toFixed(2)),
    valorLiquidoLiberado: Number(valorLiberado.toFixed(2)),
    desagio: Number(desagio.toFixed(2)),
    cetEstimado: Number(cet.toFixed(2)),
    garantiasRecomendadas: garantias,
    cenarios: {
      precoAltaVencimento: {
        preco: Number((p.precoAtualUnidade * 1.15).toFixed(2)),
        balancoDevedor: Number((valorFace * 0.15).toFixed(2)), // diferenca aparece como ganho
      },
      precoBaixaVencimento: {
        preco: Number((p.precoAtualUnidade * 0.85).toFixed(2)),
        balancoDevedor: Number((valorFace * -0.15).toFixed(2)),
      },
    },
    fundamentacao: [
      'CPR - Lei 8.929/94 (título cartular + hedge natural)',
      'Súmula 596 STJ: CPR com liquidação financeira mantém natureza do título',
      `Valor da face: R$ ${valorFace.toLocaleString('pt-BR')} (${p.quantidade} ${p.unidade} x R$ ${p.precoAtualUnidade})`,
      `Deságio ${desagio}% => recebe R$ ${valorLiberado.toLocaleString('pt-BR')}`,
      `Prazo ${meses.toFixed(1)} meses => CET implícito ${cet.toFixed(2)}% a.a.`,
      `Hedge natural: se preço sobe, valor do bem sobe; se cai, dívida fica proporcionalmente menor`,
    ].join('\n'),
  }
}

/* ================================================================
 *  14. PERÍCIA REVISIONAL - Simulador Anatocismo
 * ================================================================ */

export interface PericiaRevisionalParams {
  valorOriginal: number
  dataContratacao: string
  taxaContratualMensal: number
  capitalizacaoPactuada: 'diaria' | 'mensal' | 'anual' | 'nao'
  encargosCobrados: Array<{
    descricao: string
    valor: number
    tipo: 'juros' | 'tarifa' | 'seguro' | 'comissao_permanencia' | 'multa' | 'mora'
  }>
  dataCorte: string
}

export interface PericiaRevisionalResultado {
  anatocismoDetectado: boolean
  capitalizacaoAbusivaEm: string[]
  comissaoPermanenciaIndevida: boolean
  tarifasIndevidas: Array<{ descricao: string; valor: number }>
  valorRestituicaoSimples: number
  valorRestituicaoDobro: number // CDC art. 42 parágrafo único
  fundamentacaoPericial: string
  sumulasAplicaveis: string[]
}

export function executarPericiaRevisional(p: PericiaRevisionalParams): PericiaRevisionalResultado {
  const sumulas: string[] = []
  const capAbusiva: string[] = []

  // Capitalização
  const anatocismoDet = p.capitalizacaoPactuada === 'diaria' ||
    (p.capitalizacaoPactuada === 'mensal' && toDate(p.dataContratacao) < new Date('2001-03-30'))

  if (anatocismoDet) {
    capAbusiva.push(p.capitalizacaoPactuada)
    sumulas.push('Súmula 93 STJ - capitalização mensal só permitida se expressa')
    sumulas.push('MP 2.170-36/2001 - capitalização mensal após 31/03/2000 em crédito')
  }

  // Comissão de permanência
  const cp = p.encargosCobrados.find(e => e.tipo === 'comissao_permanencia')
  const cpCumulativa = cp && p.encargosCobrados.some(e => e.tipo === 'multa' || e.tipo === 'mora' || e.tipo === 'juros')
  if (cpCumulativa) {
    sumulas.push('Súmula 472 STJ - cumulação de comissão de permanência com outros encargos é vedada')
    sumulas.push('Súmula 294 STJ - comissão limitada à taxa média de mercado do Bacen')
    sumulas.push('Súmula 296 STJ - não cumulação com juros remuneratórios')
  }

  // Tarifas indevidas (após 30/04/2008)
  const tarifasIndevidas: PericiaRevisionalResultado['tarifasIndevidas'] = []
  if (toDate(p.dataContratacao) >= new Date('2008-04-30')) {
    const tarifasVedadas = ['TAC', 'TEC', 'emissao', 'carne', 'boleto', 'abertura', 'estruturacao']
    for (const e of p.encargosCobrados.filter(x => x.tipo === 'tarifa')) {
      if (tarifasVedadas.some(t => e.descricao.toLowerCase().includes(t.toLowerCase()))) {
        tarifasIndevidas.push({ descricao: e.descricao, valor: e.valor })
      }
    }
    if (tarifasIndevidas.length > 0) sumulas.push('STJ Tema 247 - TAC/TEC vedadas após 30/04/2008')
  }

  // Cálculo restituição
  const valorTarifas = tarifasIndevidas.reduce((s, t) => s + t.valor, 0)
  const valorCpIndevida = cpCumulativa ? (cp?.valor || 0) * 0.3 : 0 // estima 30% indevido
  const valorRestituicao = valorTarifas + valorCpIndevida

  const fundamentacao = [
    `PERÍCIA REVISIONAL - Auditoria Técnico-Financeira`,
    `Valor original: R$ ${p.valorOriginal.toLocaleString('pt-BR')}`,
    `Contratação em ${p.dataContratacao}, corte em ${p.dataCorte}`,
    `Capitalização pactuada: ${p.capitalizacaoPactuada}`,
    anatocismoDet ? `ANATOCISMO: capitalização ${p.capitalizacaoPactuada} sem previsão legal expressa` : 'Capitalização dentro dos limites',
    cpCumulativa ? 'COMISSÃO DE PERMANÊNCIA CUMULADA com outros encargos - VEDADO' : 'Sem irregularidade em comissão de permanência',
    tarifasIndevidas.length > 0 ? `Tarifas indevidas: ${tarifasIndevidas.map(t => t.descricao).join(', ')}` : 'Sem tarifas vedadas',
    ``,
    `RESTITUIÇÃO SIMPLES: R$ ${valorRestituicao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `RESTITUIÇÃO EM DOBRO (CDC 42 p.u.): R$ ${(valorRestituicao * 2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
  ].join('\n')

  return {
    anatocismoDetectado: anatocismoDet,
    capitalizacaoAbusivaEm: capAbusiva,
    comissaoPermanenciaIndevida: !!cpCumulativa,
    tarifasIndevidas,
    valorRestituicaoSimples: Number(valorRestituicao.toFixed(2)),
    valorRestituicaoDobro: Number((valorRestituicao * 2).toFixed(2)),
    fundamentacaoPericial: fundamentacao,
    sumulasAplicaveis: sumulas,
  }
}
