// ============================================================
// TableEditor — editor genérico de listagens com:
//   - Inline edit (auto-save onBlur)
//   - Bulk paste (TSV/CSV) integrado
//   - Validação por coluna (number/date/select/text)
//   - Empty state guiado
//   - Toolbar com totais customizáveis
// ============================================================
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { Plus, Trash2, ClipboardPaste, RefreshCw, Loader2, AlertTriangle } from 'lucide-react'

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

  if (error) return <div className="card-premium p-4 text-xs text-red-600">{error}</div>
  if (!items) {
    return (
      <div className="card-premium p-6 space-y-2">
        <div className="h-4 w-1/3 bg-gray-100 animate-pulse rounded" />
        <div className="h-32 bg-gray-50 animate-pulse rounded" />
      </div>
    )
  }

  return (
    <section className="card-premium p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">
            {emoji && <span className="mr-1">{emoji}</span>}
            {title} ({items.length})
          </h3>
          {subtitle && <p className="text-[10px] text-aletis-grafite-claro mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={reload}
            className="px-2 py-1 rounded-lg text-aletis-grafite-claro hover:bg-aletis-grafite-escuro/5 transition-colors"
            title="Recarregar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {bulkEndpoint && (
            <button
              type="button"
              onClick={() => setShowBulk(true)}
              className="px-3 py-1 rounded-lg bg-aletis-dourado/15 text-aletis-grafite-escuro text-xs font-body font-semibold hover:bg-aletis-dourado/25 inline-flex items-center gap-1"
              title="Cole linhas do Excel/Sheets"
            >
              <ClipboardPaste className="w-3 h-3" /> Paste do Excel
            </button>
          )}
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

      {items.length === 0 ? (
        <EmptyState msg={emptyStateMsg ?? `Nenhum registro. Clique em "Adicionar" ou cole linhas do Excel.`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-body">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-aletis-grafite-claro border-b border-aletis-grafite-claro/15">
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
              {items.map((item) => (
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
                      const total = items.reduce((acc, it) => acc + parseFloat(String((it as any)[c.key] ?? 0) || '0'), 0)
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
            onChange={(v) => setLocal((s) => ({ ...s, [c.key]: v }))}
            onCommit={(v) => commit(c.key, v)}
          />
        </td>
      ))}
      <td className="py-1 px-1">
        {saving ? (
          <Loader2 className="w-3 h-3 animate-spin text-aletis-verde" />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (confirm('Excluir este registro?')) onDelete()
            }}
            className="text-aletis-grafite-claro hover:text-red-600"
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
  column, row, onChange, onCommit,
}: {
  column: TableColumn<T>
  row: T
  onChange: (v: any) => void
  onCommit: (v: any) => void
}) {
  const value = (row as any)[column.key]

  if (column.computed) {
    const v = column.computed(row)
    return (
      <span className="tabular-nums text-aletis-grafite-claro italic">
        {column.format ? column.format(v) : String(v ?? '—')}
      </span>
    )
  }

  if (column.type === 'select') {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => { onChange(e.target.value); onCommit(e.target.value) }}
        className={`input-cell ${column.width ?? ''}`}
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
        className={`input-cell ${column.width ?? 'w-24'} ${column.align === 'right' ? 'text-right' : ''} tabular-nums`}
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
        className={`input-cell ${column.width ?? 'w-32'}`}
      />
    )
  }

  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onCommit(e.target.value || null)}
      className={`input-cell ${column.width ?? 'w-32'}`}
      placeholder={column.default !== undefined ? String(column.default) : ''}
    />
  )
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-dashed border-aletis-grafite-claro/30 p-8 text-center bg-aletis-cream/20">
      <AlertTriangle className="w-6 h-6 text-aletis-grafite-claro/40 mx-auto mb-2" />
      <p className="text-xs font-body text-aletis-grafite-claro">{msg}</p>
    </div>
  )
}
