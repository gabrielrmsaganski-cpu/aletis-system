// ============================================================
// ChecklistInterativo — UI dos checklists R.OP.003/004/005/009
// (preenchimento item-a-item com observação + persistência PG).
// ============================================================
import { useEffect, useState, useMemo } from 'react'
import { apiFetch } from '../../hooks/useApi'
import {
  X,
  Check,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Upload,
  RefreshCw,
  Download,
} from 'lucide-react'

interface ChecklistItem {
  id: string
  label: string
  hint?: string
  etapa?: string
  requiresUpload?: boolean
  acceptsObservacao?: boolean
}

interface ChecklistTemplate {
  slug: string
  codigo: string
  nome: string
  versao: string
  descricao: string
  items: ChecklistItem[]
}

interface ChecklistItemState {
  marcado?: boolean
  observacao?: string
  anexoId?: string
  atualizadoEm: string
}

interface ChecklistState {
  templateSlug: string
  itens: Record<string, ChecklistItemState>
  status: 'em_andamento' | 'concluido' | 'arquivado'
  totalItens: number
  itensConcluidos: number
  iniciadoEm: string
  atualizadoEm: string
  responsavel?: string | null
}

interface GetResponse {
  template: ChecklistTemplate
  state: ChecklistState | null
}

interface PatchResponse {
  state: ChecklistState
}

interface TemplateMeta {
  slug: string
  codigo: string
  nome: string
}

interface Props {
  template: TemplateMeta
  clienteId: string
  onClose: () => void
}

export default function ChecklistInterativo({ template, clienteId, onClose }: Props) {
  const [data, setData] = useState<GetResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [obsDraft, setObsDraft] = useState<Record<string, string>>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    setData(null)
    apiFetch<GetResponse>(
      `/processo-assessoria/clientes/${encodeURIComponent(clienteId)}/checklists/${encodeURIComponent(
        template.slug,
      )}`,
    )
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
    return () => {
      cancelled = true
    }
  }, [clienteId, template.slug])

  const grouped = useMemo(() => {
    if (!data) return null
    const out = new Map<string, ChecklistItem[]>()
    for (const it of data.template.items) {
      const k = it.etapa ?? '—'
      const arr = out.get(k) ?? []
      arr.push(it)
      out.set(k, arr)
    }
    return out
  }, [data])

  const totalConcluidos = data?.state?.itensConcluidos ?? 0
  const total = data?.template.items.length ?? 0
  const progresso = total > 0 ? totalConcluidos / total : 0

  async function toggleItem(item: ChecklistItem, marcado: boolean) {
    if (!data) return
    setSavingId(item.id)
    try {
      const obs = obsDraft[item.id] ?? data.state?.itens?.[item.id]?.observacao
      const r = await apiFetch<PatchResponse>(
        `/processo-assessoria/clientes/${encodeURIComponent(clienteId)}/checklists/${encodeURIComponent(
          template.slug,
        )}/itens/${encodeURIComponent(item.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marcado, observacao: obs }),
        },
      )
      setData((prev) => (prev ? { ...prev, state: r.state } : prev))
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setSavingId(null)
    }
  }

  async function saveObservacao(item: ChecklistItem) {
    if (!data) return
    const obs = obsDraft[item.id]
    if (obs === undefined) return
    setSavingId(item.id)
    try {
      const cur = data.state?.itens?.[item.id]
      const r = await apiFetch<PatchResponse>(
        `/processo-assessoria/clientes/${encodeURIComponent(clienteId)}/checklists/${encodeURIComponent(
          template.slug,
        )}/itens/${encodeURIComponent(item.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marcado: cur?.marcado ?? false, observacao: obs }),
        },
      )
      setData((prev) => (prev ? { ...prev, state: r.state } : prev))
      setObsDraft((d) => {
        const c = { ...d }
        delete c[item.id]
        return c
      })
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setSavingId(null)
    }
  }

  async function downloadPreenchido() {
    try {
      const url = `/api/processo-assessoria/templates/${encodeURIComponent(template.slug)}/render`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const dl = document.createElement('a')
      dl.href = URL.createObjectURL(blob)
      const cd = resp.headers.get('Content-Disposition') ?? ''
      const m = cd.match(/filename="?([^"]+)"?/)
      dl.download = m?.[1] ?? `${template.slug}.docx`
      dl.click()
      setTimeout(() => URL.revokeObjectURL(dl.href), 30_000)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-6">
      <div className="bg-white rounded-none md:rounded-2xl w-full max-w-3xl max-h-[100vh] md:max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-semibold text-aletis-verde uppercase">
              {template.codigo} · CHECKLIST INTERATIVO
            </p>
            <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro leading-tight mt-0.5">
              {template.nome}
            </h2>
            {data && (
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1 h-1.5 bg-aletis-grafite-claro/15 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-aletis-verde to-aletis-dourado transition-all"
                    style={{ width: `${progresso * 100}%` }}
                  />
                </div>
                <span className="text-xs font-body font-semibold tabular-nums text-aletis-grafite-escuro flex-shrink-0">
                  {totalConcluidos}/{total} ({Math.round(progresso * 100)}%)
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center flex-shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5 text-aletis-grafite-claro" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!data && !error && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          )}

          {data && grouped && (
            <div className="space-y-5">
              {Array.from(grouped.entries()).map(([etapa, items]) => {
                const isCollapsed = collapsed[etapa] ?? false
                const totalEt = items.length
                const concEt = items.filter((it) => data.state?.itens?.[it.id]?.marcado).length
                return (
                  <section key={etapa} className="rounded-xl border border-aletis-grafite-claro/15 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCollapsed((c) => ({ ...c, [etapa]: !c[etapa] }))}
                      className="w-full px-4 py-2.5 bg-aletis-cream/30 hover:bg-aletis-cream/50 flex items-center justify-between text-left transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-display font-semibold text-aletis-grafite-escuro">
                          {etapa}
                        </span>
                        <span className="text-[10px] tabular-nums px-2 py-0.5 rounded-full bg-aletis-verde/10 text-aletis-verde font-semibold">
                          {concEt}/{totalEt}
                        </span>
                      </div>
                      {isCollapsed ? (
                        <ChevronDown className="w-4 h-4 text-aletis-grafite-claro" />
                      ) : (
                        <ChevronUp className="w-4 h-4 text-aletis-grafite-claro" />
                      )}
                    </button>
                    {!isCollapsed && (
                      <ul className="divide-y divide-aletis-grafite-claro/10">
                        {items.map((item) => {
                          const st = data.state?.itens?.[item.id]
                          const marcado = !!st?.marcado
                          const obsDraftVal = obsDraft[item.id]
                          const obsCurrent = st?.observacao ?? ''
                          const isDirty = obsDraftVal !== undefined && obsDraftVal !== obsCurrent
                          const saving = savingId === item.id
                          return (
                            <li key={item.id} className="px-4 py-3">
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggleItem(item, !marcado)}
                                  disabled={saving}
                                  className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                                    marcado
                                      ? 'bg-aletis-verde text-white'
                                      : 'bg-white border-2 border-aletis-grafite-claro/30 hover:border-aletis-verde'
                                  } ${saving ? 'opacity-50' : ''}`}
                                  aria-label={marcado ? 'Desmarcar' : 'Marcar'}
                                >
                                  {marcado ? (
                                    <Check className="w-3 h-3" strokeWidth={3} />
                                  ) : saving ? (
                                    <RefreshCw className="w-3 h-3 animate-spin text-aletis-grafite-claro" />
                                  ) : null}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p
                                    className={`text-sm font-body leading-relaxed ${
                                      marcado
                                        ? 'text-aletis-grafite-claro line-through'
                                        : 'text-aletis-grafite-escuro'
                                    }`}
                                  >
                                    {item.label}
                                  </p>
                                  {item.requiresUpload && (
                                    <p className="text-[10px] font-body text-aletis-grafite-claro mt-0.5 flex items-center gap-1">
                                      <Upload className="w-3 h-3" /> documento esperado
                                    </p>
                                  )}
                                  {item.acceptsObservacao && (
                                    <div className="mt-2">
                                      <textarea
                                        value={obsDraftVal ?? obsCurrent}
                                        onChange={(e) =>
                                          setObsDraft((d) => ({ ...d, [item.id]: e.target.value }))
                                        }
                                        onBlur={() => isDirty && saveObservacao(item)}
                                        placeholder="Observação opcional…"
                                        rows={1}
                                        className="w-full text-xs font-body p-2 rounded-md border border-aletis-grafite-claro/20 focus:border-aletis-verde focus:outline-none focus:ring-1 focus:ring-aletis-verde/30 bg-aletis-cream/20 resize-y"
                                      />
                                      {isDirty && (
                                        <button
                                          type="button"
                                          onClick={() => saveObservacao(item)}
                                          className="mt-1 text-[10px] font-body font-medium text-aletis-verde hover:underline"
                                        >
                                          Salvar observação
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {st?.atualizadoEm && (
                                    <p className="text-[9px] text-aletis-grafite-claro mt-1.5 tabular-nums">
                                      atualizado: {new Date(st.atualizadoEm).toLocaleString('pt-BR')}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t border-aletis-grafite-claro/15 flex items-center justify-between gap-3 flex-shrink-0 bg-aletis-cream/20">
          <div className="text-xs font-body text-aletis-grafite-claro">
            {data?.state?.status === 'concluido' ? (
              <span className="inline-flex items-center gap-1 text-aletis-verde font-semibold">
                <CheckCircle2 className="w-4 h-4" /> Checklist concluído
              </span>
            ) : data?.state ? (
              <span className="inline-flex items-center gap-1">
                <Circle className="w-4 h-4 text-aletis-grafite-claro" /> Em andamento
              </span>
            ) : (
              'Salva automaticamente ao marcar/observar'
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadPreenchido}
              className="px-3 py-1.5 rounded-lg text-xs font-body font-medium text-aletis-grafite-escuro hover:bg-aletis-grafite-escuro/5 border border-aletis-grafite-claro/20 inline-flex items-center gap-1.5 transition-colors"
              title="Baixar arquivo .docx oficial preenchido (sem o estado dos itens — só identificação)"
            >
              <Download className="w-3.5 h-3.5" /> Baixar .docx
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-body font-medium bg-aletis-verde text-white hover:bg-aletis-verde-escuro transition-colors"
            >
              Fechar
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
