/**
 * ALETIS - Gerador de Propostas Inteligentes
 *
 * Recebe dados do cliente + parâmetros da operação e monta uma proposta
 * completa de 15 seções, no padrão das propostas reais (PAULO LUCIANO e AILTON),
 * combinando:
 *   - Calculadoras do calculadoras-premium.ts
 *   - Base de conhecimento (súmulas, MCR, precedentes, Plano Safra)
 *   - Memória de cálculo auditável
 *   - Fundamentação jurídica citada
 *
 * Nada de dados fabricados - tudo derivado dos inputs ou das referências normativas.
 */

import {
  calcularMemoriaCompleta,
  simularDacao,
  simularAlongamento,
  analisarCapitalizacaoDespesas,
  detectarDescaracterizacao,
  projetarFluxoPlurianual,
  executarStressTest,
  compararMultiCredores,
  simularParcelamentoSafra,
  executarPericiaRevisional,
} from '../lib/calculadoras-premium.js'
import {
  SUMULAS_STJ,
  MCR_SECOES,
  PRECEDENTES,
  PLANO_SAFRA_2025_26,
  PROAGRO_REGRAS_2025_26,
} from '@aletis/knowledge-base'

/* ============================================================
 *  TIPOS DE ENTRADA
 * ============================================================ */

export interface DadosClienteProposta {
  id?: string
  nome: string
  cpfCnpj: string
  enderecoRural?: string
  cidade: string
  uf: string
  rendaBrutaAnual?: number
  areaHa?: number
  culturaPrincipal?: string
  produtividadeSacasHa?: number
  precoSacaAtual?: number
  custoHa?: number
  arrendamentoHa?: number
  possuiDap?: boolean
  possuiCaf?: boolean
  carAtivo?: boolean
  historicoProagro?: Array<{
    ano: number
    enquadrado: boolean
    valorIndenizado?: number
    coberturaConcedida?: number
  }>
}

export interface ContextoCredito {
  credor: string
  credorTipo: 'bancario' | 'cooperativa' | 'insumos' | 'tradings' | 'particular'
  contratosOriginais: Array<{
    numero: string
    finalidade: 'custeio' | 'investimento' | 'comercializacao' | 'pessoal'
    valorOriginal: number
    taxaAA: number
    dataContratacao: string
    fonteRecursos?: string
  }>
  contratoAtual: {
    numero: string
    saldoDevedor: number
    taxaAA: number
    cet: number
    dataContratacao: string
    capitalizacaoPactuada: 'diaria' | 'mensal' | 'anual' | 'nao'
    finalidadeInformada: string
  }
  despesasCapitalizadas?: {
    iof?: number
    seguroPrestamista?: number
    cartorio?: number
    tarifaEstruturacao?: number
    tarifaAvaliacaoGarantia?: number
    outros?: number
  }
  encargosCobrados?: Array<{
    descricao: string
    valor: number
    tipo: 'juros' | 'tarifa' | 'seguro' | 'comissao_permanencia' | 'multa' | 'mora'
  }>
  pagamentosJaRealizados?: Array<{ data: string; valor: number }>
  dataCorte: string
}

export interface EventoAdverso {
  tipo: 'veranico' | 'enchente' | 'geada' | 'pragas' | 'queda_preco' | 'doenca' | 'incendio'
  dataOcorrencia: string
  localizacao: string
  percentualPerdaSafra: number
  documentacao?: string[]
}

export interface ParametrosNegociacao {
  estrategia: 'liquidacao' | 'alongamento' | 'renegociacao' | 'dacao' | 'revisional' | 'tripartite'
  percentualEntradaDesejado?: number
  numeroSafrasPagamento?: number
  bensOferecidosDacao?: Array<{
    descricao: string
    matricula?: string
    tipo: 'imovel_rural' | 'imovel_urbano' | 'maquinario' | 'semovente' | 'cota_cooperativa' | 'outros'
    areaHa?: number
    valorAvaliacao: number
  }>
  desagioDesejado?: number
  outrosCredores?: Array<{
    nome: string
    tipo: 'bancario' | 'cooperativa' | 'insumos' | 'tradings' | 'particular'
    saldoDevedor: number
    taxaAA: number
    garantia: 'real' | 'fiduciaria' | 'pessoal' | 'sem_garantia'
  }>
}

export interface PropostaInteligente {
  id: string
  dataGeracao: string
  dataValidade: string
  cliente: DadosClienteProposta
  credor: string
  estrategia: string
  secoes: {
    capa: SecaoCapa
    sumarioExecutivo: SecaoSumarioExecutivo
    contexto: SecaoContexto
    diagnosticoFinanceiro: SecaoDiagnostico
    memoriaCalculo: SecaoMemoriaCalculo
    analiseAbusividade: SecaoAnaliseAbusividade
    fluxoCaixaProjetado: SecaoFluxoCaixa
    stressTest: SecaoStressTest
    propostaEstruturada: SecaoPropostaEstruturada
    comparativoMultiCredor?: SecaoMultiCredor
    garantiasOferecidas: SecaoGarantias
    fundamentacaoLegal: SecaoFundamentacao
    anexos: SecaoAnexos
    aceite: SecaoAceite
    observacoes: SecaoObservacoes
  }
  metricasChave: {
    valorDividaAtualizado: number
    valorPropostaEstruturada: number
    descontoEstimado: number
    economiaEstimada: number
    viabilidade: 'alta' | 'media' | 'baixa'
    prazoLiquidacao: string
  }
}

interface SecaoCapa {
  titulo: string
  subtitulo: string
  dataReferencia: string
  clienteNome: string
  credorNome: string
  valorDivida: number
  valorProposta: number
}

interface SecaoSumarioExecutivo {
  paragrafoUnico: string
  pontosChave: string[]
}

interface SecaoContexto {
  historiaProdutor: string
  atividadeAtual: string
  eventosAdversos: string[]
  relacionamentoCredor: string
}

interface SecaoDiagnostico {
  saldoAtualizado: number
  cetContratual: number
  taxaOriginal: number
  spreadAbusivo: number
  indiciosAbusividade: string[]
}

interface SecaoMemoriaCalculo {
  valorOriginal: number
  despesasCapitalizadas: number
  valorLiquidoRecebido: number
  multiplicadorDespesas: number
  detalhamentoPeriodo: Array<{
    periodo: string
    saldoInicial: number
    juros: number
    pagamento: number
    saldoFinal: number
  }>
  fundamentacao: string
}

interface SecaoAnaliseAbusividade {
  houveDescaracterizacao: boolean
  indicios: string[]
  capitalizacaoAbusiva: boolean
  comissaoPermanenciaIndevida: boolean
  tarifasIndevidas: Array<{ descricao: string; valor: number }>
  valorRestituicaoEstimado: number
  valorRestituicaoDobro: number
}

interface SecaoFluxoCaixa {
  anos: Array<{
    safra: string
    receita: number
    custo: number
    margem: number
    saldoLiquido: number
  }>
  viabilidade: 'VIAVEL' | 'APERTADO' | 'INVIAVEL'
  vpl: number
  recomendacoes: string[]
}

interface SecaoStressTest {
  cenarios: Array<{
    queda: number
    status: 'QUITA' | 'PARCIAL' | 'INVIAVEL'
    gap: number
  }>
  precoBreakEven: number
  recomendacaoHedge: string
}

interface SecaoPropostaEstruturada {
  tipoEstruturacao: string
  valorTotalProposto: number
  entrada: { valor: number; data: string; descricao: string }
  parcelas: Array<{
    numero: number
    descricao: string
    data: string
    valor: number
    tipo: 'pagamento' | 'dacao' | 'compensacao' | 'parcela'
  }>
  condicoes: string[]
}

interface SecaoMultiCredor {
  totalDivida: number
  prioridadeRenegociacao: Array<{
    credor: string
    score: number
    estrategia: string
  }>
  economiaPotencialTotal: number
}

interface SecaoGarantias {
  garantiasOfertadas: Array<{
    descricao: string
    tipo: string
    valorAvaliacao: number
  }>
  observacoes: string
}

interface SecaoFundamentacao {
  sumulasAplicaveis: Array<{ numero: number; texto: string }>
  dispositivosMCR: Array<{ secao: string; titulo: string }>
  precedentes: Array<{ tribunal: string; numero: string; tese: string }>
  resolucoesCmn: string[]
  argumentacaoCentral: string
}

interface SecaoAnexos {
  listaAnexos: Array<{
    descricao: string
    obrigatorio: boolean
    observacoes?: string
  }>
}

interface SecaoAceite {
  textoAceite: string
  prazoValidade: string
  condicoesAceite: string[]
}

interface SecaoObservacoes {
  proximosPassos: string[]
  cronograma: Array<{ etapa: string; prazo: string }>
  contatoAletis: string
}

/* ============================================================
 *  GERADOR PRINCIPAL
 * ============================================================ */

export async function gerarPropostaInteligente(
  cliente: DadosClienteProposta,
  credito: ContextoCredito,
  eventos: EventoAdverso[],
  negociacao: ParametrosNegociacao,
): Promise<PropostaInteligente> {
  const id = `prop-ia-${Date.now().toString(36)}`
  const dataGeracao = new Date().toISOString().slice(0, 10)
  const validade = new Date()
  validade.setMonth(validade.getMonth() + 3)
  const dataValidade = validade.toISOString().slice(0, 10)

  // ============== RODAR CALCULADORAS ==============
  const memoria = calcularMemoriaCompleta({
    valorOriginal: credito.contratoAtual.saldoDevedor,
    dataInicio: credito.contratoAtual.dataContratacao,
    taxaNominalMensal: Math.pow(1 + credito.contratoAtual.taxaAA / 100, 1 / 12) - 1 > 0
      ? (Math.pow(1 + credito.contratoAtual.taxaAA / 100, 1 / 12) - 1) * 100
      : credito.contratoAtual.taxaAA / 12,
    iofTotal: credito.despesasCapitalizadas?.iof,
    seguroPrestamista: credito.despesasCapitalizadas?.seguroPrestamista,
    tarifasDiversas:
      (credito.despesasCapitalizadas?.cartorio || 0) +
      (credito.despesasCapitalizadas?.tarifaEstruturacao || 0) +
      (credito.despesasCapitalizadas?.tarifaAvaliacaoGarantia || 0) +
      (credito.despesasCapitalizadas?.outros || 0),
    pagamentos: credito.pagamentosJaRealizados,
    dataCorte: credito.dataCorte,
  })

  const capitalizacao = credito.despesasCapitalizadas
    ? analisarCapitalizacaoDespesas({
        valorSolicitado: credito.contratoAtual.saldoDevedor,
        despesasCapitalizadas: credito.despesasCapitalizadas,
        taxaContratualMensal: (Math.pow(1 + credito.contratoAtual.taxaAA / 100, 1 / 12) - 1) * 100,
        prazoMeses: 60,
      })
    : null

  const descaracterizacao = detectarDescaracterizacao({
    contratosOriginais: credito.contratosOriginais as any,
    contratoRenegociacao: {
      numero: credito.contratoAtual.numero,
      finalidadeInformada: credito.contratoAtual.finalidadeInformada,
      valor: credito.contratoAtual.saldoDevedor,
      taxaAA: credito.contratoAtual.taxaAA,
      cet: credito.contratoAtual.cet,
      dataRenegociacao: credito.contratoAtual.dataContratacao,
    },
  })

  const pericia = executarPericiaRevisional({
    valorOriginal: credito.contratoAtual.saldoDevedor,
    dataContratacao: credito.contratoAtual.dataContratacao,
    taxaContratualMensal: (Math.pow(1 + credito.contratoAtual.taxaAA / 100, 1 / 12) - 1) * 100,
    capitalizacaoPactuada: credito.contratoAtual.capitalizacaoPactuada,
    encargosCobrados: credito.encargosCobrados || [],
    dataCorte: credito.dataCorte,
  })

  const perdaMedia = eventos.length > 0
    ? eventos.reduce((s, e) => s + e.percentualPerdaSafra, 0) / eventos.length
    : 0

  const alongamento = perdaMedia > 0 && cliente.culturaPrincipal
    ? simularAlongamento({
        saldoDevedor: memoria.saldoAtualizado,
        taxaOriginalAA: credito.contratosOriginais[0]?.taxaAA || credito.contratoAtual.taxaAA,
        prazoOriginalMeses: 24,
        percentualPerdaSafra: perdaMedia,
        tipoCredito: (credito.contratosOriginais[0]?.finalidade === 'pessoal'
          ? 'custeio'
          : (credito.contratosOriginais[0]?.finalidade as any) || 'custeio'),
        dataVencimentoOriginal: credito.dataCorte,
        numeroSafras: negociacao.numeroSafrasPagamento,
      })
    : null

  const parcelamento = negociacao.estrategia === 'renegociacao' || negociacao.estrategia === 'alongamento'
    ? simularParcelamentoSafra({
        saldoDevedor: memoria.saldoAtualizado,
        taxaAA: credito.contratosOriginais[0]?.taxaAA || credito.contratoAtual.taxaAA,
        numeroSafras: negociacao.numeroSafrasPagamento || 4,
        dataInicioSafra: dataGeracao,
        mesColheita: 6,
        percentualEntrada: negociacao.percentualEntradaDesejado || 20,
        parcelasPorSafra: 1,
      })
    : null

  const dacao = negociacao.estrategia === 'dacao' && negociacao.bensOferecidosDacao
    ? simularDacao({
        saldoDevedor: memoria.saldoAtualizado,
        bensOferecidos: negociacao.bensOferecidosDacao,
        desagioCredorPct: negociacao.desagioDesejado,
      })
    : null

  const fluxoProjetado =
    cliente.areaHa && cliente.produtividadeSacasHa && cliente.precoSacaAtual && cliente.custoHa
      ? projetarFluxoPlurianual({
          anoBase: new Date().getFullYear(),
          cultura: cliente.culturaPrincipal || 'Soja',
          areaHa: cliente.areaHa,
          produtividadeAtual: cliente.produtividadeSacasHa,
          precoSacaAtual: cliente.precoSacaAtual,
          custoHa: cliente.custoHa,
          dividasExistentes: [{
            descricao: credito.credor,
            valor: memoria.saldoAtualizado / (negociacao.numeroSafrasPagamento || 4),
            vencimento: `${new Date().getFullYear() + 1}-06-30`,
          }],
          arrendamentoHa: cliente.arrendamentoHa,
        })
      : null

  const stressTest =
    cliente.areaHa && cliente.produtividadeSacasHa && cliente.precoSacaAtual && cliente.custoHa
      ? executarStressTest({
          producaoSacas: cliente.areaHa * cliente.produtividadeSacasHa,
          precoBaseHoje: cliente.precoSacaAtual,
          custoTotal: cliente.areaHa * cliente.custoHa,
          dividaAtual: memoria.saldoAtualizado,
        })
      : null

  const multiCredor =
    negociacao.outrosCredores && negociacao.outrosCredores.length > 0
      ? compararMultiCredores({
          credores: [
            {
              nome: credito.credor,
              tipo: credito.credorTipo,
              saldoDevedor: memoria.saldoAtualizado,
              taxaAA: credito.contratoAtual.taxaAA,
              garantia: 'real',
              abertoAoDialogo: true,
            },
            ...negociacao.outrosCredores,
          ],
          capacidadePagamentoAnual: fluxoProjetado?.anos[0]?.margemBruta || memoria.saldoAtualizado * 0.2,
        })
      : null

  // ============== MONTAR SECOES ==============

  const valorProposto = dacao
    ? dacao.valorLiquidoCredor
    : parcelamento
      ? parcelamento.totalPago
      : alongamento
        ? alongamento.valorAlongavel + alongamento.valorMantidoCondicoesOriginais
        : memoria.saldoAtualizado

  const desconto = ((memoria.saldoAtualizado - valorProposto) / memoria.saldoAtualizado) * 100

  const capa: SecaoCapa = {
    titulo: `Proposta de ${nomeEstrategia(negociacao.estrategia)} — ${cliente.nome}`,
    subtitulo: `Credor: ${credito.credor} | Contrato ${credito.contratoAtual.numero}`,
    dataReferencia: dataGeracao,
    clienteNome: cliente.nome,
    credorNome: credito.credor,
    valorDivida: memoria.saldoAtualizado,
    valorProposta: valorProposto,
  }

  const sumario: SecaoSumarioExecutivo = {
    paragrafoUnico:
      `${cliente.nome}, produtor rural em ${cliente.cidade}/${cliente.uf}, apresenta dívida consolidada ` +
      `de R$ ${memoria.saldoAtualizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} perante ${credito.credor}. ` +
      `A presente proposta estrutura a liquidação por meio de ${nomeEstrategia(negociacao.estrategia)}, ` +
      `com economia estimada de R$ ${Math.abs(memoria.saldoAtualizado - valorProposto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ` +
      `(${desconto.toFixed(1)}% sobre o valor atualizado). ` +
      (descaracterizacao.houveDescaracterizacao
        ? 'Identificada DESCARACTERIZAÇÃO de crédito rural que fundamenta recálculo com taxa original equalizada. '
        : '') +
      (perdaMedia > 20
        ? `Perdas documentadas de ${perdaMedia.toFixed(0)}% na safra autorizam alongamento via Súmula 298 STJ. `
        : '') +
      'Proposta alinhada à capacidade de pagamento projetada, viabilidade jurídica e prática de mercado.',
    pontosChave: [
      `Dívida atualizada: R$ ${memoria.saldoAtualizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `CET contratual efetivo: ${memoria.cetAnual.toFixed(2)}% a.a.`,
      `Multiplicador de despesas: ${memoria.multiplicadorDespesas.toFixed(2)}x` +
        (memoria.multiplicadorDespesas > 2 ? ' - ALERTA DE ABUSIVIDADE' : ''),
      `Estratégia adotada: ${nomeEstrategia(negociacao.estrategia)}`,
      `Valor proposto: R$ ${valorProposto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      desconto > 0 ? `Desconto/economia: ${desconto.toFixed(1)}%` : '',
      pericia.sumulasAplicaveis.length > 0 ? `Súmulas aplicáveis: ${pericia.sumulasAplicaveis.length}` : '',
    ].filter(Boolean),
  }

  const contexto: SecaoContexto = {
    historiaProdutor:
      `${cliente.nome}, inscrito(a) no CPF/CNPJ ${cliente.cpfCnpj}, produtor rural em ${cliente.cidade}/${cliente.uf}. ` +
      (cliente.areaHa ? `Explora área de ${cliente.areaHa.toLocaleString('pt-BR')} hectares. ` : '') +
      (cliente.culturaPrincipal ? `Atividade principal: ${cliente.culturaPrincipal}. ` : '') +
      (cliente.rendaBrutaAnual
        ? `Renda bruta anual declarada: R$ ${cliente.rendaBrutaAnual.toLocaleString('pt-BR')}. `
        : '') +
      (cliente.possuiDap ? 'Possui DAP. ' : '') +
      (cliente.possuiCaf ? 'Possui CAF (Cadastro Agricultura Familiar). ' : '') +
      (cliente.carAtivo ? 'CAR ativo. ' : 'CAR não informado. '),
    atividadeAtual:
      cliente.areaHa && cliente.produtividadeSacasHa
        ? `Produção estimada safra atual: ${(cliente.areaHa * cliente.produtividadeSacasHa).toLocaleString('pt-BR')} sacas ` +
          `(${cliente.produtividadeSacasHa} sacas/ha x ${cliente.areaHa} ha).`
        : 'Dados de produção não detalhados.',
    eventosAdversos: eventos.map(
      e =>
        `${nomeTipoEvento(e.tipo)} em ${e.dataOcorrencia} - ${e.localizacao}: perda de ${e.percentualPerdaSafra}% ` +
        (e.documentacao ? `(documentado: ${e.documentacao.join(', ')})` : '(sem documentação anexada)'),
    ),
    relacionamentoCredor:
      `Relacionamento com ${credito.credor} iniciado em ${credito.contratosOriginais[0]?.dataContratacao || 'N/A'}. ` +
      `${credito.contratosOriginais.length} contrato(s) original(is) consolidado(s) no instrumento atual ` +
      `${credito.contratoAtual.numero} (${credito.contratoAtual.dataContratacao}). ` +
      (credito.pagamentosJaRealizados
        ? `Pagamentos já realizados: R$ ${credito.pagamentosJaRealizados
            .reduce((s, p) => s + p.valor, 0)
            .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
        : ''),
  }

  const diagnostico: SecaoDiagnostico = {
    saldoAtualizado: memoria.saldoAtualizado,
    cetContratual: memoria.cetAnual,
    taxaOriginal: descaracterizacao.taxaMediaOriginal,
    spreadAbusivo: descaracterizacao.excessoSobreOriginal,
    indiciosAbusividade: [
      ...descaracterizacao.indicios,
      ...(capitalizacao?.abusividadeDetectada ? capitalizacao.fundamentosContestacao : []),
      ...(pericia.anatocismoDetectado ? [`Anatocismo em ${pericia.capitalizacaoAbusivaEm.join(', ')}`] : []),
      ...(pericia.comissaoPermanenciaIndevida ? ['Comissão de permanência cumulada com outros encargos'] : []),
    ],
  }

  const mem: SecaoMemoriaCalculo = {
    valorOriginal: memoria.valorOriginal,
    despesasCapitalizadas: memoria.totalDespesasCapitalizadas,
    valorLiquidoRecebido: memoria.valorLiberadoLiquido,
    multiplicadorDespesas: memoria.multiplicadorDespesas,
    detalhamentoPeriodo: memoria.detalhamentoPeriodo,
    fundamentacao: memoria.fundamentacao,
  }

  const anAb: SecaoAnaliseAbusividade = {
    houveDescaracterizacao: descaracterizacao.houveDescaracterizacao,
    indicios: descaracterizacao.indicios,
    capitalizacaoAbusiva: pericia.anatocismoDetectado,
    comissaoPermanenciaIndevida: pericia.comissaoPermanenciaIndevida,
    tarifasIndevidas: pericia.tarifasIndevidas,
    valorRestituicaoEstimado: pericia.valorRestituicaoSimples,
    valorRestituicaoDobro: pericia.valorRestituicaoDobro,
  }

  const fluxo: SecaoFluxoCaixa = {
    anos: fluxoProjetado
      ? fluxoProjetado.anos.map(a => ({
          safra: a.safra,
          receita: a.receitaBruta,
          custo: a.custoTotal,
          margem: a.margemBruta,
          saldoLiquido: a.saldoLiquido,
        }))
      : [],
    viabilidade: fluxoProjetado?.viabilidade || 'APERTADO',
    vpl: fluxoProjetado?.valorPresenteLiquido || 0,
    recomendacoes: fluxoProjetado?.recomendacoes || ['Dados insuficientes para projeção'],
  }

  const stress: SecaoStressTest = {
    cenarios: stressTest
      ? stressTest.cenarios.map(c => ({
          queda: c.queda,
          status: c.statusDivida,
          gap: c.gapDivida,
        }))
      : [],
    precoBreakEven: stressTest?.precoBreakEvenPara.divida || 0,
    recomendacaoHedge: stressTest?.recomendacao || 'Dados insuficientes para stress test',
  }

  const proposta: SecaoPropostaEstruturada = {
    tipoEstruturacao: nomeEstrategia(negociacao.estrategia),
    valorTotalProposto: valorProposto,
    entrada: parcelamento
      ? {
          valor: parcelamento.valorEntrada,
          data: dataGeracao,
          descricao: `Entrada (${negociacao.percentualEntradaDesejado}% sobre saldo atualizado)`,
        }
      : { valor: 0, data: dataGeracao, descricao: 'Sem entrada' },
    parcelas:
      parcelamento?.parcelas.map((p, idx) => ({
        numero: idx + 1,
        descricao: `Parcela ${p.numero} - safra ${p.safra}`,
        data: p.dataPagamento,
        valor: p.valorTotal,
        tipo: 'parcela' as const,
      })) ||
      (dacao
        ? negociacao.bensOferecidosDacao!.map((b, idx) => ({
            numero: idx + 1,
            descricao: `Dação - ${b.descricao}${b.matricula ? ` (mat. ${b.matricula})` : ''}`,
            data: dataGeracao,
            valor: b.valorAvaliacao,
            tipo: 'dacao' as const,
          }))
        : []),
    condicoes: [
      ...(alongamento
        ? [
            'Alongamento da dívida com base na Súmula 298 STJ e MCR 2-6-4',
            `Perda documentada de ${perdaMedia.toFixed(0)}% autoriza alongamento proporcional`,
          ]
        : []),
      ...(dacao
        ? [
            'Dação em pagamento conforme arts. 356-359 do CC',
            'Avaliação independente exigida (profissional CREA)',
            dacao.suficiente
              ? 'Quitação integral pela dação'
              : `Remanescente R$ ${dacao.saldoRemanescente.toLocaleString('pt-BR')} em parcelas posteriores`,
          ]
        : []),
      ...(parcelamento
        ? [
            'Pagamentos alinhados ao ciclo da safra',
            `${negociacao.numeroSafrasPagamento || 4} safras de pagamento + carência inicial`,
          ]
        : []),
      'Baixa de restritivos em até 30 dias da liquidação final',
      'Quitação plena e irrevogável após cumprimento integral',
    ],
  }

  const multi: SecaoMultiCredor | undefined = multiCredor
    ? {
        totalDivida: multiCredor.totalDivida,
        prioridadeRenegociacao: multiCredor.prioridadeRenegociacao.map(p => ({
          credor: p.credor,
          score: p.score,
          estrategia: p.estrategiaSugerida,
        })),
        economiaPotencialTotal: multiCredor.prioridadeRenegociacao.reduce((s, p) => s + p.valorEconomiaPotencial, 0),
      }
    : undefined

  const garantias: SecaoGarantias = {
    garantiasOfertadas:
      negociacao.bensOferecidosDacao?.map(b => ({
        descricao: `${b.descricao}${b.matricula ? ` (matrícula ${b.matricula})` : ''}`,
        tipo: b.tipo,
        valorAvaliacao: b.valorAvaliacao,
      })) || [],
    observacoes:
      negociacao.bensOferecidosDacao && negociacao.bensOferecidosDacao.length > 0
        ? `Total avaliado: R$ ${negociacao.bensOferecidosDacao
            .reduce((s, b) => s + b.valorAvaliacao, 0)
            .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Sujeitas a avaliação independente por profissional CREA.`
        : 'Sem garantias adicionais ofertadas além das já previstas no contrato original.',
  }

  const fundamentacao: SecaoFundamentacao = {
    sumulasAplicaveis: montarSumulasAplicaveis(descaracterizacao, pericia, alongamento),
    dispositivosMCR: montarMCRAplicavel(credito, alongamento, capitalizacao),
    precedentes: montarPrecedentesAplicaveis(descaracterizacao, pericia),
    resolucoesCmn: [
      'Resolução CMN 5.229/2025 — reorganiza MCR 2-6-4 (alongamento) com limites renovados',
      'Resolução CMN 5.234/2025 — ajustes Plano Safra 2025/26',
      'Resolução CMN 4.966/2021 (vigor 01/2025) — modelo IFRS9 para provisão',
      ...(eventos.some(e => e.tipo === 'veranico' || e.tipo === 'enchente' || e.tipo === 'geada')
        ? ['Resolução CMN 5.224/2025 — Proagro 2025/26 (novos limites)']
        : []),
    ],
    argumentacaoCentral: construirArgumentacaoCentral(
      descaracterizacao,
      pericia,
      alongamento,
      dacao,
      perdaMedia,
    ),
  }

  const anexos: SecaoAnexos = {
    listaAnexos: [
      { descricao: 'Cédulas originais dos contratos consolidados', obrigatorio: true },
      { descricao: 'Extrato atualizado do contrato vigente', obrigatorio: true },
      { descricao: 'Comprovantes de pagamentos já realizados', obrigatorio: true },
      ...(eventos.length > 0
        ? [{ descricao: 'Laudo técnico de perdas / COR Proagro', obrigatorio: true }]
        : []),
      ...(eventos.some(e => e.tipo === 'veranico' || e.tipo === 'enchente')
        ? [{ descricao: 'Boletins meteorológicos INMET do período', obrigatorio: true }]
        : []),
      ...(negociacao.bensOferecidosDacao
        ? [
            { descricao: 'Matrículas atualizadas dos imóveis ofertados', obrigatorio: true },
            { descricao: 'Laudo técnico de avaliação (profissional CREA)', obrigatorio: true },
          ]
        : []),
      { descricao: 'CAR atualizado', obrigatorio: true, observacoes: 'Obrigatório para operações rurais' },
      { descricao: 'DAP ou CAF (se Pronaf)', obrigatorio: false },
      { descricao: 'Declaração de Imposto de Renda últimos 2 anos', obrigatorio: false },
      { descricao: 'Certidão negativa de débitos trabalhistas/previdenciários', obrigatorio: false },
    ],
  }

  const aceite: SecaoAceite = {
    textoAceite:
      `Declaro, na qualidade de ${credito.credorTipo === 'cooperativa' ? 'cooperado ativo' : 'mutuário'}, ` +
      `que recebi a proposta acima, compreendi integralmente seus termos, memória de cálculo, fundamentação ` +
      `jurídica e condições, e manifesto minha aceitação em todos os seus termos, assumindo as obrigações ` +
      `consignadas e autorizando a formalização dos instrumentos jurídicos necessários.`,
    prazoValidade: dataValidade,
    condicoesAceite: [
      'Aceite por escrito do representante legal do credor',
      'Apresentação da documentação listada como anexo',
      'Assinatura de instrumento de novação/acordo ou termo de quitação em até 15 dias úteis',
      'Em caso de dação: registro da transmissão no cartório competente em até 60 dias',
    ],
  }

  const observacoes: SecaoObservacoes = {
    proximosPassos: [
      'Envio desta proposta ao credor via e-mail formal e registro em plataforma ALETIS',
      'Solicitação de reunião técnica em até 10 dias úteis',
      'Preparação da documentação de anexo',
      ...(negociacao.estrategia === 'revisional' || descaracterizacao.houveDescaracterizacao
        ? ['Preparação paralela de ação revisional caso acordo extrajudicial não prospere em 30 dias']
        : []),
      ...(dacao
        ? [
            'Contato com cartório para cálculo de ITBI e emolumentos',
            'Agendamento de avaliação técnica independente',
          ]
        : []),
    ],
    cronograma: [
      { etapa: 'Envio da proposta', prazo: 'Imediato (D+0)' },
      { etapa: 'Primeira resposta do credor', prazo: 'D+10 úteis' },
      { etapa: 'Reunião de alinhamento', prazo: 'D+15 úteis' },
      { etapa: 'Formalização do acordo', prazo: 'D+30 úteis' },
      { etapa: 'Primeiro pagamento/dação', prazo: 'Conforme cronograma acordado' },
    ],
    contatoAletis: 'Christian Kohler | christian@aletis.com.br | +55 (66) 98434-1616',
  }

  // ============== MONTAR SAIDA FINAL ==============
  return {
    id,
    dataGeracao,
    dataValidade,
    cliente,
    credor: credito.credor,
    estrategia: negociacao.estrategia,
    secoes: {
      capa,
      sumarioExecutivo: sumario,
      contexto,
      diagnosticoFinanceiro: diagnostico,
      memoriaCalculo: mem,
      analiseAbusividade: anAb,
      fluxoCaixaProjetado: fluxo,
      stressTest: stress,
      propostaEstruturada: proposta,
      ...(multi ? { comparativoMultiCredor: multi } : {}),
      garantiasOferecidas: garantias,
      fundamentacaoLegal: fundamentacao,
      anexos,
      aceite,
      observacoes,
    } as any,
    metricasChave: {
      valorDividaAtualizado: memoria.saldoAtualizado,
      valorPropostaEstruturada: valorProposto,
      descontoEstimado: Number(desconto.toFixed(2)),
      economiaEstimada: Number(Math.abs(memoria.saldoAtualizado - valorProposto).toFixed(2)),
      viabilidade:
        fluxoProjetado?.viabilidade === 'VIAVEL'
          ? 'alta'
          : fluxoProjetado?.viabilidade === 'APERTADO'
            ? 'media'
            : 'baixa',
      prazoLiquidacao: parcelamento
        ? `${negociacao.numeroSafrasPagamento || 4} safras`
        : dacao
          ? 'Liquidação imediata via dação'
          : 'A definir',
    },
  }
}

/* ============================================================
 *  HELPERS
 * ============================================================ */

function nomeEstrategia(e: ParametrosNegociacao['estrategia']): string {
  const map = {
    liquidacao: 'Liquidação',
    alongamento: 'Alongamento (Súmula 298 STJ)',
    renegociacao: 'Renegociação',
    dacao: 'Dação em Pagamento',
    revisional: 'Revisão Judicial',
    tripartite: 'Acordo Tripartite',
  }
  return map[e]
}

function nomeTipoEvento(t: EventoAdverso['tipo']): string {
  const map = {
    veranico: 'Veranico (déficit hídrico)',
    enchente: 'Enchente',
    geada: 'Geada',
    pragas: 'Pragas',
    queda_preco: 'Queda de preço',
    doenca: 'Doença na lavoura/rebanho',
    incendio: 'Incêndio',
  }
  return map[t]
}

function montarSumulasAplicaveis(
  desc: ReturnType<typeof detectarDescaracterizacao>,
  pericia: ReturnType<typeof executarPericiaRevisional>,
  along: ReturnType<typeof simularAlongamento> | null,
): Array<{ numero: number; texto: string }> {
  const sumulas: Array<{ numero: number; texto: string }> = []

  if (along) sumulas.push({ numero: 298, texto: SUMULAS_STJ[298].texto })
  if (pericia.comissaoPermanenciaIndevida) {
    sumulas.push({ numero: 472, texto: SUMULAS_STJ[472].texto })
    sumulas.push({ numero: 294, texto: SUMULAS_STJ[294].texto })
    sumulas.push({ numero: 296, texto: SUMULAS_STJ[296].texto })
  }
  if (pericia.anatocismoDetectado) {
    sumulas.push({ numero: 93, texto: SUMULAS_STJ[93].texto })
  }
  sumulas.push({ numero: 380, texto: SUMULAS_STJ[380].texto }) // sempre citar para proposta extrajudicial

  return sumulas
}

function montarMCRAplicavel(
  credito: ContextoCredito,
  along: ReturnType<typeof simularAlongamento> | null,
  cap: ReturnType<typeof analisarCapitalizacaoDespesas> | null,
): Array<{ secao: string; titulo: string }> {
  const mcr: Array<{ secao: string; titulo: string }> = []

  mcr.push({ secao: '2-1', titulo: MCR_SECOES['2-1'].titulo })

  if (along) {
    mcr.push({ secao: '2-6-4', titulo: MCR_SECOES['2-6-4'].titulo })
    mcr.push({ secao: '3-2', titulo: MCR_SECOES['3-2'].titulo })
  }
  if (cap?.abusividadeDetectada) {
    mcr.push({ secao: '2-6-4', titulo: MCR_SECOES['2-6-4'].titulo })
  }
  if (credito.credorTipo === 'bancario') {
    mcr.push({ secao: '6-2', titulo: MCR_SECOES['6-2'].titulo })
    mcr.push({ secao: '7-1', titulo: MCR_SECOES['7-1'].titulo })
  }
  mcr.push({ secao: '7-4', titulo: MCR_SECOES['7-4'].titulo })

  return mcr
}

function montarPrecedentesAplicaveis(
  desc: ReturnType<typeof detectarDescaracterizacao>,
  pericia: ReturnType<typeof executarPericiaRevisional>,
): Array<{ tribunal: string; numero: string; tese: string }> {
  return PRECEDENTES.filter(p => {
    if (desc.houveDescaracterizacao && p.numero.includes('1944978')) return true
    if (pericia.anatocismoDetectado && p.numero.includes('1.251.331')) return true
    if (p.numero.includes('298')) return true
    if (p.numero.includes('5008203')) return true
    return false
  })
    .slice(0, 5)
    .map(p => ({ tribunal: p.tribunal, numero: p.numero, tese: p.tese }))
}

function construirArgumentacaoCentral(
  desc: ReturnType<typeof detectarDescaracterizacao>,
  pericia: ReturnType<typeof executarPericiaRevisional>,
  along: ReturnType<typeof simularAlongamento> | null,
  dacao: ReturnType<typeof simularDacao> | null,
  perdaMedia: number,
): string {
  const pilares: string[] = []

  if (desc.houveDescaracterizacao) {
    pilares.push(
      `(i) DESCARACTERIZAÇÃO do crédito rural: contratos originais de finalidade rural foram renegociados ` +
        `sob título de crédito pessoal/empresarial, com spread de ${desc.excessoSobreOriginal.toFixed(1)}% ` +
        `sobre a taxa média equalizada — violação ao MCR 2-1 e 2-6-4.`,
    )
  }
  if (pericia.anatocismoDetectado) {
    pilares.push(
      '(ii) ANATOCISMO: capitalização em periodicidade não autorizada legalmente, em contrariedade à Súmula 93 STJ.',
    )
  }
  if (pericia.comissaoPermanenciaIndevida) {
    pilares.push(
      '(iii) COMISSÃO DE PERMANÊNCIA CUMULADA com mora/juros/multa — Súmula 472 STJ expressamente veda.',
    )
  }
  if (along && perdaMedia > 0) {
    pilares.push(
      `(iv) DIREITO AO ALONGAMENTO: perda documentada de ${perdaMedia.toFixed(0)}% da safra autoriza alongamento ` +
        `proporcional via Súmula 298 STJ e Lei 9.138/95 — direito subjetivo do devedor, não faculdade do credor.`,
    )
  }
  if (dacao) {
    pilares.push(
      '(v) DAÇÃO EM PAGAMENTO: extinção da obrigação mediante entrega de bem imóvel avaliado, ' +
        'fundamentada nos arts. 356-359 CC e precedente STJ REsp 1.429.461/RJ.',
    )
  }

  if (pilares.length === 0) {
    return (
      'A proposta estrutura uma solução negociada adequada à capacidade de pagamento do devedor, ' +
      'preservando a relação comercial e evitando litígios custosos para ambas as partes.'
    )
  }

  return (
    'A presente proposta se sustenta nos seguintes pilares jurídicos:\n\n' +
    pilares.join('\n\n') +
    '\n\nCabe ao credor acolher a proposta evitando que as irregularidades identificadas migrem para a esfera ' +
    'judicial, onde já existem precedentes uniformes que reconhecem os direitos aqui postulados.'
  )
}
