// ============================================================
// BulkPasteEditor — paste do Excel (TSV/CSV) em qualquer
// listagem (culturas, custos, contratos, fazendas).
// ============================================================
import { useState } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { ClipboardPaste, X, Check, AlertTriangle, Loader2 } from 'lucide-react'

export interface BulkColumn {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select'
  options?: string[]      // se type=select
  required?: boolean
  default?: string
}

interface Props {
  title: string
  columns: BulkColumn[]
  endpoint: string         // ex: /gestao-financeira/grupos/:id/culturas/bulk
  onClose: () => void
  onSuccess: (count: number) => void
}

export default function BulkPasteEditor({ title, columns, endpoint, onClose, onSuccess }: Props) {
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<any[][] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; errors: string[] } | null>(null)

  function parsePaste(text: string) {
    const lines = text
      .split('\n')
      .map((l) => l.replace(/\r$/, '').trim())
      .filter((l) => l.length > 0)
    // Detecta separador: tab tem prioridade, depois vírgula, depois ponto-e-vírgula
    const sep = lines[0]?.includes('\t') ? '\t' : lines[0]?.includes(';') ? ';' : ','
    const rows = lines.map((l) => l.split(sep).map((c) => c.trim()))
    setParsed(rows)
    const errs: string[] = []
    if (rows.length === 0) errs.push('Nada para colar')
    else if (rows[0].length < columns.filter((c) => c.required).length) {
      errs.push(`Esperadas ao menos ${columns.filter((c) => c.required).length} colunas, recebidas ${rows[0].length}`)
    }
    setErrors(errs)
  }

  function rowsToObjects(): any[] {
    if (!parsed) return []
    // Detecta se primeira linha é header (todas células texto não-numéricos)
    const first = parsed[0]
    const headerLooksLikeText = first.every((c) => isNaN(parseFloat(c)) || c.length > 0 && /[a-záéíóúâêôãõç]/i.test(c))
    const dataRows = headerLooksLikeText ? parsed.slice(1) : parsed
    const out: any[] = []
    for (const row of dataRows) {
      const obj: any = {}
      for (const [idx, col] of columns.entries()) {
        const raw = row[idx] ?? ''
        if (col.type === 'number') {
          const n = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
          obj[col.key] = isFinite(n) ? n : null
        } else if (col.type === 'date') {
          // Aceita DD/MM/YYYY ou YYYY-MM-DD
          const m1 = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
          if (m1) obj[col.key] = `${m1[3]}-${m1[2]}-${m1[1]}`
          else obj[col.key] = raw
        } else {
          obj[col.key] = raw
        }
      }
      out.push(obj)
    }
    return out
  }

  async function submit() {
    setSubmitting(true)
    setResult(null)
    try {
      const rows = rowsToObjects()
      const r = await apiFetch<{ inserted: number; errors: string[] }>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      setResult(r)
      if (r.inserted > 0) onSuccess(r.inserted)
    } catch (e: any) {
      setErrors([String(e?.message ?? e)])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-mono font-semibold text-foreground uppercase">📋 Bulk Paste do Excel</p>
            <h2 className="text-base font-display font-semibold text-foreground">{title}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Schema */}
          <div className="rounded-lg bg-aletis-cream/30 border border-aletis-grafite-claro/15 p-3">
            <p className="text-[11px] font-body font-semibold text-foreground mb-1.5">
              Cole {columns.length} colunas (separadas por TAB ou vírgula), uma linha por registro:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {columns.map((c) => (
                <span
                  key={c.key}
                  className={`px-1.5 py-0.5 text-[11px] font-mono rounded ${c.required ? 'bg-aletis-verde/15 text-foreground' : 'bg-aletis-grafite-claro/10 text-foreground'}`}
                >
                  {c.label}
                  {c.required && <span className="text-red-600">*</span>}
                  <span className="opacity-60"> ({c.type})</span>
                </span>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value)
              parsePaste(e.target.value)
            }}
            placeholder="Cole aqui (Ctrl+V) os dados do Excel/Sheets…"
            rows={8}
            className="w-full rounded-lg border border-aletis-grafite-claro/20 p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-aletis-verde/30"
          />

          {/* Erros */}
          {errors.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1">
              {errors.map((e, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          {parsed && parsed.length > 0 && (
            <div className="rounded-lg border border-aletis-grafite-claro/15 overflow-x-auto">
              <table className="ui-table w-full text-[11px] font-body">
                <thead className="bg-aletis-cream/40">
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key} className="text-left px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="border-t border-aletis-grafite-claro/10">
                      {columns.map((c, ci) => (
                        <td key={c.key} className="px-2 py-1 tabular-nums">
                          {row[ci] ?? <span className="text-aletis-grafite-claro/50">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {parsed.length > 10 && (
                    <tr>
                      <td colSpan={columns.length} className="text-center py-1.5 text-[11px] text-muted-foreground">
                        ... +{parsed.length - 10} linhas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div className={`rounded-lg p-3 text-xs ${result.inserted > 0 ? 'bg-aletis-verde/10 border border-aletis-verde/30 text-foreground' : 'bg-amber-50 border border-amber-300 text-amber-800'}`}>
              <div className="flex items-center gap-2 mb-1">
                {result.inserted > 0 ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                <strong>{result.inserted} registros inseridos</strong>
              </div>
              {result.errors.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px]">⚠ {result.errors.length} erros</summary>
                  <ul className="mt-1 space-y-0.5 text-[11px] list-disc list-inside">
                    {result.errors.slice(0, 10).map((e, idx) => <li key={idx}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t border-aletis-grafite-claro/15 bg-aletis-cream/20 flex items-center justify-between">
          <div className="text-[11px] font-body text-muted-foreground">
            {parsed ? `${parsed.length} linhas detectadas` : 'aguardando paste'}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-body font-medium border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5">
              {result?.inserted ? 'Concluir' : 'Cancelar'}
            </button>
            <button
              onClick={submit}
              disabled={submitting || !parsed || parsed.length === 0 || errors.length > 0}
              className="px-4 py-1.5 rounded-lg text-xs font-body font-semibold bg-aletis-verde text-white hover:bg-aletis-verde-escuro inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardPaste className="w-3.5 h-3.5" />}
              Importar {parsed?.length ?? 0} linhas
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
