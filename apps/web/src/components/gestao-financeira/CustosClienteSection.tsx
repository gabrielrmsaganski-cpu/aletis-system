// ============================================================
// CustosClienteSection — R.OP.010 nativo no ALETIS.
// Estrutura a planilha em dois blocos de preenchimento:
// insumos por cultura e demais custos anuais do cliente.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../hooks/useApi'
import {
  Calculator,
  CheckCircle2,
  ClipboardList,
  PackagePlus,
  Plus,
  Sprout,
  Trash2,
} from 'lucide-react'

type CustoTipo = 'insumo' | 'operacional' | 'fixo' | 'frete' | 'colheita' | 'arrendamento' | 'outros'
type AbaCustos = 'insumos' | 'demais'

interface CustoItem {
  id?: string
  grupoId: string
  tipo: CustoTipo
  descricao: string
  cultura?: string | null
  safra?: string | null
  terceirizado?: boolean
  quantidade?: number
  unidade?: string | null
  valorUnitario?: number
  valorAnual?: number
  valorMensal?: number
  observacoes?: string | null
  ordem?: number
}

interface Props {
  grupoId: string
}

const TEMPLATES_INSUMOS: Array<Partial<CustoItem> & { label: string }> = [
  { label: 'Semente', tipo: 'insumo', descricao: 'Sementes', unidade: 'ha' },
  { label: 'Fertilizante', tipo: 'insumo', descricao: 'Fertilizantes', unidade: 'ha' },
  { label: 'Defensivo', tipo: 'insumo', descricao: 'Defensivos agrícolas', unidade: 'ha' },
  { label: 'Corretivo', tipo: 'insumo', descricao: 'Calcário / corretivos', unidade: 'ha' },
  { label: 'Operação terceirizada', tipo: 'insumo', descricao: 'Aplicação / operação terceirizada', terceirizado: true, unidade: 'ha' },
]

const TEMPLATES_DEMAIS: Array<Partial<CustoItem> & { label: string }> = [
  { label: 'Mão de obra', tipo: 'operacional', descricao: 'Mão de obra' },
  { label: 'Energia', tipo: 'fixo', descricao: 'Energia elétrica' },
  { label: 'Manutenção', tipo: 'operacional', descricao: 'Manutenção de máquinas' },
  { label: 'Frete', tipo: 'frete', descricao: 'Frete' },
  { label: 'Colheita', tipo: 'colheita', descricao: 'Colheita' },
  { label: 'Arrendamento', tipo: 'arrendamento', descricao: 'Arrendamento' },
  { label: 'Administrativo', tipo: 'outros', descricao: 'Custos administrativos' },
]

export default function CustosClienteSection({ grupoId }: Props) {
  const [items, setItems] = useState<CustoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [aba, setAba] = useState<AbaCustos>('insumos')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch<{ custos: any[] }>(`/gestao-financeira/grupos/${grupoId}/custos`)
      setItems((r.custos || []).map(normalizarCusto))
    } catch (e) {
      console.warn('Erro ao carregar custos:', e)
    } finally {
      setLoading(false)
    }
  }, [grupoId])

  useEffect(() => { reload() }, [reload])

  const resumo = useMemo(() => {
    const insumos = items.filter((item) => item.tipo === 'insumo')
    const demais = items.filter((item) => item.tipo !== 'insumo')
    const totalInsumos = soma(insumos, 'valorAnual')
    const totalDemais = soma(demais, 'valorAnual')
    const porCultura = insumos.reduce<Record<string, number>>((acc, item) => {
      const key = item.cultura?.trim() || 'Sem cultura'
      acc[key] = (acc[key] || 0) + (Number(item.valorAnual) || 0)
      return acc
    }, {})
    const preenchidos = items.filter((item) => item.descricao && item.safra && Number(item.valorAnual) > 0).length
    return {
      insumos,
      demais,
      totalInsumos,
      totalDemais,
      totalGeral: totalInsumos + totalDemais,
      totalMensal: soma(items, 'valorMensal'),
      porCultura,
      completude: items.length ? Math.round((preenchidos / items.length) * 100) : 0,
    }
  }, [items])

  const itensVisiveis = aba === 'insumos' ? resumo.insumos : resumo.demais
  const templates = aba === 'insumos' ? TEMPLATES_INSUMOS : TEMPLATES_DEMAIS

  async function adicionar(template?: Partial<CustoItem>) {
    const tipo = template?.tipo || (aba === 'insumos' ? 'insumo' : 'operacional')
    const valorAnual = Number(template?.valorAnual) || 0
    try {
      await apiFetch(`/gestao-financeira/grupos/${grupoId}/custos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          descricao: template?.descricao || (tipo === 'insumo' ? 'Novo insumo' : 'Novo custo'),
          cultura: template?.cultura || '',
          safra: template?.safra || '24/25',
          terceirizado: Boolean(template?.terceirizado),
          quantidade: template?.quantidade ?? null,
          unidade: template?.unidade || (tipo === 'insumo' ? 'ha' : ''),
          valorUnitario: template?.valorUnitario ?? null,
          valorAnual,
          valorMensal: Number(template?.valorMensal) || arredondar(valorAnual / 12),
          observacoes: template?.observacoes || '',
          ordem: items.length,
        }),
      })
      await reload()
      sinalizarSalvo()
    } catch (e) {
      console.warn('Erro ao adicionar custo:', e)
    }
  }

  async function patch(id: string | undefined, patchData: Partial<CustoItem>) {
    if (!id) return
    const payload = { ...patchData }
    if (payload.valorAnual !== undefined && payload.valorMensal === undefined) {
      payload.valorMensal = arredondar((Number(payload.valorAnual) || 0) / 12)
    }
    try {
      await apiFetch(`/gestao-financeira/custos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...payload } : item)))
      sinalizarSalvo()
    } catch (e) {
      console.warn('Erro ao salvar custo:', e)
    }
  }

  async function remover(id: string | undefined) {
    if (!id || !confirm('Remover este custo?')) return
    try {
      await apiFetch(`/gestao-financeira/custos/${id}`, { method: 'DELETE' })
      await reload()
    } catch (e) {
      console.warn('Erro ao remover custo:', e)
    }
  }

  function sinalizarSalvo() {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1600)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-72 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <header className="rounded-lg border border-aletis-borda bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-foreground">
              R.OP.010 — Custos do Cliente
            </p>
            <h2 className="mt-1 text-xl font-display font-semibold text-foreground">
              Preenchimento guiado de custos
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A planilha foi reorganizada em dois blocos operacionais: insumos por cultura e demais custos anuais. Os valores anuais alimentam o diagnóstico financeiro do cliente.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
            <Metric label="Total anual" value={fmtBRL(resumo.totalGeral)} />
            <Metric label="Insumos" value={fmtBRL(resumo.totalInsumos)} />
            <Metric label="Demais custos" value={fmtBRL(resumo.totalDemais)} />
            <Metric label="Completude" value={`${resumo.completude}%`} tone={resumo.completude >= 80 ? 'good' : 'neutral'} />
          </div>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1.25fr_.75fr]">
        <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-display font-semibold text-foreground">
                <ClipboardList className="h-4 w-4 text-foreground" />
                Estrutura da R.OP.010
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use o mesmo raciocínio da planilha original, mas sem alternar entre arquivos.
              </p>
            </div>
            {saved && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Salvo
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <GuideCard
              title="1. Insumos por cultura"
              text="Descrição do insumo, cultura, safra, terceirização, quantidade, unidade, valor unitário e valor anual."
            />
            <GuideCard
              title="2. Demais custos"
              text="Custos fixos, operacionais, frete, colheita, arrendamento e despesas administrativas em base anual."
            />
          </div>
        </section>

        <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-display font-semibold text-foreground">
            <Sprout className="h-4 w-4 text-foreground" />
            Custo por cultura
          </h3>
          {Object.keys(resumo.porCultura).length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">Nenhum insumo com cultura preenchida ainda.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {Object.entries(resumo.porCultura).map(([cultura, valor]) => (
                <div key={cultura} className="flex items-center justify-between gap-3 rounded-md bg-aletis-cream/50 px-3 py-2">
                  <span className="truncate text-xs font-semibold text-foreground">{cultura}</span>
                  <span className="text-xs font-semibold tabular-nums text-foreground">{fmtBRL(valor)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-aletis-borda bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-aletis-borda p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-full rounded-lg border border-aletis-borda bg-aletis-cream/30 p-1 sm:w-auto">
            <TabButton active={aba === 'insumos'} onClick={() => setAba('insumos')} label={`Insumos por cultura (${resumo.insumos.length})`} />
            <TabButton active={aba === 'demais'} onClick={() => setAba('demais')} label={`Demais custos (${resumo.demais.length})`} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {templates.map((template) => (
              <button
                key={template.label}
                type="button"
                onClick={() => adicionar(template)}
                className="inline-flex items-center gap-1 rounded-md border border-aletis-borda px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-aletis-verde/40 hover:bg-aletis-verde/5"
              >
                <PackagePlus className="h-3.5 w-3.5 text-foreground" />
                {template.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => adicionar()}
              className="inline-flex items-center gap-1 rounded-md bg-aletis-verde px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aletis-verde/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo
            </button>
          </div>
        </div>

        {itensVisiveis.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center px-4 py-8 text-center">
            <Calculator className="h-9 w-9 text-aletis-grafite-claro/60" />
            <p className="mt-3 text-sm font-semibold text-foreground">
              {aba === 'insumos' ? 'Nenhum insumo por cultura cadastrado.' : 'Nenhum custo anual cadastrado.'}
            </p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Comece pelos atalhos acima para abrir os campos no mesmo formato da planilha R.OP.010.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table w-full min-w-[1180px] text-xs">
              <thead className="bg-aletis-cream/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-center">Terc.</th>
                  <th className="px-3 py-2 text-left">Cultura</th>
                  <th className="px-3 py-2 text-left">Safra</th>
                  <th className="px-3 py-2 text-right">Qtd.</th>
                  <th className="px-3 py-2 text-left">Un.</th>
                  <th className="px-3 py-2 text-right">Unitário</th>
                  <th className="px-3 py-2 text-right">Anual</th>
                  <th className="px-3 py-2 text-right">Mensal</th>
                  <th className="px-3 py-2 text-left">Observações</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {itensVisiveis.map((item) => (
                  <CustoRow
                    key={item.id}
                    item={item}
                    onPatch={(patchData) => patch(item.id, patchData)}
                    onDelete={() => remover(item.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function CustoRow({
  item,
  onPatch,
  onDelete,
}: {
  item: CustoItem
  onPatch: (patch: Partial<CustoItem>) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(item)

  useEffect(() => setDraft(item), [item])

  function update<K extends keyof CustoItem>(key: K, value: CustoItem[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function salvarValorAnual() {
    const valorAnual = Number(draft.valorAnual) || 0
    onPatch({ valorAnual, valorMensal: arredondar(valorAnual / 12) })
  }

  function calcularPorQuantidade() {
    const valorAnual = arredondar((Number(draft.quantidade) || 0) * (Number(draft.valorUnitario) || 0))
    setDraft((prev) => ({ ...prev, valorAnual, valorMensal: arredondar(valorAnual / 12) }))
    onPatch({ quantidade: draft.quantidade || 0, valorUnitario: draft.valorUnitario || 0, valorAnual, valorMensal: arredondar(valorAnual / 12) })
  }

  return (
    <tr className="border-t border-aletis-borda/70 align-top hover:bg-aletis-cream/20">
      <td className="px-3 py-2">
        <select
          value={draft.tipo}
          onChange={(e) => { const tipo = e.target.value as CustoTipo; update('tipo', tipo); onPatch({ tipo }) }}
          className={selectCls}
        >
          <option value="insumo">Insumo</option>
          <option value="operacional">Operacional</option>
          <option value="fixo">Fixo</option>
          <option value="frete">Frete</option>
          <option value="colheita">Colheita</option>
          <option value="arrendamento">Arrendamento</option>
          <option value="outros">Outros</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          value={draft.descricao || ''}
          onChange={(e) => update('descricao', e.target.value)}
          onBlur={() => onPatch({ descricao: draft.descricao || 'Custo sem descrição' })}
          className={`${inputCls} w-52`}
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={Boolean(draft.terceirizado)}
          onChange={(e) => { update('terceirizado', e.target.checked); onPatch({ terceirizado: e.target.checked }) }}
          className="h-4 w-4 rounded border-aletis-borda text-foreground focus:ring-aletis-verde"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={draft.cultura || ''}
          onChange={(e) => update('cultura', e.target.value)}
          onBlur={() => onPatch({ cultura: draft.cultura || '' })}
          placeholder="Ex.: Soja"
          className={`${inputCls} w-32`}
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={draft.safra || ''}
          onChange={(e) => update('safra', e.target.value)}
          onBlur={() => onPatch({ safra: draft.safra || '24/25' })}
          className={`${inputCls} w-20`}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          value={draft.quantidade ?? 0}
          onChange={(e) => update('quantidade', Number(e.target.value))}
          onBlur={() => onPatch({ quantidade: draft.quantidade ?? 0 })}
          className={`${inputCls} w-24 text-right tabular-nums`}
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={draft.unidade || ''}
          onChange={(e) => update('unidade', e.target.value)}
          onBlur={() => onPatch({ unidade: draft.unidade || '' })}
          placeholder="ha, sc..."
          className={`${inputCls} w-20`}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            value={draft.valorUnitario ?? 0}
            onChange={(e) => update('valorUnitario', Number(e.target.value))}
            onBlur={() => onPatch({ valorUnitario: draft.valorUnitario ?? 0 })}
            className={`${inputCls} w-28 text-right tabular-nums`}
          />
          <button
            type="button"
            onClick={calcularPorQuantidade}
            className="rounded-md border border-aletis-borda p-1.5 text-muted-foreground transition hover:border-aletis-verde/40 hover:text-aletis-verde"
            title="Calcular anual por quantidade x valor unitário"
          >
            <Calculator className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          value={draft.valorAnual ?? 0}
          onChange={(e) => update('valorAnual', Number(e.target.value))}
          onBlur={salvarValorAnual}
          className={`${inputCls} w-32 text-right font-semibold tabular-nums text-foreground`}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          value={draft.valorMensal ?? 0}
          onChange={(e) => update('valorMensal', Number(e.target.value))}
          onBlur={() => onPatch({ valorMensal: draft.valorMensal ?? 0 })}
          className={`${inputCls} w-28 text-right tabular-nums`}
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={draft.observacoes || ''}
          onChange={(e) => update('observacoes', e.target.value)}
          onBlur={() => onPatch({ observacoes: draft.observacoes || '' })}
          placeholder="Observações do consultor"
          className={`${inputCls} w-56`}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
          title="Remover custo"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone === 'good' ? 'border-emerald-200 bg-emerald-50' : 'border-aletis-borda bg-aletis-cream/35'}`}>
      <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-display font-semibold tabular-nums ${tone === 'good' ? 'text-emerald-700' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}

function GuideCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-aletis-borda bg-aletis-cream/35 p-3">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition sm:flex-none ${
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-aletis-grafite-escuro'
      }`}
    >
      {label}
    </button>
  )
}

function normalizarCusto(c: any): CustoItem {
  return {
    ...c,
    id: String(c.id),
    tipo: (c.tipo || 'outros') as CustoTipo,
    cultura: c.cultura || '',
    safra: c.safra || '24/25',
    terceirizado: Boolean(c.terceirizado),
    quantidade: numero(c.quantidade),
    valorUnitario: numero(c.valorUnitario),
    valorAnual: numero(c.valorAnual),
    valorMensal: numero(c.valorMensal),
    observacoes: c.observacoes || '',
  }
}

function soma(items: CustoItem[], key: 'valorAnual' | 'valorMensal') {
  return items.reduce((acc, item) => acc + (Number(item[key]) || 0), 0)
}

function numero(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function arredondar(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function fmtBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0)
}

const inputCls = 'rounded-md border border-aletis-borda bg-card px-2 py-1.5 text-xs text-foreground outline-none transition focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/10'
const selectCls = `${inputCls} w-32`
