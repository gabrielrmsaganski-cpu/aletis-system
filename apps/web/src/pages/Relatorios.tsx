import React, { useState, useMemo } from 'react'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { exportPDF, exportExcel, nowStr, type ReportData } from '../utils/exportReports'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
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
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtBRLCompact = (v: number): string => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
  return fmtBRL(v)
}

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type ReportId = 'portfolio' | 'rentabilidade' | 'propostas' | 'mercado' | 'fluxo' | 'auditoria'

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
    titulo: 'Portfolio de Clientes',
    descricao: 'Visao completa de todos os clientes e estagios',
    icon: Users,
    cor: '#0F4C35',
    corBg: 'bg-aletis-verde/10',
  },
  {
    id: 'rentabilidade',
    titulo: 'Analise de Rentabilidade',
    descricao: 'ROI por cliente e periodo',
    icon: TrendingUp,
    cor: '#C9A84C',
    corBg: 'bg-aletis-dourado/10',
  },
  {
    id: 'propostas',
    titulo: 'Performance de Propostas',
    descricao: 'Taxa de aceite, tempo medio, volume',
    icon: FileText,
    cor: '#3B82F6',
    corBg: 'bg-blue-50',
  },
  {
    id: 'mercado',
    titulo: 'Inteligencia de Mercado',
    descricao: 'Evolucao de precos e indicadores',
    icon: BarChart3,
    cor: '#8B5CF6',
    corBg: 'bg-purple-50',
  },
  {
    id: 'fluxo',
    titulo: 'Fluxo de Caixa Consolidado',
    descricao: 'Projecoes e realizados',
    icon: DollarSign,
    cor: '#27AE60',
    corBg: 'bg-positivo/10',
  },
  {
    id: 'auditoria',
    titulo: 'Auditoria e Compliance',
    descricao: 'Log de acoes e conformidade LGPD',
    icon: Shield,
    cor: '#C0392B',
    corBg: 'bg-alerta/10',
  },
]

// ────────────────────────────────────────────────────────────
// Portfolio Report Data
// ────────────────────────────────────────────────────────────

const PORTFOLIO_KPIs = [
  { label: 'Total Clientes', valor: 47, icon: Users, cor: '#0F4C35', corBg: 'bg-aletis-verde/10' },
  { label: 'Ativos', valor: 23, icon: CheckCircle2, cor: '#27AE60', corBg: 'bg-positivo/10' },
  { label: 'Inadimplentes', valor: 5, icon: AlertTriangle, cor: '#C0392B', corBg: 'bg-alerta/10' },
  { label: 'Em Acordo', valor: 12, icon: Briefcase, cor: '#C9A84C', corBg: 'bg-aletis-dourado/10' },
]

const CLIENTES_POR_ESTADO = [
  { estado: 'PR', clientes: 15 },
  { estado: 'MS', clientes: 10 },
  { estado: 'MT', clientes: 8 },
  { estado: 'GO', clientes: 6 },
  { estado: 'SP', clientes: 5 },
  { estado: 'MG', clientes: 3 },
]

const CLIENTES_POR_ESTAGIO = [
  { name: 'Lead', value: 7, color: '#6B7280' },
  { name: 'Qualificacao', value: 5, color: '#3B82F6' },
  { name: 'Analise', value: 8, color: '#8B5CF6' },
  { name: 'Proposta', value: 6, color: '#C9A84C' },
  { name: 'Negociacao', value: 4, color: '#E67E22' },
  { name: 'Acordo', value: 12, color: '#27AE60' },
  { name: 'Concluido', value: 5, color: '#0F4C35' },
]

const TOP_CLIENTES = [
  { nome: 'Ailton Caeiro da Silva', cidade: 'Toledo/PR', divida: 2049802.53, estagio: 'Proposta', credor: 'Sicoob' },
  { nome: 'Paulo Luciano Machado', cidade: 'Dourados/MS', divida: 1876543.21, estagio: 'Negociacao', credor: 'Banco do Brasil' },
  { nome: 'Fazenda Santa Rita Ltda', cidade: 'Sorriso/MT', divida: 1654321.00, estagio: 'Analise', credor: 'Cresol' },
  { nome: 'Agro Cerrado S.A.', cidade: 'Rio Verde/GO', divida: 1432100.87, estagio: 'Acordo', credor: 'Bradesco' },
  { nome: 'Coopernova Agric.', cidade: 'Sinop/MT', divida: 1298765.43, estagio: 'Acordo', credor: 'Itau' },
  { nome: 'Joao B. Fernandes', cidade: 'Cascavel/PR', divida: 987654.32, estagio: 'Proposta', credor: 'Sicredi' },
  { nome: 'Maria Aparecida Cruz', cidade: 'Londrina/PR', divida: 876543.21, estagio: 'Acordo', credor: 'Banco do Brasil' },
  { nome: 'Sitio Bela Vista', cidade: 'Uberlandia/MG', divida: 765432.10, estagio: 'Analise', credor: 'Santander' },
  { nome: 'Fernando R. Teixeira', cidade: 'Ribeirao Preto/SP', divida: 654321.98, estagio: 'Lead', credor: 'Banco do Brasil' },
  { nome: 'Agropec. Progresso', cidade: 'Rondonopolis/MT', divida: 543210.87, estagio: 'Acordo', credor: 'Caixa' },
]

// ────────────────────────────────────────────────────────────
// Rentabilidade Data
// ────────────────────────────────────────────────────────────

const RENTABILIDADE_MENSAL = [
  { mes: 'Nov/25', receita: 85000, custo: 32000, lucro: 53000 },
  { mes: 'Dez/25', receita: 92000, custo: 35000, lucro: 57000 },
  { mes: 'Jan/26', receita: 78000, custo: 30000, lucro: 48000 },
  { mes: 'Fev/26', receita: 105000, custo: 38000, lucro: 67000 },
  { mes: 'Mar/26', receita: 118000, custo: 41000, lucro: 77000 },
  { mes: 'Abr/26', receita: 95000, custo: 36000, lucro: 59000 },
]

// ────────────────────────────────────────────────────────────
// Propostas Data
// ────────────────────────────────────────────────────────────

const PROPOSTAS_KPIS = [
  { label: 'Propostas Enviadas', valor: '34', sub: 'ultimos 90 dias' },
  { label: 'Taxa de Aceite', valor: '62%', sub: '21 de 34' },
  { label: 'Tempo Medio Resposta', valor: '12 dias', sub: 'mediana: 9 dias' },
  { label: 'Volume Total', valor: fmtBRLCompact(14_870_000), sub: 'em negociacao' },
]

const PROPOSTAS_STATUS = [
  { name: 'Aceitas', value: 21, color: '#27AE60' },
  { name: 'Pendentes', value: 8, color: '#C9A84C' },
  { name: 'Rejeitadas', value: 5, color: '#C0392B' },
]

// ────────────────────────────────────────────────────────────
// Fluxo Caixa Data
// ────────────────────────────────────────────────────────────

const FLUXO_MENSAL = [
  { mes: 'Jan/26', entrada: 245000, saida: 180000, saldo: 65000 },
  { mes: 'Fev/26', entrada: 312000, saida: 195000, saldo: 117000 },
  { mes: 'Mar/26', entrada: 287000, saida: 210000, saldo: 77000 },
  { mes: 'Abr/26', entrada: 198000, saida: 175000, saldo: 23000 },
  { mes: 'Mai/26', entrada: 356000, saida: 220000, saldo: 136000 },
  { mes: 'Jun/26', entrada: 420000, saida: 240000, saldo: 180000 },
]

// ────────────────────────────────────────────────────────────
// Auditoria Data
// ────────────────────────────────────────────────────────────

const AUDITORIA_LOG = [
  { data: '16/04/2026 08:32', usuario: 'Christian Oliveira', acao: 'Login no sistema', tipo: 'acesso', status: 'ok' },
  { data: '16/04/2026 08:45', usuario: 'Christian Oliveira', acao: 'Consulta dados Ailton Caeiro', tipo: 'dados_pessoais', status: 'ok' },
  { data: '16/04/2026 09:12', usuario: 'Christian Oliveira', acao: 'Geracao proposta PDF #2026-047', tipo: 'documento', status: 'ok' },
  { data: '15/04/2026 17:30', usuario: 'Sistema', acao: 'Backup automatico banco de dados', tipo: 'sistema', status: 'ok' },
  { data: '15/04/2026 14:20', usuario: 'Christian Oliveira', acao: 'Exportacao relatorio clientes', tipo: 'exportacao', status: 'ok' },
  { data: '15/04/2026 11:45', usuario: 'API', acao: 'Consulta SERASA - Paulo Luciano', tipo: 'api_externa', status: 'ok' },
  { data: '14/04/2026 16:00', usuario: 'Sistema', acao: 'Anonimizacao dados ex-cliente #032', tipo: 'lgpd', status: 'ok' },
  { data: '14/04/2026 10:30', usuario: 'Christian Oliveira', acao: 'Atualizacao contrato Fazenda Santa Rita', tipo: 'documento', status: 'ok' },
]

// ────────────────────────────────────────────────────────────
// Chart Tooltip
// ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl border border-aletis-borda shadow-lg p-3">
      <p className="text-xs font-semibold text-aletis-grafite-escuro mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color || p.fill }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? fmtBRLCompact(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-white rounded-xl border border-aletis-borda shadow-lg p-3">
      <p className="text-xs font-semibold" style={{ color: d.payload.color }}>{d.name}</p>
      <p className="text-xs text-aletis-grafite-medio">{d.value} clientes</p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Report Content Components
// ────────────────────────────────────────────────────────────

function PortfolioContent({ onExport }: { onExport: (fmt: string) => void }) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PORTFOLIO_KPIs.map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${kpi.corBg} flex items-center justify-center`}>
                <kpi.icon className="w-5 h-5" style={{ color: kpi.cor }} />
              </div>
              <div>
                <p className="text-[11px] font-body text-aletis-grafite-claro">{kpi.label}</p>
                <p className="text-2xl font-display font-bold text-aletis-grafite-escuro">{kpi.valor}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar: Clientes por Estado */}
        <div className="card p-5">
          <h3 className="text-sm font-display font-bold text-aletis-grafite-escuro mb-4">
            Clientes por Estado
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={CLIENTES_POR_ESTADO}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" />
                <XAxis dataKey="estado" tick={{ fontSize: 11, fill: '#4A4A4A' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6B6B6B' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="clientes"
                  name="Clientes"
                  fill="#0F4C35"
                  radius={[4, 4, 0, 0]}
                  barSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie: Clientes por Estagio */}
        <div className="card p-5">
          <h3 className="text-sm font-display font-bold text-aletis-grafite-escuro mb-4">
            Clientes por Estagio
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={CLIENTES_POR_ESTAGIO}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={45}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name} (${value})`}
                  labelLine={{ stroke: '#6B6B6B', strokeWidth: 0.5 }}
                >
                  {CLIENTES_POR_ESTAGIO.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table: Top 10 */}
      <div className="card p-5">
        <h3 className="text-sm font-display font-bold text-aletis-grafite-escuro mb-4">
          Top 10 Clientes por Volume de Divida
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-aletis-borda">
                <th className="text-left py-2.5 px-3 font-display font-bold text-aletis-grafite-escuro text-xs">#</th>
                <th className="text-left py-2.5 px-3 font-display font-bold text-aletis-grafite-escuro text-xs">Cliente</th>
                <th className="text-left py-2.5 px-3 font-display font-bold text-aletis-grafite-escuro text-xs">Cidade</th>
                <th className="text-left py-2.5 px-3 font-display font-bold text-aletis-grafite-escuro text-xs">Credor</th>
                <th className="text-right py-2.5 px-3 font-display font-bold text-aletis-grafite-escuro text-xs">Divida</th>
                <th className="text-center py-2.5 px-3 font-display font-bold text-aletis-grafite-escuro text-xs">Estagio</th>
              </tr>
            </thead>
            <tbody>
              {TOP_CLIENTES.map((c, idx) => {
                const estagioColor: Record<string, string> = {
                  Lead: 'bg-gray-100 text-gray-600',
                  Qualificacao: 'bg-blue-50 text-blue-600',
                  Analise: 'bg-purple-50 text-purple-600',
                  Proposta: 'bg-aletis-dourado/10 text-aletis-dourado-escuro',
                  Negociacao: 'bg-ambar/10 text-ambar',
                  Acordo: 'bg-positivo/10 text-positivo',
                  Concluido: 'bg-aletis-verde/10 text-aletis-verde',
                }
                return (
                  <tr
                    key={c.nome}
                    className={`border-b border-aletis-borda/50 hover:bg-aletis-verde/5 transition-colors ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-aletis-bege/30'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-xs text-aletis-grafite-claro font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-body font-medium text-aletis-grafite-escuro text-xs">{c.nome}</span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-aletis-grafite-medio font-body">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-aletis-grafite-claro" />
                        {c.cidade}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-aletis-grafite-medio font-body">{c.credor}</td>
                    <td className="py-2.5 px-3 text-right text-xs font-mono font-medium text-aletis-grafite-escuro">
                      {fmtBRL(c.divida)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold ${estagioColor[c.estagio] || 'bg-gray-100 text-gray-500'}`}>
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
        <button onClick={() => onExport('PDF')} className="btn-primary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar PDF
        </button>
        <button onClick={() => onExport('Excel')} className="btn-outline flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>
    </div>
  )
}

function RentabilidadeContent({ onExport }: { onExport: (fmt: string) => void }) {
  const totalReceita = RENTABILIDADE_MENSAL.reduce((s, r) => s + r.receita, 0)
  const totalLucro = RENTABILIDADE_MENSAL.reduce((s, r) => s + r.lucro, 0)
  const margemMedia = (totalLucro / totalReceita * 100)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Receita Total', valor: fmtBRLCompact(totalReceita), cor: '#0F4C35', bg: 'bg-aletis-verde/10' },
          { label: 'Lucro Liquido', valor: fmtBRLCompact(totalLucro), cor: '#27AE60', bg: 'bg-positivo/10' },
          { label: 'Margem Media', valor: `${margemMedia.toFixed(1)}%`, cor: '#C9A84C', bg: 'bg-aletis-dourado/10' },
          { label: 'ROI Periodo', valor: '287%', cor: '#3B82F6', bg: 'bg-blue-50' },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <p className="text-[11px] font-body text-aletis-grafite-claro mb-1">{kpi.label}</p>
            <p className="text-2xl font-display font-bold text-aletis-grafite-escuro">{kpi.valor}</p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-display font-bold text-aletis-grafite-escuro mb-4">
          Receita vs Custo vs Lucro — Ultimos 6 Meses
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={RENTABILIDADE_MENSAL}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#4A4A4A' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6B6B6B' }} tickFormatter={(v) => fmtBRLCompact(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="receita" name="Receita" fill="#0F4C35" radius={[4, 4, 0, 0]} barSize={24} />
              <Bar dataKey="custo" name="Custo" fill="#C0392B" radius={[4, 4, 0, 0]} barSize={24} />
              <Bar dataKey="lucro" name="Lucro" fill="#27AE60" radius={[4, 4, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => onExport('PDF')} className="btn-primary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar PDF
        </button>
        <button onClick={() => onExport('Excel')} className="btn-outline flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>
    </div>
  )
}

function PropostasContent({ onExport }: { onExport: (fmt: string) => void }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PROPOSTAS_KPIS.map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <p className="text-[11px] font-body text-aletis-grafite-claro">{kpi.label}</p>
            <p className="text-2xl font-display font-bold text-aletis-grafite-escuro mt-1">{kpi.valor}</p>
            <p className="text-[10px] font-body text-aletis-grafite-claro mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-display font-bold text-aletis-grafite-escuro mb-4">
            Status das Propostas
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={PROPOSTAS_STATUS}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={50}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {PROPOSTAS_STATUS.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-display font-bold text-aletis-grafite-escuro mb-4">
            Tempo de Resposta (dias)
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { faixa: '1-5d', qtd: 8 },
                { faixa: '6-10d', qtd: 12 },
                { faixa: '11-15d', qtd: 7 },
                { faixa: '16-20d', qtd: 4 },
                { faixa: '21-30d', qtd: 2 },
                { faixa: '30d+', qtd: 1 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" />
                <XAxis dataKey="faixa" tick={{ fontSize: 11, fill: '#4A4A4A' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6B6B6B' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="qtd" name="Propostas" fill="#C9A84C" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => onExport('PDF')} className="btn-primary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar PDF
        </button>
        <button onClick={() => onExport('Excel')} className="btn-outline flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>
    </div>
  )
}

function MercadoContent({ onExport }: { onExport: (fmt: string) => void }) {
  const indicadores = [
    { nome: 'Soja (saca 60kg)', valor: 'R$ 128,50', variacao: '+2,3%', up: true },
    { nome: 'Milho (saca 60kg)', valor: 'R$ 62,80', variacao: '-0,8%', up: false },
    { nome: 'Dolar Comercial', valor: 'R$ 5,12', variacao: '+0,4%', up: true },
    { nome: 'Selic (aa)', valor: '14,25%', variacao: '0,0%', up: true },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {indicadores.map((ind) => (
          <div key={ind.nome} className="card p-4">
            <p className="text-[11px] font-body text-aletis-grafite-claro">{ind.nome}</p>
            <p className="text-xl font-display font-bold text-aletis-grafite-escuro mt-1">{ind.valor}</p>
            <p className={`text-xs font-body mt-0.5 ${ind.up ? 'text-positivo' : 'text-alerta'}`}>{ind.variacao}</p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-display font-bold text-aletis-grafite-escuro mb-4">
          Evolucao Precos Commodities (ultimos 6 meses)
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { mes: 'Nov/25', soja: 121.4, milho: 64.2 },
              { mes: 'Dez/25', soja: 124.8, milho: 63.5 },
              { mes: 'Jan/26', soja: 126.2, milho: 61.8 },
              { mes: 'Fev/26', soja: 130.1, milho: 60.2 },
              { mes: 'Mar/26', soja: 127.5, milho: 63.1 },
              { mes: 'Abr/26', soja: 128.5, milho: 62.8 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#4A4A4A' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6B6B6B' }} tickFormatter={(v) => `R$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="soja" name="Soja" fill="#C9A84C" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="milho" name="Milho" fill="#27AE60" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => onExport('PDF')} className="btn-primary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar PDF
        </button>
        <button onClick={() => onExport('Excel')} className="btn-outline flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>
    </div>
  )
}

function FluxoCaixaContent({ onExport }: { onExport: (fmt: string) => void }) {
  const totalEntrada = FLUXO_MENSAL.reduce((s, r) => s + r.entrada, 0)
  const totalSaida = FLUXO_MENSAL.reduce((s, r) => s + r.saida, 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Entradas', valor: fmtBRLCompact(totalEntrada), cor: 'text-positivo' },
          { label: 'Total Saidas', valor: fmtBRLCompact(totalSaida), cor: 'text-alerta' },
          { label: 'Saldo Liquido', valor: fmtBRLCompact(totalEntrada - totalSaida), cor: 'text-aletis-verde' },
          { label: 'Projecao Jun/26', valor: fmtBRLCompact(420000), cor: 'text-aletis-dourado-escuro' },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <p className="text-[11px] font-body text-aletis-grafite-claro">{kpi.label}</p>
            <p className={`text-2xl font-display font-bold ${kpi.cor} mt-1`}>{kpi.valor}</p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-display font-bold text-aletis-grafite-escuro mb-4">
          Fluxo de Caixa Mensal
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={FLUXO_MENSAL}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#4A4A4A' }} />
              <YAxis tick={{ fontSize: 10, fill: '#6B6B6B' }} tickFormatter={(v) => fmtBRLCompact(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="entrada" name="Entradas" fill="#27AE60" radius={[4, 4, 0, 0]} barSize={24} />
              <Bar dataKey="saida" name="Saidas" fill="#C0392B" radius={[4, 4, 0, 0]} barSize={24} />
              <Bar dataKey="saldo" name="Saldo" fill="#C9A84C" radius={[4, 4, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => onExport('PDF')} className="btn-primary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar PDF
        </button>
        <button onClick={() => onExport('Excel')} className="btn-outline flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>
    </div>
  )
}

function AuditoriaContent({ onExport }: { onExport: (fmt: string) => void }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Acoes Registradas', valor: '1.247', cor: '#0F4C35', bg: 'bg-aletis-verde/10', Icon: Eye },
          { label: 'Consultas LGPD', valor: '86', cor: '#3B82F6', bg: 'bg-blue-50', Icon: Shield },
          { label: 'Exportacoes', valor: '34', cor: '#C9A84C', bg: 'bg-aletis-dourado/10', Icon: Download },
          { label: 'Alertas', valor: '0', cor: '#27AE60', bg: 'bg-positivo/10', Icon: CheckCircle2 },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                <kpi.Icon className="w-5 h-5" style={{ color: kpi.cor }} />
              </div>
              <div>
                <p className="text-[11px] font-body text-aletis-grafite-claro">{kpi.label}</p>
                <p className="text-2xl font-display font-bold text-aletis-grafite-escuro">{kpi.valor}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-display font-bold text-aletis-grafite-escuro mb-4">
          Log de Atividades Recentes
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-aletis-borda">
                <th className="text-left py-2.5 px-3 font-display font-bold text-aletis-grafite-escuro text-xs">Data/Hora</th>
                <th className="text-left py-2.5 px-3 font-display font-bold text-aletis-grafite-escuro text-xs">Usuario</th>
                <th className="text-left py-2.5 px-3 font-display font-bold text-aletis-grafite-escuro text-xs">Acao</th>
                <th className="text-center py-2.5 px-3 font-display font-bold text-aletis-grafite-escuro text-xs">Tipo</th>
                <th className="text-center py-2.5 px-3 font-display font-bold text-aletis-grafite-escuro text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {AUDITORIA_LOG.map((log, idx) => {
                const tipoColors: Record<string, string> = {
                  acesso: 'bg-blue-50 text-blue-600',
                  dados_pessoais: 'bg-purple-50 text-purple-600',
                  documento: 'bg-aletis-dourado/10 text-aletis-dourado-escuro',
                  sistema: 'bg-gray-100 text-gray-600',
                  exportacao: 'bg-ambar/10 text-ambar',
                  api_externa: 'bg-aletis-verde/10 text-aletis-verde',
                  lgpd: 'bg-alerta/10 text-alerta',
                }
                return (
                  <tr
                    key={idx}
                    className={`border-b border-aletis-borda/50 hover:bg-aletis-verde/5 transition-colors ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-aletis-bege/30'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-xs font-mono text-aletis-grafite-medio">{log.data}</td>
                    <td className="py-2.5 px-3 text-xs font-body text-aletis-grafite-escuro font-medium">{log.usuario}</td>
                    <td className="py-2.5 px-3 text-xs font-body text-aletis-grafite-medio">{log.acao}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${tipoColors[log.tipo] || 'bg-gray-100 text-gray-500'}`}>
                        {log.tipo.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-positivo">
                        <CheckCircle2 className="w-3 h-3" />
                        OK
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-aletis-bege/80 rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-aletis-verde flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-display font-bold text-aletis-grafite-escuro">Conformidade LGPD</p>
          <p className="text-[11px] font-body text-aletis-grafite-medio mt-1">
            Todos os acessos a dados pessoais sao registrados conforme Art. 37 da LGPD (Lei 13.709/2018).
            Dados anonimizados automaticamente apos encerramento de contrato. Ultimo backup: 15/04/2026 17:30.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => onExport('PDF')} className="btn-primary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar PDF
        </button>
        <button onClick={() => onExport('Excel')} className="btn-outline flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

export default function Relatorios() {
  const [selectedReport, setSelectedReport] = useState<ReportId | null>(null)
  const { toasts, show: showToast, dismiss: dismissToast } = useToast()

  const buildReportData = (id: ReportId): ReportData => {
    const def = REPORTS.find(r => r.id === id)!
    const base = { titulo: def.titulo, subtitulo: def.descricao, gerado: nowStr() }

    if (id === 'portfolio') {
      return {
        id: 'portfolio_clientes',
        ...base,
        sections: [
          {
            tipo: 'kpis', titulo: 'Indicadores Principais',
            kpis: PORTFOLIO_KPIs.map(k => ({ label: k.label, valor: k.valor })),
          },
          {
            tipo: 'tabela', titulo: 'Clientes por Estado',
            colunas: ['Estado', 'Qtd Clientes'],
            linhas: CLIENTES_POR_ESTADO.map(c => [c.estado, c.clientes]),
          },
          {
            tipo: 'tabela', titulo: 'Clientes por Estagio',
            colunas: ['Estagio', 'Qtd'],
            linhas: CLIENTES_POR_ESTAGIO.map(c => [c.name, c.value]),
          },
          {
            tipo: 'tabela', titulo: 'Top 10 Clientes por Divida',
            colunas: ['Cliente', 'Cidade/UF', 'Divida', 'Estagio', 'Credor'],
            linhas: TOP_CLIENTES.map(c => [c.nome, c.cidade, fmtBRL(c.divida), c.estagio, c.credor]),
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
            tipo: 'tabela', titulo: 'Rentabilidade Mensal',
            colunas: ['Mes', 'Receita', 'Custo', 'Lucro'],
            linhas: RENTABILIDADE_MENSAL.map(r => [r.mes, fmtBRL(r.receita), fmtBRL(r.custo), fmtBRL(r.lucro)]),
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
            tipo: 'kpis', titulo: 'KPIs de Propostas',
            kpis: PROPOSTAS_KPIS.map(k => ({ label: k.label, valor: `${k.valor} (${k.sub})` })),
          },
          {
            tipo: 'tabela', titulo: 'Status das Propostas',
            colunas: ['Status', 'Quantidade'],
            linhas: PROPOSTAS_STATUS.map(p => [p.name, p.value]),
          },
        ],
      }
    }
    if (id === 'mercado') {
      return {
        id: 'inteligencia_mercado',
        ...base,
        sections: [
          {
            tipo: 'texto', titulo: 'Resumo',
            texto: 'Relatorio de inteligencia de mercado com indicadores econômicos (Selic, IPCA, Dolar), preços de commodities agrícolas (soja, milho, café, boi gordo, cafe arabica) e projeções de mercado. Dados obtidos em tempo real via APIs do BCB, CONAB e CEPEA.',
          },
        ],
      }
    }
    if (id === 'fluxo') {
      return {
        id: 'fluxo_caixa',
        ...base,
        sections: [
          {
            tipo: 'tabela', titulo: 'Fluxo de Caixa Mensal',
            colunas: ['Mes', 'Entrada', 'Saida', 'Saldo'],
            linhas: FLUXO_MENSAL.map(f => [f.mes, fmtBRL(f.entrada), fmtBRL(f.saida), fmtBRL(f.saldo)]),
          },
        ],
      }
    }
    // auditoria
    return {
      id: 'auditoria_compliance',
      ...base,
      sections: [
        {
          tipo: 'tabela', titulo: 'Log de Auditoria',
          colunas: ['Data/Hora', 'Usuario', 'Acao', 'Tipo', 'Status'],
          linhas: AUDITORIA_LOG.map(a => [a.data, a.usuario, a.acao, a.tipo, a.status]),
        },
      ],
    }
  }

  const handleExport = (formato: string) => {
    if (!selectedReport) return
    const def = REPORTS.find(r => r.id === selectedReport)
    try {
      const data = buildReportData(selectedReport)
      if (formato === 'PDF') {
        exportPDF(data)
      } else {
        exportExcel(data)
      }
      showToast(`${def?.titulo} exportado em ${formato}`, 'success')
    } catch (err) {
      console.error('[Export] Erro:', err)
      showToast(`Erro ao exportar: ${err instanceof Error ? err.message : 'desconhecido'}`, 'warning')
    }
  }

  const ReportContent: Record<ReportId, React.FC<{ onExport: (fmt: string) => void }>> = {
    portfolio: PortfolioContent,
    rentabilidade: RentabilidadeContent,
    propostas: PropostasContent,
    mercado: MercadoContent,
    fluxo: FluxoCaixaContent,
    auditoria: AuditoriaContent,
  }

  const selectedDef = REPORTS.find(r => r.id === selectedReport)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-aletis-grafite-escuro">
            Relatorios
          </h1>
          <p className="text-aletis-grafite-medio mt-1 font-body text-sm">
            Relatorios dinamicos e exportacao de dados do sistema ALETIS
          </p>
        </div>
        {selectedReport && (
          <button
            onClick={() => setSelectedReport(null)}
            className="flex items-center gap-2 text-sm font-body text-aletis-verde hover:text-aletis-verde-medio transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar aos relatorios
          </button>
        )}
      </div>

      {/* ── Section 1: Report Grid ──────────────────────────────── */}
      {!selectedReport && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-aletis-verde" />
            <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">
              Relatorios Disponiveis
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {REPORTS.map((report) => {
              const Icon = report.icon
              return (
                <button
                  key={report.id}
                  onClick={() => setSelectedReport(report.id)}
                  className="text-left card p-5 group hover:shadow-lg hover:border-aletis-verde/40 hover:scale-[1.02] transition-all duration-300"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl ${report.corBg} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}
                    >
                      <Icon className="w-6 h-6" style={{ color: report.cor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-display font-bold text-aletis-grafite-escuro group-hover:text-aletis-verde transition-colors">
                        {report.titulo}
                      </h3>
                      <p className="text-xs font-body text-aletis-grafite-claro mt-1 leading-relaxed">
                        {report.descricao}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-aletis-grafite-claro group-hover:text-aletis-verde group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
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
          <div className="flex items-center gap-3 mb-6">
            <div
              className={`w-10 h-10 rounded-xl ${selectedDef.corBg} flex items-center justify-center`}
            >
              <selectedDef.icon className="w-5 h-5" style={{ color: selectedDef.cor }} />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">
                {selectedDef.titulo}
              </h2>
              <p className="text-xs font-body text-aletis-grafite-claro">
                {selectedDef.descricao}
              </p>
            </div>
            <span className="badge bg-aletis-verde/10 text-aletis-verde text-[10px] ml-auto">
              <Calendar className="w-3 h-3 mr-1" />
              Abr 2026
            </span>
          </div>

          {(() => {
            const Content = ReportContent[selectedReport]
            return <Content onExport={handleExport} />
          })()}
        </section>
      )}

      {/* Bottom spacer */}
      <div className="h-8" />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
