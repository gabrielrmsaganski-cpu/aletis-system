// ============================================================
// DiagnosticoSection — radiografia financeira completa.
// Dashboard 360°, SRAI, AB+S, Exposição commodities, Insights IA.
// ============================================================
import { useEffect, useState, lazy, Suspense } from 'react'
import { apiFetch } from '../../../hooks/useApi'
import {
  Target,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'
import { fmtBRL, fmtPct } from './utils'

const Dashboard360 = lazy(() => import('../../gestao-financeira/Dashboard360'))

interface Props {
  data: UseClienteDataReturn
}

export default function DiagnosticoSection({ data }: Props) {
  const { cliente, srai, abs, analises, recalcularAnalises, recalculando, apiId } = data
  const [grupoId, setGrupoId] = useState<string | null>(null)

  useEffect(() => {
    if (!apiId) return
    apiFetch<{ grupos: Array<{ id: string }> }>(`/gestao-financeira/grupos?clienteId=${apiId}`)
      .then((r) => { if (r.grupos?.[0]) setGrupoId(r.grupos[0].id) })
      .catch(() => {})
  }, [apiId])

  if (!cliente) return null

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Cabeçalho com botão recalcular */}
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono text-aletis-verde uppercase font-semibold tracking-wider">
            🔬 análise consolidada
          </p>
          <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">
            Radiografia financeira
          </h2>
          {analises?.geradoEm && (
            <p className="text-[10px] text-aletis-grafite-claro mt-0.5">
              calculada em {new Date(analises.geradoEm).toLocaleString('pt-BR')} · {analises.duracaoMs}ms
            </p>
          )}
        </div>
        <button
          onClick={recalcularAnalises}
          disabled={recalculando}
          className="px-3 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-aletis-verde-escuro transition-colors disabled:opacity-50"
        >
          {recalculando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {recalculando ? 'Recalculando…' : 'Recalcular análise'}
        </button>
      </header>

      {/* Painel SRAI + AB+S lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SraiCard srai={srai} />
        <AbsCard abs={abs} />
      </div>

      {/* Recomendações + Alertas */}
      {analises && ((analises.alertasTop?.length ?? 0) > 0 || (analises.recomendacoes?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AlertasFullCard alertas={analises.alertasTop ?? []} />
          <RecomendacoesFullCard recs={analises.recomendacoes ?? []} />
        </div>
      )}

      {/* Exposição por commodity */}
      <ExposicaoCard exposicao={cliente.exposicaoCommodity} apiId={apiId} onChanged={data.reload} />

      {/* Dashboard 360° do GF — só se tem grupo */}
      {grupoId ? (
        <Suspense fallback={<DashboardSkeleton />}>
          <Dashboard360 grupoId={grupoId} />
        </Suspense>
      ) : (
        <NoGrupoCta apiId={apiId} onChanged={data.reload} />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function SraiCard({ srai }: { srai: UseClienteDataReturn['srai'] }) {
  if (!srai) {
    return (
      <div className="card-premium p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-aletis-grafite-claro" />
          <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">SRAI — Score de Risco Agro Integral</h3>
        </div>
        <p className="text-xs text-aletis-grafite-claro italic">Aguardando cálculo…</p>
      </div>
    )
  }
  const toneCls = {
    critico: { border: 'border-l-red-500', icon: 'text-red-600', pill: 'bg-red-100 text-red-800' },
    alto: { border: 'border-l-amber-500', icon: 'text-amber-600', pill: 'bg-amber-100 text-amber-800' },
    moderado: { border: 'border-l-blue-500', icon: 'text-blue-600', pill: 'bg-blue-100 text-blue-800' },
    baixo: { border: 'border-l-emerald-500', icon: 'text-emerald-600', pill: 'bg-emerald-100 text-emerald-800' },
  }[srai.classificacao] ?? { border: 'border-l-emerald-500', icon: 'text-emerald-600', pill: 'bg-emerald-100 text-emerald-800' }
  return (
    <div className={`card-premium p-4 border-l-4 ${toneCls.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <Target className={`w-4 h-4 ${toneCls.icon}`} />
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">SRAI</h3>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${toneCls.pill}`}>
          {srai.classificacao}
        </span>
      </div>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-3xl font-display font-bold tabular-nums">{srai.scoreTotal}</span>
        <span className="text-xs text-aletis-grafite-claro">/100</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Componente label="Financeiro" value={srai.componentes.financeiro} />
        <Componente label="Operacional" value={srai.componentes.operacional} />
        <Componente label="Climático" value={srai.componentes.climatico} />
        <Componente label="Relacionamento" value={srai.componentes.relacionamento} />
      </div>
      {srai.alertas && srai.alertas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-aletis-grafite-medio">{srai.alertas.length} alerta(s)</summary>
          <ul className="mt-1 space-y-0.5 pl-3 list-disc text-aletis-grafite-medio">
            {srai.alertas.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}

function Componente({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[10px]">
        <span className="text-aletis-grafite-claro uppercase tracking-wider">{label}</span>
        <span className="font-bold tabular-nums">{value}</span>
      </div>
      <div className="h-1 bg-aletis-grafite-claro/15 rounded-full overflow-hidden mt-0.5">
        <div className="h-full bg-aletis-verde transition-all" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  )
}

function AbsCard({ abs }: { abs: UseClienteDataReturn['abs'] }) {
  if (!abs) {
    return (
      <div className="card-premium p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-aletis-grafite-claro" />
          <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">AB+S — Agricultura Sustentável</h3>
        </div>
        <p className="text-xs text-aletis-grafite-claro italic">Aguardando avaliação de elegibilidade…</p>
      </div>
    )
  }
  const toneCls = {
    inelegivel: { border: 'border-l-red-500', icon: 'text-red-600', pill: 'bg-red-100 text-red-800' },
    integral: { border: 'border-l-emerald-500', icon: 'text-emerald-600', pill: 'bg-emerald-100 text-emerald-800' },
    parcial: { border: 'border-l-amber-500', icon: 'text-amber-600', pill: 'bg-amber-100 text-amber-800' },
    condicional: { border: 'border-l-blue-500', icon: 'text-blue-600', pill: 'bg-blue-100 text-blue-800' },
  }[abs.nivelElegibilidade] ?? { border: 'border-l-blue-500', icon: 'text-blue-600', pill: 'bg-blue-100 text-blue-800' }
  return (
    <div className={`card-premium p-4 border-l-4 ${toneCls.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className={`w-4 h-4 ${toneCls.icon}`} />
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">AB+S elegibilidade</h3>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${toneCls.pill}`}>
          {abs.nivelElegibilidade}
        </span>
      </div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-3xl font-display font-bold tabular-nums">{abs.scorePercentual}%</span>
        <span className="text-xs text-aletis-grafite-claro">de aderência</span>
      </div>
      <div className="rounded-lg bg-aletis-bege/30 px-2 py-1.5 mb-2">
        <p className="text-[10px] uppercase font-mono text-aletis-grafite-claro">Taxa estimada</p>
        <p className="text-xs font-bold tabular-nums">{abs.taxasEstimadasPct.min}% – {abs.taxasEstimadasPct.max}% a.a.</p>
      </div>
      {abs.acoesRecomendadas && abs.acoesRecomendadas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-aletis-grafite-medio">{abs.acoesRecomendadas.length} ação(ões) recomendada(s)</summary>
          <ul className="mt-1 space-y-0.5 pl-3 list-disc text-aletis-grafite-medio">
            {abs.acoesRecomendadas.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function AlertasFullCard({ alertas }: { alertas: NonNullable<UseClienteDataReturn['analises']>['alertasTop'] extends infer T ? T : never }) {
  if (!alertas || alertas.length === 0) return null
  const grouped = alertas.reduce<Record<string, typeof alertas>>((acc, a) => {
    (acc[a.nivel] ??= [] as any).push(a)
    return acc
  }, {})
  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Alertas detalhados</h3>
        <span className="text-[10px] text-aletis-grafite-claro ml-auto">{alertas.length} alerta(s)</span>
      </div>
      <div className="space-y-2">
        {(['critico', 'alto', 'moderado', 'info'] as const).map((nivel) => {
          const list = grouped[nivel]
          if (!list?.length) return null
          const cls =
            nivel === 'critico' ? 'bg-red-50/50 border-red-200 text-red-900' :
            nivel === 'alto' ? 'bg-amber-50/50 border-amber-200 text-amber-900' :
            nivel === 'moderado' ? 'bg-blue-50/50 border-blue-200 text-blue-900' :
            'bg-aletis-bege/40 border-aletis-borda text-aletis-grafite-medio'
          return (
            <div key={nivel} className={`rounded-lg border ${cls} p-2`}>
              <p className="text-[10px] font-mono uppercase tracking-wider font-bold mb-1">{nivel} ({list.length})</p>
              <ul className="space-y-1 text-xs">
                {list.map((a, i) => (
                  <li key={i} className="flex items-baseline gap-2">
                    <span className="text-[9px] font-mono opacity-70 flex-shrink-0">[{a.origem}]</span>
                    <span className="leading-snug">{a.mensagem}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RecomendacoesFullCard({ recs }: { recs: NonNullable<UseClienteDataReturn['analises']>['recomendacoes'] extends infer T ? T : never }) {
  if (!recs || recs.length === 0) return null
  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-aletis-dourado" />
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Recomendações priorizadas</h3>
        <span className="text-[10px] text-aletis-grafite-claro ml-auto">{recs.length} ações</span>
      </div>
      <ul className="space-y-2">
        {recs.map((r) => (
          <li key={r.id} className="rounded-lg bg-aletis-bege/30 p-2">
            <div className="flex items-baseline gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex-shrink-0 ${
                r.prioridade === 'p1' ? 'bg-red-100 text-red-700' :
                r.prioridade === 'p2' ? 'bg-amber-100 text-amber-800' :
                'bg-blue-100 text-blue-800'
              }`}>{r.prioridade}</span>
              <p className="text-xs font-body font-semibold flex-1">{r.titulo}</p>
              <span className="text-[9px] text-aletis-grafite-claro/60 uppercase font-mono flex-shrink-0">{r.categoria}</span>
            </div>
            <p className="text-[11px] text-aletis-grafite-medio mt-1 leading-snug">{r.acao}</p>
            {r.impactoEstimado && <p className="text-[10px] text-aletis-verde mt-0.5 font-mono">→ {r.impactoEstimado}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function ExposicaoCard({ exposicao, apiId, onChanged }: { exposicao: any[]; apiId?: string; onChanged: () => Promise<void> }) {
  const [list, setList] = useState(exposicao)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setList(exposicao) }, [exposicao])

  function patch(idx: number, key: string, value: any) {
    setList((l) => l.map((it, i) => (i === idx ? { ...it, [key]: value } : it)))
  }

  async function salvar() {
    if (!apiId) return
    setSaving(true)
    try {
      await apiFetch(`/clientes/${apiId}/exposicao`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exposicao: list }),
      })
      await onChanged()
    } finally {
      setSaving(false)
    }
  }

  function adicionar() {
    setList((l) => [...l, {
      commodity: 'Soja', areaHa: 0, produtividade: 0, unidadeProdutividade: 'sc/ha',
      precoReferencia: 0, unidadePreco: 'R$/sc', pctReceita: 0,
    }])
  }

  function remover(idx: number) {
    setList((l) => l.filter((_, i) => i !== idx))
  }

  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-aletis-dourado" />
        <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Exposição por commodity</h3>
        <button onClick={adicionar} className="ml-auto px-2 py-0.5 rounded text-[10px] font-semibold bg-aletis-verde/10 text-aletis-verde inline-flex items-center gap-1 hover:bg-aletis-verde/20">
          <Plus className="w-3 h-3" /> linha
        </button>
        <button onClick={salvar} disabled={saving} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-aletis-verde text-white disabled:opacity-50">
          {saving ? '⏳' : '💾'} salvar
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-aletis-grafite-claro italic text-center py-4">Sem exposição cadastrada. Clique em "+ linha".</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-aletis-grafite-claro border-b border-aletis-borda">
                <th className="text-left py-1.5">Commodity</th>
                <th className="text-right py-1.5">Área (ha)</th>
                <th className="text-right py-1.5">Produtiv.</th>
                <th className="text-right py-1.5">Preço ref.</th>
                <th className="text-right py-1.5">% receita</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((it, i) => (
                <tr key={i} className="border-b border-aletis-borda/50">
                  <td><input value={it.commodity} onChange={(e) => patch(i, 'commodity', e.target.value)} className="w-32 px-1 py-0.5 text-xs rounded border border-aletis-borda" /></td>
                  <td className="text-right"><input type="number" value={it.areaHa} onChange={(e) => patch(i, 'areaHa', Number(e.target.value))} className="w-20 px-1 py-0.5 text-xs rounded border border-aletis-borda text-right" /></td>
                  <td className="text-right"><input type="number" value={it.produtividade} onChange={(e) => patch(i, 'produtividade', Number(e.target.value))} className="w-20 px-1 py-0.5 text-xs rounded border border-aletis-borda text-right" /></td>
                  <td className="text-right"><input type="number" value={it.precoReferencia} onChange={(e) => patch(i, 'precoReferencia', Number(e.target.value))} className="w-24 px-1 py-0.5 text-xs rounded border border-aletis-borda text-right" /></td>
                  <td className="text-right"><input type="number" step="0.01" value={it.pctReceita ?? 0} onChange={(e) => patch(i, 'pctReceita', Number(e.target.value))} className="w-16 px-1 py-0.5 text-xs rounded border border-aletis-borda text-right" /></td>
                  <td><button onClick={() => remover(i)} className="text-aletis-grafite-claro hover:text-red-600"><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function NoGrupoCta({ apiId, onChanged }: { apiId?: string; onChanged: () => Promise<void> }) {
  const [creating, setCreating] = useState(false)
  async function autoImport() {
    if (!apiId) return
    setCreating(true)
    try {
      await apiFetch('/gestao-financeira/auto-import-crm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: apiId }),
      })
      await onChanged()
      // forço reload da página para que o useEffect do Dashboard360 pegue o novo grupoId
      window.location.reload()
    } catch {
      setCreating(false)
    }
  }
  return (
    <div className="card-premium p-8 text-center bg-gradient-to-br from-aletis-bege/40 to-white">
      <Sparkles className="w-8 h-8 text-aletis-verde mx-auto mb-3" />
      <h3 className="text-base font-display font-bold text-aletis-grafite-escuro">
        Dashboard 360° aguarda dados
      </h3>
      <p className="text-xs text-aletis-grafite-medio mt-1 max-w-md mx-auto">
        Para ver KPIs detalhados, charts de safra/endividamento, projeção 10 anos e DRE multi-cenário,
        crie um grupo de gestão financeira pré-populado a partir do CRM.
      </p>
      <button
        onClick={autoImport}
        disabled={creating}
        className="mt-4 px-4 py-2 rounded-lg bg-aletis-verde text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-aletis-verde-escuro disabled:opacity-50"
      >
        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        Auto-import (1 clique)
      </button>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    </div>
  )
}
