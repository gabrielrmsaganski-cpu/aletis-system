/**
 * ALETIS - Calculadoras Premium
 *
 * Motor matematico completo inspirado nas propostas reais:
 *  - PAULO LUCIANO x FERTIFLORA (recalculo CCB + plano pagamento semestral)
 *  - AILTON x SICOOB (descaracterizacao + dacao em pagamento + acordo tripartite)
 *
 * Todas as calculadoras produzem MEMORIA DE CALCULO auditavel e TEXTO DE FUNDAMENTACAO
 * pronto para inclusao em propostas de renegociacao.
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
 *  1. MEMORIA DE CALCULO COMPLETA
 *  (Auditavel, demonstra juros mes a mes, pagamentos e saldo final)
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

  // 3. Fundamentacao textual
  const fundamentacao = [
    `MEMORIA DE CALCULO - Art. 320 e 322 CC, Decreto-Lei 167/67 (cedulas rurais).`,
    `Valor contratado: R$ ${p.valorOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    despesas > 0
      ? `Despesas capitalizadas (IOF R$ ${(p.iofTotal || 0).toLocaleString('pt-BR')} + seguro R$ ${(p.seguroPrestamista || 0).toLocaleString('pt-BR')} + tarifas R$ ${(p.tarifasDiversas || 0).toLocaleString('pt-BR')}): R$ ${despesas.toLocaleString('pt-BR')}`
      : `Sem despesas capitalizadas informadas.`,
    `Valor liquido recebido: R$ ${valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Taxa contratual nominal: ${p.taxaNominalMensal.toFixed(4)}% a.m. (${taxaNominalAnual.toFixed(2)}% a.a.)`,
    `CET efetivo (TIR sobre fluxos reais): ${cet.mensal.toFixed(4)}% a.m. (${cet.anual.toFixed(2)}% a.a.)`,
    `Spread efetiva vs nominal: ${(cet.anual - taxaNominalAnual).toFixed(2)} p.p. a.a.`,
    multiplicador > 2
      ? `ALERTA: despesas capitalizadas multiplicam a divida em ${multiplicador.toFixed(2)}x - indicio de abusividade (cfr. caso AILTON 3,4x).`
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
 *  2. DACAO EM PAGAMENTO
 *  (Extincao de divida via entrega de bem imovel/movel)
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
  const custosPct = p.custosTransacaoPct ?? 4 // 2% ITBI + 2% cartorio (media)

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
    ? `DACAO QUITA INTEGRALMENTE a divida. Sobra R$ ${(valorLiquido - p.saldoDevedor).toLocaleString('pt-BR')} em favor do devedor.`
    : `DACAO COBRE ${((valorLiquido / p.saldoDevedor) * 100).toFixed(1)}% da divida. Remanescente R$ ${saldoRemanescente.toLocaleString('pt-BR')} a ser ` +
      `parcelado em condicoes convencionais (sugerido: 24-48 meses, carencia 12 meses).`

  const fundamentacao = [
    `DACAO EM PAGAMENTO - Arts. 356 a 359 do Codigo Civil (extincao obrigacional).`,
    `Precedente: STJ REsp 1.429.461/RJ (Min. Paulo de Tarso Sanseverino).`,
    `Saldo devedor: R$ ${p.saldoDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Total bens ofertados: R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${p.bensOferecidos.length} bem/bens)`,
    `Desagio pactuado: ${desagio}% => R$ ${valorPosDesagio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Custos transacao (${custosPct}%): R$ ${custosTrans.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Valor liquido ao credor: R$ ${valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Cobertura da divida: ${((valorLiquido / p.saldoDevedor) * 100).toFixed(1)}%`,
    suficiente ? 'DACAO SUFICIENTE - quitacao integral' : `Remanescente R$ ${saldoRemanescente.toLocaleString('pt-BR')}`,
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
 *  3. ALONGAMENTO - SUMULA 298 STJ + MCR 2-6-4
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
    `ALONGAMENTO DE DIVIDA RURAL`,
    `Base legal: Lei 9.138/95 + MCR 2-6-4 + Resolucao CMN 5.229/2025`,
    `Sumula 298 STJ: "alongamento nao e faculdade da instituicao financeira, mas direito do devedor"`,
    `Precedente recente: TJGO 2a Vara Civel Uruacu - Juiza Leticia Brum (2025) - 62% perda soja`,
    `Precedente do proporcional: TRF-4 Apelacao 5008203-86.2016.4.04.7005`,
    ``,
    `Perda documentada: ${p.percentualPerdaSafra}% da safra`,
    `Valor alongavel (proporcional): R$ ${valorAlongavel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Valor mantido em condicoes originais: R$ ${valorMantido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Taxa mantida: ${novaTaxaAA}% a.a. (mesma do contrato original - Sumula 298)`,
    `Prazo novo: ${prazoNovo} meses (${numSafras} safras + carencia ${carencia} meses)`,
    `Economia estimada vs nao alongar: R$ ${economia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
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
 *  4. CAPITALIZACAO DE DESPESAS - ANALISE ABUSIVIDADE
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
    fundamentos.push('CDC art. 39, V - vedacao de vantagem exagerada')
    fundamentos.push('CDC art. 51, IV - clausulas abusivas')
    fundamentos.push('STJ Tema 1.118 - seguro prestamista: venda casada vedada')
    fundamentos.push('CMN 3.518/2007 - limita tarifas em credito rural')
  }
  if (pctDespesas > 15) {
    fundamentos.push('MCR 2-6-4: capitalizacao limitada ao principal originalmente devido')
  }

  const recomendacao = abusividade
    ? `CONTESTAR capitalizacao. Pleitear exclusao das despesas (R$ ${despesas.toLocaleString('pt-BR')}) ` +
      `e recalculo sobre valor liquido (R$ ${valorLiquido.toLocaleString('pt-BR')}). ` +
      `Economia total R$ ${impactoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
    : `Capitalizacao dentro de padroes aceitaveis. Seguir com proposta padrao.`

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
 *  5. DESCARACTERIZACAO DE CREDITO RURAL
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
  if (percentualRural > 50) indicios.push(`${percentualRural.toFixed(0)}% dos contratos originais eram credito rural`)
  if (spreadPct > 50) indicios.push(`Spread de ${spreadPct.toFixed(0)}% sobre taxa media ponderada - indicio de descaracterizacao`)
  if (!p.contratoRenegociacao.finalidadeInformada.toLowerCase().includes('rural'))
    indicios.push(`Finalidade informada na renegociacao ("${p.contratoRenegociacao.finalidadeInformada}") nao e rural`)

  const basesLegais = [
    'MCR 2-1 - finalidades do credito rural devem ser mantidas em renegociacoes',
    'MCR 2-6-4 - alongamento nao autoriza descaracterizacao',
    'Lei 4.829/65 - natureza juridica do credito rural e imutavel durante a vida do contrato',
    'STJ - REsp 1.251.331/RS (Tema 247) - manutencao de equiparacao tarifaria',
    'TJMG Agravo 1944978-17.2022 - descaracterizacao gera recalculo com taxa original',
  ]

  const proximos: string[] = houveDescarac ? [
    '1. Levantar cedulas originais e identificar finalidade em clausula primeira',
    '2. Consultar SGS/Bacen para taxa media do MCR na data das contratacoes',
    '3. Montar planilha comparativa: taxa original x taxa renegociada x CET efetivo',
    '4. Propor recalculo com taxa original equalizada',
    '5. Se banco recusar extrajudicialmente, ajuizar acao revisional',
  ] : [
    'Nao ha descaracterizacao caracterizada. Seguir com renegociacao convencional.',
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
    recomendacoes.push(`Anos criticos identificados: ${anosCriticos.join(', ')} - considerar alongamento ou carencia`)
  if (vpl < 0)
    recomendacoes.push('VPL negativo - reestruturacao e imprescindivel (alongamento + carencia + desagio)')
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
 *  7. EQUIVALENCIA EM SACAS (hedge natural para dividas rurais)
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
      `Converter divida em ${sacas.toFixed(0)} sacas de ${p.cultura} proporciona HEDGE NATURAL: ` +
      `se preco sobe ${vol}%, divida aumenta proporcionalmente mas receita da venda da safra tambem. ` +
      `Se preco cai ${vol}%, divida reduz na mesma proporcao. ` +
      `Recomendado em contratos de longo prazo com variacao de preco esperada > 15% a.a.`,
  }
}

/* ================================================================
 *  8. STRESS TEST DE PRECO
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
    ? `ALERTA: queda de ${primeiroInviavel.queda}% no preco torna divida inviavel (gap R$ ${primeiroInviavel.gapDivida.toLocaleString('pt-BR')}). ` +
      `Recomenda-se contratar hedge (CPR, futuros B3) ou solicitar alongamento proativo antes da colheita.`
    : `Divida suportavel mesmo em cenario de queda de 50%. Margem de seguranca confortavel.`

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
  // + taxa alta, + saldo alto, + garantia menor, + aberto ao dialogo, - proximidade vencimento
  const prioridades = p.credores
    .map(c => {
      const scoreTaxa = Math.min(c.taxaAA / 30, 1) * 30
      const scoreSaldo = (c.saldoDevedor / total) * 30
      const scoreGarantia = c.garantia === 'sem_garantia' ? 25 : c.garantia === 'pessoal' ? 20 : c.garantia === 'fiduciaria' ? 10 : 5
      const scoreDialogo = c.abertoAoDialogo ? 15 : 0

      const score = scoreTaxa + scoreSaldo + scoreGarantia + scoreDialogo
      const taxaNovaAlvo = Math.max(c.taxaAA * 0.6, 10) // 40% reducao ou 10% piso
      const economia = c.saldoDevedor * ((c.taxaAA - taxaNovaAlvo) / 100) * 3 // 3 anos

      const estrategia =
        c.tipo === 'bancario' ? 'Revisional + alongamento (Sumula 298 STJ)'
          : c.tipo === 'cooperativa' ? 'Acordo extrajudicial com dacao/acordo tripartite'
            : c.tipo === 'insumos' ? 'Novacao com plano safra 2-3 anos'
              : c.tipo === 'tradings' ? 'Cessao de CPR para quitacao com desagio'
                : 'Acordo com desagio (30-50%)'

      const justificativa = `Taxa ${c.taxaAA}% a.a. (score ${scoreTaxa.toFixed(0)}) | ` +
        `Saldo R$ ${c.saldoDevedor.toLocaleString('pt-BR')} (score ${scoreSaldo.toFixed(0)}) | ` +
        `Garantia ${c.garantia} (score ${scoreGarantia}) | ` +
        `${c.abertoAoDialogo ? 'Aberto' : 'Fechado'} dialogo (score ${scoreDialogo})`

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
    ? `ESTRATEGIA: ${prioridades[0].credor} primeiro (score ${prioridades[0].score}). ` +
      `Economia potencial total: R$ ${prioridades.reduce((s, p) => s + p.valorEconomiaPotencial, 0).toLocaleString('pt-BR')} ` +
      `em 3 anos se executar todas as renegociacoes.`
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

  // Exception: se area <= 4 modulos fiscais e atividade principal agropecuaria familiar
  if (p.rendaBrutaAnual <= 500_000 && p.areaHa <= 240 && (p.percRendaFamiliar || 0) >= 70) {
    programa = 'Pronaf Mais Alimentos'; taxa = 4.0; limite = 250_000
  }

  const requisitos = [
    programa.includes('Pronaf') ? 'DAP (Declaracao de Aptidao Pronaf) ou CAF (Cadastro da Agricultura Familiar) ativa' : '',
    programa === 'Pronamp' ? 'Declaracao de renda anual ate R$ 4,8 mi' : '',
    'CAR - Cadastro Ambiental Rural ativo',
    'Zarc - plantio dentro da janela recomendada',
    'Plano de aplicacao tecnico (para investimento)',
  ].filter(Boolean) as string[]

  const documentacao = [
    'RG e CPF',
    'Comprovante de residencia (rural)',
    programa.includes('Pronaf') ? 'DAP/CAF emitido por sindicato ou entidade credenciada' : 'IRPF ultimos 2 anos',
    'Escritura/contrato arrendamento do imovel rural',
    'CAR atualizado',
    'Projeto tecnico (investimento) ou orcamento (custeio)',
  ]

  const proximos = [
    `Buscar agente financeiro credenciado no ${programa} (BB, Caixa, BNB, Sicoob, Sicredi, Banco da Amazonia)`,
    'Verificar janela do Plano Safra 2025/26 (ate junho/2026)',
    'Consultar Zarc para cultura pretendida',
    'Contratar Proagro (adicional sobre o valor) se nao houver seguro rural',
    programa === 'Pronaf B' || programa === 'Pronaf Custeio' ? 'Verificar se cliente ja usou limite anual' : '',
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
  /** % da producao pago em sacas (pratica comum Sul/Centro-Oeste: 5-12 sacas/ha) */
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
  margemLiquidaHa: number // apos arrendamento
  breakEvenProdutividade: number // sacas/ha minimo
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
  if (pctReceita > 30) recomendacoes.push(`Arrendamento representa ${pctReceita.toFixed(1)}% da receita - acima de 30% e critico`)
  if (p.valorArrendamentoSacasHa && p.valorArrendamentoSacasHa > 12) recomendacoes.push(`Arrendamento > 12 sacas/ha - renegociar com base em media regional`)
  if (breakEven > p.produtividadeSacasHa * 0.9) recomendacoes.push(`Break-even muito proximo da produtividade real - risco alto em ano de frustacao`)
  if (p.contratoVigente && (p.prazoContratoMeses || 0) < 12) recomendacoes.push('Prazo curto restante - renegociar antes da proxima safra')

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
      // Alinhar com colheita: 6 meses apos inicio da safra para safra de verao
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
    `Vantagens vs parcela mensal: sem pressao de caixa em entressafra, uso de receita da colheita para quitar parcelas`,
    `Estrutura: ${pctEntrada}% entrada + ${p.numeroSafras} safras x ${parcelasSafra} parcela(s)/safra`,
    `Taxa: ${p.taxaAA}% a.a. (${(taxaAM * 100).toFixed(4)}% a.m.)`,
    `Pagamento total: R$ ${totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Economia vs parcelamento convencional mensal: R$ ${economia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Caso PAULO LUCIANO: entrada 21,63% + 4 parcelas semestrais alinhadas a soja/safrinha`,
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
 *  13. CPR - CEDULA DE PRODUTO RURAL
 * ================================================================ */

export interface CPRSimulacaoParams {
  produtoEntregavel: 'Soja' | 'Milho' | 'Cafe' | 'Algodao' | 'Boi'
  quantidade: number // sacas ou @ ou kg
  unidade: 'sacas60kg' | 'arrobas' | 'kg'
  precoAtualUnidade: number
  dataVencimento: string
  /** juros remuneratorios (0% em CPR fisica pura) */
  taxaAA?: number
  /** desagio oferecido pelo tomador */
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
  const desagio = p.desagioPercentual ?? 8 // padrao mercado 6-12%
  const valorLiberado = valorFace * (1 - desagio / 100)

  const dataEmissao = new Date()
  const venc = toDate(p.dataVencimento)
  const meses = diffDias(dataEmissao, venc) / 30

  // CET do emissor = desagio anualizado
  const cet = meses > 0 ? (Math.pow(valorFace / valorLiberado, 12 / meses) - 1) * 100 : 0

  const garantias = [
    'Penhor agricola da lavoura a formar ou formada',
    'Aval de conjuge (se casado) - obrigatorio',
    'Seguro rural ou Proagro vinculado ao financiamento',
    'Cedencia fiduciaria de recebiveis de outras vendas (opcional, reforca)',
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
      'CPR - Lei 8.929/94 (titulo cartular + hedge natural)',
      'Sumula 596 STJ: CPR com liquidacao financeira mantem natureza do titulo',
      `Valor da face: R$ ${valorFace.toLocaleString('pt-BR')} (${p.quantidade} ${p.unidade} x R$ ${p.precoAtualUnidade})`,
      `Desagio ${desagio}% => recebe R$ ${valorLiberado.toLocaleString('pt-BR')}`,
      `Prazo ${meses.toFixed(1)} meses => CET implicito ${cet.toFixed(2)}% a.a.`,
      `Hedge natural: se preco sobe, valor do bem sobe; se cai, divida fica proporcionalmente menor`,
    ].join('\n'),
  }
}

/* ================================================================
 *  14. PERICIA REVISIONAL - Simulador Anatocismo
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
  valorRestituicaoDobro: number // CDC art. 42 paragrafo unico
  fundamentacaoPericial: string
  sumulasAplicaveis: string[]
}

export function executarPericiaRevisional(p: PericiaRevisionalParams): PericiaRevisionalResultado {
  const sumulas: string[] = []
  const capAbusiva: string[] = []

  // Capitalizacao
  const anatocismoDet = p.capitalizacaoPactuada === 'diaria' ||
    (p.capitalizacaoPactuada === 'mensal' && toDate(p.dataContratacao) < new Date('2001-03-30'))

  if (anatocismoDet) {
    capAbusiva.push(p.capitalizacaoPactuada)
    sumulas.push('Sumula 93 STJ - capitalizacao mensal so permitida se expressa')
    sumulas.push('MP 2.170-36/2001 - capitalizacao mensal apos 31/03/2000 em credito')
  }

  // Comissao de permanencia
  const cp = p.encargosCobrados.find(e => e.tipo === 'comissao_permanencia')
  const cpCumulativa = cp && p.encargosCobrados.some(e => e.tipo === 'multa' || e.tipo === 'mora' || e.tipo === 'juros')
  if (cpCumulativa) {
    sumulas.push('Sumula 472 STJ - cumulacao de comissao de permanencia com outros encargos e vedada')
    sumulas.push('Sumula 294 STJ - comissao limitada a taxa media de mercado do Bacen')
    sumulas.push('Sumula 296 STJ - nao cumulacao com juros remuneratorios')
  }

  // Tarifas indevidas (apos 30/04/2008)
  const tarifasIndevidas: PericiaRevisionalResultado['tarifasIndevidas'] = []
  if (toDate(p.dataContratacao) >= new Date('2008-04-30')) {
    const tarifasVedadas = ['TAC', 'TEC', 'emissao', 'carne', 'boleto', 'abertura', 'estruturacao']
    for (const e of p.encargosCobrados.filter(x => x.tipo === 'tarifa')) {
      if (tarifasVedadas.some(t => e.descricao.toLowerCase().includes(t.toLowerCase()))) {
        tarifasIndevidas.push({ descricao: e.descricao, valor: e.valor })
      }
    }
    if (tarifasIndevidas.length > 0) sumulas.push('STJ Tema 247 - TAC/TEC vedadas apos 30/04/2008')
  }

  // Calculo restituicao
  const valorTarifas = tarifasIndevidas.reduce((s, t) => s + t.valor, 0)
  const valorCpIndevida = cpCumulativa ? (cp?.valor || 0) * 0.3 : 0 // estima 30% indevido
  const valorRestituicao = valorTarifas + valorCpIndevida

  const fundamentacao = [
    `PERICIA REVISIONAL - Auditoria Tecnico-Financeira`,
    `Valor original: R$ ${p.valorOriginal.toLocaleString('pt-BR')}`,
    `Contratacao em ${p.dataContratacao}, corte em ${p.dataCorte}`,
    `Capitalizacao pactuada: ${p.capitalizacaoPactuada}`,
    anatocismoDet ? `ANATOCISMO: capitalizacao ${p.capitalizacaoPactuada} sem previsao legal expressa` : 'Capitalizacao dentro dos limites',
    cpCumulativa ? 'COMISSAO DE PERMANENCIA CUMULADA com outros encargos - VEDADO' : 'Sem irregularidade em comissao de permanencia',
    tarifasIndevidas.length > 0 ? `Tarifas indevidas: ${tarifasIndevidas.map(t => t.descricao).join(', ')}` : 'Sem tarifas vedadas',
    ``,
    `RESTITUICAO SIMPLES: R$ ${valorRestituicao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `RESTITUICAO EM DOBRO (CDC 42 p.u.): R$ ${(valorRestituicao * 2).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
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
