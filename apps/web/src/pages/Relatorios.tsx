import { SectionNav } from '../components/ui/SectionNav'
import PageHeader from '../components/ui/PageHeader'
/**
 * Relatorios (Relatórios)
 *
 * Pagina de relatorios dinamicos do sistema ALETIS com 6 tipos:
 * Portfolio de Clientes, Analise de Rentabilidade, Performance de
 * Propostas, Inteligencia de Mercado, Fluxo de Caixa Consolidado
 * e Auditoria/Compliance (LGPD). Cada relatorio renderiza graficos
 * (Recharts), KPIs e tabelas, com exportacao em PDF e Excel.
 */
import React, {
  lazy,
  Suspense,
  useState,
  useMemo,
  createContext,
  useContext,
} from 'react'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { InlineButton } from '../components/ui'
import {
  exportPDF,
  exportExcel,
  exportCSV,
  nowStr,
  type ReportData,
} from '../utils/exportReports'
import { useRelatoriosData, type RelatoriosData, type MarketReportRow, type SectionState } from '../hooks/useRelatoriosData'

// Context que injeta dados REAIS no JSX dos sub-Content components.
// Seções sem dados permanecem vazias e exibem sua indisponibilidade.
interface RelatoriosCtxValue {
  portfolioKpis?: typeof PORTFOLIO_KPIs_EMPTY
  clientesPorEstado?: typeof CLIENTES_POR_ESTADO_EMPTY
  clientesPorEstagio?: typeof CLIENTES_POR_ESTAGIO_EMPTY
  topClientes?: typeof TOP_CLIENTES_EMPTY
  rentabilidadeMensal?: typeof RENTABILIDADE_MENSAL_EMPTY
  fluxoMensal?: typeof FLUXO_MENSAL_EMPTY
  propostasKpis?: typeof PROPOSTAS_KPIS_EMPTY
  propostasStatus?: typeof PROPOSTAS_STATUS_EMPTY
  source?: 'api' | 'partial' | 'fallback' | 'loading'
  mercado?: MarketReportRow[]
  snapshotEm?: string | null
}
const RelatoriosCtx = createContext<RelatoriosCtxValue>({})
const RelatorioChart = lazy(() => import('./relatorios/RelatoriosCharts'))
import {
  Users,
  TrendingUp,
  FileText,
  BarChart3,
  DollarSign,
  Shield,
  ChevronRight,
  Download,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Briefcase,
  MapPin,
  Percent,
  Calendar,
  Eye,
} from 'lucide-react'

// ────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────
const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    v,
  )

const fmtBRLCompact = (v: number): string => {
  if (v >= 1_000_000)
    return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
  return fmtBRL(v)
}

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type ReportId =
  | 'portfolio'
  | 'rentabilidade'
  | 'propostas'
  | 'mercado'
  | 'fluxo'
  | 'auditoria'

interface ReportDef {
  id: ReportId
  titulo: string
  descricao: string
  icon: React.ElementType
  cor: string
  corBg: string
}

// ────────────────────────────────────────────────────────────
// Report Definitions
// ────────────────────────────────────────────────────────────

const REPORTS: ReportDef[] = [
  {
    id: 'portfolio',
    titulo: 'Portfólio de Clientes',
    descricao: 'Visão completa de todos os clientes e estágios',
    icon: Users,
    cor: '#17251b',
    corBg: 'bg-aletis-verde/10',
  },
  {
    id: 'rentabilidade',
    titulo: 'Análise de Rentabilidade',
    descricao: 'ROI por cliente e período',
    icon: TrendingUp,
    cor: '#cb9d52',
    corBg: 'bg-aletis-dourado/10',
  },
  {
    id: 'propostas',
    titulo: 'Performance de Propostas',
    descricao: 'Taxa de aceite, tempo médio, volume',
    icon: FileText,
    cor: '#3B82F6',
    corBg: 'bg-blue-50',
  },
  {
    id: 'mercado',
    titulo: 'Inteligência de Mercado',
    descricao: 'Preços e indicadores com origem e data de referência',
    icon: BarChart3,
    cor: '#8B5CF6',
    corBg: 'bg-purple-50',
  },
  {
    id: 'fluxo',
    titulo: 'Resultado Mensal por Competência',
    descricao: 'Receitas, despesas e resultado do dashboard financeiro',
    icon: DollarSign,
    cor: '#27AE60',
    corBg: 'bg-positivo/10',
  },
  {
    id: 'auditoria',
    titulo: 'Auditoria e Compliance',
    descricao: 'Log de ações e conformidade LGPD',
    icon: Shield,
    cor: '#C0392B',
    corBg: 'bg-alerta/10',
  },
]

// ────────────────────────────────────────────────────────────
// Portfolio Report Data
// ────────────────────────────────────────────────────────────

const PORTFOLIO_KPIs_EMPTY: { label: string; valor: number; icon: React.ElementType; cor: string; corBg: string }[] = []
const CLIENTES_POR_ESTADO_EMPTY: RelatoriosData['clientesPorEstado'] = []
const CLIENTES_POR_ESTAGIO_EMPTY: RelatoriosData['clientesPorEstagio'] = []
const TOP_CLIENTES_EMPTY: RelatoriosData['topClientes'] = []
const RENTABILIDADE_MENSAL_EMPTY: RelatoriosData['rentabilidadeMensal'] = []
const PROPOSTAS_KPIS_EMPTY: RelatoriosData['propostasKpis'] = []
const PROPOSTAS_STATUS_EMPTY: RelatoriosData['propostasStatus'] = []
const FLUXO_MENSAL_EMPTY: RelatoriosData['fluxoMensal'] = []

function ReportChartSkeleton({ height = 250 }: { height?: number }) {
  return (
    <div
      className="h-full animate-pulse rounded-xl border border-aletis-verde/10 bg-muted"
      style={{ minHeight: height }}
    />
  )
}

// ────────────────────────────────────────────────────────────
// Report Content Components
// ────────────────────────────────────────────────────────────

function PortfolioContent({ onExport }: { onExport: (fmt: string) => void }) {
  // Snapshot real via Context; ausência de dados não cria valores.
  const ctx = useContext(RelatoriosCtx)
  const PORTFOLIO_KPIs = ctx.portfolioKpis ?? PORTFOLIO_KPIs_EMPTY
  const CLIENTES_POR_ESTADO =
    ctx.clientesPorEstado ?? CLIENTES_POR_ESTADO_EMPTY
  const CLIENTES_POR_ESTAGIO =
    ctx.clientesPorEstagio ?? CLIENTES_POR_ESTAGIO_EMPTY
  const TOP_CLIENTES = ctx.topClientes ?? TOP_CLIENTES_EMPTY
  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PORTFOLIO_KPIs.map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl ${kpi.corBg} flex items-center justify-center`}
              >
                <kpi.icon className="w-5 h-5" style={{ color: kpi.cor }} />
              </div>
              <div>
                <p className="text-[11px] font-body text-muted-foreground">
                  {kpi.label}
                </p>
                <p className="text-2xl font-display font-semibold text-foreground">
                  {kpi.valor}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar: Clientes por Estado */}
        <div className="card p-5">
          <h3 className="text-sm font-display font-semibold text-foreground mb-4">
            Clientes por Estado
          </h3>
          <div className="h-[250px]">
            <Suspense fallback={<ReportChartSkeleton />}>
              <RelatorioChart
                type="clientesEstado"
                data={CLIENTES_POR_ESTADO}
              />
            </Suspense>
          </div>
        </div>

        {/* Pie: Clientes por Estagio */}
        <div className="card p-5">
          <h3 className="text-sm font-display font-semibold text-foreground mb-4">
            Clientes por Estágio
          </h3>
          <div className="h-[250px]">
            <Suspense fallback={<ReportChartSkeleton />}>
              <RelatorioChart
                type="clientesEstagio"
                data={CLIENTES_POR_ESTAGIO}
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Table: Top 10 */}
      <div className="card p-5">
        <h3 className="text-sm font-display font-semibold text-foreground mb-4">
          Top 10 Clientes por Volume de Dívida
        </h3>
        <div className="overflow-x-auto">
          <table className="ui-table w-full text-sm">
            <thead>
              <tr className="border-b border-aletis-borda">
                <th className="text-left py-2.5 px-3 font-display font-semibold text-foreground text-xs">
                  #
                </th>
                <th className="text-left py-2.5 px-3 font-display font-semibold text-foreground text-xs">
                  Cliente
                </th>
                <th className="text-left py-2.5 px-3 font-display font-semibold text-foreground text-xs">
                  Cidade
                </th>
                <th className="text-left py-2.5 px-3 font-display font-semibold text-foreground text-xs">
                  Credor
                </th>
                <th className="text-right py-2.5 px-3 font-display font-semibold text-foreground text-xs">
                  Dívida
                </th>
                <th className="text-center py-2.5 px-3 font-display font-semibold text-foreground text-xs">
                  Estágio
                </th>
              </tr>
            </thead>
            <tbody>
              {TOP_CLIENTES.map((c, idx) => {
                const estagioColor: Record<string, string> = {
                  Lead: 'bg-gray-100 text-gray-600',
                  Qualificação: 'bg-blue-50 text-blue-600',
                  Análise: 'bg-purple-50 text-purple-600',
                  Proposta: 'bg-aletis-dourado/10 text-aletis-dourado-escuro',
                  Negociação: 'bg-ambar/10 text-ambar',
                  Acordo: 'bg-positivo/10 text-positivo',
                  Concluído: 'bg-aletis-verde/10 text-foreground',
                }
                return (
                  <tr
                    key={c.nome}
                    className={`border-b border-aletis-borda/50 hover:bg-aletis-verde/5 transition-colors ${
                      idx % 2 === 0 ? 'bg-card' : 'bg-aletis-bege/30'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-xs text-muted-foreground font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-body font-medium text-foreground text-xs">
                        {c.nome}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[var(--text-soft)] font-body">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        {c.cidade}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[var(--text-soft)] font-body">
                      {c.credor}
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs font-mono font-medium text-foreground">
                      {fmtBRL(c.divida)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${estagioColor[c.estagio] || 'bg-gray-100 text-gray-500'}`}
                      >
                        {c.estagio}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export buttons */}
      <div className="flex gap-3">
        <InlineButton
          variant="primary"
          size="sm"
          icon={Download}
          onClick={() => onExport('PDF')}
        >
          Exportar PDF
        </InlineButton>
        <InlineButton
          variant="outline"
          size="sm"
          icon={Download}
          onClick={() => onExport('Excel')}
        >
          Exportar Excel
        </InlineButton>
        <InlineButton
          variant="outline"
          size="sm"
          icon={Download}
          onClick={() => onExport('CSV')}
        >
          Exportar CSV
        </InlineButton>
      </div>
    </div>
  )
}

function RentabilidadeContent({
  onExport,
}: {
  onExport: (fmt: string) => void
}) {
  const ctx = useContext(RelatoriosCtx)
  const RENTABILIDADE_MENSAL =
    ctx.rentabilidadeMensal ?? RENTABILIDADE_MENSAL_EMPTY
  const totalReceita = RENTABILIDADE_MENSAL.reduce((s, r) => s + r.receita, 0)
  const totalLucro = RENTABILIDADE_MENSAL.reduce((s, r) => s + r.lucro, 0)
  const margemMedia = totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Receita Total',
            valor: fmtBRLCompact(totalReceita),
            cor: '#17251b',
            bg: 'bg-aletis-verde/10',
          },
          {
            label: 'Lucro Líquido',
            valor: fmtBRLCompact(totalLucro),
            cor: '#27AE60',
            bg: 'bg-positivo/10',
          },
          {
            label: 'Margem Média',
            valor: `${margemMedia.toFixed(1)}%`,
            cor: '#cb9d52',
            bg: 'bg-aletis-dourado/10',
          },
          {
            label: 'ROI Período',
            valor: 'Indisponível',
            cor: '#3B82F6',
            bg: 'bg-blue-50',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <p className="text-[11px] font-body text-muted-foreground mb-1">
              {kpi.label}
            </p>
            <p className="text-2xl font-display font-semibold text-foreground">
              {kpi.valor}
            </p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-display font-semibold text-foreground mb-4">
          Receita vs Custo vs Lucro — Últimos 6 Meses
        </h3>
        <div className="h-[300px]">
          <Suspense fallback={<ReportChartSkeleton height={300} />}>
            <RelatorioChart type="rentabilidade" data={RENTABILIDADE_MENSAL} />
          </Suspense>
        </div>
      </div>

      <div className="flex gap-3">
        <InlineButton
          variant="primary"
          size="sm"
          icon={Download}
          onClick={() => onExport('PDF')}
        >
          Exportar PDF
        </InlineButton>
        <InlineButton
          variant="outline"
          size="sm"
          icon={Download}
          onClick={() => onExport('Excel')}
        >
          Exportar Excel
        </InlineButton>
        <InlineButton
          variant="outline"
          size="sm"
          icon={Download}
          onClick={() => onExport('CSV')}
        >
          Exportar CSV
        </InlineButton>
      </div>
    </div>
  )
}

function PropostasContent({ onExport }: { onExport: (fmt: string) => void }) {
  const ctx = useContext(RelatoriosCtx)
  const PROPOSTAS_KPIS = ctx.propostasKpis ?? PROPOSTAS_KPIS_EMPTY
  const PROPOSTAS_STATUS = ctx.propostasStatus ?? PROPOSTAS_STATUS_EMPTY
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PROPOSTAS_KPIS.map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <p className="text-[11px] font-body text-muted-foreground">
              {kpi.label}
            </p>
            <p className="text-2xl font-display font-semibold text-foreground mt-1">
              {kpi.valor}
            </p>
            <p className="text-[11px] font-body text-muted-foreground mt-0.5">
              {kpi.sub}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-display font-semibold text-foreground mb-4">
            Status das Propostas
          </h3>
          <div className="h-[250px]">
            <Suspense fallback={<ReportChartSkeleton />}>
              <RelatorioChart type="propostasStatus" data={PROPOSTAS_STATUS} />
            </Suspense>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-display font-semibold text-foreground mb-4">
            Tempo de Resposta (dias)
          </h3>
          <div className="h-[250px]">
            <Suspense fallback={<ReportChartSkeleton />}>
              <p className="text-sm text-[var(--text-soft)]">Tempo de resposta indisponível: datas de envio e resposta não foram fornecidas.</p>
            </Suspense>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <InlineButton
          variant="primary"
          size="sm"
          icon={Download}
          onClick={() => onExport('PDF')}
        >
          Exportar PDF
        </InlineButton>
        <InlineButton
          variant="outline"
          size="sm"
          icon={Download}
          onClick={() => onExport('Excel')}
        >
          Exportar Excel
        </InlineButton>
        <InlineButton
          variant="outline"
          size="sm"
          icon={Download}
          onClick={() => onExport('CSV')}
        >
          Exportar CSV
        </InlineButton>
      </div>
    </div>
  )
}

function MercadoContent({ onExport }: { onExport: (fmt: string) => void }) {
  const ctx = useContext(RelatoriosCtx)
  const rows = ctx.mercado || []
  return <div className="space-y-6">
    <p className="text-sm text-[var(--text-soft)]">Snapshot consultado em {ctx.snapshotEm ? new Date(ctx.snapshotEm).toLocaleString('pt-BR') : '—'}. Cada indicador conserva sua data de referência. Histórico e variações ausentes não são estimados.</p>
    <div className="card overflow-auto"><table className="ui-table w-full text-sm"><thead><tr>{['Indicador', 'Valor', 'Unidade', 'Praça', 'Referência', 'Fonte / estado'].map(label => <th className="p-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>
      {rows.map(row => <tr key={`${row.nome}-${row.fonte}`} className="border-t"><td className="p-3">{row.nome}</td><td className="p-3 font-mono">{new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(row.valor)}</td><td className="p-3">{row.unidade}</td><td className="p-3">{row.praca}</td><td className="p-3">{row.data}</td><td className="p-3">{row.fonte} · {row.estado}</td></tr>)}
    </tbody></table></div>
    {!rows.length && <p>Dados de mercado indisponíveis para este snapshot.</p>}
    <div className="flex gap-3">{['PDF', 'Excel', 'CSV'].map(format => <InlineButton key={format} variant="outline" size="sm" icon={Download} onClick={() => onExport(format)}>Exportar {format}</InlineButton>)}</div>
  </div>
}

function FluxoCaixaContent({ onExport }: { onExport: (fmt: string) => void }) {
  const ctx = useContext(RelatoriosCtx)
  const FLUXO_MENSAL = ctx.fluxoMensal ?? FLUXO_MENSAL_EMPTY
  const totalEntrada = FLUXO_MENSAL.reduce((s, r) => s + r.entrada, 0)
  const totalSaida = FLUXO_MENSAL.reduce((s, r) => s + r.saida, 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Receita Total',
            valor: fmtBRLCompact(totalEntrada),
            cor: 'text-positivo',
          },
          {
            label: 'Despesas Totais',
            valor: fmtBRLCompact(totalSaida),
            cor: 'text-alerta',
          },
          {
            label: 'Resultado Líquido',
            valor: fmtBRLCompact(FLUXO_MENSAL.reduce((sum, m) => sum + m.saldo, 0)),
            cor: 'text-foreground',
          },
          {
            label: 'Projeção futura',
            valor: 'Indisponível',
            cor: 'text-aletis-dourado-escuro',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <p className="text-[11px] font-body text-muted-foreground">
              {kpi.label}
            </p>
            <p className={`text-2xl font-display font-semibold ${kpi.cor} mt-1`}>
              {kpi.valor}
            </p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-display font-semibold text-foreground mb-4">
          Resultado Mensal por Competência
        </h3>
        <div className="h-[300px]">
          <Suspense fallback={<ReportChartSkeleton height={300} />}>
            <RelatorioChart type="fluxo" data={FLUXO_MENSAL} />
          </Suspense>
        </div>
      </div>

      <div className="flex gap-3">
        <InlineButton
          variant="primary"
          size="sm"
          icon={Download}
          onClick={() => onExport('PDF')}
        >
          Exportar PDF
        </InlineButton>
        <InlineButton
          variant="outline"
          size="sm"
          icon={Download}
          onClick={() => onExport('Excel')}
        >
          Exportar Excel
        </InlineButton>
        <InlineButton
          variant="outline"
          size="sm"
          icon={Download}
          onClick={() => onExport('CSV')}
        >
          Exportar CSV
        </InlineButton>
      </div>
    </div>
  )
}

function AuditoriaContent({ onExport }: { onExport: (fmt: string) => void }) {
  return <p className="card p-5">Relatório de auditoria indisponível. Nenhum registro de exemplo é incluído no relatório operacional.</p>
}

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

export default function Relatorios() {
  const [selectedReport, setSelectedReport] = useState<ReportId | null>(null)
  const { toasts, show: showToast, dismiss: dismissToast } = useToast()

  const real = useRelatoriosData()
  const ctxValue: RelatoriosCtxValue = useMemo(() => ({ ...real, portfolioKpis: real.portfolioKpis.map(k => ({ ...k, icon: Users, cor: '#17251b', corBg: 'bg-aletis-verde/10' })) }), [real])
  const sectionState = (id: ReportId): SectionState => id === 'auditoria' ? 'indisponivel' : real.sections[id === 'rentabilidade' || id === 'fluxo' ? 'financeiro' : id]
  // Locais para uso direto em buildReportData (PDF/Excel)
  const PORTFOLIO_KPIs_LIVE = ctxValue.portfolioKpis ?? PORTFOLIO_KPIs_EMPTY
  const CLIENTES_POR_ESTADO_LIVE =
    ctxValue.clientesPorEstado ?? CLIENTES_POR_ESTADO_EMPTY
  const CLIENTES_POR_ESTAGIO_LIVE =
    ctxValue.clientesPorEstagio ?? CLIENTES_POR_ESTAGIO_EMPTY
  const TOP_CLIENTES_LIVE = ctxValue.topClientes ?? TOP_CLIENTES_EMPTY
  const RENTABILIDADE_MENSAL_LIVE =
    ctxValue.rentabilidadeMensal ?? RENTABILIDADE_MENSAL_EMPTY
  const FLUXO_MENSAL_LIVE = ctxValue.fluxoMensal ?? FLUXO_MENSAL_EMPTY
  const PROPOSTAS_KPIS_LIVE = ctxValue.propostasKpis ?? PROPOSTAS_KPIS_EMPTY
  const PROPOSTAS_STATUS_LIVE =
    ctxValue.propostasStatus ?? PROPOSTAS_STATUS_EMPTY

  const buildReportData = (id: ReportId): ReportData => {
    const def = REPORTS.find((r) => r.id === id)!
    const base = {
      titulo: def.titulo,
      subtitulo: `${def.descricao}. Snapshot: ${real.snapshotEm || 'indisponível'}. Estado: ${sectionState(id)}. Fonte: ${id === 'portfolio' ? '/clientes' : id === 'propostas' ? '/propostas' : id === 'mercado' ? 'fontes por indicador' : '/financeiro/dashboard; regime de competência'}.`,
      gerado: nowStr(),
    }

    if (sectionState(id) === 'indisponivel' || sectionState(id) === 'loading') return { id, ...base, sections: [{ tipo: 'texto', titulo: 'Dados indisponíveis', texto: 'Esta seção não recebeu dados válidos. Nenhum valor foi substituído por exemplo ou por zero.' }] }

    if (id === 'portfolio') {
      return {
        id: 'portfolio_clientes',
        ...base,
        sections: [
          {
            tipo: 'kpis',
            titulo: 'Indicadores Principais',
            kpis: PORTFOLIO_KPIs_LIVE.map((k) => ({
              label: k.label,
              valor: k.valor,
            })),
          },
          {
            tipo: 'tabela',
            titulo: 'Clientes por Estado',
            colunas: ['Estado', 'Qtd Clientes'],
            linhas: CLIENTES_POR_ESTADO_LIVE.map((c) => [c.estado, c.clientes]),
          },
          {
            tipo: 'tabela',
            titulo: 'Clientes por Estágio',
            colunas: ['Estágio', 'Qtd'],
            linhas: CLIENTES_POR_ESTAGIO_LIVE.map((c) => [c.name, c.value]),
          },
          {
            tipo: 'tabela',
            titulo: 'Top 10 Clientes por Dívida',
            colunas: ['Cliente', 'Cidade/UF', 'Dívida', 'Estágio', 'Credor'],
            linhas: TOP_CLIENTES_LIVE.map((c) => [
              c.nome,
              c.cidade,
              fmtBRL(c.divida),
              c.estagio,
              c.credor,
            ]),
          },
        ],
      }
    }
    if (id === 'rentabilidade') {
      return {
        id: 'rentabilidade',
        ...base,
        sections: [
          {
            tipo: 'tabela',
            titulo: 'Rentabilidade Mensal',
            colunas: ['Mês', 'Receita', 'Custo', 'Lucro'],
            linhas: RENTABILIDADE_MENSAL_LIVE.map((r) => [
              r.mes,
              fmtBRL(r.receita),
              fmtBRL(r.custo),
              fmtBRL(r.lucro),
            ]),
          },
        ],
      }
    }
    if (id === 'propostas') {
      return {
        id: 'propostas_performance',
        ...base,
        sections: [
          {
            tipo: 'kpis',
            titulo: 'KPIs de Propostas',
            kpis: PROPOSTAS_KPIS_LIVE.map((k) => ({
              label: k.label,
              valor: `${k.valor} (${k.sub})`,
            })),
          },
          {
            tipo: 'tabela',
            titulo: 'Status das Propostas',
            colunas: ['Status', 'Quantidade'],
            linhas: PROPOSTAS_STATUS_LIVE.map((p) => [p.name, p.value]),
          },
        ],
      }
    }
    if (id === 'mercado') {
      return { id: 'inteligencia_mercado', ...base, sections: [
        { tipo: 'texto', titulo: 'Período e lacunas', texto: `Snapshot consultado em ${real.snapshotEm}. Estado: ${real.sections.mercado}. As datas de referência pertencem a cada indicador. Histórico e variações insuficientes permanecem indisponíveis.` },
        { tipo: 'tabela', titulo: 'Indicadores observados', colunas: ['Indicador', 'Valor', 'Unidade', 'Praça', 'Referência', 'Fonte', 'Estado', 'Snapshot consultado'], linhas: real.mercado.map(row => [row.nome, new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(row.valor), row.unidade, row.praca, row.data, row.fonte, row.estado, real.snapshotEm || '']) },
      ] }
    }
    if (id === 'fluxo') {
      return {
        id: 'fluxo_caixa',
        ...base,
        sections: [
          {
            tipo: 'tabela',
            titulo: 'Resultado Mensal por Competência',
            colunas: ['Competência', 'Receita', 'Despesa', 'Resultado'],
            linhas: FLUXO_MENSAL_LIVE.map((f) => [
              f.mes,
              fmtBRL(f.entrada),
              fmtBRL(f.saida),
              fmtBRL(f.saldo),
            ]),
          },
        ],
      }
    }
    return { id: 'auditoria_compliance', ...base, sections: [{ tipo: 'texto', titulo: 'Indisponível', texto: 'Dados de auditoria não carregados.' }] }
  }

  const handleExport = (formato: string) => {
    if (!selectedReport) return
    const def = REPORTS.find((r) => r.id === selectedReport)
    try {
      const data = buildReportData(selectedReport)
      if (formato === 'PDF') {
        exportPDF(data)
      } else if (formato === 'CSV') {
        const firstTable = data.sections.find(
          (section) => section.tipo === 'tabela',
        )
        if (!firstTable?.colunas || !firstTable.linhas)
          throw new Error('Relatório sem tabela para exportação CSV')
        exportCSV(data.id, firstTable.colunas, firstTable.linhas)
      } else {
        exportExcel(data)
      }
      showToast(`${def?.titulo} exportado em ${formato}`, 'success')
    } catch (err) {
      console.error('[Export] Erro:', err)
      showToast(
        `Erro ao exportar: ${err instanceof Error ? err.message : 'desconhecido'}`,
        'warning',
      )
    }
  }

  const ReportContent: Record<
    ReportId,
    React.FC<{ onExport: (fmt: string) => void }>
  > = {
    portfolio: PortfolioContent,
    rentabilidade: RentabilidadeContent,
    propostas: PropostasContent,
    mercado: MercadoContent,
    fluxo: FluxoCaixaContent,
    auditoria: AuditoriaContent,
  }

  const selectedDef = REPORTS.find((r) => r.id === selectedReport)

  return (
    <RelatoriosCtx.Provider value={ctxValue}>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <PageHeader title={<>Relatórios</>} description={<> <p className="text-[var(--text-soft)] mt-1 font-body text-sm">
              Relatórios dinâmicos e exportação de dados do sistema ALETIS
              <span className="ml-2">· {selectedReport ? sectionState(selectedReport) : real.loading ? 'carregando' : 'snapshots por seção'}</span>
            </p> </>} actions={<> {selectedReport && (
            <button
              onClick={() => setSelectedReport(null)}
              className="flex items-center gap-2 text-sm font-body text-foreground hover:text-aletis-verde-medio transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar aos relatórios
            </button>
          )} </>} />

        <div className="task-workspace">
          <SectionNav label="Navegação dos relatórios" vertical active={selectedReport ?? 'catalogo'} onChange={id => setSelectedReport(id === 'catalogo' ? null : id as ReportId)} items={[{id:'catalogo',label:'Todos os relatórios',icon:BarChart3},...REPORTS.map(report=>({id:report.id,label:report.titulo,icon:report.icon}))]} />
          <div className="min-w-0">
        {/* ── Section 1: Report Grid ──────────────────────────────── */}
        {!selectedReport && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-foreground" />
              <h2 className="text-lg font-display font-semibold text-foreground">
                Relatórios Disponíveis
              </h2>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {REPORTS.map((report) => {
                const Icon = report.icon
                return (
                  <button
                    key={report.id}
                    onClick={() => setSelectedReport(report.id)}
                    className="text-left card p-5 group  hover:border-aletis-verde/40  transition-all duration-300"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl ${report.corBg} flex items-center justify-center flex-shrink-0 `}
                      >
                        <Icon
                          className="w-6 h-6"
                          style={{ color: report.cor }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-display font-semibold text-foreground group-hover:text-aletis-verde transition-colors">
                          {report.titulo}
                        </h3>
                        <p className="text-xs font-body text-muted-foreground mt-1 leading-relaxed">
                          {report.descricao} · {sectionState(report.id)}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-aletis-verde group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Section 2: Report Content ───────────────────────────── */}
        {selectedReport && selectedDef && (
          <section>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div
                className={`w-10 h-10 rounded-xl ${selectedDef.corBg} flex items-center justify-center`}
              >
                <selectedDef.icon
                  className="w-5 h-5"
                  style={{ color: selectedDef.cor }}
                />
              </div>
              <div>
                <h2 className="text-lg font-display font-semibold text-foreground">
                  {selectedDef.titulo}
                </h2>
                <p className="text-xs font-body text-muted-foreground">
                  {selectedDef.descricao}
                </p>
              </div>
              <span className="badge bg-aletis-verde/10 text-foreground text-[11px] ml-auto">
                <Calendar className="w-3 h-3 mr-1" />
                {real.snapshotEm ? new Date(real.snapshotEm).toLocaleDateString('pt-BR') : 'Sem snapshot'}
              </span>
            </div>

            {(() => {
              if (sectionState(selectedReport) === 'loading') return <p className="card p-5">Carregando dados da seção…</p>
              if (sectionState(selectedReport) === 'indisponivel') return <p className="card p-5">Dados desta seção indisponíveis. Nenhum resultado foi substituído por zero.</p>
              const Content = ReportContent[selectedReport]
              return <Content onExport={handleExport} />
            })()}
          </section>
        )}

          </div>
        </div>
        {/* Bottom spacer */}
        <div className="h-8" />

        {/* Toast notifications */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </RelatoriosCtx.Provider>
  )
}
