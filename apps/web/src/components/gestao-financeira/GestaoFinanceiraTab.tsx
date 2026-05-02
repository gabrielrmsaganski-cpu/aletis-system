// ============================================================
// GestaoFinanceiraTab — sistema R.OP.001 v2.0 nativo no ALETIS.
// Hub com sub-tabs: Cadastro | Safras | Custos | Endividamento
//                   Demandas | Fazendas | Dashboard
// Todas as fórmulas da planilha foram reimplementadas em TypeScript
// no backend (services/gestao-financeira/calculo/).
// ============================================================
import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from 'react'
import { apiFetch } from '../../hooks/useApi'

const Dashboard360 = lazy(() => import('./Dashboard360'))
const BulkPasteEditor = lazy(() => import('./BulkPasteEditor'))
const TableEditor = lazy(() => import('./TableEditor'))
import {
  Sparkles,
  Users,
  Wheat,
  DollarSign,
  CreditCard,
  Building2,
  TrendingUp,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Calendar,
  Save,
  Edit3,
  X,
} from 'lucide-react'

interface Grupo {
  id: string
  clienteId: string
  nomeGrupo: string
  dataBase: string
  historico?: string | null
  observacoes?: string | null
  criadoEm: string
  atualizadoEm: string
}

interface Membro {
  id: string
  grupoId: string
  nome: string
  cpfCnpj?: string | null
  tipoRelacao?: string | null
  atuaAtividade: boolean
  ordem: number
}

interface CulturaSafra {
  id: string
  cultura: string
  safra: string
  cenario: string
  ordem: number
  areaPropriaHa?: string | null
  areaArrendadaHa?: string | null
  rendimentoScHa?: string | null
  precoMedioRs?: string | null
  custoUnitarioInsumosRs?: string | null
  arrendamentoBaseScHa?: string | null
  unidade?: string
}

interface ContratoDivida {
  id: string
  credor: string
  emitente?: string | null
  contrato?: string | null
  valorFinanciado?: string | null
  prazoParcelas?: number | null
  taxaNominalAa?: string | null
  periodicidade?: string | null
  metodoCalculo: string
  enquadramento?: string | null
  primeiraParcela?: string | null
  parcelasPagas: number
}

interface Demanda {
  id: string
  numero?: number | null
  tomador?: string | null
  credor?: string | null
  finalidade?: string | null
  modalidade?: string | null
  valor?: string | null
  status: string
}

interface Fazenda {
  id: string
  fazenda: string
  matricula?: string | null
  cidade?: string | null
  estado?: string | null
  areaTotalHa?: string | null
  valorHaMercado?: string | null
}

type SubTab = 'cadastro' | 'safras' | 'custos' | 'endividamento' | 'passivos' | 'garantias' | 'demandas' | 'fazendas' | 'premissas' | 'insights' | 'dashboard' | 'workflow' | 'benchmark' | 'comentarios' | 'changelog'

const SUB_TABS: { key: SubTab; label: string; emoji: string; icon: typeof Users }[] = [
  { key: 'dashboard', label: 'Dashboard 360°', emoji: '📊', icon: TrendingUp },
  { key: 'workflow', label: 'Workflow', emoji: '⏱️', icon: AlertCircle },
  { key: 'benchmark', label: 'Benchmark', emoji: '🏆', icon: TrendingUp },
  { key: 'comentarios', label: 'Comentários', emoji: '💬', icon: AlertCircle },
  { key: 'changelog', label: 'Changelog', emoji: '📜', icon: AlertCircle },
  { key: 'cadastro', label: 'Cadastro', emoji: '👥', icon: Users },
  { key: 'safras', label: 'Safras', emoji: '🌾', icon: Wheat },
  { key: 'custos', label: 'Custos', emoji: '💰', icon: DollarSign },
  { key: 'endividamento', label: 'Endividamento', emoji: '📋', icon: CreditCard },
  { key: 'passivos', label: 'Passivos', emoji: '⚠️', icon: AlertCircle },
  { key: 'garantias', label: 'Garantias', emoji: '🛡️', icon: Building2 },
  { key: 'demandas', label: 'Demandas', emoji: '📨', icon: TrendingUp },
  { key: 'fazendas', label: 'Fazendas', emoji: '🏞️', icon: Building2 },
  { key: 'premissas', label: 'Premissas', emoji: '⚙️', icon: DollarSign },
  { key: 'insights', label: 'Insights', emoji: '🔔', icon: AlertCircle },
]

interface Props {
  clienteId: string
  clienteNome?: string
  /** Sub-tabs a ocultar (já cobertas em outras seções do workspace). */
  hideSubTabs?: SubTab[]
  /** Sub-tab inicial — útil quando o componente é embedado num contexto específico. */
  initialSubTab?: SubTab
  /** Renderizar versão compact (sem hero do grupo, só sub-tabs e conteúdo). */
  compact?: boolean
}

export default function GestaoFinanceiraTab({ clienteId, clienteNome, hideSubTabs, initialSubTab, compact }: Props) {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null)
  const [activeGrupo, setActiveGrupo] = useState<Grupo | null>(null)
  const visibleSubTabs = useMemo(
    () => SUB_TABS.filter((t) => !hideSubTabs?.includes(t.key)),
    [hideSubTabs],
  )
  const defaultSub: SubTab = initialSubTab && visibleSubTabs.some((t) => t.key === initialSubTab)
    ? initialSubTab
    : (visibleSubTabs[0]?.key ?? 'dashboard')
  const [activeSub, setActiveSub] = useState<SubTab>(defaultSub)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  const reloadGrupos = useCallback(async () => {
    try {
      const r = await apiFetch<{ total: number; grupos: Grupo[] }>(
        `/gestao-financeira/grupos?clienteId=${encodeURIComponent(clienteId)}`,
      )
      setGrupos(r.grupos)
      if (!activeGrupo && r.grupos[0]) setActiveGrupo(r.grupos[0])
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }, [clienteId, activeGrupo])

  useEffect(() => {
    reloadGrupos()
  }, [reloadGrupos])

  async function criarNovoGrupo() {
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch<{ grupo: Grupo }>('/gestao-financeira/grupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          nomeGrupo: clienteNome ?? `Grupo ${clienteId}`,
          dataBase: new Date().toISOString().slice(0, 10),
        }),
      })
      setActiveGrupo(r.grupo)
      await reloadGrupos()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  async function autoImportCRM() {
    setImporting(true)
    setError(null)
    try {
      const r = await apiFetch<{ grupo: Grupo; criado: boolean; estatisticas: any }>(
        '/gestao-financeira/auto-import-crm',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clienteId }),
        },
      )
      setActiveGrupo(r.grupo)
      await reloadGrupos()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setImporting(false)
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border-l-4 border-red-500 bg-red-50 p-5">
        <p className="text-sm font-semibold text-red-800">Erro</p>
        <p className="text-xs text-red-700 mt-1">{error}</p>
      </div>
    )
  }

  if (!grupos) {
    return (
      <div className="space-y-3">
        <div className="h-20 rounded-xl bg-gray-100 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!activeGrupo) {
    return (
      <div className="card-premium p-8 text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-aletis-verde to-aletis-dourado flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
            Gestão Financeira do Grupo
          </h3>
          <p className="text-sm font-body text-aletis-grafite-claro mt-1 max-w-lg mx-auto">
            Sistema completo R.OP.001 v2.0 (28 sheets, 12.000+ fórmulas) reimplementado nativamente.
            Cálculos de Safra, EBITDA mensalizado, Endividamento (PRICE/SAC/BULLET), Passivos consolidados,
            Garantias com LTV, DRE FCL multi-cenário, Raio X 10 anos e <strong>insights automáticos</strong> de saúde financeira.
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-aletis-verde text-white text-sm font-body font-semibold hover:bg-aletis-verde-escuro transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            🪄 Iniciar com Wizard guiado (4 passos)
          </button>
          <button
            type="button"
            onClick={autoImportCRM}
            disabled={importing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-aletis-verde/40 text-aletis-verde text-sm font-body font-semibold hover:bg-aletis-verde/5 transition-colors disabled:opacity-50"
            title="Importa dados do CRM e cria grupo pré-populado"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            ⚡ Auto-import 1 clique
          </button>
          <button
            type="button"
            onClick={criarNovoGrupo}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-aletis-grafite-claro/30 text-aletis-grafite-escuro text-sm font-body font-semibold hover:bg-aletis-grafite-escuro/5 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Vazio
          </button>
        </div>
        <div className="text-[10px] font-body text-aletis-grafite-claro max-w-md mx-auto pt-3 border-t border-aletis-grafite-claro/10">
          <strong>Wizard</strong> guia em 4 passos: escolha de fonte (CRM/template/paste) → cabeçalho → conteúdo → confirmação.
        </div>

        {showWizard && (
          <Suspense fallback={null}>
            <WizardOnboarding
              clienteId={clienteId}
              clienteNome={clienteNome}
              onClose={() => setShowWizard(false)}
              onSuccess={(grupoId) => {
                setShowWizard(false)
                reloadGrupos().then(() => {
                  apiFetch<{ grupo: Grupo }>(`/gestao-financeira/grupos/${grupoId}`).then((r) => setActiveGrupo(r.grupo))
                })
              }}
            />
          </Suspense>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar superior: actions globais (export, snapshot, templates) */}
      <ToolbarActions grupoId={activeGrupo.id} clienteId={clienteId} onReload={reloadGrupos} />

      {/* Hero: grupo ativo (oculto em modo compact) */}
      {!compact && (
      <div className="card-premium p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-aletis-verde to-aletis-dourado flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-semibold text-aletis-verde uppercase">
              R.OP.001 v2.0 · GESTÃO FINANCEIRA
            </p>
            <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro truncate">
              {activeGrupo.nomeGrupo}
            </h2>
            <p className="text-[11px] font-body text-aletis-grafite-claro">
              Data base: {new Date(activeGrupo.dataBase).toLocaleDateString('pt-BR')} · ID:{' '}
              <span className="font-mono">{activeGrupo.id}</span>
            </p>
          </div>
        </div>
        {grupos.length > 1 && (
          <select
            value={activeGrupo.id}
            onChange={(e) => {
              const g = grupos.find((g) => g.id === e.target.value)
              if (g) setActiveGrupo(g)
            }}
            className="px-2 py-1 rounded border border-aletis-grafite-claro/20 text-xs"
          >
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nomeGrupo}
              </option>
            ))}
          </select>
        )}
      </div>
      )}

      {/* Sub-tabs */}
      <div className="gf-subtabs flex flex-wrap gap-2 border-b border-aletis-grafite-claro/15 pb-3">
        {visibleSubTabs.map((t) => {
          const Icon = t.icon
          const active = activeSub === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveSub(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-body font-medium inline-flex items-center gap-1.5 transition-colors ${
                active
                  ? 'bg-aletis-verde text-white shadow-sm'
                  : 'bg-white text-aletis-grafite-escuro hover:bg-aletis-verde/5 border border-aletis-grafite-claro/20'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Conteúdo da sub-tab */}
      {activeSub === 'cadastro' && <CadastroSection grupo={activeGrupo} onUpdate={reloadGrupos} />}
      {activeSub === 'safras' && <SafrasSection grupoId={activeGrupo.id} />}
      {activeSub === 'custos' && (
        <Suspense fallback={<SectionSkeleton />}>
          <TableEditor
            title="Custos do Cliente"
            emoji="💰"
            subtitle="Insumos por cultura · Operacionais · Fixos · Frete · Colheita · Arrendamento"
            baseEndpoint={`/gestao-financeira/grupos/${activeGrupo.id}/custos`}
            itemEndpoint={`/gestao-financeira/custos`}
            bulkEndpoint={`/gestao-financeira/grupos/${activeGrupo.id}/custos/bulk`}
            responseKey="custos"
            columns={[
              { key: 'tipo', label: 'Tipo', type: 'select', options: [
                { value: 'insumo', label: 'Insumo' },
                { value: 'operacional', label: 'Operacional' },
                { value: 'fixo', label: 'Fixo' },
                { value: 'frete', label: 'Frete' },
                { value: 'colheita', label: 'Colheita' },
                { value: 'arrendamento', label: 'Arrendamento' },
                { value: 'outros', label: 'Outros' },
              ], required: true, default: 'operacional', width: 'w-28' },
              { key: 'descricao', label: 'Descrição', type: 'text', required: true, width: 'w-56' },
              { key: 'cultura', label: 'Cultura', type: 'text', width: 'w-28' },
              { key: 'safra', label: 'Safra', type: 'text', required: true, default: '24/25', width: 'w-16' },
              { key: 'valorAnual', label: 'Valor Anual', type: 'number', align: 'right', width: 'w-32', format: fmtBRL },
              { key: 'valorMensal', label: 'Valor Mensal', type: 'number', align: 'right', width: 'w-32', format: fmtBRL },
            ]}
            newRowDefaults={{ tipo: 'operacional', safra: '24/25', descricao: 'Novo custo' }}
            showTotals={['valorAnual', 'valorMensal']}
            emptyStateMsg="Nenhum custo cadastrado. Use Paste do Excel para colar a aba CUSTOS DO CLIENTE da R.OP.001."
          />
        </Suspense>
      )}
      {activeSub === 'endividamento' && <EndividamentoSection grupoId={activeGrupo.id} />}
      {activeSub === 'demandas' && (
        <Suspense fallback={<SectionSkeleton />}>
          <TableEditor
            title="Demandas de Crédito"
            emoji="📨"
            subtitle="Pipeline de pedidos de crédito ao mercado bancário"
            baseEndpoint={`/gestao-financeira/grupos/${activeGrupo.id}/demandas`}
            itemEndpoint={`/gestao-financeira/demandas`}
            responseKey="demandas"
            columns={[
              { key: 'numero', label: 'Nº', type: 'number', width: 'w-12', align: 'right' },
              { key: 'data', label: 'Data', type: 'date', width: 'w-32' },
              { key: 'tomador', label: 'Tomador', type: 'text', width: 'w-32' },
              { key: 'credor', label: 'Credor', type: 'text', width: 'w-28' },
              { key: 'finalidade', label: 'Finalidade', type: 'text', width: 'w-40' },
              { key: 'modalidade', label: 'Modalidade', type: 'text', width: 'w-28' },
              { key: 'valor', label: 'Valor', type: 'number', align: 'right', width: 'w-32', format: fmtBRL },
              { key: 'prazo', label: 'Prazo', type: 'text', width: 'w-20' },
              { key: 'status', label: 'Status', type: 'select', options: [
                { value: 'em_analise', label: 'Em análise' },
                { value: 'aprovada', label: 'Aprovada' },
                { value: 'recusada', label: 'Recusada' },
                { value: 'desembolsada', label: 'Desembolsada' },
              ], width: 'w-32' },
            ]}
            newRowDefaults={{ status: 'em_analise', data: new Date().toISOString().slice(0, 10) }}
            showTotals={['valor']}
          />
        </Suspense>
      )}
      {activeSub === 'fazendas' && (
        <Suspense fallback={<SectionSkeleton />}>
          <TableEditor
            title="Fazendas (Ativos imobiliários)"
            emoji="🏞️"
            subtitle="Matrículas, áreas, valores R$/ha de mercado e venda forçada"
            baseEndpoint={`/gestao-financeira/grupos/${activeGrupo.id}/fazendas`}
            itemEndpoint={`/gestao-financeira/fazendas`}
            bulkEndpoint={`/gestao-financeira/grupos/${activeGrupo.id}/fazendas/bulk`}
            responseKey="fazendas"
            columns={[
              { key: 'fazenda', label: 'Fazenda', type: 'text', required: true, width: 'w-40' },
              { key: 'matricula', label: 'Matrícula', type: 'text', width: 'w-28' },
              { key: 'cidade', label: 'Cidade', type: 'text', width: 'w-32' },
              { key: 'estado', label: 'UF', type: 'text', width: 'w-12' },
              { key: 'areaTotalHa', label: 'Área (ha)', type: 'number', align: 'right', width: 'w-24' },
              { key: 'areaPlantioHa', label: 'Plantio (ha)', type: 'number', align: 'right', width: 'w-24' },
              { key: 'valorHaMercado', label: 'R$/ha mercado', type: 'number', align: 'right', width: 'w-32', format: fmtBRL },
              { key: 'valorHaForcado', label: 'R$/ha forçado', type: 'number', align: 'right', width: 'w-32', format: fmtBRL },
              { key: 'nrCar', label: 'CAR', type: 'text', width: 'w-32' },
            ]}
            newRowDefaults={{ fazenda: 'Nova fazenda' }}
            showTotals={['areaTotalHa', 'areaPlantioHa']}
          />
        </Suspense>
      )}
      {activeSub === 'passivos' && (
        <Suspense fallback={<SectionSkeleton />}>
          <TableEditor
            title="Passivos não-bancários"
            emoji="⚠️"
            subtitle="Fornecedores · Fiscal (PGFN/RFB) · Trabalhistas · Investimentos · Outros"
            baseEndpoint={`/gestao-financeira/grupos/${activeGrupo.id}/passivos-outros`}
            itemEndpoint={`/gestao-financeira/passivos-outros`}
            responseKey="items"
            columns={[
              { key: 'tipo', label: 'Tipo', type: 'select', options: [
                { value: 'fornecedor', label: 'Fornecedor' },
                { value: 'fiscal', label: 'Fiscal' },
                { value: 'trabalhista', label: 'Trabalhista' },
                { value: 'arrendamento', label: 'Arrendamento' },
                { value: 'investimento', label: 'Investimento' },
                { value: 'outro', label: 'Outro' },
              ], required: true, width: 'w-32' },
              { key: 'credor', label: 'Credor', type: 'text', width: 'w-32' },
              { key: 'descricao', label: 'Descrição', type: 'text', required: true, width: 'w-56' },
              { key: 'valor', label: 'Valor', type: 'number', align: 'right', required: true, width: 'w-32', format: fmtBRL },
              { key: 'vencimento', label: 'Vencimento', type: 'date', width: 'w-32' },
              { key: 'status', label: 'Status', type: 'select', options: [
                { value: 'a_vencer', label: 'A vencer' },
                { value: 'vencida', label: 'Vencida' },
                { value: 'em_negociacao', label: 'Em negociação' },
                { value: 'liquidada', label: 'Liquidada' },
              ], width: 'w-32' },
              { key: 'taxaJurosAa', label: 'Taxa a.a. %', type: 'number', align: 'right', width: 'w-20' },
            ]}
            newRowDefaults={{ tipo: 'fornecedor', status: 'a_vencer', valor: 0 }}
            showTotals={['valor']}
            emptyStateMsg="Nenhum passivo não-bancário. Cadastre fornecedores, dívidas fiscais (PGFN), trabalhistas etc."
          />
        </Suspense>
      )}
      {activeSub === 'garantias' && (
        <Suspense fallback={<SectionSkeleton />}>
          <TableEditor
            title="Garantias (LTV calculado no Dashboard 360°)"
            emoji="🛡️"
            subtitle="Imóveis · Safras · Avais · Penhores · Cauções"
            baseEndpoint={`/gestao-financeira/grupos/${activeGrupo.id}/garantias`}
            itemEndpoint={`/gestao-financeira/garantias`}
            responseKey="items"
            columns={[
              { key: 'tipo', label: 'Tipo', type: 'select', options: [
                { value: 'imovel', label: 'Imóvel' },
                { value: 'safra', label: 'Safra' },
                { value: 'aval', label: 'Aval' },
                { value: 'penhor', label: 'Penhor' },
                { value: 'caucao', label: 'Caução' },
                { value: 'outro', label: 'Outro' },
              ], required: true, width: 'w-28' },
              { key: 'descricao', label: 'Descrição', type: 'text', required: true, width: 'w-56' },
              { key: 'matricula', label: 'Matrícula', type: 'text', width: 'w-32' },
              { key: 'areaHa', label: 'Área (ha)', type: 'number', align: 'right', width: 'w-24' },
              { key: 'valorMercado', label: 'V. Mercado', type: 'number', align: 'right', width: 'w-32', format: fmtBRL },
              { key: 'valorForcado', label: 'V. Forçado', type: 'number', align: 'right', width: 'w-32', format: fmtBRL },
              { key: 'contratoVinculado', label: 'Contratos (IDs)', type: 'text', width: 'w-40' },
            ]}
            newRowDefaults={{ tipo: 'imovel', descricao: 'Nova garantia' }}
            showTotals={['valorMercado', 'valorForcado']}
            emptyStateMsg="Nenhuma garantia cadastrada. Adicione matrículas, safras dadas em garantia, etc."
          />
        </Suspense>
      )}
      {activeSub === 'premissas' && (
        <Suspense fallback={<SectionSkeleton />}>
          <TableEditor
            title="Premissas (taxas, indexadores)"
            emoji="⚙️"
            subtitle="Taxa custo financeiro · Taxa poupança · IPCA · Selic · Dólar projetado · Preço de hedge"
            baseEndpoint={`/gestao-financeira/grupos/${activeGrupo.id}/premissas`}
            itemEndpoint={`/gestao-financeira/premissas`}
            responseKey="items"
            columns={[
              { key: 'chave', label: 'Chave', type: 'text', required: true, width: 'w-40' },
              { key: 'rotulo', label: 'Rótulo', type: 'text', required: true, width: 'w-56' },
              { key: 'valor', label: 'Valor', type: 'number', align: 'right', required: true, width: 'w-28' },
              { key: 'unidade', label: 'Unidade', type: 'text', width: 'w-24' },
              { key: 'fonte', label: 'Fonte', type: 'text', width: 'w-28' },
              { key: 'vigencia', label: 'Vigência', type: 'date', width: 'w-32' },
            ]}
            newRowDefaults={{ chave: 'nova_premissa', rotulo: 'Nova premissa', valor: 0, unidade: '%a.a.' }}
          />
        </Suspense>
      )}
      {activeSub === 'insights' && <InsightsSection grupoId={activeGrupo.id} />}
      {activeSub === 'dashboard' && <Dashboard360Lazy grupoId={activeGrupo.id} />}
      {activeSub === 'workflow' && (
        <Suspense fallback={<SectionSkeleton />}>
          <KanbanSlaPanel grupoId={activeGrupo.id} />
        </Suspense>
      )}
      {activeSub === 'benchmark' && (
        <Suspense fallback={<SectionSkeleton />}>
          <BenchmarkPanel grupoId={activeGrupo.id} />
        </Suspense>
      )}
      {activeSub === 'comentarios' && (
        <Suspense fallback={<SectionSkeleton />}>
          <ComentariosPanel grupoId={activeGrupo.id} />
        </Suspense>
      )}
      {activeSub === 'changelog' && (
        <Suspense fallback={<SectionSkeleton />}>
          <ChangelogPanel grupoId={activeGrupo.id} />
        </Suspense>
      )}
    </div>
  )
}

// ============================================================
// SECTIONS
// ============================================================

function CadastroSection({ grupo, onUpdate }: { grupo: Grupo; onUpdate: () => void }) {
  const [nomeGrupo, setNomeGrupo] = useState(grupo.nomeGrupo)
  const [dataBase, setDataBase] = useState(grupo.dataBase.slice(0, 10))
  const [historico, setHistorico] = useState(grupo.historico ?? '')
  const [observacoes, setObservacoes] = useState(grupo.observacoes ?? '')
  const [membros, setMembros] = useState<Membro[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch<{ membros: Membro[] }>(`/gestao-financeira/grupos/${grupo.id}/membros`)
      .then((r) => setMembros(r.membros))
      .catch(() => setMembros([]))
  }, [grupo.id])

  async function salvarGrupo() {
    setSaving(true)
    try {
      await apiFetch(`/gestao-financeira/grupos/${grupo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeGrupo, dataBase, historico, observacoes }),
      })
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  async function adicionarMembro() {
    const r = await apiFetch<{ membro: Membro }>(
      `/gestao-financeira/grupos/${grupo.id}/membros`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Novo membro', ordem: membros.length }),
      },
    )
    setMembros((m) => [...m, r.membro])
  }

  async function patchMembro(id: string, patch: Partial<Membro>) {
    await apiFetch(`/gestao-financeira/membros/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }

  async function deletarMembro(id: string) {
    await apiFetch(`/gestao-financeira/membros/${id}`, { method: 'DELETE' })
    setMembros((m) => m.filter((x) => x.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* Identificação do grupo */}
      <section className="card-premium p-4 space-y-3">
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
          Identificação do Grupo
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nome do Grupo">
            <input
              value={nomeGrupo}
              onChange={(e) => setNomeGrupo(e.target.value)}
              className="input-premium"
            />
          </Field>
          <Field label="Data base">
            <input
              type="date"
              value={dataBase}
              onChange={(e) => setDataBase(e.target.value)}
              className="input-premium"
            />
          </Field>
          <Field label="Histórico" full>
            <div className="relative">
              <textarea
                value={historico}
                onChange={(e) => setHistorico(e.target.value)}
                rows={3}
                className="input-premium resize-y pr-10"
                placeholder="Histórico do grupo familiar / atividade rural — clique 🎙️ para ditar"
              />
              <div className="absolute top-2 right-2">
                <Suspense fallback={null}>
                  <VoiceInputButton
                    onResult={(text) => setHistorico((h) => h ? `${h} ${text}` : text)}
                    append
                    size="sm"
                  />
                </Suspense>
              </div>
            </div>
          </Field>
          <Field label="Observações" full>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className="input-premium resize-y"
            />
          </Field>
        </div>
        <button
          type="button"
          onClick={salvarGrupo}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-body font-semibold hover:bg-aletis-verde-escuro transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Salvar identificação
        </button>
      </section>

      {/* Membros do grupo familiar */}
      <section className="card-premium p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
            Membros do Grupo Familiar ({membros.length})
          </h3>
          <button
            type="button"
            onClick={adicionarMembro}
            className="px-3 py-1 rounded-lg bg-aletis-verde/10 text-aletis-verde text-xs font-body font-semibold hover:bg-aletis-verde/20 transition-colors inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Adicionar
          </button>
        </div>
        {membros.length === 0 ? (
          <p className="text-xs text-aletis-grafite-claro text-center py-6">Nenhum membro cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {membros.map((m, i) => (
              <MembroRow
                key={m.id}
                membro={m}
                onChange={(patch) => {
                  setMembros((arr) => arr.map((x) => (x.id === m.id ? { ...x, ...patch } : x)))
                }}
                onSave={(patch) => patchMembro(m.id, patch)}
                onDelete={() => deletarMembro(m.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function MembroRow({
  membro,
  onChange,
  onSave,
  onDelete,
}: {
  membro: Membro
  onChange: (patch: Partial<Membro>) => void
  onSave: (patch: Partial<Membro>) => void
  onDelete: () => void
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center px-3 py-2 rounded-lg bg-aletis-cream/30 border border-aletis-grafite-claro/10">
      <input
        value={membro.nome}
        onChange={(e) => onChange({ nome: e.target.value })}
        onBlur={() => onSave({ nome: membro.nome })}
        placeholder="Nome"
        className="md:col-span-3 input-premium-sm"
      />
      <input
        value={membro.cpfCnpj ?? ''}
        onChange={(e) => onChange({ cpfCnpj: e.target.value })}
        onBlur={() => onSave({ cpfCnpj: membro.cpfCnpj ?? '' })}
        placeholder="CPF/CNPJ"
        className="md:col-span-3 input-premium-sm"
      />
      <input
        value={membro.tipoRelacao ?? ''}
        onChange={(e) => onChange({ tipoRelacao: e.target.value })}
        onBlur={() => onSave({ tipoRelacao: membro.tipoRelacao ?? '' })}
        placeholder="Parentesco"
        className="md:col-span-3 input-premium-sm"
      />
      <label className="md:col-span-2 inline-flex items-center gap-1.5 text-xs text-aletis-grafite-escuro">
        <input
          type="checkbox"
          checked={membro.atuaAtividade}
          onChange={(e) => {
            onChange({ atuaAtividade: e.target.checked })
            onSave({ atuaAtividade: e.target.checked })
          }}
          className="rounded"
        />
        Atua na atividade
      </label>
      <button
        type="button"
        onClick={onDelete}
        className="md:col-span-1 text-aletis-grafite-claro hover:text-red-600 transition-colors"
        aria-label="Excluir"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function SafrasSection({ grupoId }: { grupoId: string }) {
  const [list, setList] = useState<CulturaSafra[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [showBulk, setShowBulk] = useState(false)

  const reload = useCallback(async () => {
    const r = await apiFetch<{ culturas: CulturaSafra[] }>(
      `/gestao-financeira/grupos/${grupoId}/culturas`,
    )
    setList(r.culturas)
  }, [grupoId])

  useEffect(() => {
    reload()
  }, [reload])

  async function adicionar() {
    setAdding(true)
    try {
      await apiFetch(`/gestao-financeira/grupos/${grupoId}/culturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cultura: 'Soja Sequeiro',
          safra: '24/25',
          cenario: 'planejado',
          areaPropriaHa: 0,
          areaArrendadaHa: 0,
          rendimentoScHa: 60,
          precoMedioRs: 130,
          custoUnitarioInsumosRs: 80,
          arrendamentoBaseScHa: 18,
        }),
      })
      reload()
    } finally {
      setAdding(false)
    }
  }

  async function patch(id: string, body: Partial<CulturaSafra>) {
    await apiFetch(`/gestao-financeira/culturas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async function remover(id: string) {
    await apiFetch(`/gestao-financeira/culturas/${id}`, { method: 'DELETE' })
    reload()
  }

  if (!list) return <SectionSkeleton />

  return (
    <section className="card-premium p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
          Quadro de Safras ({list.length})
          <span className="ml-2 text-[10px] text-aletis-grafite-claro font-mono">
            R.OP.001 sheets 1-BaseSafra + 7-Safra
          </span>
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowBulk(true)}
            className="px-3 py-1 rounded-lg bg-aletis-dourado/15 text-aletis-grafite-escuro text-xs font-body font-semibold hover:bg-aletis-dourado/25 inline-flex items-center gap-1"
            title="Cole múltiplas linhas do Excel/Sheets de uma vez"
          >
            📋 Paste do Excel
          </button>
          <button
            type="button"
            onClick={adicionar}
            disabled={adding}
            className="px-3 py-1 rounded-lg bg-aletis-verde/10 text-aletis-verde text-xs font-body font-semibold hover:bg-aletis-verde/20 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Adicionar
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-aletis-grafite-claro border-b border-aletis-grafite-claro/15">
              <th className="text-left py-2 px-1">Cultura</th>
              <th className="text-left py-2 px-1">Safra</th>
              <th className="text-left py-2 px-1">Cenário</th>
              <th className="text-right py-2 px-1">Área própria</th>
              <th className="text-right py-2 px-1">Área arrendada</th>
              <th className="text-right py-2 px-1">Rendimento</th>
              <th className="text-right py-2 px-1">Preço</th>
              <th className="text-right py-2 px-1">Custo unit.</th>
              <th className="text-right py-2 px-1">Arrend. base</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-6 text-aletis-grafite-claro">
                  Nenhuma cultura cadastrada. Use <strong>📋 Paste do Excel</strong> ou <strong>+Adicionar</strong>.
                </td>
              </tr>
            )}
            {list.map((c) => (
              <CulturaSafraRow
                key={c.id}
                row={c}
                onPatch={(p) => patch(c.id, p)}
                onDelete={() => remover(c.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {showBulk && (
        <Suspense fallback={null}>
          <BulkPasteEditor
            title="Importar Safras do Excel"
            endpoint={`/gestao-financeira/grupos/${grupoId}/culturas/bulk`}
            columns={[
              { key: 'cultura', label: 'Cultura', type: 'text', required: true },
              { key: 'safra', label: 'Safra', type: 'text', required: true },
              { key: 'cenario', label: 'Cenário', type: 'text', default: 'planejado' },
              { key: 'areaPropriaHa', label: 'Área Própria (ha)', type: 'number' },
              { key: 'areaArrendadaHa', label: 'Área Arrend. (ha)', type: 'number' },
              { key: 'rendimentoScHa', label: 'Rend. (sc/ha)', type: 'number' },
              { key: 'precoMedioRs', label: 'Preço (R$/sc)', type: 'number' },
              { key: 'custoUnitarioInsumosRs', label: 'Custo (R$/sc)', type: 'number' },
              { key: 'arrendamentoBaseScHa', label: 'Arrend. base (sc/ha)', type: 'number' },
            ]}
            onClose={() => setShowBulk(false)}
            onSuccess={() => { reload(); setShowBulk(false) }}
          />
        </Suspense>
      )}
    </section>
  )
}

function CulturaSafraRow({
  row,
  onPatch,
  onDelete,
}: {
  row: CulturaSafra
  onPatch: (patch: Partial<CulturaSafra>) => void
  onDelete: () => void
}) {
  const [s, setS] = useState(row)
  return (
    <tr className="border-b border-aletis-grafite-claro/10 hover:bg-aletis-cream/20">
      <td className="py-1 px-1">
        <input value={s.cultura} onChange={(e) => setS({ ...s, cultura: e.target.value })} onBlur={() => onPatch({ cultura: s.cultura })} className="input-cell w-32" />
      </td>
      <td className="py-1 px-1">
        <input value={s.safra} onChange={(e) => setS({ ...s, safra: e.target.value })} onBlur={() => onPatch({ safra: s.safra })} className="input-cell w-16" placeholder="23/24" />
      </td>
      <td className="py-1 px-1">
        <select value={s.cenario} onChange={(e) => { setS({ ...s, cenario: e.target.value }); onPatch({ cenario: e.target.value }) }} className="input-cell">
          <option value="planejado">Planejado</option>
          <option value="realizado">Realizado</option>
          <option value="proposta">Proposta</option>
          <option value="futura">Futura</option>
        </select>
      </td>
      <NumCell value={s.areaPropriaHa ?? ''} onChange={(v) => setS({ ...s, areaPropriaHa: v })} onBlur={() => onPatch({ areaPropriaHa: s.areaPropriaHa as any })} />
      <NumCell value={s.areaArrendadaHa ?? ''} onChange={(v) => setS({ ...s, areaArrendadaHa: v })} onBlur={() => onPatch({ areaArrendadaHa: s.areaArrendadaHa as any })} />
      <NumCell value={s.rendimentoScHa ?? ''} onChange={(v) => setS({ ...s, rendimentoScHa: v })} onBlur={() => onPatch({ rendimentoScHa: s.rendimentoScHa as any })} />
      <NumCell value={s.precoMedioRs ?? ''} onChange={(v) => setS({ ...s, precoMedioRs: v })} onBlur={() => onPatch({ precoMedioRs: s.precoMedioRs as any })} />
      <NumCell value={s.custoUnitarioInsumosRs ?? ''} onChange={(v) => setS({ ...s, custoUnitarioInsumosRs: v })} onBlur={() => onPatch({ custoUnitarioInsumosRs: s.custoUnitarioInsumosRs as any })} />
      <NumCell value={s.arrendamentoBaseScHa ?? ''} onChange={(v) => setS({ ...s, arrendamentoBaseScHa: v })} onBlur={() => onPatch({ arrendamentoBaseScHa: s.arrendamentoBaseScHa as any })} />
      <td className="py-1 px-1">
        <button type="button" onClick={onDelete} className="text-aletis-grafite-claro hover:text-red-600">
          <Trash2 className="w-3 h-3" />
        </button>
      </td>
    </tr>
  )
}

function NumCell({ value, onChange, onBlur }: { value: string; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <td className="py-1 px-1 text-right">
      <input
        type="number"
        step="0.0001"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="input-cell w-24 text-right tabular-nums"
      />
    </td>
  )
}

function CustosSection({ grupoId }: { grupoId: string }) {
  return <SimpleListSection grupoId={grupoId} type="custos" emoji="💰" titulo="Custos do Cliente" />
}

function EndividamentoSection({ grupoId }: { grupoId: string }) {
  const [list, setList] = useState<ContratoDivida[] | null>(null)
  const [adding, setAdding] = useState(false)

  const reload = useCallback(async () => {
    const r = await apiFetch<{ contratos: ContratoDivida[] }>(`/gestao-financeira/grupos/${grupoId}/contratos`)
    setList(r.contratos)
  }, [grupoId])

  useEffect(() => { reload() }, [reload])

  async function adicionar() {
    setAdding(true)
    try {
      await apiFetch(`/gestao-financeira/grupos/${grupoId}/contratos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credor: 'Banco',
          contrato: '',
          valorFinanciado: 100000,
          prazoParcelas: 36,
          taxaNominalAa: 12,
          periodicidade: 'mensal',
          metodoCalculo: 'PRICE',
          enquadramento: 'custeio',
          dataContratacao: new Date().toISOString(),
          primeiraParcela: new Date().toISOString(),
        }),
      })
      reload()
    } finally { setAdding(false) }
  }

  async function patch(id: string, body: Partial<ContratoDivida>) {
    await apiFetch(`/gestao-financeira/contratos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  async function remover(id: string) {
    await apiFetch(`/gestao-financeira/contratos/${id}`, { method: 'DELETE' })
    reload()
  }

  if (!list) return <SectionSkeleton />

  return (
    <section className="card-premium p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
          Contratos de Dívida ({list.length})
          <span className="ml-2 text-[10px] text-aletis-grafite-claro font-mono">R.OP.001 sheet 10-Endividamento</span>
        </h3>
        <button type="button" onClick={adicionar} disabled={adding} className="px-3 py-1 rounded-lg bg-aletis-verde/10 text-aletis-verde text-xs font-body font-semibold hover:bg-aletis-verde/20 inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> Adicionar contrato
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-aletis-grafite-claro border-b border-aletis-grafite-claro/15">
              <th className="text-left py-2 px-1">Credor</th>
              <th className="text-left py-2 px-1">Contrato</th>
              <th className="text-right py-2 px-1">Valor</th>
              <th className="text-right py-2 px-1">Prazo</th>
              <th className="text-right py-2 px-1">Taxa a.a.</th>
              <th className="text-left py-2 px-1">Período</th>
              <th className="text-left py-2 px-1">Método</th>
              <th className="text-left py-2 px-1">Enquad.</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={9} className="text-center py-6 text-aletis-grafite-claro">Nenhum contrato cadastrado.</td></tr>
            )}
            {list.map((c) => (
              <ContratoRow key={c.id} row={c} onPatch={(p) => patch(c.id, p)} onDelete={() => remover(c.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ContratoRow({ row, onPatch, onDelete }: { row: ContratoDivida; onPatch: (p: Partial<ContratoDivida>) => void; onDelete: () => void }) {
  const [s, setS] = useState(row)
  return (
    <tr className="border-b border-aletis-grafite-claro/10 hover:bg-aletis-cream/20">
      <td className="py-1 px-1"><input value={s.credor} onChange={(e) => setS({ ...s, credor: e.target.value })} onBlur={() => onPatch({ credor: s.credor })} className="input-cell w-32" /></td>
      <td className="py-1 px-1"><input value={s.contrato ?? ''} onChange={(e) => setS({ ...s, contrato: e.target.value })} onBlur={() => onPatch({ contrato: s.contrato ?? '' })} className="input-cell w-32" /></td>
      <NumCell value={s.valorFinanciado ?? ''} onChange={(v) => setS({ ...s, valorFinanciado: v })} onBlur={() => onPatch({ valorFinanciado: s.valorFinanciado as any })} />
      <td className="py-1 px-1 text-right"><input type="number" value={s.prazoParcelas ?? ''} onChange={(e) => setS({ ...s, prazoParcelas: parseInt(e.target.value, 10) || null })} onBlur={() => onPatch({ prazoParcelas: s.prazoParcelas })} className="input-cell w-16 text-right" /></td>
      <NumCell value={s.taxaNominalAa ?? ''} onChange={(v) => setS({ ...s, taxaNominalAa: v })} onBlur={() => onPatch({ taxaNominalAa: s.taxaNominalAa as any })} />
      <td className="py-1 px-1">
        <select value={s.periodicidade ?? 'mensal'} onChange={(e) => { setS({ ...s, periodicidade: e.target.value }); onPatch({ periodicidade: e.target.value }) }} className="input-cell">
          <option value="mensal">Mensal</option><option value="trimestral">Trim.</option>
          <option value="semestral">Sem.</option><option value="anual">Anual</option><option value="final">Bullet</option>
        </select>
      </td>
      <td className="py-1 px-1">
        <select value={s.metodoCalculo} onChange={(e) => { setS({ ...s, metodoCalculo: e.target.value }); onPatch({ metodoCalculo: e.target.value }) }} className="input-cell">
          <option value="PRICE">PRICE</option><option value="SAC">SAC</option><option value="BULLET">BULLET</option><option value="OUTROS">OUTROS</option>
        </select>
      </td>
      <td className="py-1 px-1"><input value={s.enquadramento ?? ''} onChange={(e) => setS({ ...s, enquadramento: e.target.value })} onBlur={() => onPatch({ enquadramento: s.enquadramento ?? '' })} className="input-cell w-24" /></td>
      <td className="py-1 px-1"><button type="button" onClick={onDelete} className="text-aletis-grafite-claro hover:text-red-600"><Trash2 className="w-3 h-3" /></button></td>
    </tr>
  )
}

function DemandasSection({ grupoId }: { grupoId: string }) {
  return <SimpleListSection grupoId={grupoId} type="demandas" emoji="📨" titulo="Demandas de Crédito" />
}

function FazendasSection({ grupoId }: { grupoId: string }) {
  return <SimpleListSection grupoId={grupoId} type="fazendas" emoji="🏞️" titulo="Fazendas" />
}

const SimuladorRenegociacao = lazy(() => import('./SimuladorRenegociacao'))
const StressTestModal = lazy(() => import('./StressTestModal'))
const ImportXlsmModal = lazy(() => import('./ImportXlsmModal'))
const ImportOfxModal = lazy(() => import('./ImportOfxModal'))
const WizardOnboarding = lazy(() => import('./WizardOnboarding'))
const SnapshotDiffModal = lazy(() => import('./SnapshotDiffModal'))
const NarrativaModal = lazy(() => import('./NarrativaModal'))
const KanbanSlaPanel = lazy(() => import('./KanbanSlaPanel'))
const BenchmarkPanel = lazy(() => import('./BenchmarkPanel'))
const VoiceInputButton = lazy(() => import('./VoiceInputButton'))
const ChangelogPanel = lazy(() => import('./ChangelogPanel'))
const ComentariosPanel = lazy(() => import('./ComentariosPanel'))
const MarketplaceModal = lazy(() => import('./MarketplaceModal'))

function ToolbarActions({ grupoId, clienteId, onReload }: { grupoId: string; clienteId: string; onReload: () => void }) {
  const [exporting, setExporting] = useState(false)
  const [savingSnap, setSavingSnap] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showMarketplace, setShowMarketplace] = useState(false)
  const [showSim, setShowSim] = useState(false)
  const [showStress, setShowStress] = useState(false)
  const [showImportXlsm, setShowImportXlsm] = useState(false)
  const [showImportOfx, setShowImportOfx] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [showNarr, setShowNarr] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingPpt, setExportingPpt] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function exportPptx() {
    setExportingPpt(true)
    setError(null)
    try {
      const url = `/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/diagnostico-pptx`
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const dl = document.createElement('a')
      dl.href = URL.createObjectURL(blob)
      const cd = resp.headers.get('Content-Disposition') ?? ''
      const m = cd.match(/filename="?([^"]+)"?/)
      dl.download = m?.[1] ?? `Diagnostico_${grupoId}.pptx`
      dl.click()
      setTimeout(() => URL.revokeObjectURL(dl.href), 30_000)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setExportingPpt(false)
    }
  }

  async function exportKitBanco() {
    setExportingPdf(true)
    setError(null)
    try {
      const url = `/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/kit-banco-pdf`
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const dl = document.createElement('a')
      dl.href = URL.createObjectURL(blob)
      const cd = resp.headers.get('Content-Disposition') ?? ''
      const m = cd.match(/filename="?([^"]+)"?/)
      dl.download = m?.[1] ?? `KitBanco_${grupoId}.pdf`
      dl.click()
      setTimeout(() => URL.revokeObjectURL(dl.href), 30_000)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setExportingPdf(false)
    }
  }

  async function exportXlsm() {
    setExporting(true)
    setError(null)
    try {
      const url = `/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/export-xlsm`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versao: 'v2' }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const dl = document.createElement('a')
      dl.href = URL.createObjectURL(blob)
      const cd = resp.headers.get('Content-Disposition') ?? ''
      const m = cd.match(/filename="?([^"]+)"?/)
      dl.download = m?.[1] ?? `R.OP.001_v2_${grupoId}.xlsm`
      dl.click()
      setTimeout(() => URL.revokeObjectURL(dl.href), 30_000)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setExporting(false)
    }
  }

  async function snapshot() {
    const label = window.prompt('Etiqueta do snapshot (ex: "pre-renegociacao", "proposta-banco-X"):', `snapshot-${new Date().toISOString().slice(0, 10)}`)
    if (!label) return
    setSavingSnap(true)
    try {
      await apiFetch(`/gestao-financeira/grupos/${grupoId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      onReload()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setSavingSnap(false)
    }
  }

  return (
    <div className="gf-toolbar flex items-center md:justify-end gap-2 flex-wrap">
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      <button
        type="button"
        onClick={() => setShowTemplates(!showTemplates)}
        className="px-2.5 py-1 rounded-lg text-[11px] font-body font-medium border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5 inline-flex items-center gap-1"
        title="Aplicar template de cliente típico (perfis hardcoded)"
      >
        🎯 Templates
      </button>
      <button
        type="button"
        onClick={() => setShowMarketplace(true)}
        className="px-2.5 py-1 rounded-lg text-[11px] font-body font-medium border border-aletis-verde/30 bg-aletis-verde/5 hover:bg-aletis-verde/15 inline-flex items-center gap-1"
        title="Marketplace de templates da carteira (capturar/aplicar)"
      >
        🏬 Marketplace
      </button>
      <button
        type="button"
        onClick={() => setShowSim(true)}
        className="px-2.5 py-1 rounded-lg text-[11px] font-body font-medium border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5 inline-flex items-center gap-1"
        title="Simular renegociação de contrato"
      >
        🔁 Simular
      </button>
      <button
        type="button"
        onClick={() => setShowStress(true)}
        className="px-2.5 py-1 rounded-lg text-[11px] font-body font-medium border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5 inline-flex items-center gap-1"
        title="Stress test (queda de preço/rendimento)"
      >
        🌡️ Stress
      </button>
      <button
        type="button"
        onClick={() => setShowImportXlsm(true)}
        className="px-2.5 py-1 rounded-lg text-[11px] font-body font-medium border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5 inline-flex items-center gap-1"
        title="Importar dados de um R.OP.001 .xlsm preenchido"
      >
        📤 Import .xlsm
      </button>
      <button
        type="button"
        onClick={() => setShowImportOfx(true)}
        className="px-2.5 py-1 rounded-lg text-[11px] font-body font-medium border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5 inline-flex items-center gap-1"
        title="Importar extrato bancário OFX"
      >
        🏦 OFX
      </button>
      <button
        type="button"
        onClick={snapshot}
        disabled={savingSnap}
        className="px-2.5 py-1 rounded-lg text-[11px] font-body font-medium border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5 inline-flex items-center gap-1 disabled:opacity-50"
        title="Salvar snapshot etiquetado para auditoria/diff"
      >
        📸 Snapshot
      </button>
      <button
        type="button"
        onClick={() => setShowDiff(true)}
        className="px-2.5 py-1 rounded-lg text-[11px] font-body font-medium border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5 inline-flex items-center gap-1"
        title="Comparar 2 snapshots A/B"
      >
        🔍 Diff A/B
      </button>
      <button
        type="button"
        onClick={() => setShowNarr(true)}
        className="px-2.5 py-1 rounded-lg text-[11px] font-body font-medium border border-aletis-verde/30 bg-aletis-verde/5 hover:bg-aletis-verde/15 inline-flex items-center gap-1"
        title="Gera análise textual via LLM (Claude Foundry) — 4 estilos disponíveis"
      >
        🤖 Narrativa
      </button>
      <button
        type="button"
        onClick={exportPptx}
        disabled={exportingPpt}
        className="px-3 py-1 rounded-lg text-[11px] font-body font-semibold bg-aletis-dourado/15 text-aletis-grafite-escuro hover:bg-aletis-dourado/25 inline-flex items-center gap-1 disabled:opacity-50"
        title="Gera apresentação .pptx do diagnóstico (13 slides, charts nativos)"
      >
        {exportingPpt ? '⏳' : '🎨'} Diagnóstico PPT
      </button>
      <button
        type="button"
        onClick={exportKitBanco}
        disabled={exportingPdf}
        className="px-3 py-1 rounded-lg text-[11px] font-body font-semibold bg-aletis-dourado/15 text-aletis-grafite-escuro hover:bg-aletis-dourado/25 inline-flex items-center gap-1 disabled:opacity-50"
        title="Gera PDF profissional do Kit Banco (13 seções padronizadas)"
      >
        {exportingPdf ? '⏳' : '📕'} Kit Banco PDF
      </button>
      <button
        type="button"
        onClick={exportXlsm}
        disabled={exporting}
        className="px-3 py-1 rounded-lg text-[11px] font-body font-semibold bg-aletis-verde/10 text-aletis-verde hover:bg-aletis-verde/20 inline-flex items-center gap-1 disabled:opacity-50"
        title="Gerar R.OP.001 v2.0 .xlsm preenchido (preserva VBA)"
      >
        {exporting ? '⏳' : '📥'} Exportar .xlsm
      </button>
      {showTemplates && (
        <TemplatesDialog grupoId={grupoId} onClose={() => setShowTemplates(false)} onApply={() => { setShowTemplates(false); onReload() }} />
      )}
      {showMarketplace && (
        <Suspense fallback={null}>
          <MarketplaceModal grupoId={grupoId} onClose={() => setShowMarketplace(false)} onApplied={onReload} />
        </Suspense>
      )}
      {showSim && (
        <Suspense fallback={null}>
          <SimuladorRenegociacao grupoId={grupoId} onClose={() => setShowSim(false)} />
        </Suspense>
      )}
      {showStress && (
        <Suspense fallback={null}>
          <StressTestModal grupoId={grupoId} onClose={() => setShowStress(false)} />
        </Suspense>
      )}
      {showImportXlsm && (
        <Suspense fallback={null}>
          <ImportXlsmModal grupoId={grupoId} onClose={() => setShowImportXlsm(false)} onSuccess={() => { setShowImportXlsm(false); onReload() }} />
        </Suspense>
      )}
      {showImportOfx && (
        <Suspense fallback={null}>
          <ImportOfxModal grupoId={grupoId} onClose={() => setShowImportOfx(false)} onSuccess={() => { setShowImportOfx(false); onReload() }} />
        </Suspense>
      )}
      {showDiff && (
        <Suspense fallback={null}>
          <SnapshotDiffModal grupoId={grupoId} onClose={() => setShowDiff(false)} />
        </Suspense>
      )}
      {showNarr && (
        <Suspense fallback={null}>
          <NarrativaModal grupoId={grupoId} onClose={() => setShowNarr(false)} />
        </Suspense>
      )}
    </div>
  )
}

function TemplatesDialog({ grupoId, onClose, onApply }: { grupoId: string; onClose: () => void; onApply: () => void }) {
  const TEMPLATES = [
    { id: 'soja-mt', rotulo: '🌾 Produtor de Soja — Mato Grosso', desc: '3000 ha soja + 2400 ha milho safrinha + 600 ha algodão; 8 custos típicos; 3 contratos (BB+Sicredi+Bradesco)' },
    { id: 'cafe-mg', rotulo: '☕ Cafeicultor — Sul de Minas', desc: '280 ha arábica + 80 ha conilon; 6 custos; 2 contratos (Sicoob+BNB)' },
    { id: 'boi-go', rotulo: '🐂 Pecuarista de corte — Goiás', desc: '1800 ha pasto cultivado + confinamento; 7 custos; 2 contratos (Bradesco+BB)' },
    { id: 'cana-sp', rotulo: '🌱 Fornecedor de cana — São Paulo', desc: '2000 ha (1ª colheita+soca); 5 custos; 2 contratos (Itaú+Santander)' },
  ]
  const [applying, setApplying] = useState<string | null>(null)
  async function aplicar(id: string) {
    setApplying(id)
    try {
      await apiFetch(`/gestao-financeira/grupos/${grupoId}/aplicar-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: id }),
      })
      onApply()
    } finally {
      setApplying(null)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono text-aletis-verde uppercase font-semibold">🎯 Templates de Cliente</p>
            <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro">Aplicar perfil agro típico</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center">
            <span className="text-aletis-grafite-claro">✕</span>
          </button>
        </header>
        <div className="p-5 space-y-2">
          <p className="text-xs text-aletis-grafite-claro mb-3">
            Cada template adiciona culturas, custos e contratos de um perfil agro típico. <strong>Não substitui</strong> dados existentes — soma.
          </p>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => aplicar(t.id)}
              disabled={!!applying}
              className="w-full text-left p-3 rounded-lg border border-aletis-grafite-claro/20 hover:border-aletis-verde hover:bg-aletis-verde/5 transition-colors disabled:opacity-50"
            >
              <p className="text-sm font-display font-semibold text-aletis-grafite-escuro">{t.rotulo}</p>
              <p className="text-[11px] text-aletis-grafite-claro mt-1">{t.desc}</p>
              {applying === t.id && <p className="text-[10px] text-aletis-verde mt-1">⏳ aplicando…</p>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Dashboard360Lazy({ grupoId }: { grupoId: string }) {
  return (
    <Suspense fallback={<div className="card-premium p-12 text-center"><div className="animate-pulse text-aletis-grafite-claro">Calculando dashboard 360°…</div></div>}>
      <Dashboard360 grupoId={grupoId} />
    </Suspense>
  )
}

function SimpleListV2({ grupoId, endpoint, titulo, emoji }: { grupoId: string; endpoint: string; titulo: string; emoji: string }) {
  const [items, setItems] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      const r = await apiFetch<any>(`/gestao-financeira/grupos/${grupoId}/${endpoint}`)
      setItems(r.items ?? [])
    } catch (e: any) { setError(String(e?.message ?? e)) }
  }, [grupoId, endpoint])
  useEffect(() => { reload() }, [reload])

  if (error) return <div className="card-premium p-4 text-xs text-red-600">{error}</div>
  if (!items) return <SectionSkeleton />
  return (
    <section className="card-premium p-4 space-y-3">
      <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
        {emoji} {titulo} ({items.length})
      </h3>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-aletis-grafite-claro/30 p-6 text-center bg-aletis-cream/20">
          <p className="text-xs text-aletis-grafite-claro">Nenhum registro. Adicione via API/ALIX ou aguarde wave 2 para editor inline.</p>
        </div>
      ) : (
        <pre className="text-[10px] font-mono bg-aletis-cream/30 rounded-lg p-3 overflow-x-auto max-h-96">{JSON.stringify(items, null, 2)}</pre>
      )}
    </section>
  )
}

function InsightsSection({ grupoId }: { grupoId: string }) {
  const [insights, setInsights] = useState<any[] | null>(null)
  const [recalc, setRecalc] = useState(false)
  const reload = useCallback(async () => {
    const r = await apiFetch<{ total: number; insights: any[] }>(`/gestao-financeira/grupos/${grupoId}/insights`)
    setInsights(r.insights)
  }, [grupoId])
  useEffect(() => { reload() }, [reload])

  async function recalcular() {
    setRecalc(true)
    try {
      await apiFetch(`/gestao-financeira/grupos/${grupoId}/insights/recalcular`, { method: 'POST' })
      await reload()
    } finally { setRecalc(false) }
  }

  if (!insights) return <SectionSkeleton />

  const grouped = {
    critico: insights.filter((i) => i.severidade === 'critico'),
    importante: insights.filter((i) => i.severidade === 'importante'),
    info: insights.filter((i) => i.severidade === 'info'),
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
          🔔 Insights de Saúde Financeira
        </h3>
        <button
          type="button"
          onClick={recalcular}
          disabled={recalc}
          className="px-3 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-body font-semibold hover:bg-aletis-verde-escuro inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {recalc ? '⏳ Recalculando…' : '🔄 Recalcular'}
        </button>
      </div>

      {insights.length === 0 ? (
        <div className="rounded-lg border border-dashed border-aletis-grafite-claro/30 p-6 text-center bg-aletis-cream/20">
          <p className="text-xs text-aletis-grafite-claro">Nenhum insight ainda. Clique em <strong>Recalcular</strong> ou edite o cadastro para acionar análise.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.critico.length > 0 && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-red-700 font-semibold mb-1.5">🔴 Críticos ({grouped.critico.length})</h4>
              <div className="space-y-1.5">
                {grouped.critico.map((i, idx) => <InsightRow key={idx} insight={i} />)}
              </div>
            </div>
          )}
          {grouped.importante.length > 0 && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold mb-1.5">🟡 Importantes ({grouped.importante.length})</h4>
              <div className="space-y-1.5">
                {grouped.importante.map((i, idx) => <InsightRow key={idx} insight={i} />)}
              </div>
            </div>
          )}
          {grouped.info.length > 0 && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-blue-700 font-semibold mb-1.5">🔵 Info ({grouped.info.length})</h4>
              <div className="space-y-1.5">
                {grouped.info.map((i, idx) => <InsightRow key={idx} insight={i} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InsightRow({ insight }: { insight: any }) {
  const cls = insight.severidade === 'critico'
    ? 'bg-red-50 border-red-200 text-red-900'
    : insight.severidade === 'importante'
    ? 'bg-amber-50 border-amber-200 text-amber-900'
    : 'bg-blue-50 border-blue-200 text-blue-900'
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">[{insight.categoria}]</span>
        <p className="text-xs font-body font-semibold leading-tight">{insight.titulo}</p>
        <span className="text-[10px] ml-auto opacity-60">{new Date(insight.calculadoEm).toLocaleString('pt-BR')}</span>
      </div>
      <p className="text-[11px] font-body mt-1 leading-relaxed">{insight.mensagem}</p>
      {insight.recomendacao && <p className="text-[11px] font-body mt-1 italic opacity-80">→ {insight.recomendacao}</p>}
    </div>
  )
}

function SimpleListSection({ grupoId, type, emoji, titulo }: { grupoId: string; type: string; emoji: string; titulo: string }) {
  const [items, setItems] = useState<any[] | null>(null)
  const reload = useCallback(async () => {
    const r = await apiFetch<any>(`/gestao-financeira/grupos/${grupoId}/${type}`)
    const key = type === 'demandas' ? 'demandas' : type === 'fazendas' ? 'fazendas' : 'custos'
    setItems(r[key] ?? [])
  }, [grupoId, type])
  useEffect(() => { reload() }, [reload])

  if (!items) return <SectionSkeleton />
  return (
    <section className="card-premium p-4 space-y-3">
      <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
        {emoji} {titulo} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-aletis-grafite-claro text-center py-6">
          Nenhum registro. Em breve: editor inline. Por ora use a API ou ALIX (gestao_financeira_*).
        </p>
      ) : (
        <pre className="text-[10px] font-mono bg-aletis-cream/30 rounded-lg p-3 overflow-x-auto">{JSON.stringify(items, null, 2)}</pre>
      )}
    </section>
  )
}

function DashboardSection({ grupoId }: { grupoId: string }) {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch<any>(`/gestao-financeira/grupos/${grupoId}/dashboard`)
      setData(r)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [grupoId])

  useEffect(() => { load() }, [load])

  if (loading || !data) return <SectionSkeleton />
  if (error) return <div className="text-xs text-red-600">{error}</div>

  const safras = data.safras as Array<any>
  const endividamento = data.endividamento as any
  const raioX = data.raioX as any

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Receita projetada" value={fmtBRL(raioX.indicadores.receitaTotal)} sublabel={`${raioX.anos.length} anos`} />
        <KpiCard label="EBITDA total" value={fmtBRL(raioX.indicadores.ebitdaTotal)} sublabel={`margem ${(raioX.indicadores.margemEbitda * 100).toFixed(1)}%`} />
        <KpiCard label="Dívida atual" value={fmtBRL(endividamento.saldoTotalAtual)} sublabel={`${endividamento.totalContratos} contratos`} />
        <KpiCard label="Dívida / EBITDA" value={`${raioX.indicadores.diviPorEbitda.toFixed(2)}x`} sublabel={raioX.indicadores.diviPorEbitda < 3 ? 'saudável' : 'atenção'} />
      </div>

      {/* Safras */}
      <section className="card-premium p-4">
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro mb-2">🌾 Safras Consolidadas</h3>
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="text-[10px] uppercase text-aletis-grafite-claro border-b border-aletis-grafite-claro/15">
              <th className="text-left py-1">Safra</th><th className="text-left py-1">Cenário</th>
              <th className="text-right py-1">Receita</th><th className="text-right py-1">Custo</th>
              <th className="text-right py-1">Resultado</th><th className="text-right py-1">Margem</th>
              <th className="text-right py-1">Área</th>
            </tr>
          </thead>
          <tbody>
            {safras.map((s, i) => (
              <tr key={i} className="border-b border-aletis-grafite-claro/10">
                <td className="py-1 font-mono">{s.safra}</td>
                <td className="py-1">{s.cenario}</td>
                <td className="py-1 text-right tabular-nums">{fmtBRL(s.receitaTotal)}</td>
                <td className="py-1 text-right tabular-nums">{fmtBRL(s.custoInsumosTotal + s.custoArrendamento)}</td>
                <td className="py-1 text-right tabular-nums font-semibold">{fmtBRL(s.resultadoBruto)}</td>
                <td className="py-1 text-right tabular-nums">{(s.margemBruta * 100).toFixed(1)}%</td>
                <td className="py-1 text-right tabular-nums">{s.totalAreaHa.toFixed(0)} ha</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Endividamento por credor */}
      <section className="card-premium p-4">
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro mb-2">📋 Endividamento por Credor</h3>
        <div className="space-y-2">
          {endividamento.porCredor.map((c: any, i: number) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-shrink-0 w-32 text-xs font-body">{c.credor}</div>
              <div className="flex-1 h-5 rounded bg-aletis-grafite-claro/10 relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-aletis-verde to-aletis-dourado" style={{ width: `${c.pctTotal * 100}%` }} />
                <span className="absolute inset-0 flex items-center px-2 text-[10px] font-mono">{(c.pctTotal * 100).toFixed(1)}% · {c.contratos}c</span>
              </div>
              <div className="w-32 text-right text-xs font-mono tabular-nums">{fmtBRL(c.saldo)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Cronogramas */}
      <section className="card-premium p-4">
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro mb-2">📅 Cronograma de Amortização</h3>
        {endividamento.contratos.map((c: any, i: number) => (
          <details key={i} className="mb-2 rounded-lg border border-aletis-grafite-claro/15">
            <summary className="px-3 py-2 cursor-pointer text-xs font-body bg-aletis-cream/30 hover:bg-aletis-cream/50">
              <strong>{c.credor}</strong> — {c.metodoCalculo} {c.prazoParcelas}m — saldo R$ {fmtBRL(c.saldoAtual)}
            </summary>
            <table className="w-full text-[11px] font-body">
              <thead className="text-[10px] uppercase text-aletis-grafite-claro">
                <tr><th className="text-left p-1">Ano</th><th className="text-right p-1">Capital</th><th className="text-right p-1">Juros</th><th className="text-right p-1">Parcela</th><th className="text-right p-1">Saldo fim</th></tr>
              </thead>
              <tbody>
                {c.porAno.map((y: any, j: number) => (
                  <tr key={j} className="border-t border-aletis-grafite-claro/10">
                    <td className="p-1 font-mono">{y.ano || '—'}</td>
                    <td className="p-1 text-right tabular-nums">{fmtBRL(y.capitalPago)}</td>
                    <td className="p-1 text-right tabular-nums">{fmtBRL(y.juroPago)}</td>
                    <td className="p-1 text-right tabular-nums">{fmtBRL(y.parcelaPaga)}</td>
                    <td className="p-1 text-right tabular-nums">{fmtBRL(y.saldoFinalAno)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </section>

      {/* Raio X */}
      <section className="card-premium p-4">
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro mb-2">🩻 Raio X — Projeção {raioX.anos.length} anos</h3>
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="text-[10px] uppercase text-aletis-grafite-claro border-b border-aletis-grafite-claro/15">
              <th className="text-left py-1">Ano</th><th className="text-right py-1">Receita</th><th className="text-right py-1">Débitos</th>
              <th className="text-right py-1">Saldo ano</th><th className="text-right py-1">Saldo acum.</th>
            </tr>
          </thead>
          <tbody>
            {raioX.anos.map((a: any, i: number) => (
              <tr key={i} className={`border-b border-aletis-grafite-claro/10 ${a.saldoAcumulado < 0 ? 'bg-red-50/40' : ''}`}>
                <td className="py-1 font-mono">{a.ano}</td>
                <td className="py-1 text-right tabular-nums">{fmtBRL(a.receitas.total)}</td>
                <td className="py-1 text-right tabular-nums">{fmtBRL(a.debitos.total)}</td>
                <td className={`py-1 text-right tabular-nums ${a.saldoNaoAcumulado < 0 ? 'text-red-600' : 'text-aletis-verde'}`}>{fmtBRL(a.saldoNaoAcumulado)}</td>
                <td className={`py-1 text-right tabular-nums font-semibold ${a.saldoAcumulado < 0 ? 'text-red-600' : 'text-aletis-verde'}`}>{fmtBRL(a.saldoAcumulado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function KpiCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="card-premium p-3">
      <p className="text-[10px] font-body uppercase tracking-wider text-aletis-grafite-claro">{label}</p>
      <p className="text-base font-display font-bold text-aletis-grafite-escuro tabular-nums leading-tight mt-0.5">{value}</p>
      {sublabel && <p className="text-[10px] font-body text-aletis-grafite-claro mt-0.5">{sublabel}</p>}
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-[11px] font-body font-medium uppercase tracking-wider text-aletis-grafite-claro">
        {label}
      </span>
      <div className="mt-0.5">{children}</div>
    </label>
  )
}

function SectionSkeleton() {
  return (
    <div className="card-premium p-6 space-y-2">
      <div className="h-4 w-1/3 bg-gray-100 animate-pulse rounded" />
      <div className="h-3 w-2/3 bg-gray-100 animate-pulse rounded" />
      <div className="h-32 bg-gray-50 animate-pulse rounded" />
    </div>
  )
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
