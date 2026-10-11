// ============================================================
// TableEditor — editor genérico de listagens com:
//   - Inline edit (auto-save onBlur)
//   - Bulk paste (TSV/CSV) integrado
//   - Validação por coluna (number/date/select/text)
//   - Empty state guiado
//   - Toolbar com totais customizáveis
// ============================================================
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { Plus, Trash2, ClipboardPaste, RefreshCw, Loader2, AlertTriangle, Search, CheckCircle2 } from 'lucide-react'

const BulkPasteEditor = lazy(() => import('./BulkPasteEditor'))

export interface TableColumn<T = any> {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options?: Array<{ value: string; label: string }>
  width?: string                // ex: 'w-32'
  align?: 'left' | 'right' | 'center'
  required?: boolean
  default?: string | number | boolean
  format?: (v: any) => string   // exibição (ex: BRL)
  computed?: (row: T) => string | number  // campo só-leitura calculado
  hideInBulk?: boolean
}

interface Props<T extends Record<string, any>> {
  title: string
  emoji?: string
  subtitle?: string
  /** endpoint REST base (ex: '/gestao-financeira/grupos/:id/passivos-outros').
   *  POST: create. PATCH /endpointSingle/:id: update. DELETE /endpointSingle/:id: delete.
   *  Bulk: POST /endpointBulk com { rows: [...] }.
   */
  baseEndpoint: string
  /** prefixo para PATCH/DELETE individual (ex: '/gestao-financeira/passivos-outros') */
  itemEndpoint: string
  /** endpoint para bulk paste (opcional) */
  bulkEndpoint?: string
  /** chave do array no response — items|culturas|contratos|etc */
  responseKey: string
  columns: TableColumn<T>[]
  /** valores default para nova linha */
  newRowDefaults: Partial<T>
  /** mostra totais no rodapé — keys de colunas number a somar */
  showTotals?: string[]
  /** props adicionais ao corpo */
  emptyStateMsg?: string
}

export default function TableEditor<T extends Record<string, any>>(props: Props<T>) {
  const {
    title, emoji, subtitle, baseEndpoint, itemEndpoint, bulkEndpoint,
    responseKey, columns, newRowDefaults, showTotals, emptyStateMsg,
  } = props
  const [items, setItems] = useState<T[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const reload = useCallback(async () => {
    try {
      const r = await apiFetch<any>(baseEndpoint)
      setItems(r[responseKey] ?? [])
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }, [baseEndpoint, responseKey])

  useEffect(() => {
    reload()
  }, [reload])

  async function adicionar() {
    setAdding(true)
    try {
      await apiFetch(baseEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRowDefaults),
      })
      await reload()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setAdding(false)
    }
  }

  async function patchItem(id: string, patch: Partial<T>) {
    setSavingId(id)
    try {
      await apiFetch(`${itemEndpoint}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setSavingId(null)
    }
  }

  async function remover(id: string) {
    setSavingId(id)
    try {
      await apiFetch(`${itemEndpoint}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      await reload()
    } finally {
      setSavingId(null)
    }
  }

  const allItems = items ?? []
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter((item) =>
      columns.some((col) => String((item as any)[col.key] ?? '').toLowerCase().includes(q)),
    )
  }, [allItems, columns, query])

  const requiredColumns = columns.filter((col) => col.required)
  const completeRows = requiredColumns.length === 0
    ? allItems.length
    : allItems.filter((item) => requiredColumns.every((col) => {
        const value = (item as any)[col.key]
        return value !== null && value !== undefined && String(value).trim() !== ''
      })).length
  const completionPct = allItems.length === 0 ? 0 : Math.round((completeRows / allItems.length) * 100)

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700">{error}</div>
  if (!items) {
    return (
      <div className="space-y-2 rounded-lg border border-aletis-borda bg-card p-6 shadow-none">
        <div className="h-4 w-1/3 bg-gray-100 animate-pulse rounded" />
        <div className="h-32 bg-gray-50 animate-pulse rounded" />
      </div>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-display font-semibold text-foreground">
            {emoji && <span className="mr-1">{emoji}</span>}
            {title} ({items.length})
          </h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
          {items.length > 0 && requiredColumns.length > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-aletis-borda bg-aletis-cream/30 px-2 py-1 text-[11px] font-body text-[var(--text-soft)]">
              <CheckCircle2 className={`h-3 w-3 ${completionPct >= 90 ? 'text-emerald-600' : completionPct >= 50 ? 'text-amber-600' : 'text-red-600'}`} />
              {completionPct}% das linhas com campos obrigatórios
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {items.length > 0 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar linhas..."
                className="h-9 w-full rounded-xl border border-aletis-borda bg-card py-1.5 pl-8 pr-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-aletis-verde/20 sm:w-48"
              />
            </div>
          )}
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-aletis-bege/55 transition-colors"
            title="Recarregar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {bulkEndpoint && (
            <button
              type="button"
              onClick={() => setShowBulk(true)}
              className="inline-flex h-9 items-center gap-1 rounded-xl bg-aletis-dourado/15 px-3 text-xs font-body font-semibold text-foreground hover:bg-aletis-dourado/25"
              title="Cole linhas do Excel/Sheets"
            >
              <ClipboardPaste className="w-3 h-3" /> Paste do Excel
            </button>
          )}
          <button
            type="button"
            onClick={adicionar}
            disabled={adding}
            className="inline-flex h-9 items-center gap-1 rounded-xl bg-aletis-verde/10 px-3 text-xs font-body font-semibold text-foreground hover:bg-aletis-verde/20 disabled:opacity-50"
          >
            <Plus className="w-3 h-3" /> Adicionar
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState msg={emptyStateMsg ?? `Nenhum registro. Clique em "Adicionar" ou cole linhas do Excel.`} />
      ) : filteredItems.length === 0 ? (
        <EmptyState msg="Nenhuma linha corresponde ao filtro atual." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-aletis-borda/70">
          <table className="ui-table w-full text-xs font-body">
            <thead className="bg-aletis-cream/40">
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-aletis-grafite-claro/15">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`py-2 px-1 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    {c.label}
                    {c.required && <span className="text-red-600">*</span>}
                  </th>
                ))}
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <Row
                  key={item.id}
                  row={item}
                  columns={columns}
                  onPatch={(p) => patchItem(item.id, p)}
                  onDelete={() => remover(item.id)}
                  saving={savingId === item.id}
                />
              ))}
            </tbody>
            {showTotals && showTotals.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-aletis-grafite-claro/20 font-semibold">
                  {columns.map((c, idx) => {
                    if (idx === 0) return <td key={c.key} className="py-2 px-1 text-[11px]">TOTAL</td>
                    if (showTotals.includes(c.key)) {
                      const total = filteredItems.reduce((acc, it) => acc + parseFloat(String((it as any)[c.key] ?? 0) || '0'), 0)
                      return (
                        <td key={c.key} className={`py-2 px-1 tabular-nums text-[11px] ${c.align === 'right' ? 'text-right' : ''}`}>
                          {c.format ? c.format(total) : total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                        </td>
                      )
                    }
                    return <td key={c.key}></td>
                  })}
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {showBulk && bulkEndpoint && (
        <Suspense fallback={null}>
          <BulkPasteEditor
            title={`Importar ${title} do Excel`}
            endpoint={bulkEndpoint}
            columns={columns
              .filter((c) => !c.hideInBulk && !c.computed)
              .map((c) => ({
                key: c.key,
                label: c.label,
                type: c.type === 'select' ? 'text' : c.type === 'boolean' ? 'text' : c.type as any,
                required: c.required,
                default: c.default ? String(c.default) : undefined,
              }))}
            onClose={() => setShowBulk(false)}
            onSuccess={() => { reload(); setShowBulk(false) }}
          />
        </Suspense>
      )}
    </section>
  )
}

function Row<T extends Record<string, any>>({
  row, columns, onPatch, onDelete, saving,
}: {
  row: T
  columns: TableColumn<T>[]
  onPatch: (patch: Partial<T>) => void
  onDelete: () => void
  saving: boolean
}) {
  const [local, setLocal] = useState<T>(row)
  // sincroniza quando row externa muda
  useEffect(() => { setLocal(row) }, [row])

  function commit(key: string, value: any) {
    if (local[key] === value) return
    onPatch({ [key]: value } as any)
  }

  return (
    <tr className="border-b border-aletis-grafite-claro/10 hover:bg-aletis-cream/20">
      {columns.map((c) => (
        <td
          key={c.key}
          className={`py-1 px-1 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}
        >
          <Cell
            column={c}
            row={local}
            invalid={!!c.required && (local[c.key] === null || local[c.key] === undefined || String(local[c.key]).trim() === '')}
            onChange={(v) => setLocal((s) => ({ ...s, [c.key]: v }))}
            onCommit={(v) => commit(c.key, v)}
          />
        </td>
      ))}
      <td className="py-1 px-1">
        {saving ? (
          <Loader2 className="w-3 h-3 animate-spin text-foreground" />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (confirm('Excluir este registro?')) onDelete()
            }}
            className="text-muted-foreground hover:text-red-600"
            aria-label="Excluir"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </td>
    </tr>
  )
}

function Cell<T>({
  column, row, invalid, onChange, onCommit,
}: {
  column: TableColumn<T>
  row: T
  invalid?: boolean
  onChange: (v: any) => void
  onCommit: (v: any) => void
}) {
  const value = (row as any)[column.key]
  const invalidClass = invalid ? 'border-red-300 bg-red-50/70 focus:ring-red-200' : ''

  if (column.computed) {
    const v = column.computed(row)
    return (
      <span className="tabular-nums text-muted-foreground italic">
        {column.format ? column.format(v) : String(v ?? '—')}
      </span>
    )
  }

  if (column.type === 'select') {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => { onChange(e.target.value); onCommit(e.target.value) }}
        className={`input-cell ${column.width ?? ''} ${invalidClass}`}
      >
        <option value="">—</option>
        {column.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    )
  }

  if (column.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => { onChange(e.target.checked); onCommit(e.target.checked) }}
        className="rounded"
      />
    )
  }

  if (column.type === 'number') {
    return (
      <input
        type="number"
        step="0.0001"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value === '' ? null : e.target.value)}
        className={`input-cell ${column.width ?? 'w-24'} ${column.align === 'right' ? 'text-right' : ''} tabular-nums ${invalidClass}`}
        placeholder={column.default !== undefined ? String(column.default) : ''}
      />
    )
  }

  if (column.type === 'date') {
    return (
      <input
        type="date"
        value={value ? String(value).slice(0, 10) : ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value || null)}
        className={`input-cell ${column.width ?? 'w-32'} ${invalidClass}`}
      />
    )
  }

  return (
    <input
      type="text"
      value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    onBlur={(e) => onCommit(e.target.value || null)}
    className={`input-cell ${column.width ?? 'w-32'} ${invalidClass}`}
    placeholder={column.default !== undefined ? String(column.default) : ''}
  />
  )
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-dashed border-aletis-grafite-claro/30 p-8 text-center bg-aletis-cream/20">
      <AlertTriangle className="w-6 h-6 text-aletis-grafite-claro/40 mx-auto mb-2" />
      <p className="text-xs font-body text-muted-foreground">{msg}</p>
    </div>
  )
}
