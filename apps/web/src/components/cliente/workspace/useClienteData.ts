// ============================================================
// useClienteData — fetcher único do workspace do cliente.
// Concentra todas as chamadas que ClienteDetalhes fazia disperso.
// ============================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
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
  status: 'em_dia' | 'atrasada' | 'renegociada' | 'quitada'
  vencimento?: string
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

export interface Cliente {
  id: string
  nome: string
  cpfCnpj: string
  cidade: string
  uf: string
  telefone: string
  email: string
  estagio: Estagio
  saudeFinanceira: number
  consultor: string
  propriedade?: { nome?: string; area?: string; culturas?: string[]; condicao?: string }
  resumoFinanceiro: { totalDivida: number; totalPago: number; pendente: number }
  dividas: DividaResumo[]
  evolucaoDivida: Array<{ mes: string; valor: number }>
  endereco?: any
  clima?: any
  producaoMunicipal?: any
  car?: { areaImovel?: number; codImovel?: string; municipio?: string; uf?: string }
  areaTotalHa?: number
  notas: Array<{ id: string; autor: string; criadoEm: string; texto: string }>
  tags: string[]
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
  loadingAnalises: boolean
  recalcularAnalises: () => Promise<void>
  recalculando: boolean
  /** Helpers de mutação que atualizam o estado local */
  reload: () => Promise<void>
  patchCliente: (patch: Partial<Cliente>) => Promise<void>
  addNota: (texto: string) => Promise<void>
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
  ativa: 'atrasada',
  em_acordo: 'renegociada',
  renegociada: 'renegociada',
  paga: 'quitada',
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
        status: debtStatusMap[d.status] || 'em_dia',
        vencimento: d.vencimento,
      }))
    : []

  const totalDivida = Number(data.valorTotalDivida) || data.resumoFinanceiro?.totalDivida || 0
  const totalPago = Number(data.valorTotalPago) || data.resumoFinanceiro?.totalPago || 0

  return {
    id: data.id,
    nome: data.nome,
    cpfCnpj: data.cpfCnpj || '---',
    cidade: data.cidade,
    uf: data.uf,
    telefone: data.telefone || '',
    email: data.email || '',
    estagio: data.estagio || 'lead',
    saudeFinanceira: data.saudeFinanceira ?? 50,
    consultor: data.consultor || 'Não atribuído',
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
    evolucaoDivida: Array.isArray(data.evolucaoDivida) ? data.evolucaoDivida : [],
    endereco: data.endereco,
    clima: data.clima,
    producaoMunicipal: data.producaoMunicipal,
    car: data.car,
    areaTotalHa: data.areaTotalHa,
    notas: Array.isArray(data.notas) ? data.notas : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    proximaAcao: data.proximaAcao ?? null,
    exposicaoCommodity: Array.isArray(data.exposicaoCommodity) ? data.exposicaoCommodity : [],
    visitasTecnicas: Array.isArray(data.visitasTecnicas) ? data.visitasTecnicas : [],
    portalAcesso: data.portalAcesso ?? null,
  }
}

export function useClienteData(urlId: string | undefined): UseClienteDataReturn {
  const apiId = useMemo(() => resolveApiId(urlId), [urlId])

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [srai, setSrai] = useState<SraiResult | null>(null)
  const [abs, setAbs] = useState<AbsResult | null>(null)
  const [analises, setAnalises] = useState<AnaliseResumo | null>(null)
  const [loadingAnalises, setLoadingAnalises] = useState(false)
  const [recalculando, setRecalculando] = useState(false)

  const reload = useCallback(async () => {
    if (!apiId) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<any>(`/clientes/${apiId}`)
      if (data && data.nome) setCliente(mapCliente(data))
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [apiId])

  useEffect(() => {
    reload()
  }, [reload])

  // Análises consolidadas (AutoCalcOrchestrator)
  useEffect(() => {
    if (!apiId) return
    setLoadingAnalises(true)
    apiFetch<any>(`/clientes/${apiId}/analises`)
      .then((data) => {
        if (data) setAnalises(data)
      })
      .catch(() => {})
      .finally(() => setLoadingAnalises(false))
  }, [apiId])

  // SRAI + AB+S em paralelo
  useEffect(() => {
    if (!apiId) return
    Promise.all([
      apiFetch<any>(`/clientes/${apiId}/srai`).catch(() => null),
      apiFetch<any>(`/clientes/${apiId}/abs?plantioDireto=false&ilpf=false&prada=false`).catch(() => null),
    ]).then(([sraiRes, absRes]) => {
      if (sraiRes?.success && sraiRes.data) setSrai(sraiRes.data)
      else if (sraiRes && !('success' in sraiRes)) setSrai(sraiRes)
      if (absRes?.success && absRes.data) setAbs(absRes.data)
      else if (absRes && !('success' in absRes)) setAbs(absRes)
    })
  }, [apiId])

  const recalcularAnalises = useCallback(async () => {
    if (!apiId) return
    setRecalculando(true)
    try {
      const data = await apiFetch<AnaliseResumo>(`/clientes/${apiId}/recalcular`, { method: 'POST' })
      if (data) setAnalises(data)
    } finally {
      setRecalculando(false)
    }
  }, [apiId])

  const patchCliente = useCallback(async (patch: Partial<Cliente>) => {
    if (!apiId) return
    await apiFetch(`/clientes/${apiId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setCliente((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [apiId])

  const addNota = useCallback(async (texto: string) => {
    if (!apiId || !texto.trim()) return
    const res = await apiFetch<{ success: boolean; data: { id: string; autor: string; criadoEm: string; texto: string } }>(
      `/clientes/${apiId}/notas`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: texto.trim(), autor: 'Equipe ALETIS' }) },
    )
    if (res.success) {
      setCliente((prev) => (prev ? { ...prev, notas: [...prev.notas, res.data] } : prev))
    }
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
    cliente,
    loading,
    error,
    srai,
    abs,
    analises,
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
