import { SectionNav } from '../../ui/SectionNav'
// ============================================================
// FARMS - viabilidade agricola dentro do CRM do cliente.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Calculator,
  Copy,
  Download,
  FileSpreadsheet,
  Leaf,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { apiFetch } from '../../../hooks/useApi'
import type { UseClienteDataReturn } from './useClienteData'
import type {
  FarmsCenarioInput,
  FarmsCultura,
  FarmsFormulaItem,
  FarmsGrupoItem,
  FarmsItem,
  FarmsListResponse,
  FarmsPlano,
} from '@aletis/shared-types'

type SubTab = 'dashboard' | 'premissas' | 'custos' | 'cenarios'

const CULTURAS: Array<{ id: FarmsCultura; label: string }> = [
  { id: 'soja', label: 'Soja' },
  { id: 'arroz', label: 'Arroz' },
  { id: 'milho', label: 'Milho' },
  { id: 'trigo', label: 'Trigo' },
]

const FORMULAS: Array<{ id: FarmsFormulaItem; label: string }> = [
  { id: 'insumo', label: 'Qtd x área x R$/un' },
  { id: 'mensal', label: 'Coef. x períodos x R$/un' },
  { id: 'percentual_variavel', label: '% dos custos variáveis' },
  { id: 'sacas_ha', label: 'Sacas/ha x preço' },
  { id: 'valor_ha', label: 'Valor por hectare' },
  { id: 'valor_total', label: 'Valor total manual' },
]

function fmtBRL(v: number | null | undefined): string {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fmtPct(v: number | null | undefined): string {
  return `${fmtNum((v || 0) * 100, 1)}%`
}

function asNumber(raw: string): number | undefined {
  if (raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

export default function FarmsViabilidadeSection({ data }: { data: UseClienteDataReturn }) {
  const { cliente, apiId } = data
  const [planos, setPlanos] = useState<FarmsPlano[]>([])
  const [draft, setDraft] = useState<FarmsPlano | null>(null)
  const [activeTab, setActiveTab] = useState<SubTab>('dashboard')
  const [grupoAtivo, setGrupoAtivo] = useState<FarmsGrupoItem>('variavel')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(keepId?: string) {
    if (!apiId) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch<FarmsListResponse>(`/clientes/${apiId}/farms`)
      setPlanos(res.planos)
      const selected = res.planos.find((p) => p.id === (keepId || draft?.id)) || res.planos[0] || null
      setDraft(selected)
      setDirty(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiId])

  const result = draft?.resultado
  const cenarioNormal = result?.cenarios.find((c) => c.id === 'normal')
  const itensAtivos = useMemo(
    () => draft?.itens.filter((it) => it.grupo === grupoAtivo).sort((a, b) => a.ordem - b.ordem) ?? [],
    [draft?.itens, grupoAtivo],
  )
  const resultadoPorItem = useMemo(() => {
    const map = new Map<string, NonNullable<typeof result>['itens'][number]>()
    result?.itens.forEach((it) => map.set(it.id, it))
    return map
  }, [result])

  function patchDraft(patch: Partial<FarmsPlano>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    setDirty(true)
  }

  function updateItem(id: string, patch: Partial<FarmsItem>) {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        itens: prev.itens.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      }
    })
    setDirty(true)
  }

  function updateCenario(id: FarmsCenarioInput['id'], patch: Partial<FarmsCenarioInput>) {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        cenarios: prev.cenarios.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }
    })
    setDirty(true)
  }

  async function criar(cultura: FarmsCultura) {
    if (!apiId) return
    setSaving(true)
    setError(null)
    try {
      const plano = await apiFetch<FarmsPlano>(`/clientes/${apiId}/farms`, {
        method: 'POST',
        body: JSON.stringify({
          cultura,
          safra: '2025/26',
          areaAplicadaHa: cliente?.areaTotalHa || 100,
          areaProdutivaHa: cliente?.areaTotalHa || 100,
        }),
      })
      setPlanos((prev) => [plano, ...prev])
      setDraft(plano)
      setActiveTab('premissas')
      setDirty(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function salvar() {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const { id, clienteId, criadoEm, origemPlanilha, resultado, ...payload } = draft
      const atualizado = await apiFetch<FarmsPlano>(`/farms/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setDraft(atualizado)
      setPlanos((prev) => prev.map((p) => (p.id === atualizado.id ? atualizado : p)))
      setDirty(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function recalcular() {
    if (!draft) return
    if (dirty) {
      await salvar()
      return
    }
    setSaving(true)
    try {
      const atualizado = await apiFetch<FarmsPlano>(`/farms/${draft.id}/recalcular`, { method: 'POST' })
      setDraft(atualizado)
      setPlanos((prev) => prev.map((p) => (p.id === atualizado.id ? atualizado : p)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function duplicar() {
    if (!draft) return
    setSaving(true)
    try {
      const novo = await apiFetch<FarmsPlano>(`/farms/${draft.id}/duplicar`, {
        method: 'POST',
        body: JSON.stringify({ safra: draft.safra }),
      })
      setPlanos((prev) => [novo, ...prev])
      setDraft(novo)
      setDirty(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function excluir() {
    if (!draft || !window.confirm('Excluir este plano FARMS?')) return
    setSaving(true)
    try {
      await apiFetch(`/farms/${draft.id}`, { method: 'DELETE' })
      const restantes = planos.filter((p) => p.id !== draft.id)
      setPlanos(restantes)
      setDraft(restantes[0] || null)
      setDirty(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function baixarPdf() {
    if (!draft) return
    window.open(`/api/farms/${draft.id}/pdf`, '_blank', 'noopener,noreferrer')
  }

  function addItem(grupo: FarmsGrupoItem) {
    setDraft((prev) => {
      if (!prev) return prev
      const ordem = prev.itens.filter((it) => it.grupo === grupo).length + 1
      const item: FarmsItem = {
        id: `novo-${grupo}-${Date.now()}`,
        grupo,
        ordem,
        centroCusto: grupo === 'variavel' ? 'Novo insumo' : 'Novo custo fixo',
        descricao: '',
        formula: grupo === 'variavel' ? 'insumo' : 'valor_total',
        quantidadePorHa: 0,
        unidade: '',
        valorUnitario: 0,
        percentual: undefined,
        valorTotalManual: 0,
      }
      return { ...prev, itens: [...prev.itens, item] }
    })
    setDirty(true)
  }

  function removeItem(id: string) {
    setDraft((prev) => (prev ? { ...prev, itens: prev.itens.filter((it) => it.id !== id) } : prev))
    setDirty(true)
  }

  if (!apiId || !cliente) {
    return <div className="card-premium p-8 text-center text-sm text-muted-foreground">Cliente não identificado.</div>
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <header className="rounded-lg border border-aletis-borda bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-muted flex items-center justify-center">
              <Leaf className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground">Planejamento agrícola</h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Orçamento de soja, arroz, milho e trigo com custos variáveis, custos fixos, quatro cenários produtivos,
                ponto de equilíbrio, custo por saca e relatório PDF no dossiê operacional do cliente.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton onClick={() => void recalcular()} icon={RefreshCw} disabled={!draft || saving}>
              Recalcular
            </ActionButton>
            <ActionButton onClick={() => void salvar()} icon={saving ? Loader2 : Save} disabled={!draft || saving || !dirty} primary>
              {dirty ? 'Salvar' : 'Salvo'}
            </ActionButton>
            <ActionButton onClick={baixarPdf} icon={Download} disabled={!draft}>
              PDF
            </ActionButton>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <Signal label="Planos do cliente" value={String(planos.length)} />
          <Signal label="Desembolso" value={result ? fmtBRL(result.desembolsoTotal) : '—'} />
          <Signal label="Margem normal" value={cenarioNormal ? fmtPct(cenarioNormal.margemPct) : '—'} />
          <Signal label="Custo normal/sc" value={cenarioNormal ? fmtBRL(cenarioNormal.custoRsSc) : '—'} />
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <div className="rounded-xl border border-aletis-borda bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">Planos FARMS</h3>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="mt-3 space-y-2">
              {planos.map((plano) => (
                <button
                  key={plano.id}
                  type="button"
                  onClick={() => {
                    setDraft(plano)
                    setDirty(false)
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    draft?.id === plano.id
                      ? 'border-aletis-verde bg-aletis-verde/8'
                      : 'border-aletis-borda bg-card hover:bg-aletis-bege/40'
                  }`}
                >
                  <p className="truncate text-xs font-bold text-foreground">{plano.nome}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {plano.cultura.toUpperCase()} · {plano.safra} · {fmtBRL(plano.resultado.desembolsoTotal)}
                  </p>
                </button>
              ))}
              {!planos.length && !loading && (
                <p className="rounded-lg bg-aletis-bege/50 px-3 py-2 text-xs text-muted-foreground">
                  Nenhum plano criado para este cliente.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-aletis-borda bg-card p-3 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">Criar por cultura</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {CULTURAS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void criar(c.id)}
                  disabled={saving}
                  className="rounded-lg border border-aletis-borda px-3 py-2 text-xs font-semibold text-foreground hover:border-aletis-verde hover:bg-aletis-verde/5 disabled:opacity-60"
                >
                  <Plus className="mx-auto mb-1 h-3.5 w-3.5 text-foreground" />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section aria-label="Plano de viabilidade" className="min-w-0 space-y-3">
          {!draft ? (
            <EmptyState loading={loading} />
          ) : (
            <>
              <div className="flex flex-col gap-2 rounded-xl border border-aletis-borda bg-card p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-display font-semibold text-foreground">{draft.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Atualizado em {new Date(draft.atualizadoEm).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton onClick={() => void duplicar()} icon={Copy} disabled={saving}>Duplicar</ActionButton>
                  <ActionButton onClick={() => void excluir()} icon={Trash2} disabled={saving}>Excluir</ActionButton>
                </div>
              </div>

              <SectionNav label="Análises da viabilidade" active={activeTab} onChange={setActiveTab} items={[
                { id: 'dashboard', label: 'Resultado', icon: Calculator },
                { id: 'premissas', label: 'Premissas', icon: FileSpreadsheet },
                { id: 'custos', label: 'Custos', icon: Plus },
                { id: 'cenarios', label: 'Cenários', icon: Leaf },
              ]} />

              {activeTab === 'dashboard' && <Dashboard plano={draft} />}
              {activeTab === 'premissas' && <Premissas draft={draft} patchDraft={patchDraft} />}
              {activeTab === 'custos' && (
                <Custos
                  grupoAtivo={grupoAtivo}
                  setGrupoAtivo={setGrupoAtivo}
                  itens={itensAtivos}
                  resultadoPorItem={resultadoPorItem}
                  updateItem={updateItem}
                  addItem={addItem}
                  removeItem={removeItem}
                />
              )}
              {activeTab === 'cenarios' && <Cenarios draft={draft} updateCenario={updateCenario} />}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-display font-semibold text-foreground tabular-nums break-words">{value}</p>
    </div>
  )
}

function ActionButton({
  children,
  icon: Icon,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode
  icon: typeof Save
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
        primary
          ? 'bg-aletis-verde text-white hover:bg-aletis-verde-escuro'
          : 'border border-aletis-borda bg-card text-foreground hover:bg-aletis-bege/60'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${Icon === Loader2 ? 'animate-spin' : ''}`} />
      {children}
    </button>
  )
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-aletis-borda bg-card p-10 text-center">
      {loading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <Leaf className="mx-auto h-8 w-8 text-foreground" />
      )}
      <p className="mt-3 text-sm font-semibold text-foreground">
        {loading ? 'Carregando planos FARMS...' : 'Crie o primeiro plano FARMS deste cliente'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Comece por uma cultura e ajuste premissas, custos e cenários para este cliente.
      </p>
    </div>
  )
}

function Dashboard({ plano }: { plano: FarmsPlano }) {
  const result = plano.resultado
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Custo variável" value={fmtBRL(result.totalVariavel)} />
        <Kpi label="Custo fixo" value={fmtBRL(result.totalFixo)} />
        <Kpi label="Desembolso/ha" value={fmtBRL(result.desembolsoPorHa)} />
        <Kpi label="Equilíbrio" value={`${fmtNum(result.pontoEquilibrioScHa)} sc/ha`} />
      </div>
      {result.avisos.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {result.avisos.map((a) => <p key={a}>• {a}</p>)}
        </div>
      )}
      <section className="rounded-xl border border-aletis-borda bg-card shadow-sm overflow-hidden">
        <div className="border-b border-aletis-borda px-4 py-3">
          <h3 className="text-sm font-display font-semibold text-foreground">Cenários da lavoura</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="ui-table min-w-[900px] w-full text-xs">
            <thead className="bg-aletis-bege/50 text-muted-foreground">
              <tr>
                <Th>Cenário</Th>
                <Th align="right">Kg/ha</Th>
                <Th align="right">Disponível</Th>
                <Th align="right">Lucro R$</Th>
                <Th align="right">Lucro sc/ha</Th>
                <Th align="right">Custo/sc</Th>
                <Th align="right">Margem</Th>
                <Th>Leitura</Th>
              </tr>
            </thead>
            <tbody>
              {result.cenarios.map((c) => (
                <tr key={c.id} className="border-t border-aletis-borda/70">
                  <Td strong>{c.nome}</Td>
                  <Td align="right">{fmtNum(c.produtividadeKgHa, 0)}</Td>
                  <Td align="right">{fmtNum(c.disponivelSc)} sc</Td>
                  <Td align="right" className={c.lucroLiquidoRs >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                    {fmtBRL(c.lucroLiquidoRs)}
                  </Td>
                  <Td align="right">{fmtNum(c.lucroScHa)} sc/ha</Td>
                  <Td align="right">{fmtBRL(c.custoRsSc)}</Td>
                  <Td align="right">{fmtPct(c.margemPct)}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${
                      c.veredicto === 'viavel'
                        ? 'bg-emerald-100 text-emerald-800'
                        : c.veredicto === 'atencao'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                    }`}>
                      {c.veredicto}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Premissas({ draft, patchDraft }: { draft: FarmsPlano; patchDraft: (patch: Partial<FarmsPlano>) => void }) {
  return (
    <section className="rounded-xl border border-aletis-borda bg-card p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <TextField label="Nome do plano" value={draft.nome} onChange={(nome) => patchDraft({ nome })} />
        <TextField label="Safra" value={draft.safra} onChange={(safra) => patchDraft({ safra })} />
        <label className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
          <select
            value={draft.status}
            onChange={(e) => patchDraft({ status: e.target.value as FarmsPlano['status'] })}
            className="w-full rounded-lg border border-aletis-borda px-3 py-2 text-sm"
          >
            <option value="rascunho">Rascunho</option>
            <option value="pronto">Pronto</option>
            <option value="arquivado">Arquivado</option>
          </select>
        </label>
        <NumberField label="Área aplicada (ha)" value={draft.areaAplicadaHa} onChange={(v) => patchDraft({ areaAplicadaHa: v || 0 })} />
        <NumberField label="Área produtiva (ha)" value={draft.areaProdutivaHa} onChange={(v) => patchDraft({ areaProdutivaHa: v || 0 })} />
        <NumberField label="Preço base (R$/sc)" value={draft.precoBaseRsSc} onChange={(v) => patchDraft({ precoBaseRsSc: v || 0 })} />
        <NumberField label="Unidade da saca (kg)" value={draft.unidadeSacaKg} onChange={(v) => patchDraft({ unidadeSacaKg: v || 60 })} />
        <NumberField label="Conversão sc/qq" value={draft.conversaoSacaParaQq} onChange={(v) => patchDraft({ conversaoSacaParaQq: v })} />
        <label className="space-y-1 md:col-span-2 xl:col-span-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Observações</span>
          <textarea
            value={draft.observacoes || ''}
            onChange={(e) => patchDraft({ observacoes: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-aletis-borda px-3 py-2 text-sm"
          />
        </label>
      </div>
    </section>
  )
}

function Custos({
  grupoAtivo,
  setGrupoAtivo,
  itens,
  resultadoPorItem,
  updateItem,
  addItem,
  removeItem,
}: {
  grupoAtivo: FarmsGrupoItem
  setGrupoAtivo: (grupo: FarmsGrupoItem) => void
  itens: FarmsItem[]
  resultadoPorItem: Map<string, FarmsPlano['resultado']['itens'][number]>
  updateItem: (id: string, patch: Partial<FarmsItem>) => void
  addItem: (grupo: FarmsGrupoItem) => void
  removeItem: (id: string) => void
}) {
  return (
    <section className="rounded-xl border border-aletis-borda bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-aletis-borda px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex rounded-lg border border-aletis-borda bg-aletis-bege/30 p-1">
          {(['variavel', 'fixo'] as FarmsGrupoItem[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrupoAtivo(g)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                grupoAtivo === g ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {g === 'variavel' ? 'Custos variáveis' : 'Custos fixos'}
            </button>
          ))}
        </div>
        <ActionButton onClick={() => addItem(grupoAtivo)} icon={Plus}>Adicionar linha</ActionButton>
      </div>
      <div className="overflow-x-auto">
        <table className="ui-table min-w-[1120px] w-full text-xs">
          <thead className="bg-aletis-bege/50 text-muted-foreground">
            <tr>
              <Th>Centro/Insumo</Th>
              <Th>Descrição</Th>
              <Th>Fórmula</Th>
              <Th align="right">Área</Th>
              <Th align="right">Coef.</Th>
              <Th align="right">Qtd</Th>
              <Th>Un.</Th>
              <Th align="right">R$/un</Th>
              <Th align="right">%</Th>
              <Th align="right">Total manual</Th>
              <Th align="right">Total calc.</Th>
              <Th>{' '}</Th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => {
              const calc = resultadoPorItem.get(it.id)
              return (
                <tr key={it.id} className="border-t border-aletis-borda/70">
                  <Td><MiniText value={it.centroCusto} onChange={(centroCusto) => updateItem(it.id, { centroCusto })} /></Td>
                  <Td><MiniText value={it.descricao || ''} onChange={(descricao) => updateItem(it.id, { descricao })} /></Td>
                  <Td>
                    <select
                      value={it.formula}
                      onChange={(e) => updateItem(it.id, { formula: e.target.value as FarmsFormulaItem })}
                      className="w-40 rounded-md border border-aletis-borda px-2 py-1"
                    >
                      {FORMULAS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </Td>
                  <Td align="right"><MiniNumber value={it.areaHa} onChange={(areaHa) => updateItem(it.id, { areaHa })} /></Td>
                  <Td align="right"><MiniNumber value={it.coeficiente} onChange={(coeficiente) => updateItem(it.id, { coeficiente })} /></Td>
                  <Td align="right"><MiniNumber value={it.quantidadePorHa} onChange={(quantidadePorHa) => updateItem(it.id, { quantidadePorHa })} /></Td>
                  <Td><MiniText value={it.unidade || ''} onChange={(unidade) => updateItem(it.id, { unidade })} className="w-16" /></Td>
                  <Td align="right"><MiniNumber value={it.valorUnitario} onChange={(valorUnitario) => updateItem(it.id, { valorUnitario })} /></Td>
                  <Td align="right"><MiniNumber value={it.percentual} step="0.001" onChange={(percentual) => updateItem(it.id, { percentual })} /></Td>
                  <Td align="right"><MiniNumber value={it.valorTotalManual} onChange={(valorTotalManual) => updateItem(it.id, { valorTotalManual })} /></Td>
                  <Td align="right" strong>{calc ? fmtBRL(calc.valorTotal) : '—'}</Td>
                  <Td align="right">
                    <button type="button" onClick={() => removeItem(it.id)} className="rounded-md p-1 text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Cenarios({ draft, updateCenario }: { draft: FarmsPlano; updateCenario: (id: FarmsCenarioInput['id'], patch: Partial<FarmsCenarioInput>) => void }) {
  return (
    <section className="rounded-xl border border-aletis-borda bg-card shadow-sm overflow-hidden">
      <div className="border-b border-aletis-borda px-4 py-3">
        <h3 className="text-sm font-display font-semibold text-foreground">Cenários produtivos</h3>
        <p className="text-xs text-muted-foreground">Os percentuais usam decimal: 0,02 equivale a 2%.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="ui-table min-w-[900px] w-full text-xs">
          <thead className="bg-aletis-bege/50 text-muted-foreground">
            <tr>
              <Th>Cenário</Th>
              <Th align="right">Prod. kg/ha</Th>
              <Th align="right">Umidade</Th>
              <Th align="right">Secagem</Th>
              <Th align="right">Arrend.</Th>
              <Th align="right">Frete R$/sc</Th>
              <Th align="right">Colab.</Th>
              <Th align="right">Assist.</Th>
              <Th align="right">Lucro calc.</Th>
            </tr>
          </thead>
          <tbody>
            {draft.cenarios.map((c) => {
              const calc = draft.resultado.cenarios.find((r) => r.id === c.id)
              return (
                <tr key={c.id} className="border-t border-aletis-borda/70">
                  <Td strong>{c.nome}</Td>
                  <Td align="right"><MiniNumber value={c.produtividadeKgHa} onChange={(produtividadeKgHa) => updateCenario(c.id, { produtividadeKgHa: produtividadeKgHa || 0 })} /></Td>
                  <Td align="right"><MiniNumber value={c.umidadeImpurezasPct} step="0.001" onChange={(umidadeImpurezasPct) => updateCenario(c.id, { umidadeImpurezasPct: umidadeImpurezasPct || 0 })} /></Td>
                  <Td align="right"><MiniNumber value={c.secagemPct} step="0.001" onChange={(secagemPct) => updateCenario(c.id, { secagemPct: secagemPct || 0 })} /></Td>
                  <Td align="right"><MiniNumber value={c.arrendamentoPct} step="0.001" onChange={(arrendamentoPct) => updateCenario(c.id, { arrendamentoPct: arrendamentoPct || 0 })} /></Td>
                  <Td align="right"><MiniNumber value={c.freteRsSc} onChange={(freteRsSc) => updateCenario(c.id, { freteRsSc: freteRsSc || 0 })} /></Td>
                  <Td align="right"><MiniNumber value={c.colaboradoresPct} step="0.001" onChange={(colaboradoresPct) => updateCenario(c.id, { colaboradoresPct: colaboradoresPct || 0 })} /></Td>
                  <Td align="right"><MiniNumber value={c.assistenciaPct} step="0.001" onChange={(assistenciaPct) => updateCenario(c.id, { assistenciaPct: assistenciaPct || 0 })} /></Td>
                  <Td align="right" strong className={(calc?.lucroLiquidoRs || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                    {fmtBRL(calc?.lucroLiquidoRs)}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-aletis-borda bg-card p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-display font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-aletis-borda px-3 py-2 text-sm" />
    </label>
  )
}

function NumberField({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(asNumber(e.target.value))}
        className="w-full rounded-lg border border-aletis-borda px-3 py-2 text-sm"
      />
    </label>
  )
}

function MiniText({ value, onChange, className = 'w-36' }: { value: string; onChange: (v: string) => void; className?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={`${className} rounded-md border border-aletis-borda px-2 py-1`} />
}

function MiniNumber({ value, onChange, step = '0.01' }: { value?: number; onChange: (v: number | undefined) => void; step?: string }) {
  return (
    <input
      type="number"
      step={step}
      value={value ?? ''}
      onChange={(e) => onChange(asNumber(e.target.value))}
      className="w-24 rounded-md border border-aletis-borda px-2 py-1 text-right tabular-nums"
    />
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th className={`px-3 py-2 text-${align} text-[11px] font-bold uppercase tracking-wide`}>{children}</th>
}

function Td({
  children,
  align = 'left',
  strong,
  className = '',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  strong?: boolean
  className?: string
}) {
  return (
    <td className={`px-3 py-2 align-middle text-${align} ${strong ? 'font-semibold text-foreground' : 'text-[var(--text-soft)]'} ${className}`}>
      {children}
    </td>
  )
}
