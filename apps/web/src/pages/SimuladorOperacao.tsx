import PageHeader from '../components/ui/PageHeader'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Banknote,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Download,
  FilePlus2,
  FileSpreadsheet,
  HardDrive,
  Info,
  Layers,
  LineChart as LineChartIcon,
  Percent,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Shield,
  Table2,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  calcularFichaBancaria,
  calcularRecalculoOperacao,
  simularOperacaoCompleta,
  type AmortizacaoAvulsaInput,
  type DespesaAcessoriaInput,
  type FichaBancariaEventoInput,
  type FichaBancariaInput,
  type PeriodicidadeSimulador,
  type RecalculoOperacaoInput,
  type RecalculoParcelaInput,
  type ResultadoSimuladorOperacao,
  type SimuladorOperacaoInput,
  type SistemaSimulador,
} from '@aletis/financial-calc'
import { exportPDF, fmtBRL as fmtBRLReport, nowStr, type ReportData } from '../utils/exportReports'
import { apiFetch, ApiError, useApi } from '../hooks/useApi'
import { simulationBalanceComparison, simulationCashAnalysis } from '../lib/SimulationCashAnalysis'
import { useAuth } from '../contexts/AuthContext'
import { SimulationSaveQueue, SimulationContextChanged, SimulationRegistrationRejected, simulationStorageKey, simulationDraftFingerprint, shiftCalendarMonths, safeSimulationCalculation } from '../lib/SimulationSaveQueue'
import { SimulationRouteSync } from '../lib/SimulationRouteSync'

type TabKey =
  | 'dados'
  | 'resumo'
  | 'tabelas'
  | 'comparativo'
  | 'graficos'
  | 'recalculo'
  | 'ficha'
  | 'auditoria'

const PERIODICIDADES: Array<{ value: PeriodicidadeSimulador; label: string }> = [
  { value: 'UNICA', label: 'Única' },
  { value: 'MENSAL', label: 'Mensal' },
  { value: 'BIMESTRAL', label: 'Bimestral' },
  { value: 'TRIMESTRAL', label: 'Trimestral' },
  { value: 'SEMESTRAL', label: 'Semestral' },
  { value: 'ANUAL', label: 'Anual' },
  { value: 'JUNTO_PRINCIPAL', label: 'Junto c/ principal' },
]

const SISTEMAS: SistemaSimulador[] = ['PRICE', 'SAC', 'SACRE']

const DEFAULT_DESPESAS: DespesaAcessoriaInput[] = [
  { id: 'tac', descricao: 'Taxa Abertura de Credito (TAC)', valor: 0, financiar: false },
  { id: 'prestamista', descricao: 'Prestamista', valor: 0, financiar: false },
  { id: 'seguro-lavoura', descricao: 'Seguro Lavoura', valor: 0, financiar: false },
  { id: 'cartorio', descricao: 'Cartorio', valor: 0, financiar: false },
  { id: 'fee', descricao: 'Fee 1,5%', valor: 0, financiar: false },
]

const DEFAULT_INPUT: SimuladorOperacaoInput = {
  agente: 'Agente financeiro',
  tomador: 'Tomador',
  contrato: 'Contrato',
  valorOperacao: 378_380.2,
  dataCredito: '2026-04-30',
  primeiroVencimentoPrincipal: '2032-08-30',
  primeiroVencimentoJuros: '2027-04-30',
  periodicidadePrincipal: 'SEMESTRAL',
  periodicidadeJuros: 'SEMESTRAL',
  jurosAte: 'PRIMEIRA_PRINCIPAL',
  numeroParcelas: 10,
  taxaPreAnual: 0.15,
  taxaPosAnual: 0,
  indexador: '',
  despesas: DEFAULT_DESPESAS,
  seguroVidaAtivo: false,
  seguroFinanciado: false,
  seguroForma: 'PERCENTUAL_SALDO',
  seguroPercentualMensal: 0,
  seguroValor: 0,
  iofAtivo: false,
  iofDiarioAtivo: true,
  iofPessoa: 'PF',
  iofAdicionalAtivo: true,
  iofFinanciado: false,
  amortizacoesAvulsas: [],
}

const DEFAULT_RECALCULO: RecalculoOperacaoInput = {
  dataInicial: '2026-05-15',
  valorCredito: 1_025_787.55,
  entrada: 115_000,
  custosAcessorios: 14_249.98,
  taxaMensal: 0.0153,
  periodicidade: 'SEMESTRAL',
  parcelas: [
    { id: 'r1', data: '2027-05-15', valor: 184_577.6 },
    { id: 'r2', data: '2027-08-30', valor: 184_577.6 },
    { id: 'r3', data: '2028-05-15', valor: 184_577.6 },
    { id: 'r4', data: '2028-08-30', valor: 184_577.6 },
    { id: 'r5', data: '2029-05-15', valor: 184_577.6 },
    { id: 'r6', data: '2029-08-30', valor: 184_577.6 },
    { id: 'r7', data: '2030-05-15', valor: 184_577.6 },
    { id: 'r8', data: '2030-08-30', valor: 184_577.6 },
  ],
}

const DEFAULT_FICHA: FichaBancariaInput = {
  taxaMensal: 0.01,
  valorOperacao: 3_502_216.12,
  dataInicio: '2023-04-03',
  eventos: [
    { id: 'f1', data: '2023-04-11', evento: 'Juros/Amortizacao', amortizacao: 345_076.67 },
    { id: 'f2', data: '2023-07-13', evento: 'Juros/Amortizacao', amortizacao: 67_549.07 },
    { id: 'f3', data: '2023-07-13', evento: 'Juros/Amortizacao', amortizacao: 676.19 },
    { id: 'f4', data: '2024-02-16', evento: 'Juros/Amortizacao', amortizacao: 23_985.09 },
    { id: 'f5', data: '2024-06-27', evento: 'Juros/Amortizacao', amortizacao: 4.01 },
    { id: 'f6', data: '2024-07-03', evento: 'Juros/Amortizacao', amortizacao: 800_000 },
    { id: 'f7', data: '2024-07-04', evento: 'Juros/Amortizacao', amortizacao: 220_000 },
    { id: 'f8', data: '2025-05-09', evento: 'Juros/Amortizacao', amortizacao: 1_143_940.72 },
  ],
}

const WORKSPACE_VERSION = 1
interface SimuladorWorkspaceData {
  input: SimuladorOperacaoInput
  recalculo: RecalculoOperacaoInput
  ficha: FichaBancariaInput
}

interface ClienteSimuladorOption {
  id: string
  nome: string
  cpfCnpj?: string
  credor?: string
}

interface ServerWorkspace {
  id: string
  clientId?: string
  title: string
  status: 'draft' | 'registered' | 'archived'
  draft: SimuladorWorkspaceData
  registeredVersion: number
  updatedAt: string
}

interface ServerSnapshot {
  id: string
  version: number
  input: SimuladorWorkspaceData
  createdAt: string
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function defaultWorkspace(): SimuladorWorkspaceData {
  return {
    input: cloneData(DEFAULT_INPUT),
    recalculo: cloneData(DEFAULT_RECALCULO),
    ficha: cloneData(DEFAULT_FICHA),
  }
}

function writeWorkspace(key: string, data: SimuladorWorkspaceData, savedAt: string) {
  window.localStorage.setItem(key, JSON.stringify({ version: WORKSPACE_VERSION, savedAt, ...data }))
}

const addMonthsFrom = shiftCalendarMonths

function newOperationInput(): SimuladorOperacaoInput {
  const today = new Date().toISOString().slice(0, 10)
  return {
    ...cloneData(DEFAULT_INPUT),
    agente: '',
    tomador: '',
    contrato: '',
    valorOperacao: 0,
    dataCredito: today,
    primeiroVencimentoPrincipal: addMonthsFrom(today, 12),
    primeiroVencimentoJuros: addMonthsFrom(today, 6),
    periodicidadePrincipal: 'ANUAL',
    periodicidadeJuros: 'SEMESTRAL',
    numeroParcelas: 1,
    taxaPreAnual: 0,
    taxaPosAnual: 0,
    indexador: '',
    despesas: cloneData(DEFAULT_DESPESAS),
    amortizacoesAvulsas: [],
  }
}

function blankWorkspace(): SimuladorWorkspaceData {
  const today = new Date().toISOString().slice(0, 10)
  return {
    input: newOperationInput(),
    recalculo: {
      dataInicial: today,
      valorCredito: 0,
      entrada: 0,
      custosAcessorios: 0,
      taxaMensal: 0,
      periodicidade: 'MENSAL',
      parcelas: [],
    },
    ficha: {
      taxaMensal: 0,
      valorOperacao: 0,
      dataInicio: today,
      eventos: [],
    },
  }
}

function formatSavedTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const TABS: Array<{ key: TabKey; label: string; short: string; description: string; group: string; icon: LucideIcon }> = [
  {
    key: 'dados',
    label: 'Dados da operação',
    short: 'Dados',
    description: 'Cliente, agenda, taxas, IOF, seguro e despesas.',
    group: 'Entrada',
    icon: Calculator,
  },
  {
    key: 'resumo',
    label: 'Resumo financeiro',
    short: 'Resumo',
    description: 'Indicadores centrais de PRICE, SAC e SACRE.',
    group: 'Análise',
    icon: ReceiptText,
  },
  {
    key: 'tabelas',
    label: 'Tabelas do sistema',
    short: 'Tabelas',
    description: 'Fluxo completo do sistema selecionado.',
    group: 'Análise',
    icon: Table2,
  },
  {
    key: 'comparativo',
    label: 'Comparativo',
    short: 'Comparativo',
    description: 'Leitura parcela a parcela entre os três sistemas.',
    group: 'Decisão',
    icon: BarChart3,
  },
  {
    key: 'graficos',
    label: 'Gráficos',
    short: 'Gráficos',
    description: 'Parcelas, CET, saldo e composição visual.',
    group: 'Decisão',
    icon: LineChartIcon,
  },
  {
    key: 'recalculo',
    label: 'Recálculo',
    short: 'Recálculo',
    description: 'Fluxo alternativo de pagamento e CET.',
    group: 'Apoio',
    icon: Banknote,
  },
  {
    key: 'ficha',
    label: 'Ficha bancária',
    short: 'Ficha',
    description: 'Atualização de saldo, juros e amortizações.',
    group: 'Apoio',
    icon: FileSpreadsheet,
  },
  {
    key: 'auditoria',
    label: 'Auditoria',
    short: 'Auditoria',
    description: 'Mapa de cobertura técnica do simulador.',
    group: 'Conferência',
    icon: Shield,
  },
]

function parseTab(raw: string | null): TabKey {
  return TABS.some((item) => item.key === raw) ? (raw as TabKey) : 'dados'
}

function parseSistema(raw: string | null): SistemaSimulador {
  return SISTEMAS.includes(raw as SistemaSimulador) ? (raw as SistemaSimulador) : 'PRICE'
}

const fmtBRL = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }) : 'Não calculado'

const fmtPct = (value: number, digits = 2) =>
  `${(value * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`

const fmtNum = (value: number, digits = 2) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const fmtDate = (iso: string) => {
  if (!iso) return ''
  const [year, month, day] = iso.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

function buildSimuladorReport(
  input: SimuladorOperacaoInput,
  resultado: ResultadoSimuladorOperacao,
  sistemaPrincipal: SistemaSimulador,
  registro: { version: number | null; registeredAt: string | null },
): ReportData {
  const fmtPctR = (v: number, digits = 4) =>
    `${(v * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}%`
  const stateLabel = registro.version ? `Dados da versão ${registro.version}` : 'Rascunho não registrado'
  const dataResumo = resultado.sistemas[sistemaPrincipal]
  const ind = dataResumo.indicadores
  const menorCet = resultado.resumo.reduce((best, item) =>
    item.cetAnual365 < best.cetAnual365 ? item : best,
  resultado.resumo[0])
  const valoresCet = resultado.resumo.map((item) => item.cetAnual365)
  const cetEquivalente = Math.max(...valoresCet) - Math.min(...valoresCet) < 0.0000001
  const despesasAtivas = input.despesas.filter((item) => item.valor > 0)
  const amortizacoesAvulsas = input.amortizacoesAvulsas ?? []
  const jurosAteLabel = input.jurosAte === 'FINAL' ? 'Final da operação' : 'Primeira parcela principal'

  const resumoExecutivo: ReportSection = {
    tipo: 'texto',
    titulo: 'Resumo executivo da simulação',
    texto: [
      `Esta simulação considera a operação de ${fmtBRLReport(input.valorOperacao)} para ${input.tomador || 'Cliente'}, com ${input.numeroParcelas} parcelas e taxa final calculada de ${fmtPctR(resultado.taxaFinalMensal, 2)} a.m. / ${fmtPctR(resultado.taxaFinalAnual, 2)} a.a.`,
      `No sistema ${sistemaPrincipal}, o valor financiado é ${fmtBRLReport(ind.valorFinanciado)}, o líquido creditado é ${fmtBRLReport(ind.valorLiquidoCreditado)}, a primeira prestação é ${fmtBRLReport(ind.primeiraPrestacao)} e o CET anual estimado é ${fmtPctR(ind.cetAnual365, 2)}.`,
      cetEquivalente
        ? `PRICE, SAC e SACRE apresentam CET anual equivalente de ${fmtPctR(menorCet.cetAnual365, 2)} nesta configuração. A decisão deve considerar perfil de caixa, valor das prestações, juros nominais, vencimentos e amortizações.`
        : `Entre PRICE, SAC e SACRE, o menor CET anual nesta configuração é ${menorCet.sistema}, com ${fmtPctR(menorCet.cetAnual365, 2)}. A leitura deve considerar também perfil de caixa, vencimentos, custos acessórios, IOF, seguros e eventuais amortizações avulsas.`,
    ].join(' '),
  }

  const premissasOperacionais: ReportSection = {
    tipo: 'tabela',
    titulo: 'Premissas operacionais e agenda',
    descricao: 'Parâmetros centrais usados pelo motor financeiro para construir os fluxos, comparar sistemas e calcular CET.',
    colunas: ['Premissa', 'Configuração'],
    linhas: [
      ['Origem dos parâmetros', stateLabel],
      ['Data do registro dos parâmetros', registro.registeredAt ? new Date(registro.registeredAt).toLocaleString('pt-BR') : 'Não registrado'],
      ['Motor de cálculo', resultado.versaoMotor],
      ['Resultado apresentado', 'Recalculado com o motor identificado neste relatório a partir dos parâmetros informados.'],
      ['Convenção do CET apresentado', 'Fluxos em dias corridos / 365 dias ao ano; mensal equivalente'],
      ['Sistema destacado no relatório', sistemaPrincipal],
      [cetEquivalente ? 'CET dos sistemas' : 'Sistema com menor CET', cetEquivalente ? `Equivalente (${fmtPctR(menorCet.cetAnual365, 2)} a.a.)` : `${menorCet.sistema} (${fmtPctR(menorCet.cetAnual365, 2)} a.a.)`],
      ['Taxa final mensal calculada', fmtPctR(resultado.taxaFinalMensal)],
      ['Taxa final anual calculada', fmtPctR(resultado.taxaFinalAnual)],
      ['Juros calculados até', jurosAteLabel],
      ['Periodicidade principal', input.periodicidadePrincipal],
      ['Periodicidade juros', input.periodicidadeJuros],
      ['Seguro de vida', input.seguroVidaAtivo ? (input.seguroFinanciado ? 'Ativo e financiado' : 'Ativo com débito') : 'Inativo'],
      [
        'IOF',
        input.iofAtivo
          ? [
              input.iofDiarioAtivo !== false ? 'diário PF/PJ' : 'sem diário',
              input.iofAdicionalAtivo ? 'adicional 0,38%' : 'sem adicional',
              input.iofFinanciado ? 'financiado' : 'com débito',
            ].join(' · ')
          : 'Inativo',
      ],
      ['Despesas informadas', `${input.despesas.length} itens (${despesasAtivas.length} com valor)`],
      ['Amortizações avulsas', amortizacoesAvulsas.length ? `${amortizacoesAvulsas.length} eventos` : 'Nenhuma'],
    ],
  }

  const dadosOperacao: ReportSection = {
    tipo: 'tabela',
    titulo: 'Dados da operação',
    descricao: 'Identificação da operação e parâmetros financeiros originais informados na tela do simulador.',
    colunas: ['Campo', 'Valor'],
    linhas: [
      ['Agente financeiro', input.agente || '—'],
      ['Tomador', input.tomador || '—'],
      ['Contrato', input.contrato || '—'],
      ['Valor da operação', fmtBRLReport(input.valorOperacao)],
      ['Data do crédito', fmtDate(input.dataCredito)],
      ['1º venc. principal', fmtDate(input.primeiroVencimentoPrincipal)],
      ['1º venc. juros', input.primeiroVencimentoJuros ? fmtDate(input.primeiroVencimentoJuros) : '—'],
      ['Periodicidade principal', input.periodicidadePrincipal],
      ['Periodicidade juros', input.periodicidadeJuros],
      ['Nº de parcelas', String(input.numeroParcelas)],
      ['Taxa pré (a.a.)', fmtPctR(input.taxaPreAnual)],
      ['Taxa pós (a.a.)', fmtPctR(input.taxaPosAnual)],
      ['Indexador', input.indexador || '—'],
    ],
  }

  const kpisGerais: ReportSection = {
    tipo: 'kpis',
    titulo: 'Indicadores principais — ' + sistemaPrincipal,
    kpis: [
      { label: 'Valor financiado', valor: fmtBRLReport(ind.valorFinanciado), tone: 'success' },
      { label: 'Líquido creditado', valor: fmtBRLReport(ind.valorLiquidoCreditado), tone: 'success' },
      { label: '1ª prestação', valor: fmtBRLReport(ind.primeiraPrestacao) },
      { label: 'Maior prestação', valor: fmtBRLReport(ind.maiorPrestacao) },
      { label: 'Total juros', valor: fmtBRLReport(ind.totalJuros) },
      { label: 'Total prestações', valor: fmtBRLReport(ind.totalPrestacoes) },
      { label: 'CET mensal', valor: fmtPctR(ind.cetMensal365) },
      { label: 'CET anual', valor: fmtPctR(ind.cetAnual365) },
    ],
  }

  const comparativoSistemas: ReportSection = {
    tipo: 'tabela',
    titulo: 'Comparativo PRICE × SAC × SACRE',
    descricao: 'Comparação direta entre sistemas de amortização para apoiar decisão comercial e análise de caixa.',
    colunas: ['Sistema', '1ª parcela', 'Maior parcela', 'Total juros', 'Total pago', 'CET a.a.'],
    linhas: resultado.resumo.map((r) => [
      r.sistema,
      fmtBRLReport(r.primeiraPrestacao),
      fmtBRLReport(r.maiorPrestacao),
      fmtBRLReport(r.totalJuros),
      fmtBRLReport(r.totalPrestacoes),
      fmtPctR(r.cetAnual365),
    ]),
  }

  const capacidadeCaixa: ReportSection = {
    tipo: 'tabela',
    titulo: 'Concentração dos pagamentos no caixa',
    descricao: 'Soma das prestações e amortizações de cada período. Confrontar com caixa disponível e calendário da atividade; despesas debitadas na liberação já reduzem o líquido creditado.',
    colunas: ['Sistema', 'Primeiro pagamento', 'Último pagamento', 'Mês mais pesado', 'Desembolso no mês', 'Ano mais pesado', 'Desembolso no ano'],
    linhas: simulationCashAnalysis(resultado).map(item => [
      item.system,
      item.firstPaymentDate ? fmtDate(item.firstPaymentDate) : '—',
      item.lastPaymentDate ? fmtDate(item.lastPaymentDate) : '—',
      item.peakMonth?.period || '—', item.peakMonth ? fmtBRLReport(item.peakMonth.amount) : '—',
      item.peakYear?.period || '—', item.peakYear ? fmtBRLReport(item.peakYear.amount) : '—',
    ]),
  }

  const custos: ReportSection = {
    tipo: 'tabela',
    titulo: 'Composição de custos — ' + sistemaPrincipal,
    descricao: 'Separação dos custos por total, parcela financiada e valores debitados fora do saldo financiado.',
    colunas: ['Item', 'Total', 'Financiado', 'Débito'],
    linhas: [
      ['Despesas acessórias', fmtBRLReport(ind.custos.despesasTotal), fmtBRLReport(ind.custos.despesasFinanciadas), fmtBRLReport(ind.custos.despesasDebito)],
      ['Seguro', fmtBRLReport(ind.custos.seguroTotal), fmtBRLReport(ind.custos.seguroFinanciado), fmtBRLReport(ind.custos.seguroDebito)],
      ['IOF diário PF/PJ', fmtBRLReport(ind.custos.iofDiario), fmtBRLReport(input.iofFinanciado ? ind.custos.iofDiario : 0), fmtBRLReport(input.iofFinanciado ? 0 : ind.custos.iofDiario)],
      ['IOF adicional 0,38%', fmtBRLReport(ind.custos.iofAdicional), fmtBRLReport(input.iofFinanciado ? ind.custos.iofAdicional : 0), fmtBRLReport(input.iofFinanciado ? 0 : ind.custos.iofAdicional)],
      ['IOF total', fmtBRLReport(ind.custos.iofTotal), fmtBRLReport(ind.custos.iofFinanciado), fmtBRLReport(ind.custos.iofDebito)],
    ],
  }

  const despesasDetalhadas: ReportSection = {
    tipo: 'tabela',
    titulo: 'Despesas acessórias detalhadas',
    colunas: ['Despesa', 'Valor', 'Tratamento'],
    linhas: input.despesas.map((item) => [
      item.descricao || 'Despesa',
      fmtBRLReport(item.valor),
      item.financiar ? 'Financiada no saldo' : 'Débito / não financiada',
    ]),
  }

  const amortizacoes: ReportSection | null = amortizacoesAvulsas.length
    ? {
        tipo: 'tabela',
        titulo: 'Amortizações avulsas informadas',
        colunas: ['Data', 'Valor', 'Descrição'],
        linhas: amortizacoesAvulsas.map((item) => [
          fmtDate(item.data),
          fmtBRLReport(item.valor),
          item.descricao || 'Amortização avulsa',
        ]),
      }
    : null

  const cronograma: ReportSection = {
    tipo: 'tabela',
    titulo: 'Cronograma resumido — ' + sistemaPrincipal,
    descricao: 'Fluxo completo do sistema selecionado, incluindo juros, amortização, prestação e saldo devedor.',
    colunas: ['#', 'Data', 'Tipo', 'Juros', 'Amortização', 'Prestação', 'Saldo devedor'],
    linhas: dataResumo.linhas.map((l) => [
      l.n === 0 ? '—' : String(l.n),
      fmtDate(l.data),
      l.descricao,
      fmtBRLReport(l.juros),
      fmtBRLReport(l.amortizacao),
      fmtBRLReport(l.prestacao),
      fmtBRLReport(l.saldoDevedor),
    ]),
  }

  const auditoria: ReportSection = {
    tipo: 'tabela',
    titulo: 'Auditoria técnica do cálculo',
    descricao: 'Trilha de conferência para explicar a origem dos principais blocos do relatório.',
    colunas: ['Bloco', 'Como foi calculado / validado'],
    linhas: [
      ['Motor financeiro', 'Simulador v16 nativo, usando os mesmos inputs da tela no momento da exportação.'],
      ['Sistemas', 'PRICE, SAC e SACRE calculados em paralelo para permitir comparação de parcelas, juros, saldo e CET.'],
      ['CET', 'CET apresentado: dias corridos / 365 dias ao ano. A planilha v16 usa 360 dias; valores históricos são preservados e não devem ser comparados sem igualar a convenção.'],
      ...resultado.premissas.map(premissa => ['Premissa do motor', premissa]),
      ['Custos', 'Despesas, seguro e IOF separados entre itens financiados e debitados.'],
      ['Cronograma', 'Datas, dias, juros, amortização e saldo derivados da agenda de vencimentos informada.'],
      ['Uso recomendado', 'Documento de apoio gerencial; antes de formalização, confrontar com proposta bancária, contrato e parâmetros oficiais da instituição.'],
    ],
  }

  const sections = [
    resumoExecutivo,
    premissasOperacionais,
    dadosOperacao,
    kpisGerais,
    comparativoSistemas,
    capacidadeCaixa,
    custos,
    despesasDetalhadas,
    amortizacoes,
    cronograma,
    auditoria,
  ].filter(Boolean) as ReportSection[]

  return {
    id: `simulador-${sistemaPrincipal.toLowerCase()}`,
    titulo: `Simulação de operação — ${sistemaPrincipal} · ${stateLabel}`,
    subtitulo: `${input.tomador || 'Cliente'} • Contrato ${input.contrato || '—'} • ${input.agente || 'Agente'}`,
    gerado: nowStr(),
    cover: {
      eyebrow: 'Simulador v16 - relatório técnico',
      resumo: `Relatório estruturado da simulação ${sistemaPrincipal}, com análise de premissas, custos, comparação entre sistemas de amortização, cronograma financeiro e trilha de auditoria para apresentação interna ou ao cliente.`,
      kpis: [
        { label: 'Valor da operação', valor: fmtBRLReport(input.valorOperacao) },
        { label: 'Sistema destacado', valor: sistemaPrincipal, apoio: 'Conferir custos e capacidade de pagamento' },
        { label: 'CET anual', valor: fmtPctR(ind.cetAnual365, 2), apoio: `${sistemaPrincipal}` },
        { label: 'Líquido creditado', valor: fmtBRLReport(ind.valorLiquidoCreditado) },
      ],
    },
    sections,
  }
}

// Helper type local pro buildSimuladorReport
type ReportSection = ReportData['sections'][number]

export default function SimuladorOperacao() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: clientes } = useApi<ClienteSimuladorOption[]>('/clientes', [])
  const { user } = useAuth()
  const [initialWorkspace] = useState<SimuladorWorkspaceData>(blankWorkspace)
  const [tab, setTab] = useState<TabKey>(() => parseTab(searchParams.get('tab')))
  const [input, setInput] = useState<SimuladorOperacaoInput>(() => cloneData(initialWorkspace.input))
  const [sistemaTabela, setSistemaTabelaState] = useState<SistemaSimulador>(() => parseSistema(searchParams.get('sistema')))
  const [recalculo, setRecalculo] = useState<RecalculoOperacaoInput>(() => cloneData(initialWorkspace.recalculo))
  const [ficha, setFicha] = useState<FichaBancariaInput>(() => cloneData(initialWorkspace.ficha))
  const [registeredSnapshot, setRegisteredSnapshot] = useState<string | null>(null)
  const [registeredAt, setRegisteredAt] = useState<string | null>(null)
  const [registeredVersion, setRegisteredVersion] = useState(0)
  const [draftAt, setDraftAt] = useState<string | null>(null)
  const [storageStatus, setStorageStatus] = useState<'initializing' | 'saving' | 'ready' | 'error'>('initializing')
  const [workspaceId, setWorkspaceId] = useState('')
  const [serverReady, setServerReady] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState(() => searchParams.get('clienteId') ?? '')
  const [workspaces, setWorkspaces] = useState<ServerWorkspace[]>([])
  const [recoveryBackup, setRecoveryBackup] = useState<SimuladorWorkspaceData | null>(null)
  const [busyAction, setBusyAction] = useState(false)
  const [validationTouched, setValidationTouched] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirmedDraft, setConfirmedDraft] = useState('')
  const saveQueue = useRef(new SimulationSaveQueue())
  const requestSequence = useRef(0)
  const saveSequence = useRef(0)
  const actionRunning = useRef(false)
  const mounted = useRef(true)
  const loadedUserId = useRef('')
  const routeSync = useRef(new SimulationRouteSync(location.key, { clientId: searchParams.get('clienteId') || '', workspaceId: searchParams.get('workspaceId') || undefined }))

  const workspaceData = useMemo<SimuladorWorkspaceData>(() => ({ input, recalculo, ficha }), [input, recalculo, ficha])
  const workspaceSnapshot = useMemo(() => simulationDraftFingerprint(workspaceData), [workspaceData])
  const hasUnregisteredChanges = registeredSnapshot !== workspaceSnapshot
  const hasUnsavedChanges = confirmedDraft !== workspaceSnapshot

  function rememberWorkspace(record: ServerWorkspace) {
    try { window.localStorage.setItem(`aletis:simulador:v2:${encodeURIComponent(user.id)}:last:${record.clientId || 'unlinked'}`, record.id) } catch { /* O servidor já confirmou a operação. */ }
  }

  async function openWorkspace(clientId: string, options: { id?: string; create?: boolean; example?: boolean } = {}) {
    const sequence = ++requestSequence.current
    saveSequence.current += 1
    saveQueue.current.invalidate()
    loadedUserId.current = ''
    setServerReady(false)
    setStorageStatus('initializing')
    setRegisteredSnapshot(null)
    setRegisteredAt(null)
    setRegisteredVersion(0)
    setRecoveryBackup(null)
    setWorkspaces([])
    setWorkspaceId('')
    setSelectedClientId(clientId)
    const blank = blankWorkspace()
    setInput(blank.input)
    setRecalculo(blank.recalculo)
    setFicha(blank.ficha)
    try {
      const records = await apiFetch<ServerWorkspace[]>(`/simulations${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`)
      if (sequence !== requestSequence.current || !mounted.current) return
      const compatible = records.filter(record => (record.clientId || '') === clientId && record.status !== 'archived')
      let remembered: string | null = null
      try { remembered = window.localStorage.getItem(`aletis:simulador:v2:${encodeURIComponent(user.id)}:last:${clientId || 'unlinked'}`) } catch { /* Preferência opcional. */ }
      const selectedId = options.id || (!options.create && compatible.find(record => record.id === remembered)?.id) || (!options.create && compatible[0]?.id)
      let record: ServerWorkspace
      if (selectedId) {
        record = await apiFetch<ServerWorkspace>(`/simulations/${encodeURIComponent(selectedId)}`)
        if ((record.clientId || '') !== clientId) throw new Error('A simulação selecionada pertence a outro cliente. Abra o contexto correspondente no CRM.')
      } else {
        const draft = options.example ? defaultWorkspace() : blankWorkspace()
        const selected = clientId
          ? clientes.find(item => item.id === clientId) || await apiFetch<ClienteSimuladorOption>(`/clientes/${encodeURIComponent(clientId)}`)
          : undefined
        if (sequence !== requestSequence.current || !mounted.current) return
        if (clientId && !selected?.nome) throw new Error('Não foi possível confirmar o nome do cliente para criar a operação.')
        if (selected) draft.input.tomador = selected.nome
        record = await apiFetch<ServerWorkspace>('/simulations', {
          method: 'POST',
          headers: { 'Idempotency-Key': `browser-${crypto.randomUUID()}` },
          body: JSON.stringify({ title: options.example ? 'Exemplo v16 — sem vínculo com cliente' : `Simulação — ${selected?.nome || 'nova operação'}`, clientId: clientId || undefined, draft }),
        })
      }
      if (sequence !== requestSequence.current || !mounted.current) return
      const history = record.registeredVersion > 0
        ? await apiFetch<ServerSnapshot[]>(`/simulations/${record.id}/snapshots`)
        : []
      if (sequence !== requestSequence.current || !mounted.current) return
      const latest = history.find(item => item.version === record.registeredVersion) || history[0]
      try {
        const raw = window.localStorage.getItem(simulationStorageKey(user.id, record.id))
        const local = raw ? JSON.parse(raw) : null
        if (local?.version === WORKSPACE_VERSION && local.input && local.recalculo && local.ficha && Array.isArray(local.input.despesas) && Array.isArray(local.recalculo.parcelas) && Array.isArray(local.ficha.eventos)) {
          const backup = { input: local.input, recalculo: local.recalculo, ficha: local.ficha }
          if (simulationDraftFingerprint(backup) !== simulationDraftFingerprint(record.draft)) setRecoveryBackup(backup)
        }
      } catch { /* Uma cópia local inválida nunca substitui o servidor. */ }
      saveQueue.current.activate(record.id, record.updatedAt)
      setWorkspaceId(record.id)
      setInput(cloneData(record.draft.input))
      setRecalculo(cloneData(record.draft.recalculo))
      setFicha(cloneData(record.draft.ficha))
      setConfirmedDraft(simulationDraftFingerprint(record.draft))
      setDraftAt(record.updatedAt)
      setRegisteredVersion(record.registeredVersion)
      if (latest) {
        setRegisteredSnapshot(simulationDraftFingerprint(latest.input))
        setRegisteredAt(latest.createdAt)
      }
      setWorkspaces([record, ...compatible.filter(item => item.id !== record.id)])
      rememberWorkspace(record)
      loadedUserId.current = user.id
      setServerReady(true)
      setStorageStatus('ready')
      setValidationTouched(false)
      return true
    } catch (error) {
      if (sequence !== requestSequence.current || !mounted.current) return
      setStorageStatus('error')
      setFeedback(`Não foi possível abrir a operação: ${(error as Error).message}. Nenhuma outra simulação foi criada para substituir uma falha de leitura.`)
      return false
    }
  }

  useEffect(() => {
    mounted.current = true
    void openWorkspace(searchParams.get('clienteId') || '', { id: searchParams.get('workspaceId') || undefined })
    return () => { mounted.current = false; requestSequence.current += 1; saveQueue.current.invalidate() }
    // A navegação entre operações ocorre por ações explícitas, preservando o rascunho antes da troca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  useEffect(() => {
    setTab(parseTab(searchParams.get('tab')))
    setSistemaTabelaState(parseSistema(searchParams.get('sistema')))
    const requested = routeSync.current.observe(location.key, { clientId: searchParams.get('clienteId') || '', workspaceId: searchParams.get('workspaceId') || undefined }, actionRunning.current)
    if (requested) void switchWorkspace(requested.clientId, { id: requested.workspaceId })
    // A troca explícita também cobre links vindos do CRM e navegação do navegador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, searchParams, busyAction])

  useEffect(() => {
    if (!serverReady || !workspaceId || loadedUserId.current !== user.id) return
    if (!hasUnsavedChanges) return
    try { writeWorkspace(simulationStorageKey(user.id, workspaceId), workspaceData, new Date().toISOString()) } catch { /* A cópia local não bloqueia a persistência oficial. */ }
    const sequence = ++saveSequence.current
    const timeout = window.setTimeout(() => {
      if (actionRunning.current) return
      void persistCurrentDraft().catch(error => {
        if (error instanceof SimulationContextChanged || !mounted.current || sequence !== saveSequence.current) return
        setStorageStatus('error')
        setFeedback(error instanceof ApiError && error.status === 409
          ? 'Outra edição mudou esta operação. Seu rascunho foi preservado neste navegador. Reabra a versão do servidor ou salve uma cópia antes de continuar.'
          : `O servidor não confirmou o salvamento: ${(error as Error).message}`)
      })
    }, 700)
    return () => window.clearTimeout(timeout)
    // A fila usa a versão confirmada mais recente no momento de cada gravação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSnapshot, workspaceId, serverReady, selectedClientId, user.id, hasUnsavedChanges])

  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (!serverReady || !workspaceId || !hasUnsavedChanges) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [hasUnsavedChanges, serverReady, workspaceId])

  const operationCalculation = useMemo(() => safeSimulationCalculation(() => simularOperacaoCompleta(input)), [input])
  const recalculation = useMemo(() => safeSimulationCalculation(() => calcularRecalculoOperacao(recalculo)), [recalculo])
  const statementCalculation = useMemo(() => safeSimulationCalculation(() => calcularFichaBancaria(ficha)), [ficha])
  const resultado = operationCalculation.result
  const resultadoRecalculo = recalculation.result
  const resultadoFicha = statementCalculation.result

  const activeTabIndex = Math.max(0, TABS.findIndex((item) => item.key === tab))
  const activeTab = TABS[activeTabIndex] ?? TABS[0]
  const ActiveTabIcon = activeTab.icon
  const previousTab = activeTabIndex > 0 ? TABS[activeTabIndex - 1] : null
  const nextTab = activeTabIndex < TABS.length - 1 ? TABS[activeTabIndex + 1] : null
  const flowProgress = ((activeTabIndex + 1) / TABS.length) * 100
  const sistemaSelecionado = resultado?.sistemas[sistemaTabela].indicadores

  const chartParcelas = (resultado?.comparativo ?? [])
    .filter((row) => row.n > 0)
    .map((row) => ({
      data: fmtDate(row.data),
      PRICE: Math.abs(row.price),
      SAC: Math.abs(row.sac),
      SACRE: Math.abs(row.sacre),
    }))

  const chartSaldos = (resultado?.sistemas[sistemaTabela].linhas ?? []).map((row) => ({
    data: fmtDate(row.data),
    saldo: row.saldoDevedor,
  }))

  const chartCet = (resultado?.resumo ?? []).map((item) => ({
    sistema: item.sistema,
    mensal: item.cetMensal365 * 100,
    anual: item.cetAnual365 * 100,
  }))

  // Stacked area: composição juros vs amortização do sistema escolhido
  const chartComposicao = (resultado?.sistemas[sistemaTabela].linhas ?? [])
    .filter((row) => row.n > 0)
    .map((row) => ({
      data: fmtDate(row.data),
      juros: Number(row.juros.toFixed(2)),
      amortizacao: Number(row.amortizacao.toFixed(2)),
    }))

  // Comparativo de saldo devedor dos 3 sistemas
  const chartSaldosComparativo = resultado
    ? simulationBalanceComparison(resultado).map(row => ({ ...row, data: fmtDate(row.data) }))
    : []

  function update<K extends keyof SimuladorOperacaoInput>(key: K, value: SimuladorOperacaoInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }))
    setFeedback(null)
  }

  function updateDespesa(id: string, patch: Partial<DespesaAcessoriaInput>) {
    setInput((prev) => ({
      ...prev,
      despesas: prev.despesas.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
    setFeedback(null)
  }

  function updateAvulsa(id: string, patch: Partial<AmortizacaoAvulsaInput>) {
    setInput((prev) => ({
      ...prev,
      amortizacoesAvulsas: (prev.amortizacoesAvulsas ?? []).map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }))
    setFeedback(null)
  }

  function addAvulsa() {
    setInput((prev) => ({
      ...prev,
      amortizacoesAvulsas: [
        ...(prev.amortizacoesAvulsas ?? []),
        { id: newId('avulsa'), data: prev.primeiroVencimentoPrincipal, valor: 0, descricao: 'Amortizacao avulsa' },
      ],
    }))
    setFeedback(null)
  }

  function removeAvulsa(id: string) {
    setInput((prev) => ({
      ...prev,
      amortizacoesAvulsas: (prev.amortizacoesAvulsas ?? []).filter((item) => item.id !== id),
    }))
    setFeedback(null)
  }

  async function persistCurrentDraft(): Promise<ServerWorkspace> {
    if (!serverReady || !workspaceId) throw new Error('A operação ainda não foi aberta no servidor.')
    const captured = cloneData(workspaceData)
    const snapshot = simulationDraftFingerprint(captured)
    setStorageStatus('saving')
    const saved = await saveQueue.current.run(async ({ id, updatedAt }) => {
      const record = await apiFetch<ServerWorkspace>(`/simulations/${id}/draft`, {
        method: 'PUT',
        body: JSON.stringify({
          title: `Simulação — ${captured.input.tomador || 'sem cliente'}`,
          draft: captured,
          expectedUpdatedAt: updatedAt,
        }),
      })
      return { value: record, updatedAt: record.updatedAt }
    })
    if (mounted.current) {
      setConfirmedDraft(snapshot)
      setDraftAt(saved.updatedAt)
      setStorageStatus('ready')
    }
    return saved
  }

  async function registerWorkspace(showFeedback = true): Promise<boolean> {
    if (!resultado) {
      setValidationTouched(true)
      setFeedback('Corrija os dados indicados antes de registrar a operação.')
      setTab('dados')
      updateRoute('dados', sistemaTabela)
      return false
    }
    if (!serverReady || !workspaceId || actionRunning.current) return false
    actionRunning.current = true
    setBusyAction(true)
    const captured = cloneData(workspaceData)
    const snapshot = simulationDraftFingerprint(captured)
    let confirmedRegistrationDraft: ServerWorkspace | null = null
    try {
      setStorageStatus('saving')
      const result = await saveQueue.current.run(async ({ id, updatedAt }, confirmRevision) => {
        const saved = await apiFetch<ServerWorkspace>(`/simulations/${id}/draft`, {
          method: 'PUT', body: JSON.stringify({ draft: captured, expectedUpdatedAt: updatedAt }),
        })
        confirmRevision(saved.updatedAt)
        confirmedRegistrationDraft = saved
        const registered = await apiFetch<{ workspace: ServerWorkspace; snapshot: ServerSnapshot & { blocos?: Record<string, string> } }>(`/simulations/${id}/register`, {
          method: 'POST', body: JSON.stringify({ expectedUpdatedAt: saved.updatedAt }),
        }).catch(error => {
          if (error instanceof ApiError && error.status === 422 && error.code === 'CALCULATION_VALIDATION_FAILED') throw new SimulationRegistrationRejected(error.message)
          throw error
        })
        return { value: registered, updatedAt: registered.workspace.updatedAt }
      })
      setRegisteredSnapshot(snapshot)
      setConfirmedDraft(snapshot)
      setRegisteredAt(result.snapshot.createdAt)
      setRegisteredVersion(result.snapshot.version)
      setDraftAt(result.workspace.updatedAt)
      setStorageStatus('ready')
      const unfilled = Object.entries(result.snapshot.blocos || {}).filter(([, state]) => state === 'nao_preenchido').map(([block]) => block === 'recalculo' ? 'recálculo' : block === 'ficha' ? 'ficha bancária' : block)
      if (showFeedback) setFeedback(`Versão ${result.snapshot.version} registrada. ${unfilled.length ? `Módulos não preenchidos (${unfilled.join(', ')}) não foram calculados.` : 'O relatório identifica a versão base dos parâmetros e o motor do cálculo atual.'}`)
      return true
    } catch (error) {
      if (error instanceof SimulationRegistrationRejected && confirmedRegistrationDraft) {
        setConfirmedDraft(snapshot)
        setDraftAt((confirmedRegistrationDraft as ServerWorkspace).updatedAt)
        setStorageStatus('ready')
        setFeedback(`Rascunho salvo. Corrija os dados antes de registrar: ${error.message}`)
        const target: TabKey = error.message.startsWith('Recálculo:') ? 'recalculo' : error.message.startsWith('Ficha bancária:') ? 'ficha' : 'dados'
        setTab(target)
        updateRoute(target, sistemaTabela)
      } else if (!(error instanceof SimulationContextChanged)) {
        setStorageStatus('error')
        setFeedback(`Não foi possível registrar: ${(error as Error).message}. Seu rascunho permanece disponível para salvar uma cópia.`)
      }
      return false
    } finally { actionRunning.current = false; setBusyAction(false) }
  }

  async function switchWorkspace(clientId: string, options: { id?: string; create?: boolean; example?: boolean } = {}) {
    if (actionRunning.current) return
    actionRunning.current = true
    setBusyAction(true)
    routeSync.current.beginLoad({ clientId })
    try {
      if (serverReady && hasUnsavedChanges) await persistCurrentDraft()
      if (!await openWorkspace(clientId, options)) { routeSync.current.cancelLoad(); return }
      if (!routeSync.current.finishLoad({ clientId })) return
      const params = new URLSearchParams(searchParams)
      if (clientId) params.set('clienteId', clientId)
      else params.delete('clienteId')
      params.delete('workspaceId')
      params.delete('tab')
      setSearchParams(params, { replace: true })
      setTab('dados')
      setFeedback(options.example
        ? 'Exemplo v16 aberto em uma operação separada, sem vínculo com cliente. Os dados anteriores permanecem preservados.'
        : 'Operação aberta. Somente os dados deste cenário serão salvos neste contexto.')
    } catch (error) {
      routeSync.current.cancelLoad()
      setStorageStatus('error')
      setFeedback(`A troca foi interrompida para preservar sua edição: ${(error as Error).message}. Salve uma cópia ou reabra a versão do servidor.`)
    } finally { actionRunning.current = false; setBusyAction(false) }
  }

  async function handleNewOperation() { await switchWorkspace(selectedClientId, { create: true }) }

  async function handleRestoreRegistered() {
    if (!workspaceId || actionRunning.current) return
    if (hasUnregisteredChanges && !window.confirm('Substituir o rascunho em edição pela última versão registrada desta operação?')) return
    actionRunning.current = true
    setBusyAction(true)
    try {
      const history = await apiFetch<ServerSnapshot[]>(`/simulations/${workspaceId}/snapshots`)
      const latest = history.find(item => item.version === registeredVersion) || history[0]
      if (!latest) { setFeedback('Esta operação ainda não possui uma versão registrada.'); return }
      setInput(cloneData(latest.input.input))
      setRecalculo(cloneData(latest.input.recalculo))
      setFicha(cloneData(latest.input.ficha))
      setRegisteredSnapshot(simulationDraftFingerprint(latest.input))
      setRegisteredAt(latest.createdAt)
      setRegisteredVersion(latest.version)
      setValidationTouched(false)
      setFeedback(`Versão ${latest.version} restaurada para edição. O salvamento automático confirma o rascunho no servidor.`)
    } catch (error) { setFeedback(`Não foi possível restaurar: ${(error as Error).message}`) }
    finally { actionRunning.current = false; setBusyAction(false) }
  }

  async function handleRestoreReference() { await switchWorkspace('', { create: true, example: true }) }

  async function handleSaveCopy() {
    if (!workspaceId || actionRunning.current) return
    actionRunning.current = true
    setBusyAction(true)
    const captured = cloneData(workspaceData)
    try {
      const created = await apiFetch<ServerWorkspace>('/simulations', {
        method: 'POST',
        headers: { 'Idempotency-Key': `browser-${crypto.randomUUID()}` },
        body: JSON.stringify({ title: `Cópia — ${captured.input.tomador || 'simulação'}`, clientId: selectedClientId || undefined, draft: captured }),
      })
      if (!await openWorkspace(selectedClientId, { id: created.id })) return
      setFeedback('Cópia salva como outra operação. A versão anterior permanece preservada.')
    } catch (error) { setFeedback(`Não foi possível salvar a cópia: ${(error as Error).message}`) }
    finally { actionRunning.current = false; setBusyAction(false) }
  }

  async function reloadWorkspace() {
    if (hasUnsavedChanges && workspaceId && !window.confirm('Reabrir a versão do servidor? Para preservar sua edição como outra operação, use “Salvar cópia” antes.')) return
    await openWorkspace(selectedClientId, workspaceId ? { id: workspaceId } : {})
  }

  function updateRoute(nextTab: TabKey, nextSistema: SistemaSimulador) {
    const params = new URLSearchParams(searchParams)
    if (nextTab === 'dados') params.delete('tab')
    else params.set('tab', nextTab)
    if (nextSistema === 'PRICE') params.delete('sistema')
    else params.set('sistema', nextSistema)
    setSearchParams(params, { replace: true })
  }

  async function changeTab(next: TabKey) {
    const requiresValidOperation = ['resumo', 'tabelas', 'comparativo', 'graficos'].includes(next)
    if (tab === 'dados' && requiresValidOperation) {
      setValidationTouched(true)
      if (!resultado) {
        setFeedback('Revise os dados destacados antes de avançar para a análise financeira.')
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
        return
      }
      setFeedback(hasUnregisteredChanges ? 'Prévia do rascunho. Registre uma versão quando concluir a conferência.' : 'Análise da versão registrada.')
    }
    setTab(next)
    updateRoute(next, sistemaTabela)
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  function changeSistemaTabela(next: SistemaSimulador) {
    setSistemaTabelaState(next)
    updateRoute(tab, next)
  }

  const [exportandoPdf, setExportandoPdf] = useState(false)
  async function handleExportPdf() {
    if (!resultado) {
      setValidationTouched(true)
      setFeedback('Corrija os dados da operação antes de exportar o relatório.')
      if (tab !== 'dados') changeTab('dados')
      return
    }
    try {
      setExportandoPdf(true)
      const report = buildSimuladorReport(input, resultado, sistemaTabela, { version: hasUnregisteredChanges ? null : registeredVersion, registeredAt: hasUnregisteredChanges ? null : registeredAt })
      await exportPDF(report)
    } catch (err) {
      console.error('[Simulador] Erro ao gerar PDF:', err)
      alert('Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setExportandoPdf(false)
    }
  }

  function changeClient(nextClientId: string) {
    if (nextClientId === selectedClientId) return
    void switchWorkspace(nextClientId)
  }

  return (
    <fieldset disabled={busyAction || storageStatus === 'initializing'} className="min-w-0 space-y-5">
      <header className="overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-none">
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_430px]">
          <PageHeader className="!mb-0" title={<>Simulador de Operação Financeira</>} eyebrow={<> <div className="inline-flex items-center gap-2 rounded-full border border-aletis-borda bg-muted px-3 py-1 text-[11px] font-body font-semibold uppercase text-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Simulador v16
            </div> </>} description={<> <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-soft)]">
              PRICE, SAC, SACRE, IOF, seguros, despesas, CET, recálculo e ficha bancária em um fluxo único de análise.
            </p>
<div className="mt-4 flex flex-wrap gap-2">
              {['PRICE', 'SAC', 'SACRE', 'CET', 'IOF', 'PDF ALETIS'].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-aletis-borda bg-card px-2.5 py-1 text-[11px] font-body font-semibold text-[var(--text-soft)]"
                >
                  {item}
                </span>
              ))}
            </div> </>} />

          <div className="grid gap-2 sm:grid-cols-2">
            <Kpi label="Taxa a.m." value={resultado ? fmtPct(resultado.taxaFinalMensal) : 'A preencher'} />
            <Kpi label="Taxa a.a." value={resultado ? fmtPct(resultado.taxaFinalAnual) : 'A preencher'} />
            <Kpi label={`CET ${sistemaTabela} a.a. · 365 dias`} value={sistemaSelecionado ? fmtPct(sistemaSelecionado.cetAnual365) : 'Não calculado'} />
            <Kpi label={`1ª prestação ${sistemaTabela}`} value={sistemaSelecionado ? fmtBRL(sistemaSelecionado.primeiraPrestacao) : 'Não calculada'} />
          </div>
        </div>

        <div className="grid gap-3 border-t border-aletis-borda bg-aletis-cream-papel/55 px-5 py-3 md:grid-cols-[minmax(260px,440px)_1fr] md:items-end">
          <label className="block text-xs font-body font-semibold text-foreground">
            Cliente do CRM
            <select
              value={selectedClientId}
              onChange={(event) => changeClient(event.target.value)}
              className="mt-1 block h-10 w-full rounded-xl border border-aletis-borda bg-card px-3 text-sm text-foreground outline-none focus:border-aletis-verde"
            >
              <option value="">Operações sem cliente / exemplos</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>{cliente.nome}{cliente.cpfCnpj ? ` · ${cliente.cpfCnpj}` : ''}</option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-relaxed text-[var(--text-soft)]">
            Cada cliente mantém suas próprias operações. Trocar o cliente abre outro cenário; nenhum valor financeiro é transportado automaticamente.
          </p>
          {workspaces.length > 0 && <label className="block text-xs font-semibold text-foreground">
            Operações deste contexto
            <select value={workspaceId} onChange={event => void switchWorkspace(selectedClientId, { id: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-aletis-borda bg-card px-3 text-sm">
              {workspaces.map(record => <option key={record.id} value={record.id}>{record.title} · {record.registeredVersion ? `versão ${record.registeredVersion}` : 'rascunho'} · {new Date(record.updatedAt).toLocaleDateString('pt-BR')}</option>)}
            </select>
          </label>}
        </div>

        <div className="flex flex-col gap-3 border-t border-aletis-borda bg-card px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3 text-xs text-[var(--text-soft)]" aria-live="polite">
            <span className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              storageStatus === 'error'
                ? 'bg-alerta/10 text-alerta'
                : hasUnregisteredChanges
                  ? 'bg-aletis-dourado/15 text-aletis-dourado-escuro'
                  : 'bg-aletis-verde/10 text-foreground',
            ].join(' ')}>
              {storageStatus === 'error'
                ? <AlertTriangle className="h-4 w-4" />
                : hasUnregisteredChanges
                  ? <HardDrive className="h-4 w-4" />
                  : <CheckCircle2 className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="font-body font-semibold text-foreground">
                {storageStatus === 'error'
                  ? 'Falha ao confirmar no servidor'
                  : storageStatus === 'initializing'
                    ? 'Conectando ao workspace...'
                  : storageStatus === 'saving' || hasUnsavedChanges
                    ? (storageStatus === 'saving' ? 'Salvando rascunho no servidor...' : 'Alterações aguardando salvamento...')
                    : hasUnregisteredChanges
                      ? `Rascunho salvo no servidor${draftAt ? ` às ${formatSavedTime(draftAt)}` : ''}`
                      : `Alterações registradas${registeredAt ? ` às ${formatSavedTime(registeredAt)}` : ''}`}
              </p>
              <p className="text-[11px] text-muted-foreground">
                O servidor é a fonte oficial; o navegador mantém apenas uma cópia de contingência.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void handleSaveCopy()} disabled={!workspaceId} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 text-xs font-semibold disabled:opacity-40">
              <FilePlus2 className="h-4 w-4" /> Salvar cópia
            </button>
            {storageStatus === 'error' && <button type="button" onClick={() => void reloadWorkspace()} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-alerta/30 px-3 text-xs font-semibold text-alerta">
              <RotateCcw className="h-4 w-4" /> Reabrir servidor
            </button>}
            <button
              type="button"
              onClick={() => void handleNewOperation()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 text-xs font-body font-semibold text-foreground transition hover:bg-aletis-bege/50"
            >
              <FilePlus2 className="h-4 w-4" />
              Nova operação
            </button>
            <button
              type="button"
              onClick={() => void handleRestoreRegistered()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 text-xs font-body font-semibold text-foreground transition hover:bg-aletis-bege/50"
              title="Descartar o rascunho e voltar à última versão registrada"
            >
              <RotateCcw className="h-4 w-4" />
              Restaurar salvo
            </button>
            <button
              type="button"
              onClick={() => void handleRestoreReference()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 text-xs font-body font-semibold text-foreground transition hover:bg-aletis-bege/50"
              title="Carregar o cenário que acompanha o arquivo Simulador v16 (1).xlsm"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exemplo v16
            </button>
            <button
              type="button"
              onClick={() => void registerWorkspace()}
              disabled={!serverReady || storageStatus === 'error'}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-aletis-verde px-3 text-xs font-body font-semibold text-white shadow-none transition hover:bg-aletis-verde-escuro"
              data-testid="register-simulation"
            >
              <Save className="h-4 w-4" />
              Registrar alterações
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-aletis-borda bg-aletis-cream-papel/65 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-body font-semibold text-[var(--text-soft)]">
              <span>Etapa {activeTabIndex + 1} de {TABS.length}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-foreground">{activeTab.label}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card">
              <div className="h-full rounded-full bg-aletis-verde transition-all" style={{ width: `${flowProgress}%` }} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => previousTab && changeTab(previousTab.key)}
              disabled={!previousTab}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 text-sm font-body font-semibold text-foreground transition hover:bg-aletis-bege/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ArrowLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => nextTab && changeTab(nextTab.key)}
              disabled={!nextTab}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 text-sm font-body font-semibold text-foreground transition hover:bg-aletis-bege/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {tab === 'dados' ? 'Analisar cenário' : 'Próxima'}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportandoPdf || !resultado}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-aletis-verde px-4 text-sm font-body font-semibold text-white shadow-none transition hover:bg-aletis-verde-escuro disabled:cursor-wait disabled:opacity-60"
              title="Gerar PDF estruturado da simulação para apresentar ao cliente"
            >
              <Download className="h-4 w-4" />
              {exportandoPdf ? 'Gerando PDF...' : 'Exportar PDF'}
            </button>
          </div>
        </div>
      </header>

      {recoveryBackup && <section className="rounded-lg border border-aletis-dourado/40 bg-aletis-dourado/5 p-4 text-sm">
        <p>Existe uma edição local diferente desta operação. A tela mostra a versão confirmada no servidor; recupere somente se quiser trabalhar sobre a cópia deste navegador.</p>
        <button type="button" onClick={() => { setInput(cloneData(recoveryBackup.input)); setRecalculo(cloneData(recoveryBackup.recalculo)); setFicha(cloneData(recoveryBackup.ficha)); setRecoveryBackup(null); setFeedback('Edição local recuperada como rascunho para conferência e salvamento.'); }} className="mt-2 rounded-xl border border-aletis-borda bg-card px-3 py-2 font-semibold">Recuperar edição local</button>
        <button type="button" onClick={() => { try { writeWorkspace(simulationStorageKey(user.id, workspaceId), workspaceData, draftAt || new Date().toISOString()) } catch { /* Preferência de recuperação opcional. */ } setRecoveryBackup(null) }} className="ml-2 px-3 py-2">Manter versão do servidor</button>
      </section>}

      {feedback && (
        <div
          className="flex items-start gap-3 rounded-lg border border-aletis-verde/25 bg-aletis-verde/5 px-4 py-3 text-sm text-foreground"
          role="status"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-4 space-y-4 rounded-lg border border-aletis-borda bg-card p-3 shadow-none">
            <div className="px-2 pt-1">
              <p className="text-[11px] font-body font-semibold uppercase text-muted-foreground">Fluxo técnico</p>
              <h2 className="mt-1 font-display text-base font-bold text-foreground">Simulação v16</h2>
            </div>
            <nav className="space-y-2">
              {TABS.map((item, index) => {
                const Icon = item.icon
                const active = tab === item.key
                const done = index < activeTabIndex
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => changeTab(item.key)}
                    className={[
                      'group w-full rounded-xl border p-3 text-left transition',
                      active
                        ? 'border-aletis-verde bg-aletis-verde text-white shadow-sm'
                        : 'border-aletis-borda bg-card text-[var(--text-soft)] hover:border-aletis-verde/40 hover:bg-aletis-bege/35',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={[
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-body font-bold',
                          active
                            ? 'border-white/25 bg-white/10 text-white'
                            : done
                              ? 'border-aletis-verde/20 bg-aletis-verde/10 text-foreground'
                              : 'border-aletis-borda bg-muted text-[var(--text-soft)]',
                        ].join(' ')}
                      >
                        {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className={['block text-[11px] font-body font-semibold uppercase', active ? 'text-white/70' : 'text-muted-foreground'].join(' ')}>
                          {item.group}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 font-display text-sm font-bold">
                          <Icon className="h-4 w-4 shrink-0" />
                          {item.short}
                        </span>
                        <span className={['mt-1 block text-xs leading-snug', active ? 'text-white/80' : 'text-muted-foreground'].join(' ')}>
                          {item.description}
                        </span>
                      </span>
                    </div>
                  </button>
                )
              })}
            </nav>
            <div className="rounded-xl border border-aletis-borda bg-aletis-cream-papel/70 p-3">
              <p className="text-[11px] font-body font-semibold uppercase text-muted-foreground">Sistema em análise</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-bold text-foreground">{sistemaTabela}</p>
                  <p className="text-xs text-[var(--text-soft)]">CET {sistemaSelecionado ? fmtPct(sistemaSelecionado.cetAnual365) : 'não calculado'} a.a.</p>
                </div>
                <Layers className="h-5 w-5 text-aletis-dourado-escuro" />
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <nav className="flex gap-2 overflow-x-auto pb-1 xl:hidden">
            {TABS.map((item) => {
              const Icon = item.icon
              const active = tab === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => changeTab(item.key)}
                  className={[
                    'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-body font-semibold transition',
                    active
                      ? 'border-aletis-verde bg-aletis-verde text-white shadow-none'
                      : 'border-aletis-borda bg-card text-[var(--text-soft)] hover:bg-aletis-cream-papel',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  {item.short}
                </button>
              )
            })}
          </nav>

          <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-aletis-borda bg-muted text-foreground">
                  <ActiveTabIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-body font-semibold uppercase text-muted-foreground">{activeTab.group}</p>
                  <h2 className="font-display text-lg font-bold text-foreground">{activeTab.label}</h2>
                  <p className="text-sm leading-relaxed text-[var(--text-soft)]">{activeTab.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Kpi label="Valor" value={fmtBRL(input.valorOperacao)} />
                <Kpi label="Parcela" value={sistemaSelecionado ? fmtBRL(sistemaSelecionado.primeiraPrestacao) : 'Não calculada'} />
                <Kpi label="Total juros" value={sistemaSelecionado ? fmtBRL(sistemaSelecionado.totalJuros) : 'Não calculado'} />
              </div>
            </div>
          </section>

      {!resultado && tab !== 'dados' && ['resumo', 'tabelas', 'comparativo', 'graficos'].includes(tab) && <CalculationIssues errors={operationCalculation.errors} />}
      {tab === 'dados' && (
        <>
          <ValidationPanel
            resultado={resultado}
            errors={operationCalculation.errors}
            emphasized={validationTouched}
          />
          <DadosTab
            input={input}
            update={update}
            updateDespesa={updateDespesa}
            updateAvulsa={updateAvulsa}
            addAvulsa={addAvulsa}
            removeAvulsa={removeAvulsa}
          />
        </>
      )}
      {tab === 'resumo' && resultado && <><CashAnalysisPanel resultado={resultado} /><ResumoTab resultado={resultado} /></>}
      {tab === 'tabelas' && resultado && (
          <TabelasTab
          sistema={sistemaTabela}
          setSistema={changeSistemaTabela}
          resultado={resultado.sistemas[sistemaTabela]}
        />
      )}
      {tab === 'comparativo' && resultado && <><CashAnalysisPanel resultado={resultado} /><ComparativoTab rows={resultado.comparativo} /></>}
      {tab === 'graficos' && resultado && (
        <GraficosTab
          chartParcelas={chartParcelas}
          chartSaldos={chartSaldos}
          chartCet={chartCet}
          chartComposicao={chartComposicao}
          chartSaldosComparativo={chartSaldosComparativo}
          sistemaTabela={sistemaTabela}
          setSistemaTabela={changeSistemaTabela}
        />
      )}
      {tab === 'recalculo' && (
        <RecalculoTab
          input={recalculo}
          setInput={setRecalculo}
          resultado={resultadoRecalculo}
          errors={recalculation.errors}
        />
      )}
      {tab === 'ficha' && (
        <FichaTab
          input={ficha}
          setInput={setFicha}
          resultado={resultadoFicha}
          errors={statementCalculation.errors}
        />
      )}
      {tab === 'auditoria' && <AuditoriaTab resultadoAtual={resultado} />}
        </main>
      </div>
    </fieldset>
  )
}

function ValidationPanel({
  resultado,
  emphasized,
  errors,
}: {
  resultado: ReturnType<typeof simularOperacaoCompleta> | null
  errors: string[]
  emphasized: boolean
}) {
  const erros = resultado?.validacao.erros ?? errors.map((mensagem, index) => ({ codigo: String(index), campo: '', mensagem }))
  const avisos = resultado?.validacao.avisos ?? []
  if (erros.length === 0 && avisos.length === 0) {
    return (
      <section className="flex items-start gap-3 rounded-lg border border-aletis-verde/25 bg-aletis-verde/5 px-4 py-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
        <div>
          <p className="text-sm font-body font-semibold text-foreground">Dados consistentes para análise</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-soft)]">
            Cada alteração já recalcula PRICE, SAC, SACRE, custos e CET. Use “Registrar alterações” para confirmar esta versão.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section
      className={[
        'rounded-lg border px-4 py-3 transition-shadow',
        erros.length
          ? 'border-alerta/35 bg-alerta/5'
          : 'border-aletis-dourado/40 bg-aletis-dourado/5',
        emphasized ? 'ring-2 ring-alerta/20' : '',
      ].join(' ')}
      role={erros.length ? 'alert' : 'status'}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className={['mt-0.5 h-5 w-5 shrink-0', erros.length ? 'text-alerta' : 'text-aletis-dourado-escuro'].join(' ')} />
        <div className="min-w-0">
          <p className="text-sm font-body font-semibold text-foreground">
            {erros.length
              ? `${erros.length} ${erros.length === 1 ? 'correção necessária' : 'correções necessárias'} antes de avançar`
              : 'Dados válidos com pontos de atenção'}
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-[var(--text-soft)]">
            {[...erros, ...avisos].map((item) => (
              <li key={`${item.codigo}-${item.campo}`} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{item.mensagem}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function CalculationIssues({ errors }: { errors: string[] }) {
  if (!errors.length) return null
  return <div role="alert" className="mb-4 rounded-xl border border-alerta/30 bg-alerta/5 p-3 text-sm text-foreground">
    <p className="font-semibold">Complete ou corrija os dados para calcular</p>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>
  </div>
}

function CashAnalysisPanel({ resultado }: { resultado: ResultadoSimuladorOperacao }) {
  const cash = simulationCashAnalysis(resultado)
  return <section className="space-y-4 rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
    <div>
      <h2 className="font-display text-lg font-bold text-foreground">Capacidade de pagamento e próximos cuidados</h2>
      <p className="mt-1 text-sm text-[var(--text-soft)]">Confira o mês mais pesado com o caixa disponível e o calendário da safra. O menor CET, isoladamente, não define a operação adequada.</p>
    </div>
    <div className="grid gap-3 lg:grid-cols-3">
      {cash.map(item => <div key={item.system} className="space-y-2 rounded-xl border border-aletis-borda bg-aletis-cream-papel/50 p-3">
        <h3 className="font-semibold text-foreground">{item.system}</h3>
        <p className="text-xs">Primeiro pagamento no cronograma: <strong>{item.firstPaymentDate ? fmtDate(item.firstPaymentDate) : 'Não previsto'}</strong></p>
        <p className="text-xs">Último pagamento no cronograma: <strong>{item.lastPaymentDate ? fmtDate(item.lastPaymentDate) : 'Não previsto'}</strong></p>
        <Metric label={item.peakMonth ? `Maior caixa no mês · ${item.peakMonth.period.slice(5)}/${item.peakMonth.period.slice(0, 4)}` : 'Maior caixa no mês'} value={item.peakMonth ? fmtBRL(item.peakMonth.amount) : 'Não calculado'} />
        <Metric label={item.peakYear ? `Maior caixa no ano · ${item.peakYear.period}` : 'Maior caixa no ano'} value={item.peakYear ? fmtBRL(item.peakYear.amount) : 'Não calculado'} />
        {resultado.sistemas[item.system].indicadores.amortizacaoAvulsaNaoAplicada > 0 && <p className="text-xs text-alerta">Amortização informada não aplicada: {fmtBRL(resultado.sistemas[item.system].indicadores.amortizacaoAvulsaNaoAplicada)}. Confira os eventos de quitação.</p>}
      </div>)}
    </div>
    <details className="rounded-xl border border-aletis-borda p-3 text-xs text-[var(--text-soft)]">
      <summary className="cursor-pointer font-semibold text-foreground">Premissas e convenções do cálculo</summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">{resultado.premissas.map(premissa => <li key={premissa}>{premissa}</li>)}</ul>
      <p className="mt-2">CET apresentado: base 365 dias, mensal equivalente. Motor: {resultado.versaoMotor}. Custos não informados não estão incluídos. Os picos de caixa somam as prestações e amortizações do cronograma; despesas debitadas na liberação reduzem o líquido creditado do resumo.</p>
    </details>
  </section>
}

function DadosTab({
  input,
  update,
  updateDespesa,
  updateAvulsa,
  addAvulsa,
  removeAvulsa,
}: {
  input: SimuladorOperacaoInput
  update: <K extends keyof SimuladorOperacaoInput>(key: K, value: SimuladorOperacaoInput[K]) => void
  updateDespesa: (id: string, patch: Partial<DespesaAcessoriaInput>) => void
  updateAvulsa: (id: string, patch: Partial<AmortizacaoAvulsaInput>) => void
  addAvulsa: () => void
  removeAvulsa: (id: string) => void
}) {
  return (
    <div className="grid gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-5">
        <Panel icon={Banknote} title="Dados da operacao">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label="Agente financeiro" value={input.agente} onChange={(v) => update('agente', v)} />
            <TextField label="Tomador" value={input.tomador} onChange={(v) => update('tomador', v)} />
            <TextField label="Contrato" value={input.contrato} onChange={(v) => update('contrato', v)} />
            <MoneyField label="Valor da operação" value={input.valorOperacao} onChange={(v) => update('valorOperacao', v)} testId="operation-value" />
            <DateField label="Data do credito" value={input.dataCredito} onChange={(v) => update('dataCredito', v)} />
            <NumberField label="Numero de parcelas" value={input.numeroParcelas} onChange={(v) => update('numeroParcelas', v)} min={1} step={1} />
          </div>
        </Panel>

        <Panel icon={Percent} title="Taxa e agenda">
          <div className="grid gap-3 md:grid-cols-2">
            <PercentField label="Tx. pre ao ano" value={input.taxaPreAnual} onChange={(v) => update('taxaPreAnual', v)} />
            <PercentField label="Tx. pos ao ano" value={input.taxaPosAnual} onChange={(v) => update('taxaPosAnual', v)} />
            <TextField label="Indexador" value={input.indexador ?? ''} onChange={(v) => update('indexador', v)} placeholder="CDI, IPCA, TR..." />
            <DateField label="1o venc. principal" value={input.primeiroVencimentoPrincipal} onChange={(v) => update('primeiroVencimentoPrincipal', v)} />
            <SelectField
              label="Freq. principal"
              value={input.periodicidadePrincipal}
              options={PERIODICIDADES.filter((p) => p.value !== 'JUNTO_PRINCIPAL')}
              onChange={(v) => {
                const periodicidade = v as PeriodicidadeSimulador
                update('periodicidadePrincipal', periodicidade)
                if (periodicidade === 'UNICA') update('numeroParcelas', 1)
              }}
            />
            <DateField label="1o venc. juros" value={input.primeiroVencimentoJuros ?? ''} onChange={(v) => update('primeiroVencimentoJuros', v)} />
            <SelectField
              label="Freq. juros"
              value={input.periodicidadeJuros}
              options={PERIODICIDADES.filter(p => p.value !== 'UNICA')}
              onChange={(v) => update('periodicidadeJuros', v as PeriodicidadeSimulador)}
            />
            <SelectField
              label="Juros ate"
              value={input.jurosAte}
              options={[
                { value: 'PRIMEIRA_PRINCIPAL', label: '1a parcela principal' },
                { value: 'FINAL', label: 'Final da operacao' },
              ]}
              onChange={(v) => update('jurosAte', v as SimuladorOperacaoInput['jurosAte'])}
            />
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel icon={Shield} title="Seguro e IOF">
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle label="Seguro de vida" checked={input.seguroVidaAtivo} onChange={(v) => update('seguroVidaAtivo', v)} />
            <Toggle label="Seguro financiado" checked={input.seguroFinanciado} onChange={(v) => update('seguroFinanciado', v)} />
            <SelectField
              label="Forma do seguro"
              value={input.seguroForma}
              options={[
                { value: 'PERCENTUAL_SALDO', label: '% mensal s/ saldo' },
                { value: 'VALOR_FIXO', label: 'Valor fixo' },
              ]}
              onChange={(v) => update('seguroForma', v as SimuladorOperacaoInput['seguroForma'])}
            />
            {input.seguroForma === 'PERCENTUAL_SALDO' ? (
              <PercentField label="% mensal seguro" value={input.seguroPercentualMensal} onChange={(v) => update('seguroPercentualMensal', v)} />
            ) : (
              <MoneyField label="Valor do seguro" value={input.seguroValor} onChange={(v) => update('seguroValor', v)} />
            )}
            <Toggle label="IOF" checked={input.iofAtivo} onChange={(v) => update('iofAtivo', v)} />
            <Toggle
              label="IOF diário PF/PJ"
              checked={input.iofDiarioAtivo !== false}
              onChange={(v) => update('iofDiarioAtivo', v)}
            />
            <Toggle label="IOF financiado" checked={input.iofFinanciado} onChange={(v) => update('iofFinanciado', v)} />
            <SelectField
              label="Pessoa"
              value={input.iofPessoa}
              options={[
                { value: 'PF', label: 'Pessoa fisica' },
                { value: 'PJ', label: 'Pessoa juridica' },
              ]}
              onChange={(v) => update('iofPessoa', v as SimuladorOperacaoInput['iofPessoa'])}
            />
            <Toggle label="IOF adicional 0,38%" checked={input.iofAdicionalAtivo} onChange={(v) => update('iofAdicionalAtivo', v)} />
          </div>
        </Panel>

        <Panel icon={ReceiptText} title="Despesas acessorias">
          <div className="space-y-2">
            {input.despesas.map((item) => (
              <div key={item.id} className="grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_150px_110px]">
                <TextField label={item.descricao} value={item.descricao} onChange={(v) => updateDespesa(item.id, { descricao: v })} />
                <MoneyField label="Valor" value={item.valor} onChange={(v) => updateDespesa(item.id, { valor: v })} />
                <Toggle label="Financiar" checked={item.financiar} onChange={(v) => updateDespesa(item.id, { financiar: v })} compact />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel icon={Table2} title="Amortizacoes avulsas">
        <div className="space-y-2">
          {(input.amortizacoesAvulsas ?? []).map((item) => (
            <div key={item.id} className="grid gap-2 md:grid-cols-[160px_160px_1fr_40px]">
              <DateField label="Data" value={item.data} onChange={(v) => updateAvulsa(item.id, { data: v })} />
              <MoneyField label="Valor" value={item.valor} onChange={(v) => updateAvulsa(item.id, { valor: v })} />
              <TextField label="Descricao" value={item.descricao ?? ''} onChange={(v) => updateAvulsa(item.id, { descricao: v })} />
              <button
                type="button"
                onClick={() => removeAvulsa(item.id)}
                className="mt-6 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-alerta/10 text-alerta hover:bg-alerta/20"
                aria-label="Remover amortizacao avulsa"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addAvulsa}
            className="inline-flex items-center gap-2 rounded-xl bg-aletis-verde px-3 py-2 text-sm font-body font-semibold text-white hover:bg-aletis-verde-escuro"
          >
            <Plus className="h-4 w-4" />
            Adicionar amortizacao
          </button>
        </div>
      </Panel>
    </div>
  )
}

function ResumoTab({ resultado }: { resultado: ReturnType<typeof simularOperacaoCompleta> }) {
  const menorCet = resultado.resumo.reduce((best, item) =>
    item.cetAnual365 < best.cetAnual365 ? item : best,
  resultado.resumo[0])
  const menorJuros = resultado.resumo.reduce((best, item) =>
    item.totalJuros < best.totalJuros ? item : best,
  resultado.resumo[0])
  const menorPrimeira = resultado.resumo.reduce((best, item) =>
    item.primeiraPrestacao < best.primeiraPrestacao ? item : best,
  resultado.resumo[0])
  const cets = resultado.resumo.map((item) => item.cetAnual365)
  const cetEquivalente = Math.max(...cets) - Math.min(...cets) < 0.0000001

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <div className="flex items-start gap-3">
          <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
          <div>
            <h2 className="font-display text-base font-bold text-foreground">Leitura para decisão</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
              O melhor sistema depende do objetivo de caixa. O simulador separa custo total, parcela inicial e CET para evitar uma recomendação baseada em apenas um indicador.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <DecisionMetric
            label="Menor total de juros"
            system={menorJuros.sistema}
            value={fmtBRL(menorJuros.totalJuros)}
            detail="Menor custo nominal no cronograma"
          />
          <DecisionMetric
            label="Menor 1ª prestação"
            system={menorPrimeira.sistema}
            value={fmtBRL(menorPrimeira.primeiraPrestacao)}
            detail="Menor pressão inicial sobre o caixa"
          />
          <DecisionMetric
            label={cetEquivalente ? 'CET equivalente' : 'Menor CET anual'}
            system={cetEquivalente ? 'PRICE · SAC · SACRE' : menorCet.sistema}
            value={fmtPct(menorCet.cetAnual365)}
            detail={cetEquivalente ? 'Mesmo fluxo de custos nesta configuração' : 'Menor custo efetivo anual estimado'}
          />
        </div>
      </section>

      <div className="grid gap-3">
        {resultado.resumo.map((item) => (
          <section
            key={item.sistema}
            className={[
              'rounded-lg border bg-card p-4 shadow-none',
              'border-aletis-borda',
            ].join(' ')}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-bold text-foreground">{item.sistema}</h2>
                  {cetEquivalente && (
                    <span className="rounded-full border border-aletis-verde/25 bg-aletis-verde/10 px-2 py-0.5 text-[11px] font-body font-semibold text-foreground">
                      CET equivalente
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
                  Valor financiado, liquidez, prestação e custo total calculados para este sistema.
                </p>
              </div>
              <span className="w-fit rounded-full border border-aletis-dourado/30 bg-aletis-dourado/15 px-2.5 py-1 text-xs font-body font-semibold text-aletis-dourado-escuro">
                CET {fmtPct(item.cetAnual365)} a.a.
              </span>
            </div>
            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
              <Metric label="Valor financiado" value={fmtBRL(item.valorFinanciado)} />
              <Metric label="Liquido creditado" value={fmtBRL(item.valorLiquidoCreditado)} />
              <Metric label="1a prestacao" value={fmtBRL(item.primeiraPrestacao)} />
              <Metric label="Total juros" value={fmtBRL(item.totalJuros)} />
              <Metric label="Total prestacoes" value={fmtBRL(item.totalPrestacoes)} />
              <Metric label="Saldo final" value={fmtBRL(item.saldoFinal)} />
            </div>
          </section>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-none">
        <div className="overflow-x-auto">
          <table className="ui-table w-full min-w-[740px] text-sm">
            <thead className="bg-muted text-left text-xs font-body uppercase text-[var(--text-soft)]">
              <tr>
                <th className="px-4 py-3">Descricao</th>
                {resultado.resumo.map((item) => (
                  <th key={item.sistema} className="px-4 py-3">{item.sistema}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-aletis-borda">
              {[
                ['Valor da operacao', (i: typeof resultado.resumo[number]) => fmtBRL(i.valorOperacao)],
                ['Despesas acessorias', (i: typeof resultado.resumo[number]) => fmtBRL(i.custos.despesasTotal)],
                ['Seguro de vida', (i: typeof resultado.resumo[number]) => fmtBRL(i.custos.seguroTotal)],
                ['IOF diário PF/PJ', (i: typeof resultado.resumo[number]) => fmtBRL(i.custos.iofDiario)],
                ['IOF adicional 0,38%', (i: typeof resultado.resumo[number]) => fmtBRL(i.custos.iofAdicional)],
                ['IOF total', (i: typeof resultado.resumo[number]) => fmtBRL(i.custos.iofTotal)],
                ['Valor financiado', (i: typeof resultado.resumo[number]) => fmtBRL(i.valorFinanciado)],
                ['Valores debitados', (i: typeof resultado.resumo[number]) => fmtBRL(i.custos.valoresDebitados)],
                ['Valor liquido creditado', (i: typeof resultado.resumo[number]) => fmtBRL(i.valorLiquidoCreditado)],
                ['1a prestacao', (i: typeof resultado.resumo[number]) => fmtBRL(i.primeiraPrestacao)],
                ['CET mensal', (i: typeof resultado.resumo[number]) => fmtPct(i.cetMensal365)],
                ['CET anual', (i: typeof resultado.resumo[number]) => fmtPct(i.cetAnual365)],
              ].map(([label, getter]) => (
                <tr key={label as string} className="text-foreground">
                  <td className="px-4 py-3 font-semibold">{label as string}</td>
                  {resultado.resumo.map((item) => (
                    <td key={item.sistema} className="max-w-[220px] px-4 py-3 font-mono text-sm leading-snug [overflow-wrap:anywhere]">
                      {(getter as (i: typeof item) => string)(item)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function TabelasTab({
  sistema,
  setSistema,
  resultado,
}: {
  sistema: SistemaSimulador
  setSistema: (sistema: SistemaSimulador) => void
  resultado: ReturnType<typeof simularOperacaoCompleta>['sistemas'][SistemaSimulador]
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {SISTEMAS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSistema(item)}
              className={[
                'rounded-xl border px-4 py-2 text-sm font-body font-semibold transition',
                sistema === item
                  ? 'border-aletis-verde bg-aletis-verde text-white'
                  : 'border-aletis-borda bg-card text-[var(--text-soft)] hover:bg-aletis-cream-papel',
              ].join(' ')}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Kpi label="Total" value={fmtBRL(resultado.indicadores.totalPrestacoes)} />
          <Kpi label="Juros" value={fmtBRL(resultado.indicadores.totalJuros)} />
          <Kpi label="CET a.a." value={fmtPct(resultado.indicadores.cetAnual365)} />
        </div>
      </div>
      <AmortizacaoTable linhas={resultado.linhas} />
    </div>
  )
}

function ComparativoTab({ rows }: { rows: ReturnType<typeof simularOperacaoCompleta>['comparativo'] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-none">
      <div className="max-h-[680px] overflow-auto">
        <table className="ui-table w-full min-w-[820px] text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-body uppercase text-[var(--text-soft)]">
            <tr>
              <th className="px-4 py-3">N</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Descricao</th>
              <th className="px-4 py-3 text-right">PRICE</th>
              <th className="px-4 py-3 text-right">SAC</th>
              <th className="px-4 py-3 text-right">SACRE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-aletis-borda">
            {rows.map((row) => (
              <tr key={`${row.n}-${row.data}`} className="text-foreground">
                <td className="px-4 py-3 font-mono">{row.n}</td>
                <td className="px-4 py-3">{fmtDate(row.data)}</td>
                <td className="px-4 py-3">{row.descricao}</td>
                <td className="max-w-[170px] px-4 py-3 text-right font-mono leading-snug [overflow-wrap:anywhere]">{fmtBRL(row.price)}</td>
                <td className="max-w-[170px] px-4 py-3 text-right font-mono leading-snug [overflow-wrap:anywhere]">{fmtBRL(row.sac)}</td>
                <td className="max-w-[170px] px-4 py-3 text-right font-mono leading-snug [overflow-wrap:anywhere]">{fmtBRL(row.sacre)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function GraficosTab({
  chartParcelas,
  chartSaldos,
  chartCet,
  chartComposicao,
  chartSaldosComparativo,
  sistemaTabela,
  setSistemaTabela,
}: {
  chartParcelas: Array<{ data: string; PRICE: number; SAC: number; SACRE: number }>
  chartSaldos: Array<{ data: string; saldo: number }>
  chartCet: Array<{ sistema: string; mensal: number; anual: number }>
  chartComposicao: Array<{ data: string; juros: number; amortizacao: number }>
  chartSaldosComparativo: Array<{ data: string; PRICE: number; SAC: number; SACRE: number }>
  sistemaTabela: SistemaSimulador
  setSistemaTabela: (s: SistemaSimulador) => void
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <ChartPanel title="Parcelas — PRICE × SAC × SACRE">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartParcelas} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e1d2" />
            <XAxis dataKey="data" minTickGap={32} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => compactBRL(Number(v))} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmtBRL(Number(v))} />
            <Legend />
            <Line type="monotone" dataKey="PRICE" stroke="#14532d" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="SAC" stroke="#b45309" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="SACRE" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Saldo devedor">
        <div className="mb-3 flex gap-2">
          {SISTEMAS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSistemaTabela(item)}
              className={[
                'rounded-md px-2.5 py-1 text-xs font-semibold',
                sistemaTabela === item ? 'bg-aletis-verde text-white' : 'bg-aletis-cream text-foreground',
              ].join(' ')}
            >
              {item}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={244}>
          <AreaChart data={chartSaldos} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14532d" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#14532d" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e1d2" />
            <XAxis dataKey="data" minTickGap={32} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => compactBRL(Number(v))} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmtBRL(Number(v))} />
            <Area type="monotone" dataKey="saldo" stroke="#14532d" strokeWidth={2.5} fill="url(#saldoGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="CET — Mensal × Anual">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartCet} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e1d2" />
            <XAxis dataKey="sistema" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `${fmtNum(Number(v), 1)}%`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => `${fmtNum(Number(v), 2)}%`} />
            <Legend />
            <Bar dataKey="mensal" name="Mensal" fill="#c6922c" radius={[4, 4, 0, 0]} />
            <Bar dataKey="anual" name="Anual" fill="#14532d" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title={`Composição da prestação — ${sistemaTabela}`}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartComposicao} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e1d2" />
            <XAxis dataKey="data" minTickGap={32} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => compactBRL(Number(v))} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmtBRL(Number(v))} />
            <Legend />
            <Bar dataKey="amortizacao" name="Amortização" stackId="p" fill="#14532d" />
            <Bar dataKey="juros" name="Juros" stackId="p" fill="#c6922c" />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Saldo devedor comparativo — PRICE × SAC × SACRE" className="xl:col-span-2">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartSaldosComparativo} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e1d2" />
            <XAxis dataKey="data" minTickGap={32} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => compactBRL(Number(v))} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmtBRL(Number(v))} />
            <Legend />
            <Line type="monotone" dataKey="PRICE" stroke="#14532d" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="SAC" stroke="#b45309" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="SACRE" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  )
}

function RecalculoTab({
  input,
  setInput,
  resultado,
  errors,
}: {
  input: RecalculoOperacaoInput
  setInput: (updater: RecalculoOperacaoInput | ((prev: RecalculoOperacaoInput) => RecalculoOperacaoInput)) => void
  resultado: ReturnType<typeof calcularRecalculoOperacao> | null
  errors: string[]
}) {
  function update<K extends keyof RecalculoOperacaoInput>(key: K, value: RecalculoOperacaoInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }))
  }
  function updateParcela(id: string, patch: Partial<RecalculoParcelaInput>) {
    setInput((prev) => ({
      ...prev,
      parcelas: prev.parcelas.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }
  function addParcela() {
    setInput((prev) => ({
      ...prev,
      parcelas: [...prev.parcelas, { id: newId('recalc'), data: prev.dataInicial, valor: 0 }],
    }))
  }
  function removeParcela(id: string) {
    setInput((prev) => ({ ...prev, parcelas: prev.parcelas.filter((item) => item.id !== id) }))
  }

  return (
    <div className="grid gap-5 2xl:grid-cols-[420px_1fr]">
      <Panel icon={Banknote} title="Recalculo de operacoes">
        <CalculationIssues errors={errors} />
        <p className="mb-3 text-xs leading-relaxed text-[var(--text-soft)]">
          Informe os custos como valor positivo. Para manter paridade com a planilha v16, o quadro apresenta esse custo como ajuste negativo no total líquido com estruturação.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField label="Data inicial" value={input.dataInicial} onChange={(v) => update('dataInicial', v)} />
          <MoneyField label="Valor do credito" value={input.valorCredito} onChange={(v) => update('valorCredito', v)} />
          <MoneyField label="Entrada" value={input.entrada} onChange={(v) => update('entrada', v)} />
          <MoneyField label="Custos acessorios" value={input.custosAcessorios} onChange={(v) => update('custosAcessorios', v)} />
          <PercentField label="Taxa ao mes" value={input.taxaMensal} onChange={(v) => update('taxaMensal', v)} />
          <SelectField
            label="Periodicidade"
            value={input.periodicidade}
            options={PERIODICIDADES.filter((p) => !['UNICA', 'JUNTO_PRINCIPAL'].includes(p.value))}
            onChange={(v) => update('periodicidade', v as RecalculoOperacaoInput['periodicidade'])}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="Valor financiado" value={resultado ? fmtBRL(resultado.valorFinanciado) : 'Não calculado'} />
          <Metric label="Total parcelas" value={resultado ? fmtBRL(resultado.totalParcelas) : 'Não calculado'} />
          <Metric label="Total líquido c/ estruturação" value={resultado ? fmtBRL(resultado.totalComEstruturacao) : 'Não calculado'} />
          <Metric label="Ajuste de estruturação" value={resultado ? fmtBRL(resultado.diferenca) : 'Não calculado'} />
          <Metric label="Taxa do fluxo financiado · 365 dias" value={resultado ? fmtPct(resultado.cetAnual365) : 'Não calculado'} />
          <Metric label="Crédito líquido" value={resultado ? fmtBRL(resultado.valorLiquidoCreditado) : 'Não calculado'} />
          <Metric label="CET sobre o crédito líquido · 365 dias" value={resultado ? fmtPct(resultado.cetLiquidoAnual365) : 'Não calculado'} />
          <Metric label="Valor presente à taxa informada" value={resultado ? fmtBRL(resultado.valorPresenteParcelas) : 'Não calculado'} />
          <Metric label="Diferença de valor presente" value={resultado ? fmtBRL(resultado.diferencaValorPresente) : 'Não calculado'} />
        </div>
        {resultado && <div className="mt-4 rounded-xl border border-aletis-dourado/30 bg-aletis-dourado/5 p-3 text-xs">
          <p className="font-semibold text-foreground">Encontrar condições compatíveis com a taxa informada</p>
          <p className="mt-1">Mantendo datas e parcelas, o cálculo aponta as seguintes alternativas para negociação. Os valores abaixo não alteram o cenário automaticamente.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Metric label="Crédito compatível com a taxa" value={fmtBRL(resultado.creditoCompativelTaxaInformada)} />
            <Metric label={resultado.ajusteParaTaxaInformadaRequerDesconto ? 'Desconto necessário (valor negativo)' : 'Custos compatíveis com a taxa'} value={fmtBRL(resultado.custosAcessoriosCompativeisTaxaInformada)} />
          </div>
          <p className="mt-2">A taxa informada desconta as parcelas para valor presente, com mês de 30 dias, conforme a planilha. O CET sobre o líquido usa o crédito efetivamente recebido e as parcelas; a taxa do fluxo financiado inclui custos no valor inicial.</p>
        </div>}
      </Panel>

      <section className="overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-none">
        <div className="flex items-center justify-between border-b border-aletis-borda bg-aletis-cream-papel/45 px-4 py-3">
          <h2 className="font-display text-base font-bold text-foreground">Plano de pagamento</h2>
          <button type="button" onClick={addParcela} className="inline-flex items-center gap-2 rounded-xl bg-aletis-verde px-3 py-2 text-sm font-body font-semibold text-white">
            <Plus className="h-4 w-4" /> Parcela
          </button>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="ui-table w-full min-w-[620px] text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs font-body uppercase text-[var(--text-soft)]">
              <tr>
                <th className="px-4 py-3">Parc.</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Fluxo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-aletis-borda">
              {input.parcelas.map((item, index) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-mono">{index + 1}</td>
                  <td className="px-4 py-3"><InlineDate value={item.data} onChange={(v) => updateParcela(item.id, { data: v })} /></td>
                  <td className="px-4 py-3"><InlineMoney value={item.valor} onChange={(v) => updateParcela(item.id, { valor: v })} /></td>
                  <td className="px-4 py-3 font-mono">{Number.isFinite(item.valor) ? fmtBRL(-Math.abs(item.valor)) : 'Não calculado'}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => removeParcela(item.id)} className="rounded-md p-2 text-alerta hover:bg-alerta/10" aria-label="Remover parcela">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function FichaTab({
  input,
  setInput,
  resultado,
  errors,
}: {
  input: FichaBancariaInput
  setInput: (updater: FichaBancariaInput | ((prev: FichaBancariaInput) => FichaBancariaInput)) => void
  resultado: ReturnType<typeof calcularFichaBancaria> | null
  errors: string[]
}) {
  function update<K extends keyof FichaBancariaInput>(key: K, value: FichaBancariaInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }))
  }
  function updateEvento(id: string, patch: Partial<FichaBancariaEventoInput>) {
    setInput((prev) => ({
      ...prev,
      eventos: prev.eventos.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }
  function addEvento() {
    setInput((prev) => ({
      ...prev,
      eventos: [...prev.eventos, { id: newId('ficha'), data: prev.dataInicio, evento: 'Juros/Amortizacao', amortizacao: 0 }],
    }))
  }
  function removeEvento(id: string) {
    setInput((prev) => ({ ...prev, eventos: prev.eventos.filter((item) => item.id !== id) }))
  }

  return (
    <div className="space-y-5">
      <Panel icon={FileSpreadsheet} title="Ficha grafica bancaria">
        <CalculationIssues errors={errors} />
        <div className="grid gap-3 md:grid-cols-4">
          <PercentField label="Taxa de juros a.m." value={input.taxaMensal} onChange={(v) => update('taxaMensal', v)} />
          <MoneyField label="Valor da operacao" value={input.valorOperacao} onChange={(v) => update('valorOperacao', v)} />
          <DateField label="Data inicio" value={input.dataInicio} onChange={(v) => update('dataInicio', v)} />
          <Metric label="Saldo atualizado" value={resultado ? fmtBRL(resultado.saldoAtual) : 'Não calculado'} />
        </div>
      </Panel>

      <section className="overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-none">
        <div className="flex items-center justify-between border-b border-aletis-borda bg-aletis-cream-papel/45 px-4 py-3">
          <div className="flex flex-wrap gap-3">
            <Kpi label="Juros total" value={resultado ? fmtBRL(resultado.totalJuros) : 'Não calculado'} />
            <Kpi label="Amortizacoes" value={resultado ? fmtBRL(resultado.totalAmortizacoes) : 'Não calculado'} />
            <Kpi label="Taxa a.d." value={resultado ? fmtPct(resultado.taxaDiaria, 4) : 'Não calculada'} />
            <Kpi label="Pagamentos informados" value={resultado ? fmtBRL(resultado.totalPagamentosInformados) : 'Não calculado'} />
            <Kpi label="Excedente não aplicado" value={resultado ? fmtBRL(resultado.totalExcedente) : 'Não calculado'} />
          </div>
          <button type="button" onClick={addEvento} className="inline-flex items-center gap-2 rounded-xl bg-aletis-verde px-3 py-2 text-sm font-body font-semibold text-white">
            <Plus className="h-4 w-4" /> Evento
          </button>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="ui-table w-full min-w-[920px] text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs font-body uppercase text-[var(--text-soft)]">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Dias</th>
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3 text-right">Valor nominal</th>
                <th className="px-4 py-3 text-right">Juros periodo</th>
                <th className="px-4 py-3 text-right">Pagamento informado</th>
                <th className="px-4 py-3 text-right">Aplicado / excedente</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-aletis-borda">
              {(resultado?.linhas ?? input.eventos.map(evento => ({ ...evento, dias: 0, valorNominal: Number.NaN, jurosPeriodo: Number.NaN, saldoAtualizado: Number.NaN, excedente: Number.NaN }))).map((linha) => {
                const original = input.eventos.find((e) => e.id === linha.id)
                return (
                  <tr key={linha.id} className="text-foreground">
                    <td className="px-4 py-3">
                      {original ? <InlineDate value={original.data} onChange={(v) => updateEvento(original.id, { data: v })} /> : fmtDate(linha.data)}
                    </td>
                    <td className="px-4 py-3 font-mono">{resultado ? linha.dias : '—'}</td>
                    <td className="px-4 py-3">
                      {original ? (
                        <input
                          value={original.evento}
                          onChange={(e) => updateEvento(original.id, { evento: e.target.value })}
                          className="w-full rounded-lg border border-aletis-borda px-2 py-1 text-sm outline-none focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/15"
                        />
                      ) : linha.evento}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtBRL(linha.valorNominal)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtBRL(linha.jurosPeriodo)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {original ? <InlineMoney value={original.amortizacao} onChange={(v) => updateEvento(original.id, { amortizacao: v })} /> : fmtBRL(linha.amortizacao)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">{resultado ? `${fmtBRL(linha.amortizacao)} / ${fmtBRL(linha.excedente)}` : 'Não calculado'}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtBRL(linha.saldoAtualizado)}</td>
                    <td className="px-4 py-3 text-right">
                      {original && (
                        <button type="button" onClick={() => removeEvento(original.id)} className="rounded-md p-2 text-alerta hover:bg-alerta/10" aria-label="Remover evento">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function AuditoriaTab({ resultadoAtual }: { resultadoAtual: ReturnType<typeof simularOperacaoCompleta> | null }) {
  const referencia = useMemo(() => simularOperacaoCompleta(DEFAULT_INPUT), [])
  const esperado = {
    PRICE: { primeira: 53_457.407218014734, juros: 491_925.58507658355 },
    SAC: { primeira: 56_190.72845005858, juros: 479_108.5311764784 },
    SACRE: { primeira: 39_673.29084500586, juros: 514_460.91624589707 },
  } as const
  const rows = [
    ['TUTORIAL', 'Orientação substituída por fluxo guiado, validação e mensagens de registro.', 'Melhorado'],
    ['TELA INICIAL', 'Consolidada no cabeçalho com ações, estado do rascunho e indicadores.', 'Melhorado'],
    ['PAINEL DE DADOS', 'Inputs, agenda, taxas, despesas, seguro, IOF e amortizações avulsas.', 'Coberto'],
    ['RESUMO DA OPERAÇÃO', 'Operação, custos, líquido, prestações, CET e leitura para decisão.', 'Coberto'],
    ['PRICE', 'Tabela por dias corridos, seguro, IOF, fluxo e CET.', 'Conferido'],
    ['SAC', 'Amortização constante, juros, seguro, IOF, fluxo e CET.', 'Conferido'],
    ['SACRE', 'Amortização recalculada e juros da tranche conforme o cenário v16.', 'Conferido'],
    ['ANÁLISE COMPARATIVA', 'PRICE × SAC × SACRE parcela a parcela.', 'Coberto'],
    ['GRÁF. CET', 'Gráfico nativo, responsivo e alimentado pelo cálculo atual.', 'Coberto'],
    ['GRÁF. PARCELAS', 'Parcelas comparadas com tooltip e seleção de sistema.', 'Coberto'],
    ['GRÁF. SLD. DEVEDOR', 'Saldo individual e comparativo dos três sistemas.', 'Coberto'],
    ['RECÁLCULO DE OPERAÇÕES', 'Fluxo, CET e sinal do custo de estruturação normalizado.', 'Conferido'],
    ['FICHA GRÁFICA BANCÁRIA', 'Saldo por evento, juros diários e amortizações editáveis.', 'Coberto'],
  ]
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Abas catalogadas" value="13 de 13" />
        <Metric label="Sistemas conferidos" value="PRICE · SAC · SACRE" />
        <Metric label="Tolerância monetária" value="Até R$ 0,05" />
        <Metric
          label="Cenário atual"
          value={resultadoAtual ? 'Dados consistentes' : 'Dados a conferir'}
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-none">
        <div className="border-b border-aletis-borda bg-aletis-cream-papel/45 px-4 py-3">
          <h2 className="font-display text-base font-bold text-foreground">Paridade do cenário de referência</h2>
          <p className="mt-1 text-xs text-[var(--text-soft)]">Valores extraídos do arquivo “Simulador v16 (1).xlsm” e protegidos por testes automatizados.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="ui-table w-full min-w-[760px] text-sm">
            <thead className="bg-muted text-left text-xs font-body uppercase text-[var(--text-soft)]">
              <tr>
                <th className="px-4 py-3">Sistema</th>
                <th className="px-4 py-3 text-right">1ª prestação v16</th>
                <th className="px-4 py-3 text-right">1ª prestação nativa</th>
                <th className="px-4 py-3 text-right">Total juros v16</th>
                <th className="px-4 py-3 text-right">Diferença</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-aletis-borda">
              {SISTEMAS.map((sistema) => {
                const atual = referencia.sistemas[sistema].indicadores
                const diferenca = atual.totalJuros - esperado[sistema].juros
                return (
                  <tr key={sistema}>
                    <td className="px-4 py-3 font-semibold text-foreground">{sistema}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtBRL(esperado[sistema].primeira)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtBRL(atual.primeiraPrestacao)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtBRL(esperado[sistema].juros)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtBRL(diferenca)}</td>
                    <td className="px-4 py-3">
                      <span className={Math.abs(diferenca) <= 0.05 && Math.abs(atual.primeiraPrestacao - esperado[sistema].primeira) <= 0.05 ? 'text-foreground' : 'text-alerta'}>{Math.abs(diferenca) <= 0.05 && Math.abs(atual.primeiraPrestacao - esperado[sistema].primeira) <= 0.05 ? 'Conferido' : 'Divergência a revisar'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-aletis-borda bg-card shadow-none">
        <table className="ui-table w-full min-w-[820px] text-sm">
          <thead className="bg-muted text-left text-xs font-body uppercase text-[var(--text-soft)]">
            <tr>
              <th className="px-4 py-3">Aba original</th>
              <th className="px-4 py-3">Implementação nativa</th>
              <th className="px-4 py-3">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-aletis-borda">
            {rows.map(([sheet, coverage, status]) => (
              <tr key={sheet}>
                <td className="px-4 py-3 font-semibold text-foreground">{sheet}</td>
                <td className="px-4 py-3 text-foreground">{coverage}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-aletis-verde/10 px-2 py-1 text-xs font-semibold text-foreground">{status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-aletis-dourado/30 bg-aletis-dourado/5 p-4 text-sm text-foreground">
        <h2 className="font-display font-semibold text-foreground">Notas técnicas da migração</h2>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-[var(--text-soft)]">
          <li>• A planilha possui macros VBA; o sistema substitui os cálculos centrais por funções TypeScript testáveis, sem depender da execução de macros no navegador.</li>
          <li>• O intervalo nomeado <span className="font-mono">NM_SeguroVlr</span> está quebrado no arquivo original (<span className="font-mono">#REF!</span>); a tela nativa usa campos tipados e não herda essa referência inválida.</li>
          <li>• O original limita as tabelas a aproximadamente 512 linhas; o fluxo nativo valida até 500 parcelas e preserva a edição com rascunho local.</li>
        </ul>
      </section>
    </div>
  )
}

function AmortizacaoTable({ linhas }: { linhas: ReturnType<typeof simularOperacaoCompleta>['sistemas'][SistemaSimulador]['linhas'] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-none">
      <div className="max-h-[680px] overflow-auto">
        <table className="ui-table w-full min-w-[1120px] text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-body uppercase text-[var(--text-soft)]">
            <tr>
              <th className="px-4 py-3">N</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Descricao</th>
              <th className="px-4 py-3 text-right">Dias</th>
              <th className="px-4 py-3 text-right">Saldo inicial</th>
              <th className="px-4 py-3 text-right">Juros</th>
              <th className="px-4 py-3 text-right">Amortizacao</th>
              <th className="px-4 py-3 text-right">Seguro</th>
              <th className="px-4 py-3 text-right">IOF</th>
              <th className="px-4 py-3 text-right">Prestacao</th>
              <th className="px-4 py-3 text-right">Saldo devedor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-aletis-borda">
            {linhas.map((linha) => (
              <tr key={`${linha.n}-${linha.data}`} className="text-foreground">
                <td className="px-4 py-3 font-mono">{linha.n}</td>
                <td className="px-4 py-3">{fmtDate(linha.data)}</td>
                <td className="px-4 py-3">{linha.descricao}</td>
                <td className="px-4 py-3 text-right font-mono">{linha.dias}</td>
                <td className="max-w-[150px] px-4 py-3 text-right font-mono leading-snug [overflow-wrap:anywhere]">{fmtBRL(linha.saldoInicial)}</td>
                <td className="max-w-[150px] px-4 py-3 text-right font-mono leading-snug [overflow-wrap:anywhere]">{fmtBRL(linha.juros)}</td>
                <td className="max-w-[150px] px-4 py-3 text-right font-mono leading-snug [overflow-wrap:anywhere]">{fmtBRL(linha.amortizacao)}</td>
                <td className="max-w-[150px] px-4 py-3 text-right font-mono leading-snug [overflow-wrap:anywhere]">{fmtBRL(linha.seguro)}</td>
                <td className="max-w-[150px] px-4 py-3 text-right font-mono leading-snug [overflow-wrap:anywhere]">{fmtBRL(linha.iof)}</td>
                <td className="max-w-[150px] px-4 py-3 text-right font-mono leading-snug [overflow-wrap:anywhere]">{fmtBRL(linha.prestacao)}</td>
                <td className="max-w-[150px] px-4 py-3 text-right font-mono leading-snug [overflow-wrap:anywhere]">{fmtBRL(linha.saldoDevedor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Panel({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-aletis-borda bg-muted text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-display text-base font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function ChartPanel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={['rounded-lg border border-aletis-borda bg-card p-4 shadow-none', className ?? ''].join(' ').trim()}>
      <h2 className="mb-3 font-display text-base font-bold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[136px] max-w-full flex-1 rounded-xl border border-aletis-borda bg-card px-3 py-2 shadow-none">
      <p className="truncate text-[11px] font-body font-semibold uppercase text-muted-foreground" title={label}>{label}</p>
      <p
        className="mt-0.5 max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-bold leading-tight text-foreground"
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[72px] min-w-0 flex-col justify-between rounded-xl border border-aletis-borda bg-aletis-cream-papel/60 px-3 py-2">
      <p className="text-[11px] font-body font-semibold uppercase leading-snug text-muted-foreground">{label}</p>
      <p
        className="mt-1 max-w-full break-words font-mono text-[13px] font-semibold leading-tight text-foreground [overflow-wrap:anywhere]"
        title={value}
      >
        {value}
      </p>
    </div>
  )
}

function DecisionMetric({ label, system, value, detail }: { label: string; system: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-aletis-borda bg-aletis-cream-papel/45 p-3">
      <p className="text-[11px] font-body font-semibold uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-base font-bold text-foreground">{system}</p>
        <p className="font-mono text-sm font-semibold text-foreground">{value}</p>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-[var(--text-soft)]">{detail}</p>
    </div>
  )
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-xs font-body font-semibold text-[var(--text-soft)]">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-aletis-grafite-claro/70 focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/15"
      />
    </label>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs font-body font-semibold text-[var(--text-soft)]">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/15"
      />
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  step = 0.01,
  testId,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  step?: number
  testId?: string
}) {
  return (
    <label className="block text-xs font-body font-semibold text-[var(--text-soft)]">
      {label}
      <input
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value.trim() === '' ? Number.NaN : Number(e.target.value))}
        data-testid={testId}
        className="mt-1 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/15"
      />
    </label>
  )
}

function MoneyField({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId?: string }) {
  return <NumberField label={label} value={value} onChange={onChange} min={0} step={0.01} testId={testId} />
}

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs font-body font-semibold text-[var(--text-soft)]">
      {label}
      <div className="relative mt-1">
        <input
          type="number"
          step={0.01}
          value={Number.isFinite(value) ? roundDisplay(value * 100) : ''}
          onChange={(e) => onChange(e.target.value.trim() === '' ? Number.NaN : Number(e.target.value) / 100)}
          className="w-full rounded-xl border border-aletis-borda bg-card px-3 py-2 pr-8 text-sm text-foreground outline-none transition focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/15"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-soft)]">%</span>
      </div>
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <label className="block text-xs font-body font-semibold text-[var(--text-soft)]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/15"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function Toggle({ label, checked, onChange, compact = false }: { label: string; checked: boolean; onChange: (v: boolean) => void; compact?: boolean }) {
  return (
    <label className={['flex items-center justify-between gap-2 rounded-xl border border-aletis-borda bg-aletis-cream-papel/35 px-3 py-2 text-xs font-body font-semibold text-[var(--text-soft)]', compact ? 'h-10' : ''].join(' ')}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-aletis-verde"
      />
    </label>
  )
}

function InlineDate({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-36 rounded-lg border border-aletis-borda px-2 py-1 text-sm outline-none focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/15"
    />
  )
}

function InlineMoney({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      step={0.01}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value.trim() === '' ? Number.NaN : Number(e.target.value))}
      className="w-36 rounded-lg border border-aletis-borda px-2 py-1 text-right font-mono text-sm outline-none focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/15"
    />
  )
}

function compactBRL(value: number) {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} mil`
  return `R$ ${value.toFixed(0)}`
}

function roundDisplay(value: number) {
  return Math.round(value * 10000) / 10000
}
