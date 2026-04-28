// ============================================================
// useRelatoriosData — agrega dados reais para o módulo Relatórios
// ============================================================
// Substitui os arrays mock de Relatorios.tsx por consumo real:
//   - /api/clientes              → KPIs portfolio, distribuição UF/estágio, top dívidas
//   - /api/propostas             → KPIs propostas, distribuição por status
//   - /api/financeiro/dashboard  → fluxo mensal, rentabilidade
// Quando uma API falha, mantém o fallback do consumer (pra a UI nunca quebrar).
// ============================================================
import { useEffect, useState } from 'react'
import { apiFetch } from './useApi'

export interface PortfolioKPI {
  label: string
  valor: number
}

export interface ClientesPorEstado {
  estado: string
  clientes: number
}

export interface ClientesPorEstagio {
  name: string
  value: number
  color: string
}

export interface TopCliente {
  nome: string
  cidade: string
  divida: number
  estagio: string
  credor: string
}

export interface RentabilidadeMes {
  mes: string
  receita: number
  custo: number
  lucro: number
}

export interface FluxoMes {
  mes: string
  entrada: number
  saida: number
  saldo: number
}

export interface PropostasKPI {
  label: string
  valor: string
  sub: string
}

export interface PropostasStatus {
  name: string
  value: number
  color: string
}

interface RelatoriosData {
  portfolioKpis: PortfolioKPI[]
  clientesPorEstado: ClientesPorEstado[]
  clientesPorEstagio: ClientesPorEstagio[]
  topClientes: TopCliente[]
  rentabilidadeMensal: RentabilidadeMes[]
  fluxoMensal: FluxoMes[]
  propostasKpis: PropostasKPI[]
  propostasStatus: PropostasStatus[]
  loading: boolean
  source: 'api' | 'partial' | 'fallback' | 'loading'
  error: string | null
}

const ESTAGIO_COLOR: Record<string, string> = {
  prospeccao: '#6B7280',
  qualificacao: '#3B82F6',
  analise: '#8B5CF6',
  proposta: '#C9A84C',
  negociacao: '#E67E22',
  acordo: '#27AE60',
  encerrado: '#0F4C35',
  arquivado: '#9CA3AF',
}

const ESTAGIO_LABEL: Record<string, string> = {
  prospeccao: 'Prospecção',
  qualificacao: 'Qualificação',
  analise: 'Análise',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  acordo: 'Acordo',
  encerrado: 'Concluído',
  arquivado: 'Arquivado',
}

const STATUS_COLOR: Record<string, string> = {
  aceita: '#27AE60',
  enviada: '#C9A84C',
  rascunho: '#3B82F6',
  rejeitada: '#C0392B',
  expirada: '#9CA3AF',
}

const fmtMes = (date: Date) =>
  date
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    .replace('.', '')
    .replace(/\b\w/g, (c) => c.toUpperCase())

export function useRelatoriosData(): RelatoriosData {
  const [data, setData] = useState<RelatoriosData>({
    portfolioKpis: [],
    clientesPorEstado: [],
    clientesPorEstagio: [],
    topClientes: [],
    rentabilidadeMensal: [],
    fluxoMensal: [],
    propostasKpis: [],
    propostasStatus: [],
    loading: true,
    source: 'loading',
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const results = await Promise.allSettled([
        apiFetch<any[]>('/clientes'),
        apiFetch<any[]>('/propostas'),
        apiFetch<any>('/financeiro/dashboard').catch(() => null),
      ])

      if (cancelled) return

      const clientes = results[0].status === 'fulfilled' ? (results[0].value ?? []) : []
      const propostas = results[1].status === 'fulfilled' ? (results[1].value ?? []) : []
      const financeiro = results[2].status === 'fulfilled' ? results[2].value : null

      const failures = results.filter((r) => r.status === 'rejected').length
      const source: RelatoriosData['source'] =
        failures === 0 ? 'api' : failures === 3 ? 'fallback' : 'partial'

      // ── Portfolio KPIs ─────────────────────────────────────
      const ativos = clientes.filter((c) => ['negociacao', 'analise', 'proposta', 'acordo'].includes(c.estagio))
      const inadimplentes = clientes.filter((c) => c.estagio === 'arquivado' || c.estagio === 'encerrado')
      const emAcordo = clientes.filter((c) => c.estagio === 'acordo')
      const portfolioKpis: PortfolioKPI[] = [
        { label: 'Total Clientes', valor: clientes.length },
        { label: 'Ativos', valor: ativos.length },
        { label: 'Inadimplentes', valor: inadimplentes.length },
        { label: 'Em Acordo', valor: emAcordo.length },
      ]

      // ── Clientes por estado ────────────────────────────────
      const ufMap = new Map<string, number>()
      for (const c of clientes) {
        if (c.uf) ufMap.set(c.uf, (ufMap.get(c.uf) ?? 0) + 1)
      }
      const clientesPorEstado: ClientesPorEstado[] = Array.from(ufMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([estado, qtd]) => ({ estado, clientes: qtd }))

      // ── Clientes por estágio ───────────────────────────────
      const estagioMap = new Map<string, number>()
      for (const c of clientes) {
        const k = c.estagio || 'sem-estagio'
        estagioMap.set(k, (estagioMap.get(k) ?? 0) + 1)
      }
      const clientesPorEstagio: ClientesPorEstagio[] = Array.from(estagioMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([est, qtd]) => ({
          name: ESTAGIO_LABEL[est] ?? est,
          value: qtd,
          color: ESTAGIO_COLOR[est] ?? '#6B7280',
        }))

      // ── Top clientes por dívida ────────────────────────────
      const topClientes: TopCliente[] = [...clientes]
        .filter((c) => Number(c.valorTotalDivida) > 0)
        .sort((a, b) => Number(b.valorTotalDivida ?? 0) - Number(a.valorTotalDivida ?? 0))
        .slice(0, 10)
        .map((c) => ({
          nome: c.nome,
          cidade: [c.cidade, c.uf].filter(Boolean).join('/'),
          divida: Number(c.valorTotalDivida) || 0,
          estagio: ESTAGIO_LABEL[c.estagio] ?? c.estagio ?? '—',
          credor: c.credor ?? '—',
        }))

      // ── Rentabilidade mensal (do dashboard financeiro) ─────
      // Estrutura esperada: financeiro.serieMensal: [{mes, receita, despesa, ...}]
      let rentabilidadeMensal: RentabilidadeMes[] = []
      let fluxoMensal: FluxoMes[] = []
      if (financeiro?.serieMensal && Array.isArray(financeiro.serieMensal)) {
        rentabilidadeMensal = financeiro.serieMensal.slice(-6).map((m: any) => ({
          mes: m.mesLabel || m.mes,
          receita: Number(m.receita ?? 0),
          custo: Number(m.despesa ?? m.custo ?? 0),
          lucro: Number(m.receita ?? 0) - Number(m.despesa ?? m.custo ?? 0),
        }))
        fluxoMensal = financeiro.serieMensal.slice(-6).map((m: any) => {
          const entrada = Number(m.receita ?? 0)
          const saida = Number(m.despesa ?? m.custo ?? 0)
          return {
            mes: m.mesLabel || m.mes,
            entrada,
            saida,
            saldo: entrada - saida,
          }
        })
      }
      // Fallback simples: gera 6 meses zerados se não veio nada
      if (rentabilidadeMensal.length === 0) {
        const today = new Date()
        for (let i = 5; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
          rentabilidadeMensal.push({ mes: fmtMes(d), receita: 0, custo: 0, lucro: 0 })
          fluxoMensal.push({ mes: fmtMes(d), entrada: 0, saida: 0, saldo: 0 })
        }
      }

      // ── Propostas: KPIs + status ───────────────────────────
      const last90 = new Date(Date.now() - 90 * 86400_000)
      const propostas90 = propostas.filter((p) => {
        const dt = p.dataCriacao || p.criadoEm || p.ultimaAtualizacao
        if (!dt) return true
        try { return new Date(dt) >= last90 } catch { return true }
      })
      const aceitas90 = propostas90.filter((p) => p.status === 'aceita').length
      const totalEnv = propostas90.length
      const taxaAceite = totalEnv > 0 ? Math.round((aceitas90 / totalEnv) * 100) : 0
      const volumeTotal = propostas90.reduce((s, p) => s + (Number(p.valorProposta) || 0), 0)
      const propostasKpis: PropostasKPI[] = [
        { label: 'Propostas Enviadas', valor: String(totalEnv), sub: 'últimos 90 dias' },
        { label: 'Taxa de Aceite', valor: `${taxaAceite}%`, sub: `${aceitas90} de ${totalEnv}` },
        {
          label: 'Em Negociação',
          valor: String(propostas90.filter((p) => p.status === 'enviada').length),
          sub: 'aguardando resposta',
        },
        {
          label: 'Volume Total',
          valor: volumeTotal > 0
            ? volumeTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
            : '—',
          sub: 'em negociação',
        },
      ]

      const statusMap = new Map<string, number>()
      for (const p of propostas) {
        const k = p.status || 'rascunho'
        statusMap.set(k, (statusMap.get(k) ?? 0) + 1)
      }
      const propostasStatus: PropostasStatus[] = Array.from(statusMap.entries()).map(([k, v]) => ({
        name: k.charAt(0).toUpperCase() + k.slice(1),
        value: v,
        color: STATUS_COLOR[k] ?? '#6B7280',
      }))

      setData({
        portfolioKpis,
        clientesPorEstado,
        clientesPorEstagio,
        topClientes,
        rentabilidadeMensal,
        fluxoMensal,
        propostasKpis,
        propostasStatus,
        loading: false,
        source,
        error: null,
      })
    }

    load().catch((err) => {
      if (cancelled) return
      setData((prev) => ({ ...prev, loading: false, source: 'fallback', error: String(err?.message || err) }))
    })

    return () => { cancelled = true }
  }, [])

  return data
}
