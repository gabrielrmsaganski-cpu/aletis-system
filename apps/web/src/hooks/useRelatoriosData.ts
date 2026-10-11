import { useEffect, useState } from 'react'
import { apiFetch, apiFetchFull } from './useApi'

export interface PortfolioKPI { label: string; valor: number }
export interface ClientesPorEstado { estado: string; clientes: number }
export interface ClientesPorEstagio { name: string; value: number; color: string }
export interface TopCliente { nome: string; cidade: string; divida: number; estagio: string; credor: string }
export interface RentabilidadeMes { mes: string; receita: number; custo: number; lucro: number }
export interface FluxoMes { mes: string; entrada: number; saida: number; saldo: number }
export interface PropostasKPI { label: string; valor: string; sub: string }
export interface PropostasStatus { name: string; value: number; color: string }
export type SectionState = 'disponivel' | 'parcial' | 'indisponivel' | 'loading'
export interface MarketReportRow { nome: string; valor: number; unidade: string; praca: string; data: string; fonte: string; estado: string }
export interface RelatoriosData {
  portfolioKpis: PortfolioKPI[]; clientesPorEstado: ClientesPorEstado[]; clientesPorEstagio: ClientesPorEstagio[]; topClientes: TopCliente[]
  rentabilidadeMensal: RentabilidadeMes[]; fluxoMensal: FluxoMes[]; propostasKpis: PropostasKPI[]; propostasStatus: PropostasStatus[]
  mercado: MarketReportRow[]; snapshotEm: string | null
  sections: Record<'portfolio' | 'propostas' | 'financeiro' | 'mercado', SectionState>
  loading: boolean; source: 'api' | 'partial' | 'fallback' | 'loading'; error: string | null
}
const COLORS: Record<string, string> = { prospeccao: '#6B7280', qualificacao: '#3B82F6', analise: '#8B5CF6', proposta: '#cb9d52', negociacao: '#E67E22', acordo: '#27AE60', encerrado: '#17251b', arquivado: '#9CA3AF', aceita: '#27AE60', enviada: '#cb9d52', rascunho: '#3B82F6', rejeitada: '#C0392B', expirada: '#9CA3AF' }
const LABELS: Record<string, string> = { prospeccao: 'Prospecção', qualificacao: 'Qualificação', analise: 'Análise', proposta: 'Proposta', negociacao: 'Negociação', acordo: 'Acordo', encerrado: 'Concluído', arquivado: 'Arquivado' }
const finite = (v: unknown): boolean => (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(Number(v))
const empty: RelatoriosData = { portfolioKpis: [], clientesPorEstado: [], clientesPorEstagio: [], topClientes: [], rentabilidadeMensal: [], fluxoMensal: [], propostasKpis: [], propostasStatus: [], mercado: [], snapshotEm: null, sections: { portfolio: 'loading', propostas: 'loading', financeiro: 'loading', mercado: 'loading' }, loading: true, source: 'loading', error: null }

/** Snapshot das respostas recebidas: ausência de fonte continua ausência. */
export function buildRelatoriosData(clientesInput: unknown, propostasInput: unknown, financeiro: any, prices: any, indicators: any, snapshotEm: string): RelatoriosData {
  const clientsValid = Array.isArray(clientesInput) && clientesInput.every(c => c && typeof c === 'object' && typeof c.nome === 'string')
  const proposalsValid = Array.isArray(propostasInput) && propostasInput.every(p => p && typeof p === 'object' && typeof p.status === 'string')
  const clientes: any[] = clientsValid ? clientesInput as any[] : []
  const propostas: any[] = proposalsValid ? propostasInput as any[] : []
  const series = financeiro?.fluxoCaixa12m
  const financeValid = Array.isArray(series) && series.length > 0 && series.every(m => m && /^\d{4}-\d{2}$/.test(m.mes) && finite(m.receita) && finite(m.despesa) && finite(m.resultado))
  const portfolioKpis = clientsValid ? [
    { label: 'Total Clientes', valor: clientes.length },
    { label: 'Ativos', valor: clientes.filter(c => !['encerrado', 'arquivado'].includes(c.estagio)).length },
    { label: 'Encerrados / arquivados', valor: clientes.filter(c => ['encerrado', 'arquivado'].includes(c.estagio)).length },
    { label: 'Em Acordo', valor: clientes.filter(c => c.estagio === 'acordo').length },
  ] : []
  const uf = new Map<string, number>(); const stages = new Map<string, number>(); const statuses = new Map<string, number>()
  for (const c of clientes) { if (c.uf) uf.set(c.uf, (uf.get(c.uf) || 0) + 1); const stage = c.estagio || 'Sem estágio'; stages.set(stage, (stages.get(stage) || 0) + 1) }
  for (const p of propostas) { const status = p.status || 'Sem status'; statuses.set(status, (statuses.get(status) || 0) + 1) }
  const rentabilidadeMensal: RentabilidadeMes[] = financeValid ? [...series].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-6).map(m => ({ mes: m.mes, receita: Number(m.receita), custo: Number(m.despesa), lucro: Number(m.resultado) })) : []
  const fluxoMensal = rentabilidadeMensal.map(m => ({ mes: m.mes, entrada: m.receita, saida: m.custo, saldo: m.lucro }))
  const cutoff = Date.parse(snapshotEm) - 90 * 86400000
  const sent = propostas.filter(p => ['enviada', 'aceita', 'rejeitada', 'expirada'].includes(p.status) && Date.parse(p.dataCriacao || p.criadoEm || '') >= cutoff)
  const accepted = sent.filter(p => p.status === 'aceita').length
  const volume = sent.filter(p => finite(p.valorProposta)).reduce((sum, p) => sum + Number(p.valorProposta), 0)
  const propostasKpis = proposalsValid ? [
    { label: 'Propostas Enviadas', valor: String(sent.length), sub: 'últimos 90 dias; somente registros datados' },
    { label: 'Taxa de Aceite', valor: sent.length ? `${Math.round(accepted / sent.length * 100)}%` : '—', sub: `${accepted} de ${sent.length}` },
    { label: 'Em Negociação', valor: String(sent.filter(p => p.status === 'enviada').length), sub: 'aguardando resposta' },
    { label: 'Volume Proposto', valor: volume.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), sub: 'propostas enviadas no período' },
  ] : []
  const priceValid = prices?.success === true && Array.isArray(prices.data) && prices.meta?.estado !== 'indisponivel'
  const indicatorValid = indicators?.success === true && Array.isArray(indicators.data) && indicators.meta?.estado !== 'indisponivel'
  const mercado: MarketReportRow[] = [
    ...(priceValid ? prices.data.filter((p: any) => p.fonteOrigem !== 'fallback' && finite(p.precoAtual) && p.atualizacao).map((p: any) => ({ nome: p.cultura, valor: Number(p.precoAtual), unidade: p.unidade, praca: p.praca, data: p.atualizacao, fonte: p.fonte, estado: p.estado || 'disponivel' })) : []),
    ...(indicatorValid ? indicators.data.filter((i: any) => i.fonteOrigem !== 'fallback' && finite(i.valor) && i.referencia).map((i: any) => ({ nome: i.nome, valor: Number(i.valor), unidade: i.unidade, praca: 'Brasil', data: i.referencia, fonte: i.fonte, estado: i.estado || 'disponivel' })) : []),
  ]
  const sections: RelatoriosData['sections'] = { portfolio: clientsValid ? 'disponivel' : 'indisponivel', propostas: proposalsValid ? 'disponivel' : 'indisponivel', financeiro: financeValid ? 'disponivel' : 'indisponivel', mercado: !mercado.length ? 'indisponivel' : !priceValid || !indicatorValid || [prices?.meta?.estado, indicators?.meta?.estado].includes('parcial') || mercado.some(m => m.estado !== 'disponivel') ? 'parcial' : 'disponivel' }
  const states = Object.values(sections)
  return { portfolioKpis, clientesPorEstado: [...uf].sort((a, b) => b[1] - a[1]).map(([estado, clientes]) => ({ estado, clientes })), clientesPorEstagio: [...stages].map(([key, value]) => ({ name: LABELS[key] || key, value, color: COLORS[key] || '#6B7280' })), topClientes: [...clientes].filter(c => finite(c.valorTotalDivida) && Number(c.valorTotalDivida) > 0).sort((a, b) => Number(b.valorTotalDivida) - Number(a.valorTotalDivida)).slice(0, 10).map(c => ({ nome: c.nome, cidade: [c.cidade, c.uf].filter(Boolean).join('/'), divida: Number(c.valorTotalDivida), estagio: LABELS[c.estagio] || c.estagio || '—', credor: c.credor || '—' })), rentabilidadeMensal, fluxoMensal, propostasKpis, propostasStatus: [...statuses].map(([name, value]) => ({ name, value, color: COLORS[name] || '#6B7280' })), mercado, snapshotEm, sections, loading: false, source: states.every(s => s === 'disponivel') ? 'api' : states.every(s => s === 'indisponivel') ? 'fallback' : 'partial', error: states.some(s => s !== 'disponivel') ? 'Há seções sem dados completos; consulte o estado de cada relatório.' : null }
}

export function useRelatoriosData(): RelatoriosData {
  const [data, setData] = useState<RelatoriosData>(empty)
  useEffect(() => {
    let cancelled = false
    Promise.allSettled([apiFetch('/clientes'), apiFetch('/propostas'), apiFetch('/financeiro/dashboard'), apiFetchFull('/mercado/precos?periodo=180d'), apiFetchFull('/mercado/indicadores')]).then(results => {
      if (cancelled) return
      const values = results.map(r => r.status === 'fulfilled' ? r.value : undefined)
      setData(buildRelatoriosData(values[0], values[1], values[2], values[3], values[4], new Date().toISOString()))
    }).catch(error => { if (!cancelled) setData({ ...empty, loading: false, source: 'fallback', sections: { portfolio: 'indisponivel', propostas: 'indisponivel', financeiro: 'indisponivel', mercado: 'indisponivel' }, error: String(error) }) })
    return () => { cancelled = true }
  }, [])
  return data
}
