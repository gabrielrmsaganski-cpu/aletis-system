import { SectionNav } from '../components/ui/SectionNav'
import PageHeader from '../components/ui/PageHeader'
/**
 * ADM Canarana — gestão administrativa executiva do escritório de Canarana.
 *
 * 8 abas:
 *   • Dashboard     — KPIs executivos, tendências, pipeline, alertas, metas
 *   • DRE           — Demonstração do Resultado do Exercício completa
 *   • Comercial     — Pipeline, metas vs realizado, projeções
 *   • Projetos      — Projetos de reestruturação / atividades comerciais (CRUD)
 *   • Receitas      — receitas do escritório (CRUD)
 *   • Despesas      — despesas operacionais por categoria (CRUD)
 *   • Funcionários  — quadro de funcionários (CRUD)
 *   • Folha         — folha de pagamento (CRUD)
 */
import React, { useState, useMemo, useEffect } from 'react'
import { useApi, apiFetch } from '../hooks/useApi'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Wallet,
  Plus,
  X,
  Edit3,
  Trash2,
  Calendar,
  DollarSign,
  Building2,
  Loader2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  FolderOpen,
  Briefcase,
  Search,
  Filter,
  ChevronRight,
  MessageSquare,
  Minus,
  PieChart,
  Activity,
  Flag,
  FileText,
  Download,
  Upload,
  Paperclip,
  Eye,
  Package,
} from 'lucide-react'

/* ================= Helpers ================= */

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

const fmtPct = (v: number): string => `${(v ?? 0).toFixed(1).replace('.', ',')}%`

const fmtDate = (iso?: string): string => {
  if (!iso) return '—'
  const s = iso.slice(0, 10)
  const parts = s.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

const currentCompetencia = (): string => new Date().toISOString().slice(0, 7)

const statusClasses = (status: string): string => {
  switch (status) {
    case 'ativo':
    case 'recebida':
    case 'pago':
    case 'concluido':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'previsto':
    case 'pendente':
    case 'prospeccao':
    case 'analise':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'atrasada':
    case 'atrasado':
    case 'perdido':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'proposta':
    case 'negociacao':
      return 'bg-sky-50 text-sky-700 border-sky-200'
    case 'contrato':
      return 'bg-violet-50 text-violet-700 border-violet-200'
    case 'ferias':
      return 'bg-sky-50 text-sky-700 border-sky-200'
    case 'afastado':
      return 'bg-orange-50 text-orange-700 border-orange-200'
    case 'desligado':
      return 'bg-gray-100 text-gray-600 border-gray-200'
    case 'urgente':
      return 'bg-red-100 text-red-800 border-red-300'
    case 'alta':
      return 'bg-orange-100 text-orange-800 border-orange-300'
    case 'media':
      return 'bg-blue-100 text-blue-800 border-blue-300'
    case 'baixa':
      return 'bg-gray-100 text-gray-700 border-gray-300'
    default:
      return 'bg-gray-50 text-gray-600 border-gray-200'
  }
}

const etapaLabel = (etapa: string): string => {
  const map: Record<string, string> = {
    prospeccao: 'Prospecção',
    analise: 'Análise',
    proposta: 'Proposta',
    negociacao: 'Negociação',
    contrato: 'Contrato',
    concluido: 'Concluído',
    perdido: 'Perdido',
  }
  return map[etapa] || etapa
}

const etapaOrdem = (etapa: string): number => {
  const map: Record<string, number> = { prospeccao: 0, analise: 1, proposta: 2, negociacao: 3, contrato: 4, concluido: 5, perdido: 6 }
  return map[etapa] ?? 99
}

/* ================= Tipos ================= */

type Tab = 'dashboard' | 'dre' | 'comercial' | 'projetos' | 'documentos' | 'receitas' | 'despesas' | 'funcionarios' | 'folha'

interface Funcionario {
  id: string
  nome: string
  cargo: string
  escritorio: string
  salarioBase: number
  dataContratacao?: string
  telefone?: string
  email?: string
  status: 'ativo' | 'ferias' | 'afastado' | 'desligado'
  observacoes?: string
}

interface Receita {
  id: string
  escritorio: string
  competencia: string
  descricao: string
  origem?: string
  valor: number
  dataRecebimento?: string
  formaPagamento?: string
  status: 'recebida' | 'previsto' | 'atrasada'
}

interface Despesa {
  id: string
  escritorio: string
  competencia: string
  descricao: string
  categoria: string
  fornecedor?: string
  valor: number
  dataPagamento?: string
  dataVencimento?: string
  status: 'pago' | 'pendente' | 'atrasado'
}

interface FolhaPagamento {
  id: string
  funcionarioId: string
  escritorio: string
  competencia: string
  salarioBase: number
  bonus: number
  descontos: number
  valorLiquido: number
  dataPagamento?: string
  status: 'pago' | 'previsto' | 'atrasado'
}

interface Meta {
  id: string
  escritorio: string
  competencia: string
  tipo: 'receita' | 'despesa' | 'folha' | 'contratos' | 'clientes'
  valorMeta: number
  atual: number
}

interface Projeto {
  id: string
  escritorio: string
  titulo: string
  cliente?: string
  consultor?: string
  valorEstimado: number
  valorFechado: number
  etapa: 'prospeccao' | 'analise' | 'proposta' | 'negociacao' | 'contrato' | 'concluido' | 'perdido'
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente'
  dataPrevisaoFechamento?: string
  observacoes?: string
}

interface Alerta {
  id: string
  tipo: string
  mensagem: string
  severidade: 'alta' | 'media' | 'baixa'
  valor?: number
}

/* ================= Componente principal ================= */

export default function AdmCanarana() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [competencia, setCompetencia] = useState<string>(currentCompetencia())
  const [toast, setToast] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [gerandoFechamento, setGerandoFechamento] = useState(false)
  const [fechamentoUrl, setFechamentoUrl] = useState<string | null>(null)
  const [fechamentoLoading, setFechamentoLoading] = useState(false)

  const showToast = (tipo: 'sucesso' | 'erro', msg: string) => {
    setToast({ tipo, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const refresh = () => setRefreshKey((k) => k + 1)

  const tabs: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'dre', label: 'DRE', icon: PieChart },
    { key: 'comercial', label: 'Comercial', icon: Target },
    { key: 'projetos', label: 'Projetos', icon: FolderOpen },
    { key: 'documentos', label: 'Documentos', icon: FileText },
    { key: 'receitas', label: 'Receitas', icon: TrendingUp },
    { key: 'despesas', label: 'Despesas', icon: TrendingDown },
    { key: 'funcionarios', label: 'Funcionários', icon: Users },
    { key: 'folha', label: 'Folha', icon: Wallet },
  ]

  return (
    <div className="min-h-screen bg-aletis-bege">
      {/* Header */}
      <PageHeader eyebrow="Escritório Canarana" title={<>Administrativo Canarana</>} description={<> <p className="mt-2 max-w-2xl font-body text-sm text-[var(--text-soft)] lg:text-base">
              Gestão executiva do escritório: finanças, DRE, pipeline comercial, projetos e equipe — tudo em uma tela.
            </p> </>} actions={<> <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('documentos')}
              className="flex items-center gap-2 rounded-xl border border-aletis-dourado/40 bg-aletis-dourado/15 px-3 py-2 text-sm font-medium text-[var(--text-strong)]  transition hover:bg-aletis-dourado/25"
            >
              <Upload className="h-4 w-4" /> Documentos
            </button>
            <button
              onClick={() => setGerandoFechamento(true)}
              className="flex items-center gap-2 rounded-xl border border-aletis-borda bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-soft)]  transition hover:bg-[var(--bg-surface)]"
            >
              <Package className="h-4 w-4" /> Fechamento
            </button>
            <label className="flex items-center gap-2 rounded-xl border border-aletis-borda bg-[var(--bg-surface)] px-3 py-2 ">
              <Calendar className="h-4 w-4 text-[var(--text-strong)]" />
              <input
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                className="bg-transparent text-sm text-[var(--text-soft)] focus:outline-none"
              />
            </label>
          </div> </>} />

      <SectionNav label="Áreas de administração" items={tabs.map(item => ({ id: item.key, label: item.label === 'Dashboard' ? 'Visão geral' : item.label, icon: item.icon }))} active={tab} onChange={setTab} />

      {/* Conteúdo */}
      <div>
        {tab === 'dashboard' && <DashboardSection competencia={competencia} refreshKey={refreshKey} showToast={showToast} />}
        {tab === 'dre' && <DRESection competencia={competencia} refreshKey={refreshKey} />}
        {tab === 'comercial' && <ComercialSection competencia={competencia} refreshKey={refreshKey} showToast={showToast} />}
        {tab === 'projetos' && <ProjetosSection showToast={showToast} refresh={refresh} refreshKey={refreshKey} />}
        {tab === 'documentos' && <DocumentosSection competencia={competencia} showToast={showToast} refresh={refresh} refreshKey={refreshKey} />}
        {tab === 'receitas' && <ReceitasSection competencia={competencia} showToast={showToast} refresh={refresh} refreshKey={refreshKey} />}
        {tab === 'despesas' && <DespesasSection competencia={competencia} showToast={showToast} refresh={refresh} refreshKey={refreshKey} />}
        {tab === 'funcionarios' && <FuncionariosSection showToast={showToast} refresh={refresh} refreshKey={refreshKey} />}
        {tab === 'folha' && <FolhaSection competencia={competencia} showToast={showToast} refresh={refresh} refreshKey={refreshKey} />}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 shadow-lg transition" style={{
          backgroundColor: toast.tipo === 'sucesso' ? '#ecfdf5' : '#fef2f2',
          borderColor: toast.tipo === 'sucesso' ? '#a7f3d0' : '#fecaca',
          color: toast.tipo === 'sucesso' ? '#047857' : '#b91c1c',
        }}>
          <span className="text-sm font-medium">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Modal de Fechamento */}
      {gerandoFechamento && (
        <Modal title="Fechamento Mensal para Contador" onClose={() => { setGerandoFechamento(false); setFechamentoUrl(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-soft)]">
              O fechamento gera um pacote ZIP com CSVs de receitas, despesas e folha, manifesto JSON e relatório HTML formatado para envio ao contador.
            </p>
            <div className="rounded-lg border border-aletis-borda/40 bg-aletis-bege/30 p-3 text-xs text-[var(--text-soft)]">
              <strong>Competência:</strong> {competencia}<br />
              <strong>Conteúdo:</strong> manifesto.json, receitas.csv, despesas.csv, folha.csv, fechamento.html, anexos/
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setGerandoFechamento(false); setFechamentoUrl(null); }} className="rounded-lg border border-aletis-borda/60 px-3 py-2 text-sm font-medium hover:bg-aletis-bege">Cancelar</button>
              <button
                onClick={async () => {
                  setFechamentoLoading(true)
                  try {
                    const res = await apiFetch<any>(`/adm-canarana/fechamento/${competencia}/gerar`)
                    setFechamentoUrl(`/api${res.download}`)
                    showToast('sucesso', 'Fechamento gerado com sucesso!')
                  } catch (err: any) {
                    showToast('erro', err.message || 'Erro ao gerar fechamento')
                  } finally {
                    setFechamentoLoading(false)
                  }
                }}
                disabled={fechamentoLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-3 py-2 text-sm font-medium text-white hover:bg-aletis-verde-escuro disabled:opacity-50"
              >
                {fechamentoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                {fechamentoLoading ? 'Gerando...' : 'Gerar Pacote'}
              </button>
            </div>
            {fechamentoUrl && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="mb-2 text-sm font-medium text-emerald-800">Pacote pronto!</div>
                <div className="flex gap-2">
                  <a href={fechamentoUrl} download className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700">
                    <Download className="h-3.5 w-3.5" /> Baixar ZIP
                  </a>
                  <a href={`/api/adm-canarana/fechamento/${competencia}/preview`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                    <Eye className="h-3.5 w-3.5" /> Visualizar HTML
                  </a>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ================= Dashboard Executivo ================= */

function DashboardSection({
  competencia,
  refreshKey,
  showToast,
}: {
  competencia: string
  refreshKey: number
  showToast(t: 'sucesso' | 'erro', m: string): void
}) {
  const { data: dash, loading } = useApi<any>(`/adm-canarana/dashboard?competencia=${encodeURIComponent(competencia)}`, null)
  const { data: alertasData } = useApi<{ alertas: Alerta[]; total: number; criticos: number }>(`/adm-canarana/alertas?competencia=${encodeURIComponent(competencia)}`, { alertas: [], total: 0, criticos: 0 })
  const ano = Number(competencia.slice(0, 4))
  const { data: fluxo } = useApi<Array<{ competencia: string; receita: number; despesa: number; folha: number; saldo: number }>>(`/adm-canarana/fluxo-anual/${ano}`, [])

  const resumo = dash?.resumo
  const metas = dash?.metas || []
  const projetos = dash?.projetos || []

  const metaRec = metas.find((m: Meta) => m.tipo === 'receita')
  const metaDesp = metas.find((m: Meta) => m.tipo === 'despesa')
  const metaFolha = metas.find((m: Meta) => m.tipo === 'folha')

  const maxBar = useMemo(() => {
    if (!fluxo.length) return 1
    return Math.max(...fluxo.map((f) => Math.max(f.receita, f.despesa + f.folha)), 1)
  }, [fluxo])

  const alertas = alertasData?.alertas || []
  const criticos = alertasData?.criticos || 0

  return (
    <div className="space-y-6">
      {/* KPIs linha 1 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Receita do mês" value={fmtBRL(resumo?.totalReceitas ?? 0)} icon={TrendingUp} tone="verde" loading={loading} extra={metaRec ? `${fmtPct(Math.min(100, (resumo?.totalReceitas / metaRec.valorMeta) * 100))} da meta` : undefined} />
        <KpiCard label="Despesas" value={fmtBRL(resumo?.totalDespesas ?? 0)} icon={TrendingDown} tone="vermelho" loading={loading} extra={metaDesp ? `${fmtPct(Math.min(100, (resumo?.totalDespesas / metaDesp.valorMeta) * 100))} da meta` : undefined} />
        <KpiCard label="Folha + Encargos" value={fmtBRL(resumo?.totalFolha ?? 0)} icon={Wallet} tone="amber" loading={loading} extra={metaFolha ? `${fmtPct(Math.min(100, (resumo?.totalFolha / metaFolha.valorMeta) * 100))} da meta` : undefined} />
        <KpiCard label="Lucro Operacional" value={fmtBRL(resumo?.saldo ?? 0)} icon={DollarSign} tone={(resumo?.saldo ?? 0) >= 0 ? 'verde' : 'vermelho'} loading={loading} extra={resumo?.margemPercentual != null ? `Margem ${fmtPct(resumo.margemPercentual)}` : undefined} />
      </div>

      {/* KPIs linha 2 — comercial */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Valor em Pipeline" value={fmtBRL(resumo?.pipelineValor ?? 0)} icon={Briefcase} tone="sky" loading={loading} />
        <KpiCard label="Fechado no mês" value={fmtBRL(resumo?.pipelineFechado ?? 0)} icon={CheckCircle2} tone="verde" loading={loading} />
        <KpiCard label="Propostas Ativas" value={String(resumo?.propostasAtivas ?? 0)} icon={Target} tone="amber" loading={loading} />
        <KpiCard label="Novos Clientes" value={String(resumo?.novosClientes ?? 0)} icon={Users} tone="indigo" loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Gráfico fluxo anual */}
        <div className="rounded-xl border border-aletis-borda/60 bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-foreground">Fluxo Anual — {ano}</h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Receita</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Despesa</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Folha</span>
            </div>
          </div>
          {fluxo.length === 0 ? (
            <EmptyState text="Sem dados para o ano selecionado." />
          ) : (
            <div className="space-y-3">
              {fluxo.map((f) => {
                const nomeMes = f.competencia.slice(5, 7) + '/' + f.competencia.slice(0, 4)
                const wRec = Math.max(2, Math.round((f.receita / maxBar) * 100))
                const wDesp = Math.max(2, Math.round(((f.despesa + f.folha) / maxBar) * 100))
                const ativo = f.competencia === competencia
                return (
                  <div key={f.competencia} className={`flex items-center gap-3 rounded-lg px-2 py-1 ${ativo ? 'bg-aletis-verde/5' : ''}`}>
                    <div className="w-12 text-xs font-semibold text-[var(--text-soft)]">{nomeMes}</div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded bg-emerald-400 transition-all" style={{ width: `${wRec}%` }} />
                        <span className="w-20 text-[11px] text-aletis-grafite-medio/70">{fmtBRL(f.receita)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 rounded bg-red-400 transition-all" style={{ width: `${wDesp}%` }} />
                        <span className="w-20 text-[11px] text-aletis-grafite-medio/70">{fmtBRL(f.despesa + f.folha)}</span>
                      </div>
                    </div>
                    <div className={`w-20 text-right text-[11px] font-bold ${f.saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmtBRL(f.saldo)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Painel direito: Alertas + Pipeline */}
        <div className="space-y-6">
          {/* Alertas */}
          <div className="rounded-xl border border-aletis-borda/60 bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Alertas
              </h3>
              {criticos > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{criticos} crítico(s)</span>}
            </div>
            {alertas.length === 0 ? (
              <div className="flex items-center gap-2 py-2 text-xs text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Nenhum alerta ativo. Tudo em ordem!
              </div>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {alertas.map((a) => (
                  <div key={a.id} className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${a.severidade === 'alta' ? 'border-red-100 bg-red-50 text-red-800' : a.severidade === 'media' ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-blue-100 bg-blue-50 text-blue-800'}`}>
                    {a.severidade === 'alta' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : a.severidade === 'media' ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    <div className="flex-1">
                      <div className="font-medium">{a.mensagem}</div>
                      {a.valor != null && <div className="mt-0.5 opacity-80">{fmtBRL(a.valor)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pipeline rápido */}
          <div className="rounded-xl border border-aletis-borda/60 bg-card p-5 shadow-sm">
            <h3 className="mb-3 font-display text-sm font-semibold text-foreground">Pipeline Rápido</h3>
            {projetos.length === 0 ? (
              <EmptyState text="Sem projetos cadastrados." />
            ) : (
              <div className="space-y-2">
                {['prospeccao', 'analise', 'proposta', 'negociacao', 'contrato', 'concluido'].map((etapa) => {
                  const count = projetos.filter((p: Projeto) => p.etapa === etapa).length
                  const valor = projetos.filter((p: Projeto) => p.etapa === etapa).reduce((s: number, p: Projeto) => s + p.valorEstimado, 0)
                  if (count === 0) return null
                  return (
                    <div key={etapa} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${
                          etapa === 'concluido' ? 'bg-emerald-400' :
                          etapa === 'contrato' ? 'bg-violet-400' :
                          etapa === 'negociacao' ? 'bg-sky-400' :
                          etapa === 'proposta' ? 'bg-amber-400' :
                          'bg-gray-300'
                        }`} />
                        <span className="text-[var(--text-soft)]">{etapaLabel(etapa)}</span>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-bold text-gray-600">{count}</span>
                      </div>
                      <span className="font-medium">{fmtBRL(valor)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metas vs Realizado + Categorias */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-aletis-borda/60 bg-card p-5 shadow-sm">
          <h3 className="mb-4 font-display text-sm font-semibold text-foreground">Metas vs Realizado</h3>
          <div className="space-y-4">
            <ProgressMeta label="Receita" atual={resumo?.totalReceitas ?? 0} meta={metaRec?.valorMeta ?? 0} cor="bg-emerald-500" />
            <ProgressMeta label="Despesas (limite)" atual={resumo?.totalDespesas ?? 0} meta={metaDesp?.valorMeta ?? 0} cor="bg-red-500" invert />
            <ProgressMeta label="Folha (limite)" atual={resumo?.totalFolha ?? 0} meta={metaFolha?.valorMeta ?? 0} cor="bg-amber-500" invert />
          </div>
          {!metaRec && !metaDesp && !metaFolha && (
            <div className="mt-3 text-xs text-aletis-grafite-medio/60">
              Cadastre metas na aba <strong>Comercial</strong> para acompanhar o progresso.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-aletis-borda/60 bg-card p-5 shadow-sm">
          <h3 className="mb-4 font-display text-sm font-semibold text-foreground">Receitas por Origem</h3>
          <div className="space-y-2">
            {Object.entries(dash?.receitasPorCategoria ?? {}).length === 0 && <div className="text-xs text-aletis-grafite-medio/60">Nenhuma receita no período.</div>}
            {Object.entries(dash?.receitasPorCategoria ?? {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-soft)]">{k}</span>
                <span className="font-semibold">{fmtBRL(v as number)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-aletis-borda/60 bg-card p-5 shadow-sm">
          <h3 className="mb-4 font-display text-sm font-semibold text-foreground">Despesas por Categoria</h3>
          <div className="space-y-2">
            {Object.entries(dash?.despesasPorCategoria ?? {}).length === 0 && <div className="text-xs text-aletis-grafite-medio/60">Nenhuma despesa no período.</div>}
            {Object.entries(dash?.despesasPorCategoria ?? {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-soft)]">{k}</span>
                <span className="font-semibold">{fmtBRL(v as number)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================= DRE ================= */

function DRESection({ competencia, refreshKey }: { competencia: string; refreshKey: number }) {
  const { data: dreData, loading } = useApi<any>(`/adm-canarana/dre?competencia=${encodeURIComponent(competencia)}`, null)
  const dre = dreData?.dre

  const linhas = [
    { label: 'Receita Bruta (recebida)', valor: dre?.receitaBruta, tipo: 'receita' },
    { label: 'Receita Prevista', valor: dre?.receitaPrevista, tipo: 'receita' },
    { label: 'Receita Total (bruta + prevista)', valor: dre?.receitaTotal, tipo: 'receita', destaque: true },
    { label: 'Impostos Simplificados (DAS/ISS ~6%)', valor: dre?.impostoSimplificado, tipo: 'despesa' },
    { label: 'Receita Líquida', valor: dre?.receitaLiquida, tipo: 'resultado', destaque: true },
    { label: 'Despesas Operacionais', valor: dre?.despesasOperacionais, tipo: 'despesa' },
    { label: 'Folha de Pagamento (líquida)', valor: dre?.totalFolha, tipo: 'despesa' },
    { label: 'Provisão INSS Patronal (~20%)', valor: dre?.provisaoINSS, tipo: 'despesa', observacao: 'Provisão' },
    { label: 'Provisão FGTS (~8%)', valor: dre?.provisaoFGTS, tipo: 'despesa', observacao: 'Provisão' },
    { label: 'Provisão 13º Salário', valor: dre?.provisao13, tipo: 'despesa', observacao: 'Provisão' },
    { label: 'Custo Total da Folha', valor: dre?.custoTotalFolha, tipo: 'despesa', destaque: true },
    { label: 'EBITDA', valor: dre?.ebitda, tipo: 'resultado', destaque: true },
    { label: 'Margem EBITDA', valor: dre?.margemEbitda, tipo: 'percentual', observacao: fmtPct(dre?.margemEbitda ?? 0) },
    { label: 'Depreciação Estimada', valor: dre?.depreciacao, tipo: 'despesa', observacao: 'Provisão' },
    { label: 'Lucro Operacional', valor: dre?.lucroOperacional, tipo: 'resultado', destaque: true },
    { label: 'Margem Operacional', valor: dre?.margemOperacional, tipo: 'percentual', observacao: fmtPct(dre?.margemOperacional ?? 0) },
    { label: 'Imposto de Renda (~15%)', valor: dre?.ir, tipo: 'despesa' },
    { label: 'Lucro Líquido', valor: dre?.lucroLiquido, tipo: 'resultado', destaque: true, grande: true },
    { label: 'Margem Líquida', valor: dre?.margemLiquida, tipo: 'percentual', observacao: fmtPct(dre?.margemLiquida ?? 0) },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    )
  }

  if (!dre) {
    return <EmptyState text="DRE não disponível para o período selecionado." />
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-xl border border-aletis-borda/60 bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Demonstração do Resultado do Exercício</h2>
            <p className="text-xs text-aletis-grafite-medio/70">Competência: {competencia}</p>
          </div>
          <div className={`rounded-xl border px-4 py-2 text-center ${dre.lucroLiquido >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <div className="text-[11px] font-medium uppercase tracking-wider text-aletis-grafite-medio/70">Lucro Líquido</div>
            <div className={`text-lg font-bold ${dre.lucroLiquido >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtBRL(dre.lucroLiquido)}</div>
          </div>
        </div>

        <div className="space-y-1">
          {linhas.map((l, i) => (
            <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              l.grande ? 'bg-aletis-verde/5 border border-aletis-verde/10' :
              l.destaque ? 'bg-gray-50' :
              l.tipo === 'resultado' ? 'font-semibold text-foreground' :
              ''
            }`}>
              <div className="flex items-center gap-2">
                <span className={l.tipo === 'receita' ? 'text-emerald-600' : l.tipo === 'despesa' ? 'text-red-500' : l.tipo === 'resultado' ? 'text-foreground' : 'text-[var(--text-soft)]'}>
                  {l.label}
                </span>
                {l.observacao && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{l.observacao}</span>}
              </div>
              <span className={`font-mono font-medium ${
                l.tipo === 'receita' ? 'text-emerald-700' :
                l.tipo === 'despesa' ? 'text-red-600' :
                l.tipo === 'resultado' && (l.valor ?? 0) >= 0 ? 'text-emerald-700' :
                l.tipo === 'resultado' ? 'text-red-700' :
                'text-[var(--text-soft)]'
              }`}>
                {l.tipo === 'percentual' ? l.observacao : fmtBRL(l.valor ?? 0)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-aletis-borda/40 bg-aletis-bege/30 p-4">
          <h4 className="mb-1 text-xs font-semibold text-foreground">Análise do CEO</h4>
          <p className="text-xs text-[var(--text-soft)]">
            {dre.margemLiquida >= 20
              ? 'Margem líquida excelente. O escritório está saudável e com capacidade de reinvestimento.'
              : dre.margemLiquida >= 10
              ? 'Margem líquida adequada. Monitore despesas operacionais para manter a saúde financeira.'
              : dre.margemLiquida >= 0
              ? 'Margem líquida baixa. Avalie redução de custos fixos e tempo de recebimento dos clientes.'
              : 'Resultado negativo. É necessário intervenção imediata nas despesas e aceleração de receitas.'}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ================= Comercial ================= */

function ComercialSection({
  competencia,
  refreshKey,
  showToast,
}: {
  competencia: string
  refreshKey: number
  showToast(t: 'sucesso' | 'erro', m: string): void
}) {
  const { data: metas, loading: loadingMetas, refetch: refetchMetas } = useApi<Meta[]>(`/adm-canarana/metas?competencia=${encodeURIComponent(competencia)}`, [])
  const { data: projetos, refetch: refetchProjetos } = useApi<Projeto[]>(`/adm-canarana/projetos`, [])
  const { data: dash } = useApi<any>(`/adm-canarana/dashboard?competencia=${encodeURIComponent(competencia)}`, null)
  const [modalMeta, setModalMeta] = useState<Meta | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { refetchMetas(); refetchProjetos() }, [refreshKey])

  const etapas = ['prospeccao', 'analise', 'proposta', 'negociacao', 'contrato', 'concluido', 'perdido']
  const pipelinePorEtapa = useMemo(() => {
    return etapas.map((etapa) => ({
      etapa,
      label: etapaLabel(etapa),
      count: projetos.filter((p) => p.etapa === etapa).length,
      valor: projetos.filter((p) => p.etapa === etapa).reduce((s, p) => s + p.valorEstimado, 0),
    }))
  }, [projetos])

  const totalPipeline = projetos.filter((p) => !['concluido', 'perdido'].includes(p.etapa)).reduce((s, p) => s + p.valorEstimado, 0)
  const totalFechado = projetos.filter((p) => p.etapa === 'concluido').reduce((s, p) => s + p.valorFechado, 0)
  const totalPerdido = projetos.filter((p) => p.etapa === 'perdido').reduce((s, p) => s + p.valorEstimado, 0)
  const taxaConversao = (totalFechado + totalPerdido) > 0 ? (totalFechado / (totalFechado + totalPerdido)) * 100 : 0

  async function handleMetaSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const body: any = {
      competencia: fd.get('competencia') as string,
      tipo: fd.get('tipo') as string,
      valorMeta: Number((fd.get('valorMeta') as string).replace(/\./g, '').replace(',', '.')),
      atual: Number(((fd.get('atual') as string) || '0').replace(/\./g, '').replace(',', '.')),
    }
    try {
      setSaving(true)
      if (modalMeta && modalMeta.id) {
        await apiFetch(`/adm-canarana/metas/${modalMeta.id}`, { method: 'PUT', body: JSON.stringify(body) })
        showToast('sucesso', 'Meta atualizada')
      } else {
        await apiFetch('/adm-canarana/metas', { method: 'POST', body: JSON.stringify(body) })
        showToast('sucesso', 'Meta criada')
      }
      setModalMeta(null)
      refetchMetas()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function excluirMeta(id: string) {
    if (!confirm('Excluir meta?')) return
    try {
      await apiFetch(`/adm-canarana/metas/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Meta excluída')
      refetchMetas()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao excluir')
    }
  }

  const resumo = dash?.resumo

  return (
    <div className="space-y-6">
      {/* KPIs comerciais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Pipeline Ativo" value={fmtBRL(totalPipeline)} icon={Target} tone="sky" />
        <KpiCard label="Fechado (total)" value={fmtBRL(totalFechado)} icon={CheckCircle2} tone="verde" />
        <KpiCard label="Perdido" value={fmtBRL(totalPerdido)} icon={TrendingDown} tone="vermelho" />
        <KpiCard label="Taxa de Conversão" value={fmtPct(taxaConversao)} icon={Activity} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pipeline visual */}
        <div className="rounded-xl border border-aletis-borda/60 bg-card p-5 shadow-sm">
          <h3 className="mb-4 font-display text-base font-semibold text-foreground">Funil de Vendas</h3>
          <div className="space-y-3">
            {pipelinePorEtapa.filter((p) => p.count > 0).map((p) => {
              const maxVal = Math.max(...pipelinePorEtapa.map((x) => x.valor), 1)
              const pct = Math.round((p.valor / maxVal) * 100)
              return (
                <div key={p.etapa} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{p.label}</span>
                    <span className="text-[var(--text-soft)]">{p.count} projeto(s) · {fmtBRL(p.valor)}</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-gray-100">
                    <div className="h-3 rounded-full bg-aletis-verde transition-all" style={{ width: `${Math.max(4, pct)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Metas */}
        <div className="rounded-xl border border-aletis-borda/60 bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-foreground">Metas do Mês</h3>
            <button onClick={() => setModalMeta({ id: '', escritorio: 'Canarana', competencia, tipo: 'receita', valorMeta: 0, atual: 0 } as Meta)} className="inline-flex items-center gap-1 rounded-lg bg-aletis-verde px-2.5 py-1.5 text-xs font-medium text-white hover:bg-aletis-verde-escuro">
              <Plus className="h-3.5 w-3.5" /> Meta
            </button>
          </div>
          {loadingMetas && <div className="py-4 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}
          {!loadingMetas && metas.length === 0 && <EmptyState text="Nenhuma meta para este mês." />}
          <div className="space-y-4">
            {metas.map((m) => {
              const real = m.tipo === 'receita' ? (resumo?.totalReceitas ?? 0) :
                           m.tipo === 'despesa' ? (resumo?.totalDespesas ?? 0) :
                           m.tipo === 'folha' ? (resumo?.totalFolha ?? 0) :
                           m.tipo === 'contratos' ? (resumo?.pipelineFechado ?? 0) :
                           m.atual
              const pct = m.valorMeta > 0 ? Math.min(100, (real / m.valorMeta) * 100) : 0
              return (
                <div key={m.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium capitalize text-foreground">{m.tipo}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-soft)]">{fmtBRL(real)} / {fmtBRL(m.valorMeta)}</span>
                      <button onClick={() => setModalMeta(m)} className="text-[var(--text-soft)] hover:text-aletis-verde"><Edit3 className="h-3 w-3" /></button>
                      <button onClick={() => excluirMeta(m.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-aletis-verde' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {modalMeta && (
        <Modal title={modalMeta.id ? 'Editar meta' : 'Nova meta'} onClose={() => setModalMeta(null)}>
          <form onSubmit={handleMetaSubmit} className="space-y-3">
            <input name="competencia" type="hidden" value={modalMeta.competencia || competencia} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Tipo</label>
                <select name="tipo" defaultValue={modalMeta.tipo} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                  <option value="folha">Folha</option>
                  <option value="contratos">Contratos</option>
                  <option value="clientes">Clientes</option>
                </select>
              </div>
              <Field label="Valor da meta" name="valorMeta" type="text" defaultValue={modalMeta.valorMeta ? String(modalMeta.valorMeta).replace('.', ',') : ''} required placeholder="0,00" />
              <Field label="Atual (opcional)" name="atual" type="text" defaultValue={modalMeta.atual ? String(modalMeta.atual).replace('.', ',') : '0'} placeholder="0,00" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalMeta(null)} className="rounded-lg border border-aletis-borda/60 px-3 py-2 text-sm font-medium hover:bg-aletis-bege">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-aletis-verde px-3 py-2 text-sm font-medium text-white hover:bg-aletis-verde-escuro disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

/* ================= Projetos ================= */

function ProjetosSection({
  showToast,
  refresh,
  refreshKey,
}: {
  showToast(t: 'sucesso' | 'erro', m: string): void
  refresh(): void
  refreshKey: number
}) {
  const [filtroEtapa, setFiltroEtapa] = useState<string>('')
  const [busca, setBusca] = useState('')
  const { data: projetos, loading, refetch } = useApi<Projeto[]>(`/adm-canarana/projetos${filtroEtapa ? `?etapa=${encodeURIComponent(filtroEtapa)}` : ''}`, [])
  const { data: crmClientes } = useApi<any[]>(`/adm-canarana/clientes`, [])
  const [modal, setModal] = useState<Projeto | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { refetch() }, [refreshKey, filtroEtapa, refetch])

  const filtered = useMemo(() => {
    if (!busca.trim()) return projetos
    const q = busca.toLowerCase()
    return projetos.filter((p) => p.titulo.toLowerCase().includes(q) || (p.cliente || '').toLowerCase().includes(q) || (p.consultor || '').toLowerCase().includes(q))
  }, [projetos, busca])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const body: any = {
      titulo: fd.get('titulo') as string,
      cliente: (fd.get('cliente') as string) || undefined,
      consultor: (fd.get('consultor') as string) || undefined,
      valorEstimado: Number((fd.get('valorEstimado') as string || '0').replace(/\./g, '').replace(',', '.')),
      valorFechado: Number((fd.get('valorFechado') as string || '0').replace(/\./g, '').replace(',', '.')),
      etapa: fd.get('etapa') as string,
      prioridade: fd.get('prioridade') as string,
      dataPrevisaoFechamento: (fd.get('dataPrevisaoFechamento') as string) || undefined,
      observacoes: (fd.get('observacoes') as string) || undefined,
    }
    try {
      setSaving(true)
      if (modal && modal.id) {
        await apiFetch(`/adm-canarana/projetos/${modal.id}`, { method: 'PUT', body: JSON.stringify(body) })
        showToast('sucesso', 'Projeto atualizado')
      } else {
        await apiFetch('/adm-canarana/projetos', { method: 'POST', body: JSON.stringify(body) })
        showToast('sucesso', 'Projeto criado')
      }
      setModal(null)
      refresh()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function excluir(id: string) {
    if (!confirm('Excluir projeto?')) return
    try {
      await apiFetch(`/adm-canarana/projetos/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Projeto excluído')
      refresh()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao excluir')
    }
  }

  const etapasFiltro = [
    { value: '', label: 'Todas as etapas' },
    { value: 'prospeccao', label: 'Prospecção' },
    { value: 'analise', label: 'Análise' },
    { value: 'proposta', label: 'Proposta' },
    { value: 'negociacao', label: 'Negociação' },
    { value: 'contrato', label: 'Contrato' },
    { value: 'concluido', label: 'Concluído' },
    { value: 'perdido', label: 'Perdido' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-aletis-grafite-medio/50" />
            <input
              type="text"
              placeholder="Buscar projeto, cliente ou consultor..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-64 rounded-lg border border-aletis-borda/60 bg-card py-1.5 pl-9 pr-3 text-sm focus:border-aletis-verde focus:outline-none"
            />
          </div>
          <select
            value={filtroEtapa}
            onChange={(e) => setFiltroEtapa(e.target.value)}
            className="rounded-lg border border-aletis-borda/60 bg-card px-3 py-1.5 text-sm focus:border-aletis-verde focus:outline-none"
          >
            {etapasFiltro.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
        <button onClick={() => setModal({ id: '', escritorio: 'Canarana', titulo: '', valorEstimado: 0, valorFechado: 0, etapa: 'prospeccao', prioridade: 'media' } as Projeto)} className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-3 py-2 text-sm font-display font-medium text-white hover:bg-aletis-verde-escuro">
          <Plus className="h-4 w-4" /> Novo projeto
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-aletis-borda/60 bg-card shadow-sm">
        <table className="ui-table w-full text-sm">
          <thead>
            <tr className="border-b border-aletis-borda/40 text-left">
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Projeto</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Cliente</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Consultor</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Valor Est.</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Etapa</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Prioridade</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Previsão</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-aletis-grafite-medio/60"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-aletis-grafite-medio/60">Nenhum projeto encontrado.</td></tr>}
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-aletis-borda/30 hover:bg-aletis-bege/30">
                <td className="px-4 py-3 font-medium">{p.titulo}</td>
                <td className="px-4 py-3">{p.cliente || '—'}</td>
                <td className="px-4 py-3">{p.consultor || '—'}</td>
                <td className="px-4 py-3">{fmtBRL(p.valorEstimado)}</td>
                <td className="px-4 py-3"><span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(p.etapa)}`}>{etapaLabel(p.etapa)}</span></td>
                <td className="px-4 py-3"><span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(p.prioridade)}`}>{p.prioridade}</span></td>
                <td className="px-4 py-3">{fmtDate(p.dataPrevisaoFechamento)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setModal(p)} className="rounded p-1 text-[var(--text-soft)] hover:bg-aletis-bege"><Edit3 className="h-4 w-4" /></button>
                    <button onClick={() => excluir(p.id)} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Editar projeto' : 'Novo projeto'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Título" name="titulo" defaultValue={modal.titulo} required />
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Cliente</label>
                <select name="cliente" defaultValue={modal.cliente || ''} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
                  <option value="">Selecione um cliente do CRM...</option>
                  {crmClientes?.map((c) => (
                    <option key={c.id} value={c.nome}>{c.nome} ({c.cidade || ''}{c.uf ? `/${c.uf}` : ''})</option>
                  ))}
                </select>
              </div>
              <Field label="Consultor" name="consultor" defaultValue={modal.consultor || ''} />
              <Field label="Valor estimado" name="valorEstimado" type="text" defaultValue={modal.valorEstimado ? String(modal.valorEstimado).replace('.', ',') : '0'} placeholder="0,00" />
              <Field label="Valor fechado" name="valorFechado" type="text" defaultValue={modal.valorFechado ? String(modal.valorFechado).replace('.', ',') : '0'} placeholder="0,00" />
              <Field label="Previsão fechamento" name="dataPrevisaoFechamento" type="date" defaultValue={modal.dataPrevisaoFechamento || ''} />
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Etapa</label>
                <select name="etapa" defaultValue={modal.etapa} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
                  <option value="prospeccao">Prospecção</option>
                  <option value="analise">Análise</option>
                  <option value="proposta">Proposta</option>
                  <option value="negociacao">Negociação</option>
                  <option value="contrato">Contrato</option>
                  <option value="concluido">Concluído</option>
                  <option value="perdido">Perdido</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Prioridade</label>
                <select name="prioridade" defaultValue={modal.prioridade} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Observações</label>
              <textarea name="observacoes" defaultValue={modal.observacoes || ''} rows={3} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(null)} className="rounded-lg border border-aletis-borda/60 px-3 py-2 text-sm font-medium hover:bg-aletis-bege">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-aletis-verde px-3 py-2 text-sm font-medium text-white hover:bg-aletis-verde-escuro disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}


/* ================= Receitas ================= */

function ReceitasSection({ competencia, showToast, refresh, refreshKey }: { competencia: string; showToast(t: 'sucesso' | 'erro', m: string): void; refresh(): void; refreshKey: number }) {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const { data: receitas, loading, refetch } = useApi<Receita[]>(`/adm-canarana/receitas?competencia=${encodeURIComponent(competencia)}`, [])
  const { data: recClientes } = useApi<any[]>(`/adm-canarana/clientes`, [])
  const [modal, setModal] = useState<Receita | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { refetch() }, [refreshKey, refetch])

  const filtered = useMemo(() => {
    let list = receitas
    if (busca.trim()) {
      const q = busca.toLowerCase()
      list = list.filter((r) => r.descricao.toLowerCase().includes(q) || (r.origem || '').toLowerCase().includes(q))
    }
    if (filtroStatus) list = list.filter((r) => r.status === filtroStatus)
    return list
  }, [receitas, busca, filtroStatus])

  const total = useMemo(() => filtered.reduce((s, r) => s + (r.valor || 0), 0), [filtered])
  const totalRecebido = useMemo(() => receitas.filter((r) => r.status === 'recebida').reduce((s, r) => s + r.valor, 0), [receitas])
  const totalPrevisto = useMemo(() => receitas.filter((r) => r.status === 'previsto').reduce((s, r) => s + r.valor, 0), [receitas])
  const totalAtrasado = useMemo(() => receitas.filter((r) => r.status === 'atrasada').reduce((s, r) => s + r.valor, 0), [receitas])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const body: any = {
      competencia: fd.get('competencia') as string,
      descricao: fd.get('descricao') as string,
      origem: (fd.get('origem') as string) || undefined,
      valor: Number((fd.get('valor') as string).replace(/\./g, '').replace(',', '.')),
      dataRecebimento: (fd.get('dataRecebimento') as string) || undefined,
      formaPagamento: (fd.get('formaPagamento') as string) || undefined,
      status: fd.get('status') as string,
    }
    try {
      setSaving(true)
      if (modal && modal.id) {
        await apiFetch(`/adm-canarana/receitas/${modal.id}`, { method: 'PUT', body: JSON.stringify(body) })
        showToast('sucesso', 'Receita atualizada')
      } else {
        await apiFetch('/adm-canarana/receitas', { method: 'POST', body: JSON.stringify(body) })
        showToast('sucesso', 'Receita criada')
      }
      setModal(null)
      refresh()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function excluir(id: string) {
    if (!confirm('Excluir receita?')) return
    try {
      await apiFetch(`/adm-canarana/receitas/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Receita excluída')
      refresh()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao excluir')
    }
  }

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Recebido</div>
          <div className="text-lg font-bold text-emerald-700">{fmtBRL(totalRecebido)}</div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">Previsto</div>
          <div className="text-lg font-bold text-amber-700">{fmtBRL(totalPrevisto)}</div>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-red-600">Atrasado</div>
          <div className="text-lg font-bold text-red-700">{fmtBRL(totalAtrasado)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-aletis-grafite-medio/50" />
            <input type="text" placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} className="w-56 rounded-lg border border-aletis-borda/60 bg-card py-1.5 pl-9 pr-3 text-sm focus:border-aletis-verde focus:outline-none" />
          </div>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="rounded-lg border border-aletis-borda/60 bg-card px-3 py-1.5 text-sm focus:border-aletis-verde focus:outline-none">
            <option value="">Todos status</option>
            <option value="recebida">Recebida</option>
            <option value="previsto">Previsto</option>
            <option value="atrasada">Atrasada</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-soft)]">Total filtrado: <span className="font-semibold text-foreground">{fmtBRL(total)}</span></span>
          <button onClick={() => setModal({ id: '', escritorio: 'Canarana', competencia, descricao: '', valor: 0, status: 'previsto' } as Receita)} className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-3 py-2 text-sm font-display font-medium text-white hover:bg-aletis-verde-escuro">
            <Plus className="h-4 w-4" /> Nova receita
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-aletis-borda/60 bg-card shadow-sm">
        <table className="ui-table w-full text-sm">
          <thead>
            <tr className="border-b border-aletis-borda/40 text-left">
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Descrição</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Origem</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Valor</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Recebimento</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Status</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-aletis-grafite-medio/60"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-aletis-grafite-medio/60">Nenhuma receita encontrada.</td></tr>}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-aletis-borda/30 hover:bg-aletis-bege/30">
                <td className="px-4 py-3 font-medium">{r.descricao}</td>
                <td className="px-4 py-3">{r.origem || '—'}</td>
                <td className="px-4 py-3">{fmtBRL(r.valor)}</td>
                <td className="px-4 py-3">{fmtDate(r.dataRecebimento)}</td>
                <td className="px-4 py-3"><span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(r.status)}`}>{r.status}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setModal(r)} className="rounded p-1 text-[var(--text-soft)] hover:bg-aletis-bege"><Edit3 className="h-4 w-4" /></button>
                    <button onClick={() => excluir(r.id)} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Editar receita' : 'Nova receita'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input name="competencia" type="hidden" value={modal.competencia || competencia} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Descrição" name="descricao" defaultValue={modal.descricao} required />
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Origem / Cliente</label>
                <select name="origem" defaultValue={modal.origem || ''} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
                  <option value="">Selecione...</option>
                  <option value="servico">Serviço Geral</option>
                  <option value="outro">Outro</option>
                  {recClientes?.map((c) => (
                    <option key={c.id} value={c.nome}>{c.nome}</option>
                  ))}
                </select>
              </div>
              <Field label="Valor" name="valor" type="text" defaultValue={modal.valor ? String(modal.valor).replace('.', ',') : ''} required placeholder="0,00" />
              <Field label="Data de recebimento" name="dataRecebimento" type="date" defaultValue={modal.dataRecebimento || ''} />
              <Field label="Forma de pagamento" name="formaPagamento" defaultValue={modal.formaPagamento || ''} />
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Status</label>
                <select name="status" defaultValue={modal.status} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
                  <option value="previsto">Previsto</option>
                  <option value="recebida">Recebida</option>
                  <option value="atrasada">Atrasada</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(null)} className="rounded-lg border border-aletis-borda/60 px-3 py-2 text-sm font-medium hover:bg-aletis-bege">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-aletis-verde px-3 py-2 text-sm font-medium text-white hover:bg-aletis-verde-escuro disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

/* ================= Despesas ================= */

function DespesasSection({ competencia, showToast, refresh, refreshKey }: { competencia: string; showToast(t: 'sucesso' | 'erro', m: string): void; refresh(): void; refreshKey: number }) {
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('')
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const { data: despesas, loading, refetch } = useApi<Despesa[]>(`/adm-canarana/despesas?competencia=${encodeURIComponent(competencia)}`, [])
  const [modal, setModal] = useState<Despesa | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { refetch() }, [refreshKey, refetch])

  const filtered = useMemo(() => {
    let list = despesas
    if (busca.trim()) {
      const q = busca.toLowerCase()
      list = list.filter((d) => d.descricao.toLowerCase().includes(q) || d.categoria.toLowerCase().includes(q) || (d.fornecedor || '').toLowerCase().includes(q))
    }
    if (filtroCategoria) list = list.filter((d) => d.categoria === filtroCategoria)
    if (filtroStatus) list = list.filter((d) => d.status === filtroStatus)
    return list
  }, [despesas, busca, filtroCategoria, filtroStatus])

  const total = useMemo(() => filtered.reduce((s, d) => s + (d.valor || 0), 0), [filtered])
  const categorias = useMemo(() => Array.from(new Set(despesas.map((d) => d.categoria))), [despesas])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const body: any = {
      competencia: fd.get('competencia') as string,
      descricao: fd.get('descricao') as string,
      categoria: fd.get('categoria') as string,
      fornecedor: (fd.get('fornecedor') as string) || undefined,
      valor: Number((fd.get('valor') as string).replace(/\./g, '').replace(',', '.')),
      dataPagamento: (fd.get('dataPagamento') as string) || undefined,
      dataVencimento: (fd.get('dataVencimento') as string) || undefined,
      status: fd.get('status') as string,
    }
    try {
      setSaving(true)
      if (modal && modal.id) {
        await apiFetch(`/adm-canarana/despesas/${modal.id}`, { method: 'PUT', body: JSON.stringify(body) })
        showToast('sucesso', 'Despesa atualizada')
      } else {
        await apiFetch('/adm-canarana/despesas', { method: 'POST', body: JSON.stringify(body) })
        showToast('sucesso', 'Despesa criada')
      }
      setModal(null)
      refresh()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function excluir(id: string) {
    if (!confirm('Excluir despesa?')) return
    try {
      await apiFetch(`/adm-canarana/despesas/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Despesa excluída')
      refresh()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao excluir')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-aletis-grafite-medio/50" />
            <input type="text" placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} className="w-56 rounded-lg border border-aletis-borda/60 bg-card py-1.5 pl-9 pr-3 text-sm focus:border-aletis-verde focus:outline-none" />
          </div>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="rounded-lg border border-aletis-borda/60 bg-card px-3 py-1.5 text-sm focus:border-aletis-verde focus:outline-none">
            <option value="">Todas categorias</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="rounded-lg border border-aletis-borda/60 bg-card px-3 py-1.5 text-sm focus:border-aletis-verde focus:outline-none">
            <option value="">Todos status</option>
            <option value="pago">Pago</option>
            <option value="pendente">Pendente</option>
            <option value="atrasado">Atrasado</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-soft)]">Total: <span className="font-semibold text-foreground">{fmtBRL(total)}</span></span>
          <button onClick={() => setModal({ id: '', escritorio: 'Canarana', competencia, descricao: '', categoria: '', valor: 0, status: 'pendente' } as Despesa)} className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-3 py-2 text-sm font-display font-medium text-white hover:bg-aletis-verde-escuro">
            <Plus className="h-4 w-4" /> Nova despesa
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-aletis-borda/60 bg-card shadow-sm">
        <table className="ui-table w-full text-sm">
          <thead>
            <tr className="border-b border-aletis-borda/40 text-left">
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Descrição</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Categoria</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Fornecedor</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Valor</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Venc./Pag.</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Status</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-aletis-grafite-medio/60"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-aletis-grafite-medio/60">Nenhuma despesa encontrada.</td></tr>}
            {filtered.map((d) => (
              <tr key={d.id} className="border-b border-aletis-borda/30 hover:bg-aletis-bege/30">
                <td className="px-4 py-3 font-medium">{d.descricao}</td>
                <td className="px-4 py-3">{d.categoria}</td>
                <td className="px-4 py-3">{d.fornecedor || '—'}</td>
                <td className="px-4 py-3">{fmtBRL(d.valor)}</td>
                <td className="px-4 py-3">{fmtDate(d.dataVencimento || d.dataPagamento)}</td>
                <td className="px-4 py-3"><span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(d.status)}`}>{d.status}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setModal(d)} className="rounded p-1 text-[var(--text-soft)] hover:bg-aletis-bege"><Edit3 className="h-4 w-4" /></button>
                    <button onClick={() => excluir(d.id)} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Editar despesa' : 'Nova despesa'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input name="competencia" type="hidden" value={modal.competencia || competencia} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Descrição" name="descricao" defaultValue={modal.descricao} required />
              <Field label="Categoria" name="categoria" defaultValue={modal.categoria} required />
              <Field label="Fornecedor" name="fornecedor" defaultValue={modal.fornecedor || ''} />
              <Field label="Valor" name="valor" type="text" defaultValue={modal.valor ? String(modal.valor).replace('.', ',') : ''} required placeholder="0,00" />
              <Field label="Data de pagamento" name="dataPagamento" type="date" defaultValue={modal.dataPagamento || ''} />
              <Field label="Data de vencimento" name="dataVencimento" type="date" defaultValue={modal.dataVencimento || ''} />
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Status</label>
                <select name="status" defaultValue={modal.status} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
                  <option value="pendente">Pendente</option>
                  <option value="pago">Pago</option>
                  <option value="atrasado">Atrasado</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(null)} className="rounded-lg border border-aletis-borda/60 px-3 py-2 text-sm font-medium hover:bg-aletis-bege">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-aletis-verde px-3 py-2 text-sm font-medium text-white hover:bg-aletis-verde-escuro disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}


/* ================= Funcionários ================= */

function FuncionariosSection({ showToast, refresh, refreshKey }: { showToast(t: 'sucesso' | 'erro', m: string): void; refresh(): void; refreshKey: number }) {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const { data: funcionarios, loading, refetch } = useApi<Funcionario[]>(`/adm-canarana/funcionarios`, [])
  const [modal, setModal] = useState<Funcionario | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { refetch() }, [refreshKey, refetch])

  const filtered = useMemo(() => {
    let list = funcionarios
    if (busca.trim()) {
      const q = busca.toLowerCase()
      list = list.filter((f) => f.nome.toLowerCase().includes(q) || f.cargo.toLowerCase().includes(q))
    }
    if (filtroStatus) list = list.filter((f) => f.status === filtroStatus)
    return list
  }, [funcionarios, busca, filtroStatus])

  const custoTotal = useMemo(() =>
    funcionarios.filter((f) => f.status === 'ativo').reduce((s, f) => s + f.salarioBase, 0),
  [funcionarios])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const body: any = {
      nome: fd.get('nome') as string,
      cargo: fd.get('cargo') as string,
      salarioBase: Number((fd.get('salarioBase') as string).replace(/\./g, '').replace(',', '.')),
      dataContratacao: (fd.get('dataContratacao') as string) || undefined,
      telefone: (fd.get('telefone') as string) || undefined,
      email: (fd.get('email') as string) || undefined,
      status: fd.get('status') as string,
      observacoes: (fd.get('observacoes') as string) || undefined,
    }
    try {
      setSaving(true)
      if (modal && modal.id) {
        await apiFetch(`/adm-canarana/funcionarios/${modal.id}`, { method: 'PUT', body: JSON.stringify(body) })
        showToast('sucesso', 'Funcionário atualizado')
      } else {
        await apiFetch('/adm-canarana/funcionarios', { method: 'POST', body: JSON.stringify(body) })
        showToast('sucesso', 'Funcionário criado')
      }
      setModal(null)
      refresh()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function excluir(id: string) {
    if (!confirm('Excluir funcionário?')) return
    try {
      await apiFetch(`/adm-canarana/funcionarios/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Funcionário excluído')
      refresh()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao excluir')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-aletis-borda/60 bg-card p-3 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">Total</div>
          <div className="text-lg font-bold text-foreground">{funcionarios.length}</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Ativos</div>
          <div className="text-lg font-bold text-emerald-700">{funcionarios.filter((f) => f.status === 'ativo').length}</div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">Em férias</div>
          <div className="text-lg font-bold text-amber-700">{funcionarios.filter((f) => f.status === 'ferias').length}</div>
        </div>
        <div className="rounded-xl border border-aletis-borda/60 bg-card p-3 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">Custo ativos</div>
          <div className="text-lg font-bold text-foreground">{fmtBRL(custoTotal)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-aletis-grafite-medio/50" />
            <input type="text" placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} className="w-56 rounded-lg border border-aletis-borda/60 bg-card py-1.5 pl-9 pr-3 text-sm focus:border-aletis-verde focus:outline-none" />
          </div>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="rounded-lg border border-aletis-borda/60 bg-card px-3 py-1.5 text-sm focus:border-aletis-verde focus:outline-none">
            <option value="">Todos status</option>
            <option value="ativo">Ativo</option>
            <option value="ferias">Férias</option>
            <option value="afastado">Afastado</option>
            <option value="desligado">Desligado</option>
          </select>
        </div>
        <button onClick={() => setModal({ id: '', nome: '', cargo: '', escritorio: 'Canarana', salarioBase: 0, status: 'ativo' } as Funcionario)} className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-3 py-2 text-sm font-display font-medium text-white hover:bg-aletis-verde-escuro">
          <Plus className="h-4 w-4" /> Novo funcionário
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-aletis-borda/60 bg-card shadow-sm">
        <table className="ui-table w-full text-sm">
          <thead>
            <tr className="border-b border-aletis-borda/40 text-left">
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Nome</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Cargo</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Salário base</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Contato</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Status</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-aletis-grafite-medio/60"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-aletis-grafite-medio/60">Nenhum funcionário encontrado.</td></tr>}
            {filtered.map((f) => (
              <tr key={f.id} className="border-b border-aletis-borda/30 hover:bg-aletis-bege/30">
                <td className="px-4 py-3 font-medium">{f.nome}</td>
                <td className="px-4 py-3">{f.cargo}</td>
                <td className="px-4 py-3">{fmtBRL(f.salarioBase)}</td>
                <td className="px-4 py-3">
                  <div className="text-xs">{f.telefone || '—'}</div>
                  <div className="text-xs text-aletis-grafite-medio/60">{f.email || '—'}</div>
                </td>
                <td className="px-4 py-3"><span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(f.status)}`}>{f.status}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setModal(f)} className="rounded p-1 text-[var(--text-soft)] hover:bg-aletis-bege"><Edit3 className="h-4 w-4" /></button>
                    <button onClick={() => excluir(f.id)} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Editar funcionário' : 'Novo funcionário'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nome" name="nome" defaultValue={modal.nome} required />
              <Field label="Cargo" name="cargo" defaultValue={modal.cargo} required />
              <Field label="Salário base" name="salarioBase" type="text" defaultValue={modal.salarioBase ? String(modal.salarioBase).replace('.', ',') : ''} required placeholder="0,00" />
              <Field label="Data de contratação" name="dataContratacao" type="date" defaultValue={modal.dataContratacao || ''} />
              <Field label="Telefone" name="telefone" defaultValue={modal.telefone || ''} />
              <Field label="E-mail" name="email" type="email" defaultValue={modal.email || ''} />
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Status</label>
                <select name="status" defaultValue={modal.status} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
                  <option value="ativo">Ativo</option>
                  <option value="ferias">Férias</option>
                  <option value="afastado">Afastado</option>
                  <option value="desligado">Desligado</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Observações</label>
              <textarea name="observacoes" defaultValue={modal.observacoes || ''} rows={3} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(null)} className="rounded-lg border border-aletis-borda/60 px-3 py-2 text-sm font-medium hover:bg-aletis-bege">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-aletis-verde px-3 py-2 text-sm font-medium text-white hover:bg-aletis-verde-escuro disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

/* ================= Folha ================= */

function FolhaSection({ competencia, showToast, refresh, refreshKey }: { competencia: string; showToast(t: 'sucesso' | 'erro', m: string): void; refresh(): void; refreshKey: number }) {
  const { data: folha, loading, refetch } = useApi<FolhaPagamento[]>(`/adm-canarana/folha?competencia=${encodeURIComponent(competencia)}`, [])
  const { data: funcionarios } = useApi<Funcionario[]>(`/adm-canarana/funcionarios`, [])
  const [modal, setModal] = useState<FolhaPagamento | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { refetch() }, [refreshKey, refetch])

  const total = useMemo(() => folha.reduce((s, f) => s + (f.valorLiquido || 0), 0), [folha])
  const totalBruto = useMemo(() => folha.reduce((s, f) => s + f.salarioBase + f.bonus, 0), [folha])
  const totalDescontos = useMemo(() => folha.reduce((s, f) => s + f.descontos, 0), [folha])

  const funcMap = useMemo(() => {
    const m: Record<string, Funcionario> = {}
    for (const f of funcionarios) m[f.id] = f
    return m
  }, [funcionarios])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const body: any = {
      funcionarioId: fd.get('funcionarioId') as string,
      competencia: fd.get('competencia') as string,
      salarioBase: Number((fd.get('salarioBase') as string).replace(/\./g, '').replace(',', '.')),
      bonus: Number(((fd.get('bonus') as string) || '0').replace(/\./g, '').replace(',', '.')),
      descontos: Number(((fd.get('descontos') as string) || '0').replace(/\./g, '').replace(',', '.')),
      valorLiquido: Number((fd.get('valorLiquido') as string).replace(/\./g, '').replace(',', '.')),
      dataPagamento: (fd.get('dataPagamento') as string) || undefined,
      status: fd.get('status') as string,
    }
    try {
      setSaving(true)
      if (modal && modal.id) {
        await apiFetch(`/adm-canarana/folha/${modal.id}`, { method: 'PUT', body: JSON.stringify(body) })
        showToast('sucesso', 'Pagamento atualizado')
      } else {
        await apiFetch('/adm-canarana/folha', { method: 'POST', body: JSON.stringify(body) })
        showToast('sucesso', 'Pagamento criado')
      }
      setModal(null)
      refresh()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function excluir(id: string) {
    if (!confirm('Excluir pagamento?')) return
    try {
      await apiFetch(`/adm-canarana/folha/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Pagamento excluído')
      refresh()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao excluir')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-aletis-borda/60 bg-card p-3 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">Registros</div>
          <div className="text-lg font-bold text-foreground">{folha.length}</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Bruto + Bônus</div>
          <div className="text-lg font-bold text-emerald-700">{fmtBRL(totalBruto)}</div>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-red-600">Descontos</div>
          <div className="text-lg font-bold text-red-700">{fmtBRL(totalDescontos)}</div>
        </div>
        <div className="rounded-xl border border-aletis-borda/60 bg-card p-3 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">Total Líquido</div>
          <div className="text-lg font-bold text-foreground">{fmtBRL(total)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-soft)]">Total líquido: <span className="font-semibold text-foreground">{fmtBRL(total)}</span></div>
        <button onClick={() => setModal({ id: '', funcionarioId: '', escritorio: 'Canarana', competencia, salarioBase: 0, bonus: 0, descontos: 0, valorLiquido: 0, status: 'previsto' } as FolhaPagamento)} className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-3 py-2 text-sm font-display font-medium text-white hover:bg-aletis-verde-escuro">
          <Plus className="h-4 w-4" /> Novo pagamento
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-aletis-borda/60 bg-card shadow-sm">
        <table className="ui-table w-full text-sm">
          <thead>
            <tr className="border-b border-aletis-borda/40 text-left">
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Funcionário</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Salário base</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Bônus</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Descontos</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Líquido</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Pagamento</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Status</th>
              <th className="px-4 py-3 font-medium text-[var(--text-soft)]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-aletis-grafite-medio/60"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && folha.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-aletis-grafite-medio/60">Nenhum pagamento encontrado.</td></tr>}
            {folha.map((f) => (
              <tr key={f.id} className="border-b border-aletis-borda/30 hover:bg-aletis-bege/30">
                <td className="px-4 py-3 font-medium">{funcMap[f.funcionarioId]?.nome || f.funcionarioId}</td>
                <td className="px-4 py-3">{fmtBRL(f.salarioBase)}</td>
                <td className="px-4 py-3">{fmtBRL(f.bonus)}</td>
                <td className="px-4 py-3">{fmtBRL(f.descontos)}</td>
                <td className="px-4 py-3 font-semibold">{fmtBRL(f.valorLiquido)}</td>
                <td className="px-4 py-3">{fmtDate(f.dataPagamento)}</td>
                <td className="px-4 py-3"><span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(f.status)}`}>{f.status}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setModal(f)} className="rounded p-1 text-[var(--text-soft)] hover:bg-aletis-bege"><Edit3 className="h-4 w-4" /></button>
                    <button onClick={() => excluir(f.id)} className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Editar pagamento' : 'Novo pagamento'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input name="competencia" type="hidden" value={modal.competencia || competencia} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Funcionário</label>
                <select name="funcionarioId" defaultValue={modal.funcionarioId} required className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
                  <option value="">Selecione...</option>
                  {funcionarios.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome} — {f.cargo}</option>
                  ))}
                </select>
              </div>
              <Field label="Salário base" name="salarioBase" type="text" defaultValue={modal.salarioBase ? String(modal.salarioBase).replace('.', ',') : ''} required placeholder="0,00" />
              <Field label="Bônus" name="bonus" type="text" defaultValue={modal.bonus ? String(modal.bonus).replace('.', ',') : '0'} placeholder="0,00" />
              <Field label="Descontos" name="descontos" type="text" defaultValue={modal.descontos ? String(modal.descontos).replace('.', ',') : '0'} placeholder="0,00" />
              <Field label="Valor líquido" name="valorLiquido" type="text" defaultValue={modal.valorLiquido ? String(modal.valorLiquido).replace('.', ',') : ''} required placeholder="0,00" />
              <Field label="Data de pagamento" name="dataPagamento" type="date" defaultValue={modal.dataPagamento || ''} />
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Status</label>
                <select name="status" defaultValue={modal.status} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
                  <option value="previsto">Previsto</option>
                  <option value="pago">Pago</option>
                  <option value="atrasado">Atrasado</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(null)} className="rounded-lg border border-aletis-borda/60 px-3 py-2 text-sm font-medium hover:bg-aletis-bege">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-aletis-verde px-3 py-2 text-sm font-medium text-white hover:bg-aletis-verde-escuro disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

/* ================= UI reutilizável ================= */

/* ================= Documentos (Upload Inteligente) ================= */

interface AnexoDoc {
  id: string
  nomeOriginal: string
  nomeArmazenado: string
  tipo: string
  tamanho: number
  uploadEm: string
}

function DocumentosSection({
  competencia,
  showToast,
  refresh,
  refreshKey,
}: {
  competencia: string
  showToast(t: 'sucesso' | 'erro', m: string): void
  refresh(): void
  refreshKey: number
}) {
  const [tipoDoc, setTipoDoc] = useState<'receita' | 'despesa' | 'anexo'>('despesa')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [preview, setPreview] = useState<any>(null)

  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState('aluguel')
  const [status, setStatus] = useState('pendente')
  const [fornecedor, setFornecedor] = useState('')
  const [origem, setOrigem] = useState('')
  const [dataDoc, setDataDoc] = useState('')

  async function extrairOCR(file: File) {
    setOcrLoading(true)
    setPreview(null)
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      const res = await fetch('/api/adm-canarana/documentos/extrair', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.success === false) throw new Error(json.error || 'Erro na extração')
      const e = json.data?.extraido
      if (e) {
        setPreview(e)
        // Preenche formulário automaticamente
        if (e.descricao) setDescricao(e.descricao)
        if (e.valor != null) setValor(String(e.valor).replace('.', ','))
        if (e.data) setDataDoc(e.data)
        if (e.categoria) setCategoria(e.categoria)
        if (e.emissor) {
          if (e.tipo === 'receita') setOrigem(e.emissor)
          else setFornecedor(e.emissor)
        }
        if (e.tipo === 'receita' || e.tipo === 'despesa') setTipoDoc(e.tipo)
      }
    } catch (err: any) {
      showToast('erro', err.message || 'Erro na extração OCR')
    } finally {
      setOcrLoading(false)
    }
  }

  function onArquivoChange(file: File | null) {
    setArquivo(file)
    setPreview(null)
    setDescricao('')
    setValor('')
    setDataDoc('')
    setFornecedor('')
    setOrigem('')
    if (file) extrairOCR(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!arquivo && tipoDoc !== 'anexo') { showToast('erro', 'Selecione um documento'); return }
    if (!descricao.trim()) { showToast('erro', 'Descrição é obrigatória'); return }
    if (tipoDoc !== 'anexo' && (!valor || Number(valor.replace(/\./g, '').replace(',', '.')) <= 0)) { showToast('erro', 'Valor deve ser maior que zero'); return }
    const fd = new FormData()
    fd.append('competencia', competencia)
    fd.append('tipoDoc', tipoDoc)
    fd.append('descricao', descricao)
    fd.append('valor', valor ? valor.replace(/\./g, '').replace(',', '.') : '0')
    fd.append('categoria', categoria)
    fd.append('status', status)
    fd.append('fornecedor', fornecedor)
    fd.append('origem', origem)
    fd.append('dataDoc', dataDoc)
    fd.append('autoExtrair', '0')
    if (arquivo) fd.append('arquivo', arquivo)

    try {
      setUploading(true)
      const res = await fetch('/api/adm-canarana/documentos/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.success === false) throw new Error(json.error || 'Erro no upload')
      showToast('sucesso', tipoDoc === 'anexo' ? 'Documento anexado' : `${tipoDoc === 'receita' ? 'Receita' : 'Despesa'} criada com sucesso`)
      setArquivo(null)
      setPreview(null)
      setDescricao('')
      setValor('')
      setFornecedor('')
      setOrigem('')
      setDataDoc('')
      refresh()
    } catch (err: any) {
      showToast('erro', err.message || 'Erro ao enviar documento')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="rounded-xl border border-aletis-borda/60 bg-card p-5 shadow-sm lg:col-span-1">
        <h3 className="mb-4 font-display text-base font-semibold text-foreground flex items-center gap-2">
          <Upload className="h-5 w-5 text-foreground" />
          Lançamento Inteligente
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Tipo de lançamento</label>
            <div className="flex gap-2">
              {(['receita', 'despesa', 'anexo'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTipoDoc(t)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium capitalize transition ${
                    tipoDoc === t
                      ? 'border-aletis-verde bg-aletis-verde text-white'
                      : 'border-aletis-borda/60 bg-card text-[var(--text-soft)] hover:bg-aletis-bege'
                  }`}
                >
                  {t === 'anexo' ? 'Só anexar' : t}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border-2 border-dashed border-aletis-borda/40 bg-aletis-bege/20 p-4 text-center transition"
               style={ocrLoading ? { borderColor: '#a7f3d0', background: '#ecfdf5' } : {}}>
            <input type="file" id="doc-upload" className="hidden" onChange={(e) => onArquivoChange(e.target.files?.[0] || null)} accept=".pdf,.jpg,.jpeg,.png,.xml,.csv,.xlsx,.xls,.ofx" />
            <label htmlFor="doc-upload" className="cursor-pointer">
              {ocrLoading ? <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-foreground" /> : <Paperclip className="mx-auto mb-2 h-6 w-6 text-aletis-grafite-medio/50" />}
              <div className="text-xs text-[var(--text-soft)]">
                {ocrLoading ? 'Lendo documento com IA...' : arquivo ? <span className="font-semibold text-foreground">{arquivo.name}</span> : 'Clique ou arraste nota, recibo, comprovante, XML, OFX...'}
              </div>
              <div className="mt-1 text-[11px] text-aletis-grafite-medio/60">OCR + OpenAI Vision — até 25MB</div>
            </label>
          </div>

          {/* Preview OCR */}
          {preview && (
            <div className="rounded-lg border border-aletis-verde/30 bg-aletis-verde/5 p-3 text-xs">
              <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Dados extraídos automaticamente
                <span className="ml-auto rounded-full bg-aletis-verde/10 px-1.5 py-0.5 text-[11px]">
                  {preview.fonte === 'llm-vision' ? 'IA Vision' : preview.fonte === 'llm-text' ? 'IA Texto' : preview.fonte === 'tesseract' ? 'OCR' : 'Regex'}
                  {preview.confianca ? ` · ${Math.round(preview.confianca * 100)}%` : ''}
                </span>
              </div>
              {preview.valor != null && <div className="flex justify-between"><span className="text-[var(--text-soft)]">Valor detectado:</span><span className="font-semibold">{fmtBRL(preview.valor)}</span></div>}
              {preview.data && <div className="flex justify-between"><span className="text-[var(--text-soft)]">Data:</span><span className="font-semibold">{fmtDate(preview.data)}</span></div>}
              {preview.categoria && <div className="flex justify-between"><span className="text-[var(--text-soft)]">Categoria:</span><span className="font-semibold capitalize">{preview.categoria}</span></div>}
              {preview.emissor && <div className="flex justify-between"><span className="text-[var(--text-soft)]">{preview.tipo === 'receita' ? 'Cliente' : 'Fornecedor'}:</span><span className="font-semibold">{preview.emissor}</span></div>}
              {preview.numeroDocumento && <div className="flex justify-between"><span className="text-[var(--text-soft)]">Nº Doc:</span><span className="font-semibold">{preview.numeroDocumento}</span></div>}
            </div>
          )}

          <FieldInline label="Descrição" value={descricao} onChange={setDescricao} required />
          {tipoDoc !== 'anexo' && (
            <FieldInline label="Valor (R$)" value={valor} onChange={setValor} required placeholder="0,00" />
          )}
          {tipoDoc === 'receita' && (
            <FieldInline label="Origem / Cliente" value={origem} onChange={setOrigem} placeholder="Ex: João Silva" />
          )}
          {tipoDoc === 'despesa' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Categoria</label>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
                  <option value="aluguel">Aluguel</option>
                  <option value="material">Material de escritório</option>
                  <option value="viagem">Viagem</option>
                  <option value="alimentacao">Alimentação</option>
                  <option value="combustivel">Combustível</option>
                  <option value="imposto">Imposto</option>
                  <option value="servico">Serviço terceirizado</option>
                  <option value="marketing">Marketing</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <FieldInline label="Fornecedor" value={fornecedor} onChange={setFornecedor} placeholder="Nome do fornecedor" />
            </>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none">
              {tipoDoc === 'receita' ? (
                <><option value="previsto">Previsto</option><option value="recebida">Recebida</option><option value="atrasada">Atrasada</option></>
              ) : tipoDoc === 'despesa' ? (
                <><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="atrasado">Atrasado</option></>
              ) : (
                <><option value="arquivado">Arquivado</option></>
              )}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">Data do documento</label>
            <input type="date" value={dataDoc} onChange={(e) => setDataDoc(e.target.value)} className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none" />
          </div>

          <button type="submit" disabled={uploading || ocrLoading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-aletis-verde px-3 py-2.5 text-sm font-medium text-white hover:bg-aletis-verde-escuro disabled:opacity-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Salvando...' : tipoDoc === 'anexo' ? 'Anexar documento' : `Criar ${tipoDoc} com documento`}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-aletis-borda/60 bg-card p-5 shadow-sm lg:col-span-2">
        <h3 className="mb-4 font-display text-base font-semibold text-foreground">Como funciona o Lançamento Inteligente com OCR</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-aletis-borda/40 bg-aletis-bege/20 p-4">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-aletis-verde/10">
              <Upload className="h-4 w-4 text-foreground" />
            </div>
            <h4 className="mb-1 text-sm font-semibold text-foreground">1. Envie o documento</h4>
            <p className="text-xs text-[var(--text-soft)]">Tire foto do recibo, salve o PDF da nota ou arraste o arquivo. O sistema aceita PDF, JPG, PNG, XML e OFX.</p>
          </div>
          <div className="rounded-lg border border-aletis-borda/40 bg-aletis-bege/20 p-4">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-sky-50">
              <Eye className="h-4 w-4 text-sky-500" />
            </div>
            <h4 className="mb-1 text-sm font-semibold text-foreground">2. IA extrai automaticamente</h4>
            <p className="text-xs text-[var(--text-soft)]">O sistema usa OCR (Tesseract) + OpenAI Vision para ler valor, data, CNPJ, descrição e classificar.</p>
          </div>
          <div className="rounded-lg border border-aletis-borda/40 bg-aletis-bege/20 p-4">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-50">
              <Edit3 className="h-4 w-4 text-amber-500" />
            </div>
            <h4 className="mb-1 text-sm font-semibold text-foreground">3. Revise e confirme</h4>
            <p className="text-xs text-[var(--text-soft)]">Os campos aparecem preenchidos. Você pode corrigir qualquer dado antes de salvar. O documento fica anexado.</p>
          </div>
          <div className="rounded-lg border border-aletis-borda/40 bg-aletis-bege/20 p-4">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
              <Package className="h-4 w-4 text-emerald-500" />
            </div>
            <h4 className="mb-1 text-sm font-semibold text-foreground">4. Fechamento pronto</h4>
            <p className="text-xs text-[var(--text-soft)]">No botão "Fechamento" no topo da página, gere um pacote ZIP completo com CSVs, manifesto e HTML para enviar ao contador.</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong>Dica do CEO:</strong> Envie recibos e notas todos os dias pelo celular. A IA lê e organiza sozinha. No final do mês seu fechamento estará 90% pronto e o contador vai agradecer.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
function FieldInline({ label, value, onChange, required, placeholder }: { label: string; value: string; onChange(v: string): void; required?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">{label}{required ? ' *' : ''}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
      />
    </div>
  )
}

function Receipt(props: any) { return <FileText {...props} /> }

function Field({ label, name, type = 'text', defaultValue, required, placeholder }: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-soft)]">{label}{required ? ' *' : ''}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-aletis-borda/60 bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
      />
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose(): void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-lg border border-aletis-borda/60 bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-[var(--text-soft)] hover:bg-aletis-bege"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-sm text-aletis-grafite-medio/60">
      <BarChart3 className="mb-2 h-8 w-8 opacity-30" />
      {text}
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, tone, loading, extra }: { label: string; value: string; icon: React.ElementType; tone: string; loading?: boolean; extra?: string }) {
  const toneMap: Record<string, string> = {
    verde: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    vermelho: 'bg-red-50 border-red-100 text-red-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    sky: 'bg-sky-50 border-sky-100 text-sky-700',
    indigo: 'bg-indigo-50 border-indigo-100 text-indigo-700',
  }
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${toneMap[tone] ?? toneMap.verde}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider opacity-80">{label}</span>
        <Icon className="h-5 w-5 opacity-60" />
      </div>
      <div className="text-2xl font-bold tracking-tight">{loading ? <Loader2 className="h-6 w-6 animate-spin opacity-50" /> : value}</div>
      {extra && <div className="mt-1 text-xs font-medium opacity-70">{extra}</div>}
    </div>
  )
}

function ProgressMeta({ label, atual, meta, cor, invert }: { label: string; atual: number; meta: number; cor: string; invert?: boolean }) {
  const pct = meta > 0 ? Math.min(100, (atual / meta) * 100) : 0
  const ok = invert ? pct <= 100 : pct >= 100
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-[var(--text-soft)]">{fmtBRL(atual)} / {fmtBRL(meta)}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-100">
        <div className={`h-2.5 rounded-full transition-all ${ok ? cor : 'bg-red-400'}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  )
}
