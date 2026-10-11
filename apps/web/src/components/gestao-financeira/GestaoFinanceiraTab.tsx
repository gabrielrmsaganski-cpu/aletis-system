// ============================================================
// GestaoFinanceiraTab — gestão financeira do cliente no ALETIS.
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
  FileSpreadsheet,
  ShieldCheck,
  Calculator,
  ScrollText,
  Database,
  CheckCircle2,
  Circle,
  Clock3,
  ArrowRight,
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

interface FinanceiroOverview {
  grupoId: string
  clienteId: string
  score: number
  counts: Record<string, number>
  totals: {
    dividaTotal: number
    dividaBancaria: number
    passivosNaoBancarios: number
    areaTotalHa: number
    garantiasValorForcado: number
  }
  stages: Array<{
    key: SubTab
    label: string
    count: number
    status: 'ok' | 'partial' | 'empty'
    required: boolean
    hint: string
  }>
}

type SubTab = 'mapa' | 'cadastro' | 'safras' | 'custos' | 'endividamento' | 'passivos' | 'garantias' | 'demandas' | 'fazendas' | 'premissas' | 'insights' | 'dashboard' | 'workflow' | 'benchmark' | 'comentarios' | 'changelog'
type SubTabGroup = 'visao' | 'entrada' | 'operacao' | 'credito' | 'saida' | 'governanca'

const SUB_TAB_GROUPS: Array<{ key: SubTabGroup; label: string }> = [
  { key: 'visao', label: 'Visão' },
  { key: 'entrada', label: 'Entrada de dados' },
  { key: 'operacao', label: 'Produção e custos' },
  { key: 'credito', label: 'Dívida e garantias' },
  { key: 'saida', label: 'Saídas' },
  { key: 'governanca', label: 'Governança' },
]

const SUB_TABS: { key: SubTab; label: string; emoji: string; icon: typeof Users; group: SubTabGroup }[] = [
  { key: 'dashboard', label: 'Raio X 360', emoji: '', icon: TrendingUp, group: 'visao' },
  { key: 'insights', label: 'Alertas', emoji: '', icon: AlertCircle, group: 'visao' },
  { key: 'cadastro', label: 'Cadastro', emoji: '', icon: Users, group: 'entrada' },
  { key: 'fazendas', label: 'Propriedades', emoji: '', icon: Building2, group: 'entrada' },
  { key: 'premissas', label: 'Premissas', emoji: '', icon: DollarSign, group: 'entrada' },
  { key: 'safras', label: 'Safras', emoji: '', icon: Wheat, group: 'operacao' },
  { key: 'custos', label: 'Custos', emoji: '', icon: Calculator, group: 'operacao' },
  { key: 'endividamento', label: 'Endividamento', emoji: '', icon: CreditCard, group: 'credito' },
  { key: 'passivos', label: 'Passivos', emoji: '', icon: AlertCircle, group: 'credito' },
  { key: 'garantias', label: 'Garantias', emoji: '', icon: Building2, group: 'credito' },
  { key: 'demandas', label: 'Demandas', emoji: '', icon: TrendingUp, group: 'saida' },
  { key: 'workflow', label: 'Pipeline', emoji: '', icon: AlertCircle, group: 'saida' },
  { key: 'benchmark', label: 'Benchmark', emoji: '', icon: TrendingUp, group: 'saida' },
  { key: 'comentarios', label: 'Pareceres', emoji: '', icon: ScrollText, group: 'governanca' },
  { key: 'changelog', label: 'Auditoria', emoji: '', icon: ShieldCheck, group: 'governanca' },
  { key: 'mapa', label: 'Mapa Excel', emoji: '', icon: FileSpreadsheet, group: 'governanca' },
]

const WORKBOOK_SHEETS = [
  { sheet: '1 - BaseSafra', range: 'B1:I700', cells: 4900, formulas: 175, module: 'Base agrícola', status: 'Referencia' },
  { sheet: '2 - Cadastro de Itens', range: 'B1:BV154', cells: 4605, formulas: 53, module: 'Cadastros auxiliares', status: 'Referencia' },
  { sheet: '3 - Cadastro', range: 'B2:J74', cells: 455, formulas: 0, module: 'Cadastro do grupo e membros', status: 'Nativo' },
  { sheet: '4 - Overview', range: 'B2:V57', cells: 684, formulas: 13, module: 'Resumo executivo', status: 'Dashboard' },
  { sheet: '5 - Demandas', range: 'B1:AI32', cells: 482, formulas: 0, module: 'Demandas de crédito', status: 'Nativo' },
  { sheet: '6 - Custos do Cliente', range: 'A1:W1018', cells: 23392, formulas: 107, module: 'Custos, insumos e fixos', status: 'Nativo' },
  { sheet: '7 - Safra', range: 'B2:K877', cells: 8649, formulas: 1940, module: 'Safras por cultura', status: 'Nativo' },
  { sheet: '7.1 - Rateio de Custos', range: 'A1:AC927', cells: 26877, formulas: 100, module: 'Rateio calculado', status: 'Motor' },
  { sheet: '7.2 - EBITDA', range: 'A1:AE940', cells: 29140, formulas: 121, module: 'EBITDA mensal', status: 'Motor' },
  { sheet: '7.3 - Premissas Safras', range: 'B2:L91', cells: 611, formulas: 144, module: 'Premissas agrícolas', status: 'Nativo' },
  { sheet: '8 - Ativos', range: 'B1:CN111', cells: 7814, formulas: 431, module: 'Fazendas, estoques e recebíveis', status: 'Nativo' },
  { sheet: '9 - Fornecedores (Cadastro)', range: 'B2:AA104', cells: 2471, formulas: 4, module: 'Fornecedores', status: 'Nativo' },
  { sheet: '10 - Endividamento', range: 'B2:DI98', cells: 10391, formulas: 4558, module: 'Dívidas bancárias', status: 'Nativo' },
  { sheet: '10.1 - Premissas Endividamento', range: 'B2:AE76', cells: 1206, formulas: 345, module: 'Premissas de dívida', status: 'Nativo' },
  { sheet: '11 - Passivos', range: 'B2:DE99', cells: 8734, formulas: 1713, module: 'Passivos não bancários', status: 'Nativo' },
  { sheet: '12 - Fluxo de Caixa Projetado', range: 'A1:AC103', cells: 2857, formulas: 226, module: 'Fluxo projetado', status: 'Motor' },
  { sheet: '9.1 - Custo Safra', range: 'B2:S98', cells: 1647, formulas: 62, module: 'Custo por safra', status: 'Motor' },
  { sheet: 'Planilha1', range: 'A1:A29', cells: 29, formulas: 0, module: 'Suporte interno', status: 'Referencia' },
  { sheet: '13 - Rel. Prem de safra', range: 'B2:L994', cells: 1444, formulas: 0, module: 'Relatório de premissas', status: 'Relatorio' },
  { sheet: '14 - Garantias', range: 'B2:Z103', cells: 2167, formulas: 269, module: 'Garantias e LTV', status: 'Nativo' },
  { sheet: '13 - PREMISSAS(PADRONIZAR)', range: 'B1:Q144', cells: 1023, formulas: 151, module: 'Premissas gerais', status: 'Nativo' },
  { sheet: '15 - Premissas e Suporte', range: 'B1:CB122', cells: 2032, formulas: 46, module: 'Suporte de cálculo', status: 'Nativo' },
  { sheet: '13.1 - OWER VIEW PREMISSAS', range: 'B1:H36', cells: 179, formulas: 9, module: 'Resumo de premissas', status: 'Dashboard' },
  { sheet: '16 - Raio X', range: 'B1:S116', cells: 1936, formulas: 202, module: 'Raio X financeiro', status: 'Dashboard' },
  { sheet: '17 - DRE FCL', range: 'B1:AG180', cells: 2766, formulas: 273, module: 'DRE/FCL', status: 'Motor' },
  { sheet: 'RELATÓRIO', range: 'B42:AL657', cells: 9827, formulas: 832, module: 'Relatório final', status: 'PDF/PPT' },
  { sheet: '18 - BANCO', range: 'C1:N447', cells: 4528, formulas: 0, module: 'Kit banco', status: 'PDF' },
  { sheet: '19 - Guia de Uso', range: 'A1:Z150', cells: 3900, formulas: 0, module: 'Guia operacional', status: 'Referencia' },
] as const

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

  // Reage a navegação externa (ex: Guia do Consultor clicando em uma etapa)
  useEffect(() => {
    if (initialSubTab && visibleSubTabs.some((t) => t.key === initialSubTab) && activeSub !== initialSubTab) {
      setActiveSub(initialSubTab)
    }
  }, [initialSubTab])
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
      <div className="rounded-lg border border-aletis-borda bg-card p-8 text-center shadow-none">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg border border-aletis-borda bg-aletis-bege/45 text-foreground">
          <FileSpreadsheet className="h-7 w-7" />
        </div>
        <div className="mt-5">
          <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.22em] text-foreground">
            Gestão Financeira ALETIS
          </p>
          <h3 className="mt-2 text-xl font-display font-semibold text-foreground">
            CRM financeiro agro pronto para estruturar o cliente
          </h3>
          <p className="text-sm font-body text-[var(--text-soft)] mt-2 max-w-2xl mx-auto leading-relaxed">
            Cadastro, propriedades, safras, custos, ativos, endividamento, passivos, garantias,
            demandas, premissas, Raio X, DRE/FCL e memória de cálculo. Quando faltar evidência,
            o sistema marca como não informado, pendente de preenchimento ou necessário validar.
          </p>
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          <ProofPill label="Entrada" value="CRM, importação ou cadastro manual" />
          <ProofPill label="Cálculo" value="Premissas abertas e auditáveis" />
          <ProofPill label="Segurança" value="Logs e controle por cliente" />
        </div>
        <div className="mt-6 flex flex-col md:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-aletis-verde px-5 text-sm font-body font-semibold text-white transition-colors hover:bg-aletis-verde-escuro"
          >
            <Sparkles className="w-4 h-4" />
            Cadastro guiado
          </button>
          <button
            type="button"
            onClick={autoImportCRM}
            disabled={importing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-5 text-sm font-body font-semibold text-foreground transition-colors hover:bg-aletis-bege/50 disabled:opacity-50"
            title="Importa dados do CRM e cria grupo pré-populado"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Importar do CRM
          </button>
          <button
            type="button"
            onClick={criarNovoGrupo}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-5 text-sm font-body font-semibold text-[var(--text-soft)] transition-colors hover:bg-aletis-bege/50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar vazio
          </button>
        </div>
        <div className="mt-5 max-w-2xl border-t border-aletis-borda pt-4 mx-auto text-[11px] font-body text-muted-foreground">
          Regra de integridade: o sistema cria estrutura, calculos, fluxos e templates, mas nao inventa valor,
          contrato, taxa, garantia, tese juridica ou conclusao sem fonte cadastrada.
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

      <GrupoContextHeader
        grupo={activeGrupo}
        grupos={grupos}
        compact={compact}
        loading={loading}
        onSelect={(grupoId) => {
          const g = grupos.find((item) => item.id === grupoId)
          if (g) setActiveGrupo(g)
        }}
        onNew={criarNovoGrupo}
      />

      <ReadinessPanel
        grupoId={activeGrupo.id}
        activeSub={activeSub}
        visibleSubTabs={visibleSubTabs}
        onGo={(tab) => setActiveSub(tab)}
      />

      {/* Sub-tabs */}
      <GroupedSubTabs tabs={visibleSubTabs} activeSub={activeSub} onChange={setActiveSub} />

      {/* Conteúdo da sub-tab */}
      {activeSub === 'mapa' && <WorkbookMapSection />}
      {activeSub === 'cadastro' && <CadastroSection grupo={activeGrupo} onUpdate={reloadGrupos} />}
      {activeSub === 'safras' && <SafrasSection grupoId={activeGrupo.id} />}
      {activeSub === 'custos' && (
        <Suspense fallback={<SectionSkeleton />}>
          <TableEditor
            title="Custos do Cliente"
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

function ProofPill({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-aletis-borda bg-aletis-bege/25 px-3 py-2 text-left">
      <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-foreground">{label}</p>
      <p className="mt-1 text-[11px] font-body leading-snug text-[var(--text-soft)]">{value}</p>
    </div>
  )
}

function GrupoContextHeader({
  grupo,
  grupos,
  compact,
  loading,
  onSelect,
  onNew,
}: {
  grupo: Grupo
  grupos: Grupo[]
  compact?: boolean
  loading: boolean
  onSelect: (grupoId: string) => void
  onNew: () => void
}) {
  return (
    <div className={`rounded-lg border border-aletis-borda bg-card shadow-none ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-aletis-borda bg-aletis-bege/45 text-foreground">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-mono font-semibold text-foreground uppercase tracking-[0.18em]">
              Gestão Financeira ALETIS
            </p>
            <h2 className="text-base font-display font-semibold text-foreground truncate">
              {grupo.nomeGrupo}
            </h2>
            <p className="text-[11px] font-body text-muted-foreground">
              Data base: {new Date(grupo.dataBase).toLocaleDateString('pt-BR')} · {grupos.length} grupo{grupos.length !== 1 ? 's' : ''} neste cliente
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          {grupos.length > 1 && (
            <select
              value={grupo.id}
              onChange={(e) => onSelect(e.target.value)}
              className="h-9 rounded-xl border border-aletis-borda bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-aletis-verde/15"
            >
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nomeGrupo}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={onNew}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 text-xs font-body font-semibold text-foreground hover:bg-aletis-bege/50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Novo grupo
          </button>
        </div>
      </div>
    </div>
  )
}

function ReadinessPanel({
  grupoId,
  activeSub,
  visibleSubTabs,
  onGo,
}: {
  grupoId: string
  activeSub: SubTab
  visibleSubTabs: Array<(typeof SUB_TABS)[number]>
  onGo: (tab: SubTab) => void
}) {
  const [overview, setOverview] = useState<FinanceiroOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const visibleKeys = useMemo(() => new Set(visibleSubTabs.map((t) => t.key)), [visibleSubTabs])

  useEffect(() => {
    let alive = true
    setOverview(null)
    setError(null)
    apiFetch<FinanceiroOverview>(`/gestao-financeira/grupos/${grupoId}/overview`)
      .then((data) => { if (alive) setOverview(data) })
      .catch((err) => { if (alive) setError(String(err?.message ?? err)) })
    return () => { alive = false }
  }, [grupoId])

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Não foi possível carregar a visão de preenchimento: {error}
      </div>
    )
  }

  if (!overview) {
    return (
      <div className="grid gap-3 md:grid-cols-[220px_1fr]">
        <div className="h-32 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-32 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    )
  }

  const nextStage = overview.stages.find((stage) => stage.required && stage.status !== 'ok')
  const stageRows = overview.stages.filter((stage) => visibleKeys.has(stage.key))

  return (
    <section className="grid gap-3 xl:grid-cols-[260px_1fr]">
      <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-foreground">preenchimento</p>
            <p className="mt-1 text-3xl font-display font-semibold text-foreground tabular-nums">{overview.score}%</p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-aletis-bege" style={{ borderTopColor: overview.score >= 80 ? '#10b981' : overview.score >= 50 ? '#cb9d52' : '#ef4444' }}>
            {overview.score >= 80 ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <Clock3 className="h-6 w-6 text-aletis-dourado" />}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <MiniMetric label="Dívida" value={fmtBRL(overview.totals.dividaTotal)} />
          <MiniMetric label="Área" value={`${overview.totals.areaTotalHa.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ha`} />
          <MiniMetric label="Garantias" value={fmtBRL(overview.totals.garantiasValorForcado)} />
          <MiniMetric label="Contratos" value={String(overview.counts.contratos ?? 0)} />
        </div>
      </div>

      <div className="rounded-lg border border-aletis-borda bg-card p-3 shadow-none">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-display font-semibold text-foreground">
              Estrutura do dossiê financeiro
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {nextStage ? `Próximo bloco crítico: ${nextStage.label}.` : 'Blocos críticos completos para diagnóstico e exportações.'}
            </p>
          </div>
          {nextStage && visibleKeys.has(nextStage.key) && (
            <button
              type="button"
              onClick={() => onGo(nextStage.key)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-aletis-verde px-3 text-xs font-semibold text-white hover:bg-aletis-verde-escuro"
            >
              Abrir {nextStage.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {stageRows.map((stage) => (
            <button
              type="button"
              key={stage.key}
              onClick={() => onGo(stage.key)}
              className={`rounded-xl border p-3 text-left transition-all  hover:shadow-sm ${
                activeSub === stage.key
                  ? 'border-aletis-verde bg-aletis-verde/5'
                  : stage.status === 'ok'
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : stage.status === 'partial'
                      ? 'border-amber-200 bg-amber-50/60'
                      : 'border-aletis-borda bg-card'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-body font-semibold text-foreground">{stage.label}</span>
                {stage.status === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : stage.status === 'partial' ? (
                  <Clock3 className="h-4 w-4 text-amber-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{stage.hint}</p>
              <p className="mt-2 text-[11px] font-mono text-muted-foreground tabular-nums">{stage.count} registro{stage.count !== 1 ? 's' : ''}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-aletis-borda bg-aletis-bege/25 px-2 py-1.5">
      <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  )
}

function GroupedSubTabs({
  tabs,
  activeSub,
  onChange,
}: {
  tabs: Array<(typeof SUB_TABS)[number]>
  activeSub: SubTab
  onChange: (tab: SubTab) => void
}) {
  return (
    <div className="rounded-lg border border-aletis-borda bg-white/90 p-2 shadow-none">
      <div className="grid gap-2 xl:grid-cols-6">
        {SUB_TAB_GROUPS.map((group) => {
          const groupTabs = tabs.filter((tab) => tab.group === group.key)
          if (groupTabs.length === 0) return null
          return (
            <div key={group.key} className="rounded-xl border border-aletis-borda bg-aletis-bege/20 p-2">
              <p className="mb-1.5 px-1 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1.5 xl:flex-col">
                {groupTabs.map((tab) => {
                  const Icon = tab.icon
                  const active = activeSub === tab.key
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => onChange(tab.key)}
                      className={`w-full justify-start px-2.5 py-1.5 rounded-lg text-xs font-body font-medium inline-flex items-center gap-1.5 transition-colors ${
                        active
                          ? 'bg-aletis-verde text-white shadow-sm'
                          : 'border border-transparent bg-card text-[var(--text-soft)] hover:border-aletis-borda hover:bg-aletis-bege/55'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WorkbookMapSection() {
  const totals = WORKBOOK_SHEETS.reduce(
    (acc, row) => ({
      sheets: acc.sheets + 1,
      cells: acc.cells + row.cells,
      formulas: acc.formulas + row.formulas,
    }),
    { sheets: 0, cells: 0, formulas: 0 },
  )
  const nativeCount = WORKBOOK_SHEETS.filter((row) => row.status === 'Nativo').length
  const motorCount = WORKBOOK_SHEETS.filter((row) => row.status === 'Motor' || row.status === 'Dashboard').length

  return (
    <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <WorkbookStat icon={FileSpreadsheet} label="Abas mapeadas" value={totals.sheets.toLocaleString('pt-BR')} />
        <WorkbookStat icon={Calculator} label="Fórmulas catalogadas" value={totals.formulas.toLocaleString('pt-BR')} />
        <WorkbookStat icon={Database} label="Células preenchidas" value={totals.cells.toLocaleString('pt-BR')} />
        <WorkbookStat icon={ShieldCheck} label="Macros VBA" value="Preservado no .xlsm" />
      </div>

      <div className="overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-none">
        <div className="border-b border-aletis-borda bg-aletis-bege/25 px-4 py-3">
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-foreground">
            R.OP.001_Registro de Gestão Financeirav2.0.xlsm
          </p>
          <h3 className="text-base font-display font-semibold text-foreground mt-1">
            Cobertura nativa da planilha financeira
          </h3>
          <p className="text-xs font-body text-[var(--text-soft)] mt-1">
            {nativeCount} abas editáveis no sistema, {motorCount} abas reprocessadas pelo motor financeiro e exportação
            para PDF, PPT e Excel macro-habilitado quando precisar.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="ui-table w-full text-left text-xs">
            <thead className="bg-aletis-cream/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-body font-semibold">Aba original</th>
                <th className="px-3 py-2 font-body font-semibold">Módulo ALETIS</th>
                <th className="px-3 py-2 font-body font-semibold">Intervalo</th>
                <th className="px-3 py-2 font-body font-semibold text-right">Células</th>
                <th className="px-3 py-2 font-body font-semibold text-right">Fórmulas</th>
                <th className="px-3 py-2 font-body font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {WORKBOOK_SHEETS.map((row) => (
                <tr key={row.sheet} className="border-t border-aletis-grafite-claro/10 hover:bg-aletis-cream/25">
                  <td className="px-3 py-2 font-body font-semibold text-foreground whitespace-nowrap">
                    {row.sheet}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-soft)] min-w-[180px]">{row.module}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{row.range}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{row.cells.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{row.formulas.toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2">
                    <WorkbookStatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function WorkbookStat({ icon: Icon, label, value }: { icon: typeof FileSpreadsheet; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex items-center gap-2 text-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-mono uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="mt-2 text-lg font-display font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  )
}

function WorkbookStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Nativo'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'Motor' || status === 'Dashboard'
        ? 'bg-blue-50 text-blue-700 border-blue-200'
        : status === 'PDF' || status === 'PDF/PPT' || status === 'Relatorio'
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-mono font-semibold uppercase ${cls}`}>
      {status}
    </span>
  )
}

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
      <section className="space-y-3 rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <h3 className="text-sm font-display font-semibold text-foreground">
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
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-aletis-verde px-4 text-xs font-body font-semibold text-white transition-colors hover:bg-aletis-verde-escuro disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Salvar identificação
        </button>
      </section>

      {/* Membros do grupo familiar */}
      <section className="space-y-3 rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-display font-semibold text-foreground">
            Membros do Grupo Familiar ({membros.length})
          </h3>
          <button
            type="button"
            onClick={adicionarMembro}
            className="inline-flex h-8 items-center gap-1 rounded-xl bg-aletis-verde/10 px-3 text-xs font-body font-semibold text-foreground transition-colors hover:bg-aletis-verde/20"
          >
            <Plus className="w-3 h-3" /> Adicionar
          </button>
        </div>
        {membros.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Nenhum membro cadastrado.</p>
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
    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-xl border border-aletis-borda bg-aletis-bege/20 px-3 py-2">
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
      <label className="md:col-span-2 inline-flex items-center gap-1.5 text-xs text-foreground">
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
        className="md:col-span-1 text-muted-foreground hover:text-red-600 transition-colors"
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
    <section className="space-y-3 rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-foreground">
          Quadro de Safras ({list.length})
          <span className="ml-2 text-[11px] text-muted-foreground font-mono">
            R.OP.001 sheets 1-BaseSafra + 7-Safra
          </span>
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowBulk(true)}
            className="inline-flex h-8 items-center gap-1 rounded-xl bg-aletis-dourado/15 px-3 text-xs font-body font-semibold text-foreground hover:bg-aletis-dourado/25"
            title="Cole múltiplas linhas do Excel/Sheets de uma vez"
          >
            <FileSpreadsheet className="w-3 h-3" /> Paste do Excel
          </button>
          <button
            type="button"
            onClick={adicionar}
            disabled={adding}
            className="inline-flex h-8 items-center gap-1 rounded-xl bg-aletis-verde/10 px-3 text-xs font-body font-semibold text-foreground hover:bg-aletis-verde/20 disabled:opacity-50"
          >
            <Plus className="w-3 h-3" /> Adicionar
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="ui-table w-full text-xs font-body">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-aletis-grafite-claro/15">
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
                <td colSpan={10} className="text-center py-6 text-muted-foreground">
                  Nenhuma cultura cadastrada. Use <strong>Paste do Excel</strong> ou <strong>Adicionar</strong>.
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
        <button type="button" onClick={onDelete} className="text-muted-foreground hover:text-red-600">
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
  return <SimpleListSection grupoId={grupoId} type="custos" titulo="Custos do Cliente" />
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
    <section className="space-y-3 rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-foreground">
          Contratos de Dívida ({list.length})
          <span className="ml-2 text-[11px] text-muted-foreground font-mono">R.OP.001 sheet 10-Endividamento</span>
        </h3>
        <button type="button" onClick={adicionar} disabled={adding} className="inline-flex h-8 items-center gap-1 rounded-xl bg-aletis-verde/10 px-3 text-xs font-body font-semibold text-foreground hover:bg-aletis-verde/20 disabled:opacity-50">
          <Plus className="w-3 h-3" /> Adicionar contrato
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="ui-table w-full text-xs font-body">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-aletis-grafite-claro/15">
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
              <tr><td colSpan={9} className="text-center py-6 text-muted-foreground">Nenhum contrato cadastrado.</td></tr>
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
      <td className="py-1 px-1"><button type="button" onClick={onDelete} className="text-muted-foreground hover:text-red-600"><Trash2 className="w-3 h-3" /></button></td>
    </tr>
  )
}

function DemandasSection({ grupoId }: { grupoId: string }) {
  return <SimpleListSection grupoId={grupoId} type="demandas" titulo="Demandas de Crédito" />
}

function FazendasSection({ grupoId }: { grupoId: string }) {
  return <SimpleListSection grupoId={grupoId} type="fazendas" titulo="Fazendas" />
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

function ToolbarMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="relative">
      <summary className="flex h-9 cursor-pointer select-none items-center rounded-xl border border-aletis-borda bg-card px-3 text-[11px] font-body font-semibold text-foreground hover:bg-aletis-bege/45">
        {label}
      </summary>
      <div className="absolute right-0 top-full z-40 mt-1 min-w-[190px] rounded-xl border border-aletis-borda bg-card p-1 shadow-xl">
        {children}
      </div>
    </details>
  )
}

function ToolbarMenuButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="block w-full rounded-lg px-3 py-2 text-left text-xs font-body font-medium text-foreground hover:bg-aletis-bege/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}

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
    <div className="gf-toolbar flex flex-wrap items-center gap-2 rounded-lg border border-aletis-borda bg-card p-2 shadow-none md:justify-end">
      {error && <span className="text-[11px] text-red-600">{error}</span>}
      <ToolbarMenu label="Dados">
        <ToolbarMenuButton onClick={() => setShowTemplates(!showTemplates)}>Templates</ToolbarMenuButton>
        <ToolbarMenuButton onClick={() => setShowMarketplace(true)}>Marketplace</ToolbarMenuButton>
        <ToolbarMenuButton onClick={() => setShowImportXlsm(true)}>Importar Excel</ToolbarMenuButton>
        <ToolbarMenuButton onClick={() => setShowImportOfx(true)}>Importar OFX</ToolbarMenuButton>
      </ToolbarMenu>
      <ToolbarMenu label="Análise">
        <ToolbarMenuButton onClick={() => setShowSim(true)}>Simular renegociação</ToolbarMenuButton>
        <ToolbarMenuButton onClick={() => setShowStress(true)}>Stress test</ToolbarMenuButton>
        <ToolbarMenuButton onClick={() => setShowNarr(true)}>Narrativa ALIX</ToolbarMenuButton>
      </ToolbarMenu>
      <ToolbarMenu label="Auditoria">
        <ToolbarMenuButton onClick={snapshot} disabled={savingSnap}>
          {savingSnap ? 'Salvando snapshot...' : 'Salvar snapshot'}
        </ToolbarMenuButton>
        <ToolbarMenuButton onClick={() => setShowDiff(true)}>Comparar snapshots</ToolbarMenuButton>
      </ToolbarMenu>
      <button
        type="button"
        onClick={exportPptx}
        disabled={exportingPpt}
        className="inline-flex h-9 items-center gap-1 rounded-xl bg-aletis-dourado/15 px-3 text-[11px] font-body font-semibold text-foreground hover:bg-aletis-dourado/25 disabled:opacity-50"
        title="Gerar apresentação de diagnóstico"
      >
        {exportingPpt ? 'Gerando...' : 'Diagnóstico PPT'}
      </button>
      <button
        type="button"
        onClick={exportKitBanco}
        disabled={exportingPdf}
        className="inline-flex h-9 items-center gap-1 rounded-xl bg-aletis-dourado/15 px-3 text-[11px] font-body font-semibold text-foreground hover:bg-aletis-dourado/25 disabled:opacity-50"
        title="Gerar PDF para banco"
      >
        {exportingPdf ? 'Gerando...' : 'Kit Banco PDF'}
      </button>
      <button
        type="button"
        onClick={exportXlsm}
        disabled={exporting}
        className="inline-flex h-9 items-center gap-1 rounded-xl bg-aletis-verde/10 px-3 text-[11px] font-body font-semibold text-foreground hover:bg-aletis-verde/20 disabled:opacity-50"
        title="Exportar dados para Excel"
      >
        {exporting ? 'Gerando...' : 'Exportar Excel'}
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
    { id: 'soja-mt', rotulo: 'Produtor de Soja - Mato Grosso', desc: '3000 ha soja + 2400 ha milho safrinha + 600 ha algodão; 8 custos típicos; 3 contratos (BB+Sicredi+Bradesco)' },
    { id: 'cafe-mg', rotulo: 'Cafeicultor - Sul de Minas', desc: '280 ha arábica + 80 ha conilon; 6 custos; 2 contratos (Sicoob+BNB)' },
    { id: 'boi-go', rotulo: 'Pecuarista de corte - Goiás', desc: '1800 ha pasto cultivado + confinamento; 7 custos; 2 contratos (Bradesco+BB)' },
    { id: 'cana-sp', rotulo: 'Fornecedor de cana - São Paulo', desc: '2000 ha (1ª colheita+soca); 5 custos; 2 contratos (Itaú+Santander)' },
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
      <div className="bg-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-mono text-foreground uppercase font-semibold">Templates de Cliente</p>
            <h2 className="text-base font-display font-semibold text-foreground">Aplicar perfil agro típico</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </header>
        <div className="p-5 space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
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
              <p className="text-sm font-display font-semibold text-foreground">{t.rotulo}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{t.desc}</p>
              {applying === t.id && (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  aplicando...
                </p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Dashboard360Lazy({ grupoId }: { grupoId: string }) {
  return (
    <Suspense fallback={<div className="rounded-lg border border-aletis-borda bg-card p-12 text-center shadow-none"><div className="animate-pulse text-muted-foreground">Calculando dashboard 360°...</div></div>}>
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

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700">{error}</div>
  if (!items) return <SectionSkeleton />
  return (
    <section className="space-y-3 rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <h3 className="text-sm font-display font-semibold text-foreground">
        {titulo} ({items.length})
      </h3>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-aletis-grafite-claro/30 p-6 text-center bg-aletis-cream/20">
          <p className="text-xs text-muted-foreground">Nenhum registro. Adicione via API/Aletéia ou aguarde wave 2 para editor inline.</p>
        </div>
      ) : (
        <pre className="text-[11px] font-mono bg-aletis-cream/30 rounded-lg p-3 overflow-x-auto max-h-96">{JSON.stringify(items, null, 2)}</pre>
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
        <h3 className="text-sm font-display font-semibold text-foreground">
          Insights de saúde financeira
        </h3>
        <button
          type="button"
          onClick={recalcular}
          disabled={recalc}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-aletis-verde px-3 text-xs font-body font-semibold text-white hover:bg-aletis-verde-escuro disabled:opacity-50"
        >
          {recalc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {recalc ? 'Recalculando...' : 'Recalcular'}
        </button>
      </div>

      {insights.length === 0 ? (
        <div className="rounded-lg border border-dashed border-aletis-grafite-claro/30 p-6 text-center bg-aletis-cream/20">
          <p className="text-xs text-muted-foreground">Nenhum insight ainda. Clique em <strong>Recalcular</strong> ou edite o cadastro para acionar análise.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.critico.length > 0 && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-red-700 font-semibold mb-1.5">Críticos ({grouped.critico.length})</h4>
              <div className="space-y-1.5">
                {grouped.critico.map((i, idx) => <InsightRow key={idx} insight={i} />)}
              </div>
            </div>
          )}
          {grouped.importante.length > 0 && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold mb-1.5">Importantes ({grouped.importante.length})</h4>
              <div className="space-y-1.5">
                {grouped.importante.map((i, idx) => <InsightRow key={idx} insight={i} />)}
              </div>
            </div>
          )}
          {grouped.info.length > 0 && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-blue-700 font-semibold mb-1.5">Info ({grouped.info.length})</h4>
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
        <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">[{insight.categoria}]</span>
        <p className="text-xs font-body font-semibold leading-tight">{insight.titulo}</p>
        <span className="text-[11px] ml-auto opacity-60">{new Date(insight.calculadoEm).toLocaleString('pt-BR')}</span>
      </div>
      <p className="text-[11px] font-body mt-1 leading-relaxed">{insight.mensagem}</p>
      {insight.recomendacao && <p className="text-[11px] font-body mt-1 italic opacity-80">→ {insight.recomendacao}</p>}
    </div>
  )
}

function SimpleListSection({ grupoId, type, titulo }: { grupoId: string; type: string; titulo: string }) {
  const [items, setItems] = useState<any[] | null>(null)
  const reload = useCallback(async () => {
    const r = await apiFetch<any>(`/gestao-financeira/grupos/${grupoId}/${type}`)
    const key = type === 'demandas' ? 'demandas' : type === 'fazendas' ? 'fazendas' : 'custos'
    setItems(r[key] ?? [])
  }, [grupoId, type])
  useEffect(() => { reload() }, [reload])

  if (!items) return <SectionSkeleton />
  return (
    <section className="space-y-3 rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <h3 className="text-sm font-display font-semibold text-foreground">
        {titulo} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          Nenhum registro. Em breve: editor inline. Por ora use a API ou Aletéia (gestao_financeira_*).
        </p>
      ) : (
        <pre className="text-[11px] font-mono bg-aletis-cream/30 rounded-lg p-3 overflow-x-auto">{JSON.stringify(items, null, 2)}</pre>
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
      <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <h3 className="text-sm font-display font-semibold text-foreground mb-2">Safras consolidadas</h3>
        <table className="ui-table w-full text-xs font-body">
          <thead>
            <tr className="text-[11px] uppercase text-muted-foreground border-b border-aletis-grafite-claro/15">
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
      <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <h3 className="text-sm font-display font-semibold text-foreground mb-2">Endividamento por credor</h3>
        <div className="space-y-2">
          {endividamento.porCredor.map((c: any, i: number) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-shrink-0 w-32 text-xs font-body">{c.credor}</div>
              <div className="flex-1 h-5 rounded bg-aletis-grafite-claro/10 relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-aletis-verde" style={{ width: `${c.pctTotal * 100}%` }} />
                <span className="absolute inset-0 flex items-center px-2 text-[11px] font-mono">{(c.pctTotal * 100).toFixed(1)}% · {c.contratos}c</span>
              </div>
              <div className="w-32 text-right text-xs font-mono tabular-nums">{fmtBRL(c.saldo)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Cronogramas */}
      <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <h3 className="text-sm font-display font-semibold text-foreground mb-2">Cronograma de amortização</h3>
        {endividamento.contratos.map((c: any, i: number) => (
          <details key={i} className="mb-2 rounded-lg border border-aletis-grafite-claro/15">
            <summary className="px-3 py-2 cursor-pointer text-xs font-body bg-aletis-cream/30 hover:bg-aletis-cream/50">
              <strong>{c.credor}</strong> — {c.metodoCalculo} {c.prazoParcelas}m — saldo R$ {fmtBRL(c.saldoAtual)}
            </summary>
            <table className="ui-table w-full text-[11px] font-body">
              <thead className="text-[11px] uppercase text-muted-foreground">
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
      <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <h3 className="text-sm font-display font-semibold text-foreground mb-2">Raio X - projeção {raioX.anos.length} anos</h3>
        <table className="ui-table w-full text-xs font-body">
          <thead>
            <tr className="text-[11px] uppercase text-muted-foreground border-b border-aletis-grafite-claro/15">
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
                <td className={`py-1 text-right tabular-nums ${a.saldoNaoAcumulado < 0 ? 'text-red-600' : 'text-foreground'}`}>{fmtBRL(a.saldoNaoAcumulado)}</td>
                <td className={`py-1 text-right tabular-nums font-semibold ${a.saldoAcumulado < 0 ? 'text-red-600' : 'text-foreground'}`}>{fmtBRL(a.saldoAcumulado)}</td>
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
    <div className="rounded-lg border border-aletis-borda bg-card p-3 shadow-none">
      <p className="text-[11px] font-body uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-base font-display font-semibold text-foreground tabular-nums leading-tight mt-0.5">{value}</p>
      {sublabel && <p className="text-[11px] font-body text-muted-foreground mt-0.5">{sublabel}</p>}
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-[11px] font-body font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-0.5">{children}</div>
    </label>
  )
}

function SectionSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border border-aletis-borda bg-card p-6 shadow-none">
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
