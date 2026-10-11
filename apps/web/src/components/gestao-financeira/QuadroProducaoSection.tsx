// ============================================================
// QuadroProducaoSection — R.OP.011 nativo no ALETIS.
// Abre o preenchimento por blocos: agricultura e pecuária.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../hooks/useApi'
import {
  Beef,
  CheckCircle2,
  ClipboardList,
  MapPin,
  PackagePlus,
  Plus,
  Sprout,
  Trash2,
  TrendingUp,
  Wheat,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Cenario = 'planejado' | 'realizado' | 'proposta' | 'futura'
type AbaProducao = 'agricultura' | 'pecuaria'

interface ProducaoItem {
  id?: string
  grupoId: string
  cultura: string
  safra: string
  cenario: Cenario
  areaPropriaHa?: number
  areaArrendadaHa?: number
  rendimentoScHa?: number
  precoMedioRs?: number
  custoUnitarioInsumosRs?: number
  arrendamentoBaseScHa?: number
  unidade?: string
  observacoes?: string | null
  ordem?: number
}

interface LinhaCalculada extends ProducaoItem {
  areaPlantada: number
  quantidadeProduzida: number
  receitaTotal: number
  custoInsumosTotal: number
  custoArrendamento: number
  custoTotal: number
  resultadoBruto: number
  margemBruta: number
}

interface Props {
  grupoId: string
}

const CULTURAS_TEMPLATE: Array<Partial<ProducaoItem> & { label: string }> = [
  { label: 'Soja', cultura: 'Soja', rendimentoScHa: 60, precoMedioRs: 120, unidade: 'sc' },
  { label: 'Milho', cultura: 'Milho', rendimentoScHa: 110, precoMedioRs: 55, unidade: 'sc' },
  { label: 'Algodão', cultura: 'Algodão', rendimentoScHa: 300, precoMedioRs: 165, unidade: '@' },
  { label: 'Arroz', cultura: 'Arroz', rendimentoScHa: 150, precoMedioRs: 75, unidade: 'sc' },
  { label: 'Trigo', cultura: 'Trigo', rendimentoScHa: 55, precoMedioRs: 70, unidade: 'sc' },
]

const BLOCOS_PECUARIA = [
  {
    label: 'Rebanho atual',
    observacoes: 'Preencher categorias: fêmeas até 12m, 13-24m, 25-36m, acima de 36m, machos até 12m, 13-24m, 25-36m e acima de 36m.',
  },
  {
    label: 'Rebanho de produção',
    observacoes: 'Preencher touros e vacas matrizes, com saldo por ano e observações de retenção/descarte.',
  },
  {
    label: 'Bovinos',
    observacoes: 'Preencher ciclo produtivo, pasto próprio, pasto arrendado, custo de arrendamento e tipo de terminação.',
  },
  {
    label: 'Custos de produção',
    observacoes: 'Preencher aquisição de animais, pastagem, confinamento, dias de operação e quantidade de animais.',
  },
  {
    label: 'Animais comercializados',
    observacoes: 'Preencher quantidade comercializada, peso médio e preço médio para machos e fêmeas.',
  },
]

export default function QuadroProducaoSection({ grupoId }: Props) {
  const [items, setItems] = useState<ProducaoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [aba, setAba] = useState<AbaProducao>('agricultura')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch<{ culturas: any[] }>(`/gestao-financeira/grupos/${grupoId}/culturas`)
      setItems((r.culturas || []).map(normalizarProducao))
    } catch (e) {
      console.warn('Erro ao carregar produção:', e)
    } finally {
      setLoading(false)
    }
  }, [grupoId])

  useEffect(() => { reload() }, [reload])

  const pecuaria = useMemo(() => items.filter((item) => ehPecuaria(item)), [items])
  const agricultura = useMemo(() => items.filter((item) => !ehPecuaria(item)), [items])

  const linhasCalculadas = useMemo<LinhaCalculada[]>(() => {
    return agricultura.map((item) => {
      const areaPlantada = (Number(item.areaPropriaHa) || 0) + (Number(item.areaArrendadaHa) || 0)
      const quantidadeProduzida = areaPlantada * (Number(item.rendimentoScHa) || 0)
      const receitaTotal = quantidadeProduzida * (Number(item.precoMedioRs) || 0)
      const custoInsumosTotal = areaPlantada * (Number(item.custoUnitarioInsumosRs) || 0)
      const custoArrendamento = (Number(item.areaArrendadaHa) || 0) * (Number(item.arrendamentoBaseScHa) || 0) * (Number(item.precoMedioRs) || 0)
      const custoTotal = custoInsumosTotal + custoArrendamento
      const resultadoBruto = receitaTotal - custoTotal
      const margemBruta = receitaTotal > 0 ? resultadoBruto / receitaTotal : 0
      return {
        ...item,
        areaPlantada,
        quantidadeProduzida,
        receitaTotal,
        custoInsumosTotal,
        custoArrendamento,
        custoTotal,
        resultadoBruto,
        margemBruta,
      }
    })
  }, [agricultura])

  const totais = useMemo(() => {
    const receita = soma(linhasCalculadas, 'receitaTotal')
    const custo = soma(linhasCalculadas, 'custoTotal')
    const resultado = soma(linhasCalculadas, 'resultadoBruto')
    return {
      area: soma(linhasCalculadas, 'areaPlantada'),
      quantidade: soma(linhasCalculadas, 'quantidadeProduzida'),
      receita,
      custo,
      resultado,
      margem: receita > 0 ? resultado / receita : 0,
    }
  }, [linhasCalculadas])

  async function adicionarAgricultura(template?: Partial<ProducaoItem>) {
    try {
      await apiFetch(`/gestao-financeira/grupos/${grupoId}/culturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cultura: template?.cultura || 'Nova cultura',
          safra: template?.safra || '24/25',
          cenario: template?.cenario || 'planejado',
          areaPropriaHa: template?.areaPropriaHa ?? 0,
          areaArrendadaHa: template?.areaArrendadaHa ?? 0,
          rendimentoScHa: template?.rendimentoScHa ?? 0,
          precoMedioRs: template?.precoMedioRs ?? 0,
          custoUnitarioInsumosRs: template?.custoUnitarioInsumosRs ?? 0,
          arrendamentoBaseScHa: template?.arrendamentoBaseScHa ?? 0,
          unidade: template?.unidade || 'sc',
          observacoes: template?.observacoes || '',
          ordem: items.length,
        }),
      })
      await reload()
      sinalizarSalvo()
    } catch (e) {
      console.warn('Erro ao adicionar produção:', e)
    }
  }

  async function adicionarPecuaria(bloco: { label: string; observacoes: string }) {
    try {
      await apiFetch(`/gestao-financeira/grupos/${grupoId}/culturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cultura: `Pecuária - ${bloco.label}`,
          safra: '24/25',
          cenario: 'planejado',
          areaPropriaHa: 0,
          areaArrendadaHa: 0,
          rendimentoScHa: 0,
          precoMedioRs: 0,
          custoUnitarioInsumosRs: 0,
          arrendamentoBaseScHa: 0,
          unidade: 'cab',
          observacoes: bloco.observacoes,
          ordem: items.length,
        }),
      })
      await reload()
      sinalizarSalvo()
    } catch (e) {
      console.warn('Erro ao adicionar bloco de pecuária:', e)
    }
  }

  async function patch(id: string | undefined, patchData: Partial<ProducaoItem>) {
    if (!id) return
    try {
      await apiFetch(`/gestao-financeira/culturas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchData),
      })
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patchData } : item)))
      sinalizarSalvo()
    } catch (e) {
      console.warn('Erro ao salvar produção:', e)
    }
  }

  async function remover(id: string | undefined) {
    if (!id || !confirm('Remover este registro de produção?')) return
    try {
      await apiFetch(`/gestao-financeira/culturas/${id}`, { method: 'DELETE' })
      await reload()
    } catch (e) {
      console.warn('Erro ao remover produção:', e)
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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-foreground">
              R.OP.011 — Quadro de Produção do Cliente
            </p>
            <h2 className="mt-1 text-xl font-display font-semibold text-foreground">
              Produção agrícola e pecuária
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              O quadro foi separado pelos mesmos blocos da planilha: culturas agrícolas, safra, área, produção, receita, custo, preço médio e registros de pecuária.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:min-w-[640px]">
            <Metric label="Área" value={`${fmtNumero(totais.area)} ha`} icon={MapPin} />
            <Metric label="Produção" value={`${fmtNumero(totais.quantidade)} un.`} icon={Wheat} />
            <Metric label="Receita" value={fmtBRL(totais.receita)} icon={TrendingUp} tone="good" />
            <Metric label="Custo" value={fmtBRL(totais.custo)} icon={ClipboardList} />
            <Metric label="Margem" value={`${(totais.margem * 100).toFixed(1)}%`} icon={Sprout} tone={totais.margem >= 0.2 ? 'good' : 'neutral'} />
          </div>
        </div>
      </header>

      <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-display font-semibold text-foreground">
              <ClipboardList className="h-4 w-4 text-foreground" />
              Como preencher a R.OP.011 no sistema
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Os campos calculados aparecem na própria linha, evitando fórmulas escondidas em abas da planilha.
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
            title="Agricultura"
            text="Nome da cultura, safra, área plantada, quantidade produzida, receita, custo, preço médio e informações importantes."
          />
          <GuideCard
            title="Pecuária"
            text="Rebanho atual, rebanho de produção, bovinos, custos de produção e animais comercializados ficam em blocos próprios."
          />
        </div>
      </section>

      <section className="rounded-lg border border-aletis-borda bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-aletis-borda p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="inline-flex w-full rounded-lg border border-aletis-borda bg-aletis-cream/30 p-1 sm:w-auto">
            <TabButton active={aba === 'agricultura'} onClick={() => setAba('agricultura')} label={`Agricultura (${agricultura.length})`} />
            <TabButton active={aba === 'pecuaria'} onClick={() => setAba('pecuaria')} label={`Pecuária (${pecuaria.length})`} />
          </div>

          {aba === 'agricultura' ? (
            <div className="flex flex-wrap items-center gap-2">
              {CULTURAS_TEMPLATE.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => adicionarAgricultura(template)}
                  className="inline-flex items-center gap-1 rounded-md border border-aletis-borda px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-aletis-verde/40 hover:bg-aletis-verde/5"
                >
                  <PackagePlus className="h-3.5 w-3.5 text-foreground" />
                  {template.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => adicionarAgricultura()}
                className="inline-flex items-center gap-1 rounded-md bg-aletis-verde px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-aletis-verde/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova cultura
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {BLOCOS_PECUARIA.map((bloco) => (
                <button
                  key={bloco.label}
                  type="button"
                  onClick={() => adicionarPecuaria(bloco)}
                  className="inline-flex items-center gap-1 rounded-md border border-aletis-borda px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:border-aletis-verde/40 hover:bg-aletis-verde/5"
                >
                  <Beef className="h-3.5 w-3.5 text-foreground" />
                  {bloco.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {aba === 'agricultura' ? (
          <AgriculturaTable
            linhas={linhasCalculadas}
            onPatch={patch}
            onDelete={remover}
          />
        ) : (
          <PecuariaTable
            linhas={pecuaria}
            onPatch={patch}
            onDelete={remover}
          />
        )}
      </section>
    </div>
  )
}

function AgriculturaTable({
  linhas,
  onPatch,
  onDelete,
}: {
  linhas: LinhaCalculada[]
  onPatch: (id: string | undefined, patch: Partial<ProducaoItem>) => void
  onDelete: (id: string | undefined) => void
}) {
  if (linhas.length === 0) {
    return (
      <EmptyState
        icon={Wheat}
        title="Nenhuma cultura agrícola cadastrada."
        text="Use os atalhos acima para abrir uma linha de preenchimento no formato da R.OP.011."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="ui-table w-full min-w-[1460px] text-xs">
        <thead className="bg-aletis-cream/40 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Cultura</th>
            <th className="px-3 py-2 text-left">Safra</th>
            <th className="px-3 py-2 text-left">Cenário</th>
            <th className="px-3 py-2 text-right">Área própria</th>
            <th className="px-3 py-2 text-right">Área arrendada</th>
            <th className="px-3 py-2 text-right">Área total</th>
            <th className="px-3 py-2 text-right">Rendimento</th>
            <th className="px-3 py-2 text-left">Un.</th>
            <th className="px-3 py-2 text-right">Qtd. produzida</th>
            <th className="px-3 py-2 text-right">Preço médio</th>
            <th className="px-3 py-2 text-right">Receita</th>
            <th className="px-3 py-2 text-right">Custo/ha</th>
            <th className="px-3 py-2 text-right">Arr. sc/ha</th>
            <th className="px-3 py-2 text-right">Custo total</th>
            <th className="px-3 py-2 text-right">Margem</th>
            <th className="px-3 py-2 text-left">Informações importantes</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <AgriculturaRow
              key={linha.id}
              linha={linha}
              onPatch={(patch) => onPatch(linha.id, patch)}
              onDelete={() => onDelete(linha.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AgriculturaRow({
  linha,
  onPatch,
  onDelete,
}: {
  linha: LinhaCalculada
  onPatch: (patch: Partial<ProducaoItem>) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<ProducaoItem>(linha)

  useEffect(() => setDraft(linha), [linha])

  function update<K extends keyof ProducaoItem>(key: K, value: ProducaoItem[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <tr className="border-t border-aletis-borda/70 align-top hover:bg-aletis-cream/20">
      <td className="px-3 py-2">
        <input value={draft.cultura} onChange={(e) => update('cultura', e.target.value)} onBlur={() => onPatch({ cultura: draft.cultura || 'Cultura' })} className={`${inputCls} w-36`} />
      </td>
      <td className="px-3 py-2">
        <input value={draft.safra} onChange={(e) => update('safra', e.target.value)} onBlur={() => onPatch({ safra: draft.safra || '24/25' })} className={`${inputCls} w-20`} />
      </td>
      <td className="px-3 py-2">
        <select value={draft.cenario} onChange={(e) => { const cenario = e.target.value as Cenario; update('cenario', cenario); onPatch({ cenario }) }} className={`${inputCls} w-28`}>
          <option value="planejado">Planejado</option>
          <option value="realizado">Realizado</option>
          <option value="proposta">Proposta</option>
          <option value="futura">Futura</option>
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        <NumberInput value={draft.areaPropriaHa} onChange={(v) => update('areaPropriaHa', v)} onBlur={() => onPatch({ areaPropriaHa: draft.areaPropriaHa ?? 0 })} />
      </td>
      <td className="px-3 py-2 text-right">
        <NumberInput value={draft.areaArrendadaHa} onChange={(v) => update('areaArrendadaHa', v)} onBlur={() => onPatch({ areaArrendadaHa: draft.areaArrendadaHa ?? 0 })} />
      </td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{fmtNumero(linha.areaPlantada)}</td>
      <td className="px-3 py-2 text-right">
        <NumberInput value={draft.rendimentoScHa} onChange={(v) => update('rendimentoScHa', v)} onBlur={() => onPatch({ rendimentoScHa: draft.rendimentoScHa ?? 0 })} />
      </td>
      <td className="px-3 py-2">
        <input value={draft.unidade || ''} onChange={(e) => update('unidade', e.target.value)} onBlur={() => onPatch({ unidade: draft.unidade || 'sc' })} className={`${inputCls} w-16`} />
      </td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
        {fmtNumero(linha.quantidadeProduzida)}
      </td>
      <td className="px-3 py-2 text-right">
        <NumberInput value={draft.precoMedioRs} onChange={(v) => update('precoMedioRs', v)} onBlur={() => onPatch({ precoMedioRs: draft.precoMedioRs ?? 0 })} width="w-28" />
      </td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{fmtBRL(linha.receitaTotal)}</td>
      <td className="px-3 py-2 text-right">
        <NumberInput value={draft.custoUnitarioInsumosRs} onChange={(v) => update('custoUnitarioInsumosRs', v)} onBlur={() => onPatch({ custoUnitarioInsumosRs: draft.custoUnitarioInsumosRs ?? 0 })} width="w-28" />
      </td>
      <td className="px-3 py-2 text-right">
        <NumberInput value={draft.arrendamentoBaseScHa} onChange={(v) => update('arrendamentoBaseScHa', v)} onBlur={() => onPatch({ arrendamentoBaseScHa: draft.arrendamentoBaseScHa ?? 0 })} />
      </td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{fmtBRL(linha.custoTotal)}</td>
      <td className="px-3 py-2 text-right">
        <span className={`font-semibold tabular-nums ${linha.margemBruta >= 0.2 ? 'text-emerald-700' : linha.margemBruta >= 0 ? 'text-amber-700' : 'text-red-700'}`}>
          {(linha.margemBruta * 100).toFixed(1)}%
        </span>
      </td>
      <td className="px-3 py-2">
        <input
          value={draft.observacoes || ''}
          onChange={(e) => update('observacoes', e.target.value)}
          onBlur={() => onPatch({ observacoes: draft.observacoes || '' })}
          placeholder="Observações da safra, fonte dos dados, riscos..."
          className={`${inputCls} w-64`}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button type="button" onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600" title="Remover cultura">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}

function PecuariaTable({
  linhas,
  onPatch,
  onDelete,
}: {
  linhas: ProducaoItem[]
  onPatch: (id: string | undefined, patch: Partial<ProducaoItem>) => void
  onDelete: (id: string | undefined) => void
}) {
  if (linhas.length === 0) {
    return (
      <EmptyState
        icon={Beef}
        title="Nenhum bloco de pecuária cadastrado."
        text="Adicione os blocos acima para registrar rebanho, bovinos, custos e comercialização sem depender da planilha."
      />
    )
  }

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-2">
      {linhas.map((linha) => (
        <PecuariaCard
          key={linha.id}
          linha={linha}
          onPatch={(patch) => onPatch(linha.id, patch)}
          onDelete={() => onDelete(linha.id)}
        />
      ))}
    </div>
  )
}

function PecuariaCard({
  linha,
  onPatch,
  onDelete,
}: {
  linha: ProducaoItem
  onPatch: (patch: Partial<ProducaoItem>) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(linha)
  useEffect(() => setDraft(linha), [linha])

  return (
    <article className="rounded-lg border border-aletis-borda bg-aletis-cream/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={draft.cultura.replace(/^Pecuária - /, '')}
            onChange={(e) => setDraft((prev) => ({ ...prev, cultura: `Pecuária - ${e.target.value}` }))}
            onBlur={() => onPatch({ cultura: draft.cultura || 'Pecuária - Bloco' })}
            className={`${inputCls} w-full font-semibold`}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={draft.safra}
              onChange={(e) => setDraft((prev) => ({ ...prev, safra: e.target.value }))}
              onBlur={() => onPatch({ safra: draft.safra || '24/25' })}
              className={`${inputCls} w-24`}
            />
            <select
              value={draft.cenario}
              onChange={(e) => { const cenario = e.target.value as Cenario; setDraft((prev) => ({ ...prev, cenario })); onPatch({ cenario }) }}
              className={`${inputCls} w-32`}
            >
              <option value="planejado">Planejado</option>
              <option value="realizado">Realizado</option>
              <option value="proposta">Proposta</option>
              <option value="futura">Futura</option>
            </select>
          </div>
        </div>
        <button type="button" onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600" title="Remover bloco">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <textarea
        value={draft.observacoes || ''}
        onChange={(e) => setDraft((prev) => ({ ...prev, observacoes: e.target.value }))}
        onBlur={() => onPatch({ observacoes: draft.observacoes || '' })}
        rows={5}
        className={`${inputCls} mt-3 w-full resize-y leading-relaxed`}
        placeholder="Preencha aqui os detalhes da seção da planilha: saldos por ano, categorias, custos, quantidades e observações."
      />
    </article>
  )
}

function NumberInput({
  value,
  onChange,
  onBlur,
  width = 'w-24',
}: {
  value?: number
  onChange: (value: number) => void
  onBlur: () => void
  width?: string
}) {
  return (
    <input
      type="number"
      value={value ?? 0}
      onChange={(e) => onChange(Number(e.target.value))}
      onBlur={onBlur}
      className={`${inputCls} ${width} text-right tabular-nums`}
    />
  )
}

function Metric({ label, value, icon: Icon, tone = 'neutral' }: { label: string; value: string; icon: LucideIcon; tone?: 'neutral' | 'good' }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone === 'good' ? 'border-emerald-200 bg-emerald-50' : 'border-aletis-borda bg-aletis-cream/35'}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
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

function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-4 py-8 text-center">
      <Icon className="h-9 w-9 text-aletis-grafite-claro/60" />
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">{text}</p>
    </div>
  )
}

function normalizarProducao(c: any): ProducaoItem {
  return {
    ...c,
    id: String(c.id),
    cultura: c.cultura || 'Cultura',
    safra: c.safra || '24/25',
    cenario: (c.cenario || 'planejado') as Cenario,
    areaPropriaHa: numero(c.areaPropriaHa),
    areaArrendadaHa: numero(c.areaArrendadaHa),
    rendimentoScHa: numero(c.rendimentoScHa),
    precoMedioRs: numero(c.precoMedioRs),
    custoUnitarioInsumosRs: numero(c.custoUnitarioInsumosRs),
    arrendamentoBaseScHa: numero(c.arrendamentoBaseScHa),
    unidade: c.unidade || 'sc',
    observacoes: c.observacoes || '',
  }
}

function ehPecuaria(item: ProducaoItem) {
  return item.cultura.toLowerCase().startsWith('pecuária') || item.cultura.toLowerCase().startsWith('pecuaria')
}

function soma<T extends Record<string, any>>(items: T[], key: keyof T) {
  return items.reduce((acc, item) => acc + (Number(item[key]) || 0), 0)
}

function numero(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function fmtNumero(n: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n || 0)
}

function fmtBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0)
}

const inputCls = 'rounded-md border border-aletis-borda bg-card px-2 py-1.5 text-xs text-foreground outline-none transition focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/10'
