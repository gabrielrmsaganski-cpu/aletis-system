// ============================================================
// useClienteData — fetcher único do workspace do cliente.
// Concentra todas as chamadas que ClienteDetalhes fazia disperso.
// ============================================================
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { apiFetch } from '../../../hooks/useApi'

export type Estagio =
  | 'lead'
  | 'qualificacao'
  | 'analise'
  | 'proposta'
  | 'negociacao'
  | 'acordo'
  | 'acompanhamento'
  | 'concluido'
  | 'prospeccao'
  | 'encerrado'

export interface DividaResumo {
  id: string
  credor: string
  contrato: string
  modalidade: string
  valorOriginal: number
  valorAtual: number
  taxa: string
  status: 'em_dia' | 'atrasada' | 'renegociada' | 'quitada' | 'ativa' | 'em_acordo' | 'paga' | 'nao_informado'
  vencimento?: string
  emitente?: string
  tomador?: string
  finalidade?: string
  enquadramento?: string
  numeroCedula?: string
  valorParcela?: number
  dataContratacao?: string
  primeiraParcela?: string
  ultimaParcela?: string
  parcelasTotal?: number
  parcelasPagas?: number
  prazoMeses?: number
  carenciaMeses?: number
  diasAtraso?: number
  taxaNominalAa?: string
  taxaEfetivaAa?: string
  cetAa?: string
  indexador?: string
  periodicidade?: string
  metodoCalculo?: string
  garantias?: string[]
  observacoes?: string
  informacoesAdicionais?: Array<{ campo: string; valor: string }>
}

export interface PagamentoCliente {
  id: string
  data: string
  valor: number
  descricao: string
  tipo: 'pagamento' | 'dacao' | 'deposito_judicial'
  status?: 'previsto' | 'realizado' | 'compensado' | 'cancelado'
  credor?: string
  contrato?: string
  formaPagamento?: string
  comprovante?: string
  observacoes?: string
  informacoesAdicionais?: Array<{ campo: string; valor: string }>
}

export interface SraiResult {
  scoreTotal: number
  classificacao: 'baixo' | 'moderado' | 'alto' | 'critico'
  componentes: { financeiro: number; operacional: number; climatico: number; relacionamento: number }
  alertas: string[]
  recomendacoes: string[]
}

export interface AbsResult {
  elegivel: boolean
  nivelElegibilidade: 'integral' | 'parcial' | 'condicional' | 'inelegivel'
  scorePercentual: number
  taxasEstimadasPct: { min: number; max: number }
  acoesRecomendadas: string[]
}

export interface AnaliseResumo {
  geradoEm: string
  duracaoMs: number
  saldoRecalculado?: { totalSaldoRecalculado: number; totalJurosAcumulados: number } | null
  fluxoCaixaSafra?: { saldoLivre: number; capacidadePagamento: number } | null
  margemCliente?: { margemPct: number; classificacao: string } | null
  alertasTop?: Array<{ nivel: string; origem: string; mensagem: string }>
  recomendacoes?: Array<{ id: string; titulo: string; prioridade: 'p1' | 'p2' | 'p3'; acao: string; categoria: string; impactoEstimado?: string }>
}

export interface FinancialHealth {
  score: number | null
  nivel: 'forte' | 'equilibrada' | 'atencao' | 'pressionada' | 'critica' | 'indisponivel'
  confianca: 'alta' | 'media' | 'baixa'
  coberturaPct: number
  metodologiaVersao: string
  calculadoEm: string
  componentes: Array<{
    id: string
    label: string
    score: number | null
    peso: number
    disponivel: boolean
    valor: string
    leitura: string
  }>
  fatores: Array<{ tipo: 'positivo' | 'atencao' | 'critico'; titulo: string; detalhe: string }>
  metricas: {
    capacidadePagamentoPct: number | null
    saldoLivre: string | null
    margemBrutaProjetada: string | null
    margemRealPct: number | null
    dividaPorHa: string | null
    contratosConsiderados: number
    contratosVencidos: number
  }
}

export interface Cliente {
  id: string
  nome: string
  cpfCnpj: string
  tipo?: 'pessoa_fisica' | 'pessoa_juridica'
  cidade: string
  uf: string
  telefone: string
  whatsapp?: string
  email: string
  atividade?: string
  estagio: Estagio
  saudeFinanceira: number | null
  saudeFinanceiraDetalhes?: FinancialHealth
  consultor: string
  escritorio?: string
  credor: string
  modalidadeCredito?: string
  valorTotalDivida?: number
  valorTotalPago?: number
  observacoes?: string
  cep?: string
  carCodigoImovel?: string
  culturas?: string[]
  ultimaAtualizacao?: string
  propriedade?: { nome?: string; area?: string; culturas?: string[]; condicao?: string }
  resumoFinanceiro: { totalDivida: number; totalPago: number; pendente: number }
  dividas: DividaResumo[]
  pagamentos: PagamentoCliente[]
  evolucaoDivida: Array<{ mes: string; valor: number }>
  endereco?: any
  clima?: any
  producaoMunicipal?: any
  car?: { areaImovel?: number; codImovel?: string; municipio?: string; uf?: string }
  areaTotalHa?: number
  notas: Array<{ id: string; autor: string; criadoEm: string; texto: string }>
  tags: string[]
  grupoFamiliar: Array<{
    id: string
    nome: string
    parentesco?: string
    papel?: string
    cpfCnpj?: string
    telefone?: string
    email?: string
    atuaAtividade?: boolean
    vinculoCliente?: string
    observacoes?: string
    principal?: boolean
    criadoEm?: string
    atualizadoEm?: string
  }>
  proximaAcao: { data: string; descricao: string } | null
  exposicaoCommodity: any[]
  visitasTecnicas: any[]
  portalAcesso?: { ativo: boolean; usuario: string } | null
}

export interface UseClienteDataReturn {
  apiId: string | undefined
  cliente: Cliente | null
  loading: boolean
  error: string | null
  /** Score SRAI carregado em paralelo */
  srai: SraiResult | null
  abs: AbsResult | null
  /** Análise consolidada do AutoCalcOrchestrator */
  analises: AnaliseResumo | null
  financialHealth: FinancialHealth | null
  loadingAnalises: boolean
  recalcularAnalises: () => Promise<void>
  recalculando: boolean
  /** Helpers de mutação que atualizam o estado local */
  reload: () => Promise<void>
  patchCliente: (patch: Partial<Cliente>) => Promise<void>
  addNota: (texto: string, autor?: string) => Promise<void>
  removerNota: (notaId: string) => Promise<void>
  setProximaAcao: (acao: { data: string; descricao: string } | null) => Promise<void>
  setTags: (tags: string[]) => Promise<void>
}

/**
 * Mapeia ids de URL "amigáveis" para os ids do backend (cli-XXX).
 * Mantém aliases legacy de Ailton/Paulo para backward-compat.
 */
function resolveApiId(urlId: string | undefined): string | undefined {
  if (!urlId) return undefined
  if (urlId === 'ailton-caeiro') return 'cli-001'
  if (urlId === 'paulo-luciano') return 'cli-002'
  return urlId
}

const debtStatusMap: Record<string, DividaResumo['status']> = {
  ativa: 'ativa',
  em_acordo: 'em_acordo',
  renegociada: 'renegociada',
  paga: 'paga',
  em_dia: 'em_dia',
  atrasada: 'atrasada',
  quitada: 'quitada',
}

function mapCliente(data: any): Cliente {
  const dividas: DividaResumo[] = Array.isArray(data.dividas)
    ? data.dividas.map((d: any, idx: number): DividaResumo => ({
        id: d.id || `div-${idx}`,
        credor: d.credor || '—',
        contrato: d.contrato || '—',
        modalidade: d.modalidade || 'Crédito Rural',
        valorOriginal: Number(d.valorOriginal) || 0,
        valorAtual: Number(d.valorAtual ?? d.valorAtualizado) || 0,
        taxa: d.taxa || '—',
        status: debtStatusMap[d.status] || 'nao_informado',
        vencimento: d.vencimento,
        emitente: d.emitente,
        tomador: d.tomador,
        finalidade: d.finalidade,
        enquadramento: d.enquadramento,
        numeroCedula: d.numeroCedula,
        valorParcela: d.valorParcela == null ? undefined : Number(d.valorParcela) || 0,
        dataContratacao: d.dataContratacao,
        primeiraParcela: d.primeiraParcela,
        ultimaParcela: d.ultimaParcela,
        parcelasTotal: d.parcelasTotal == null ? undefined : Number(d.parcelasTotal) || 0,
        parcelasPagas: d.parcelasPagas == null ? undefined : Number(d.parcelasPagas) || 0,
        prazoMeses: d.prazoMeses == null ? undefined : Number(d.prazoMeses) || 0,
        carenciaMeses: d.carenciaMeses == null ? undefined : Number(d.carenciaMeses) || 0,
        diasAtraso: d.diasAtraso == null ? undefined : Number(d.diasAtraso) || 0,
        taxaNominalAa: d.taxaNominalAa,
        taxaEfetivaAa: d.taxaEfetivaAa,
        cetAa: d.cetAa,
        indexador: d.indexador,
        periodicidade: d.periodicidade,
        metodoCalculo: d.metodoCalculo,
        garantias: Array.isArray(d.garantias) ? d.garantias.map(String) : [],
        observacoes: d.observacoes,
        informacoesAdicionais: Array.isArray(d.informacoesAdicionais) ? d.informacoesAdicionais : [],
      }))
    : []

  const pagamentos: PagamentoCliente[] = Array.isArray(data.pagamentos)
    ? data.pagamentos.map((p: any, idx: number): PagamentoCliente => ({
        id: p.id || `pag-${idx}`,
        data: p.data || '',
        valor: Number(p.valor) || 0,
        descricao: p.descricao || '',
        tipo: ['dacao', 'deposito_judicial'].includes(p.tipo) ? p.tipo : 'pagamento',
        status: ['previsto', 'realizado', 'compensado', 'cancelado'].includes(p.status) ? p.status : 'realizado',
        credor: p.credor || '',
        contrato: p.contrato || '',
        formaPagamento: p.formaPagamento || '',
        comprovante: p.comprovante || '',
        observacoes: p.observacoes || '',
        informacoesAdicionais: Array.isArray(p.informacoesAdicionais) ? p.informacoesAdicionais : [],
      }))
    : []

  const totalDivida = Number(data.valorTotalDivida) || data.resumoFinanceiro?.totalDivida || 0
  const totalPago = Number(data.valorTotalPago) || data.resumoFinanceiro?.totalPago || 0

  return {
    id: data.id,
    nome: data.nome,
    cpfCnpj: data.cpfCnpj || '',
    tipo: data.tipo === 'pessoa_juridica' ? 'pessoa_juridica' : 'pessoa_fisica',
    cidade: data.cidade,
    uf: data.uf,
    telefone: data.telefone || '',
    whatsapp: data.whatsapp || '',
    email: data.email || '',
    atividade: data.atividade || '',
    estagio: data.estagio || 'lead',
    saudeFinanceira: data.saudeFinanceira !== null && data.saudeFinanceira !== undefined && data.saudeFinanceira !== '' && Number.isFinite(Number(data.saudeFinanceira))
      ? Math.max(0, Math.min(100, Number(data.saudeFinanceira))) : null,
    saudeFinanceiraDetalhes: data.saudeFinanceiraDetalhes,
    consultor: data.consultor || 'Não atribuído',
    escritorio: data.escritorio || '',
    credor: data.credor || 'A definir',
    modalidadeCredito: data.modalidadeCredito || '',
    valorTotalDivida: totalDivida,
    valorTotalPago: totalPago,
    observacoes: data.observacoes || '',
    cep: data.cep || data.endereco?.cep || '',
    carCodigoImovel: data.carCodigoImovel || data.car?.codImovel || '',
    culturas: Array.isArray(data.culturas) ? data.culturas : [],
    ultimaAtualizacao: data.ultimaAtualizacao,
    propriedade: data.propriedade ?? {
      nome: data.car?.codImovel ? `CAR ${data.car.codImovel}` : data.nome,
      area: data.car?.areaImovel ? `${data.car.areaImovel} ha` : data.areaTotalHa ? `${data.areaTotalHa} ha` : '—',
      culturas: Array.isArray(data.culturas) ? data.culturas : [],
      condicao: data.observacoes || 'Em análise',
    },
    resumoFinanceiro: data.resumoFinanceiro ?? {
      totalDivida,
      totalPago,
      pendente: totalDivida - totalPago,
    },
    dividas,
    pagamentos,
    evolucaoDivida: Array.isArray(data.evolucaoDivida) ? data.evolucaoDivida : [],
    endereco: data.endereco,
    clima: data.clima,
    producaoMunicipal: data.producaoMunicipal,
    car: data.car,
    areaTotalHa: data.areaTotalHa,
    notas: Array.isArray(data.notas) ? data.notas : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    grupoFamiliar: Array.isArray(data.grupoFamiliar) ? data.grupoFamiliar : [],
    proximaAcao: data.proximaAcao ?? null,
    exposicaoCommodity: Array.isArray(data.exposicaoCommodity) ? data.exposicaoCommodity : [],
    visitasTecnicas: Array.isArray(data.visitasTecnicas) ? data.visitasTecnicas : [],
    portalAcesso: data.portalAcesso ?? null,
  }
}

export function useClienteData(urlId: string | undefined): UseClienteDataReturn {
  const apiId = useMemo(() => resolveApiId(urlId), [urlId])
  const activeId = useRef(apiId)
  activeId.current = apiId
  const reloadController = useRef<AbortController | null>(null)

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [srai, setSrai] = useState<SraiResult | null>(null)
  const [abs, setAbs] = useState<AbsResult | null>(null)
  const [analises, setAnalises] = useState<AnaliseResumo | null>(null)
  const [financialHealth, setFinancialHealth] = useState<FinancialHealth | null>(null)
  const [loadingAnalises, setLoadingAnalises] = useState(false)
  const [recalculando, setRecalculando] = useState(false)

  useEffect(() => {
    setCliente(null)
    setSrai(null)
    setAbs(null)
    setAnalises(null)
    setFinancialHealth(null)
    setRecalculando(false)
    setError(null)
  }, [apiId])

  const reload = useCallback(async () => {
    if (!apiId) return
    reloadController.current?.abort()
    const controller = new AbortController()
    reloadController.current = controller
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<any>(`/clientes/${apiId}`, { signal: controller.signal })
      if (!controller.signal.aborted && activeId.current === apiId && data && data.nome) {
        const mapped = mapCliente(data)
        setCliente(mapped)
        if (mapped.saudeFinanceiraDetalhes) setFinancialHealth(mapped.saudeFinanceiraDetalhes)
      }
    } catch (e: any) {
      if (!controller.signal.aborted && activeId.current === apiId) setError(String(e?.message ?? e))
    } finally {
      if (!controller.signal.aborted && activeId.current === apiId) setLoading(false)
    }
  }, [apiId])

  useEffect(() => {
    if (!apiId) return
    const controller = new AbortController()
    apiFetch<FinancialHealth>(`/clientes/${apiId}/saude-financeira`, { signal: controller.signal })
      .then((health) => {
        if (controller.signal.aborted || activeId.current !== apiId) return
        setFinancialHealth(health)
        setCliente((current) => current?.id === apiId ? { ...current, saudeFinanceira: health.score, saudeFinanceiraDetalhes: health } : current)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [apiId, analises?.geradoEm])

  useEffect(() => {
    reload()
    return () => reloadController.current?.abort()
  }, [reload])

  // Análises consolidadas (AutoCalcOrchestrator)
  useEffect(() => {
    if (!apiId) return
    const controller = new AbortController()
    setLoadingAnalises(true)
    apiFetch<any>(`/clientes/${apiId}/analises`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted && activeId.current === apiId && data) setAnalises(data)
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted && activeId.current === apiId) setLoadingAnalises(false) })
    return () => controller.abort()
  }, [apiId])

  // SRAI + AB+S em paralelo
  useEffect(() => {
    if (!apiId) return
    const controller = new AbortController()
    Promise.all([
      apiFetch<any>(`/clientes/${apiId}/srai`, { signal: controller.signal }).catch(() => null),
      apiFetch<any>(`/clientes/${apiId}/abs?plantioDireto=false&ilpf=false&prada=false`, { signal: controller.signal }).catch(() => null),
    ]).then(([sraiRes, absRes]) => {
      if (controller.signal.aborted || activeId.current !== apiId) return
      if (sraiRes?.success && sraiRes.data) setSrai(sraiRes.data)
      else if (sraiRes && !('success' in sraiRes)) setSrai(sraiRes)
      if (absRes?.success && absRes.data) setAbs(absRes.data)
      else if (absRes && !('success' in absRes)) setAbs(absRes)
    })
    return () => controller.abort()
  }, [apiId])

  const recalcularAnalises = useCallback(async () => {
    if (!apiId) return
    setRecalculando(true)
    try {
      const data = await apiFetch<AnaliseResumo>(`/clientes/${apiId}/recalcular`, { method: 'POST' })
      if (activeId.current !== apiId) return
      if (data) setAnalises(data)
      const health = await apiFetch<FinancialHealth>(`/clientes/${apiId}/saude-financeira`)
      if (activeId.current !== apiId) return
      setFinancialHealth(health)
      setCliente((current) => current ? { ...current, saudeFinanceira: health.score, saudeFinanceiraDetalhes: health } : current)
    } finally {
      if (activeId.current === apiId) setRecalculando(false)
    }
  }, [apiId])

  const patchCliente = useCallback(async (patch: Partial<Cliente>) => {
    if (!apiId) return
    await apiFetch(`/clientes/${apiId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setCliente((prev) => (prev?.id === apiId ? { ...prev, ...patch } : prev))
  }, [apiId])

  const addNota = useCallback(async (texto: string, autor?: string) => {
    if (!apiId || !texto.trim()) return
    const nota = await apiFetch<{ id: string; autor: string; criadoEm: string; texto: string }>(
      `/clientes/${apiId}/notas`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: texto.trim(), autor: autor?.trim() || 'Equipe ALETIS' }) },
    )
    setCliente((prev) => (prev?.id === apiId
      ? { ...prev, notas: [...prev.notas.filter((existing) => existing.id !== nota.id), nota] }
      : prev))
  }, [apiId])

  const removerNota = useCallback(async (notaId: string) => {
    if (!apiId) return
    await apiFetch(`/clientes/${apiId}/notas/${notaId}`, { method: 'DELETE' })
    setCliente((prev) => (prev ? { ...prev, notas: prev.notas.filter((n) => n.id !== notaId) } : prev))
  }, [apiId])

  const setProximaAcao = useCallback(async (acao: { data: string; descricao: string } | null) => {
    await patchCliente({ proximaAcao: acao })
  }, [patchCliente])

  const setTags = useCallback(async (tags: string[]) => {
    await patchCliente({ tags })
  }, [patchCliente])

  return {
    apiId,
    cliente: cliente?.id === apiId ? cliente : null,
    loading: loading || Boolean(apiId && cliente?.id !== apiId && !error),
    error,
    srai,
    abs,
    analises,
    financialHealth,
    loadingAnalises,
    recalcularAnalises,
    recalculando,
    reload,
    patchCliente,
    addNota,
    removerNota,
    setProximaAcao,
    setTags,
  }
}
