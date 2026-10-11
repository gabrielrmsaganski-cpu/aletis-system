// ============================================================
// ChecklistInterativo — UI dos checklists R.OP.003/004/005/009
// (preenchimento item-a-item com observação + persistência PG).
// ============================================================
import { useEffect, useState, useMemo } from 'react'
import { apiFetch } from '../../hooks/useApi'
import {
  Check,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Upload,
  RefreshCw,
  Download,
  ListChecks,
} from 'lucide-react'
import MotionDialog from '../ui/MotionDialog'
import { motion } from 'framer-motion'

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

const checklistSecondaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3.5 text-xs font-semibold text-foreground transition hover:bg-aletis-cream-papel disabled:cursor-not-allowed disabled:opacity-50'
const checklistPanelClass = 'rounded-lg border border-aletis-borda bg-card p-4 shadow-none'
const checklistLabelClass = 'text-[11px] font-body font-semibold uppercase text-muted-foreground'

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

  const footer = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs font-body text-muted-foreground">
        {data?.state?.status === 'concluido' ? (
          <span className="inline-flex items-center gap-1 text-foreground font-semibold">
            <CheckCircle2 className="w-4 h-4" /> Checklist concluído
          </span>
        ) : data?.state ? (
          <span className="inline-flex items-center gap-1">
            <Circle className="w-4 h-4 text-muted-foreground" /> Em andamento
          </span>
        ) : (
          'Salva automaticamente ao marcar/observar'
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={downloadPreenchido}
          className={checklistSecondaryButtonClass}
          title="Baixar arquivo .docx oficial preenchido (sem o estado dos itens — só identificação)"
        >
          <Download className="w-3.5 h-3.5" /> Baixar .docx
        </motion.button>
      </div>
    </div>
  )

  return (
    <MotionDialog
      title={template.nome}
      eyebrow={`${template.codigo} · CHECKLIST INTERATIVO`}
      icon={<ListChecks className="h-5 w-5" />}
      onClose={onClose}
      size="full"
      swipeToDismiss={!savingId}
      footer={footer}
      bodyClassName="space-y-4 bg-aletis-cream-papel/35"
    >
      {data && (
        <section className={checklistPanelClass}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className={checklistLabelClass}>Checklist operacional</p>
              <h3 className="mt-1 break-words font-display text-lg font-bold text-foreground">
                {data.template.nome}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-soft)]">
                {data.template.descricao || 'Marque cada item, registre observações e baixe o documento oficial preenchido.'}
              </p>
            </div>
            <div className="grid min-w-0 grid-cols-3 gap-2 lg:min-w-[360px]">
              <ChecklistMini label="Itens" value={`${total}`} />
              <ChecklistMini label="Concluídos" value={`${totalConcluidos}`} />
              <ChecklistMini label="Progresso" value={`${Math.round(progresso * 100)}%`} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-aletis-borda">
              <div
                className="h-full rounded-full bg-aletis-verde transition-all"
                style={{ width: `${progresso * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-body font-semibold tabular-nums text-foreground">
              {totalConcluidos}/{total}
            </span>
          </div>
        </section>
      )}

      <div>
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
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
                  <section key={etapa} className="overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-none">
                    <button
                      type="button"
                      onClick={() => setCollapsed((c) => ({ ...c, [etapa]: !c[etapa] }))}
                      className="w-full px-4 py-3 bg-aletis-cream-papel/65 hover:bg-aletis-cream-papel flex items-center justify-between text-left transition-colors"
                    >
                      <div className="flex items-center gap-2">
                          <span className="text-sm font-display font-semibold text-foreground">
                          {etapa}
                        </span>
                        <span className="text-[11px] tabular-nums px-2 py-0.5 rounded-full bg-aletis-verde/10 text-foreground font-semibold">
                          {concEt}/{totalEt}
                        </span>
                      </div>
                      {isCollapsed ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
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
                            <li key={item.id} className="px-4 py-3.5">
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggleItem(item, !marcado)}
                                  disabled={saving}
                                  className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                                    marcado
                                      ? 'bg-aletis-verde text-white'
                                      : 'bg-card border border-aletis-borda hover:border-aletis-verde'
                                  } ${saving ? 'opacity-50' : ''}`}
                                  aria-label={marcado ? 'Desmarcar' : 'Marcar'}
                                >
                                  {marcado ? (
                                    <Check className="w-3 h-3" strokeWidth={3} />
                                  ) : saving ? (
                                    <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                                  ) : null}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p
                                    className={`text-sm font-body leading-relaxed ${
                                      marcado
                                        ? 'text-muted-foreground line-through'
                                        : 'text-foreground'
                                    }`}
                                  >
                                    {item.label}
                                  </p>
                                  {item.requiresUpload && (
                                    <p className="text-[11px] font-body text-muted-foreground mt-0.5 flex items-center gap-1">
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
                                    className="w-full resize-y rounded-xl border border-aletis-borda bg-card p-2.5 text-xs font-body text-foreground outline-none transition placeholder:text-aletis-grafite-claro/70 focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/20"
                                      />
                                      {isDirty && (
                                        <button
                                          type="button"
                                          onClick={() => saveObservacao(item)}
                                          className="mt-1 text-[11px] font-body font-medium text-foreground hover:underline"
                                        >
                                          Salvar observação
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {st?.atualizadoEm && (
                                    <p className="text-[11px] text-muted-foreground mt-1.5 tabular-nums">
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
    </MotionDialog>
  )
}

function ChecklistMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-aletis-borda bg-aletis-cream-papel/55 px-3 py-2">
      <p className={checklistLabelClass}>{label}</p>
      <p className="mt-1 break-words font-display text-sm font-bold text-foreground">{value}</p>
    </div>
  )
}
