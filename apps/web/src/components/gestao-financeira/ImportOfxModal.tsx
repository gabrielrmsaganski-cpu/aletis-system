// ============================================================
// ImportOfxModal — upload de extrato bancário OFX, parse e
// categorização heurística antes de aplicar como gf_custo_safra.
// ============================================================
import { useState } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { Upload, Check, Loader2, Banknote } from 'lucide-react'
import AppDialog from '../ui/AppDialog'

interface OfxParsed {
  banco?: string
  conta?: string
  agencia?: string
  saldoFinal?: number
  saldoData?: string
  totalCreditos: number
  totalDebitos: number
  transacoesCount: number
  warnings: string[]
  resumoPorCategoria: Array<{ categoria: string; tipo: string; total: number; count: number; exemplos: string[] }>
  amostra: Array<{ tipo: string; data: string; valor: number; memo?: string; categoria: string }>
}

interface Props {
  grupoId: string
  onClose: () => void
  onSuccess: () => void
}

export default function ImportOfxModal({ grupoId, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<OfxParsed | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [safra, setSafra] = useState('24/25')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ inserted: number; errors: string[] } | null>(null)

  async function upload() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const resp = await fetch('/api/gestao-financeira/parse-ofx', { method: 'POST', body: fd })
      const json = await resp.json()
      if (!resp.ok || !json.success) throw new Error(json.error || `HTTP ${resp.status}`)
      setParsed(json.data)
      // por padrão pré-seleciona todas categorias com total > 1000
      setSelected(new Set(json.data.resumoPorCategoria.filter((c: any) => c.total > 1000).map((c: any) => c.categoria)))
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  async function aplicar() {
    if (!parsed) return
    setLoading(true)
    try {
      const categorias = parsed.resumoPorCategoria.filter((c) => selected.has(c.categoria))
      const r = await apiFetch<{ inserted: number; errors: string[] }>(`/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/import-ofx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorias, safra }),
      })
      setResult(r)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  function toggle(cat: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <AppDialog
      title="Importar Extrato OFX"
      subtitle="Bancos brasileiros exportam extratos no formato .ofx; o ALETIS faz a categorização automática."
      icon={<Banknote className="h-5 w-5" />}
      onClose={onClose}
      size="xl"
      bodyClassName="space-y-4"
    >
          {!parsed && (
            <>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Arquivo .ofx</label>
                <input
                  type="file"
                  accept=".ofx,.qfx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full mt-1 text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-aletis-verde/10 file:text-aletis-verde file:font-semibold"
                />
                {file && <p className="text-[11px] text-muted-foreground mt-1">{file.name}</p>}
              </div>
              {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={upload}
                  disabled={!file || loading}
                  className="px-4 py-1.5 rounded-lg text-xs bg-aletis-verde text-white font-semibold hover:bg-aletis-verde-escuro inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Analisar OFX
                </button>
              </div>
            </>
          )}

          {parsed && !result && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                <Stat label="Banco" value={parsed.banco ?? '—'} />
                <Stat label="Conta" value={parsed.conta ?? '—'} />
                <Stat label="Transações" value={String(parsed.transacoesCount)} />
                <Stat label="Saldo final" value={fmtBRL(parsed.saldoFinal ?? 0)} />
                <Stat label="Total créditos" value={fmtBRL(parsed.totalCreditos)} />
                <Stat label="Total débitos" value={fmtBRL(parsed.totalDebitos)} />
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Safra de destino</label>
                <input
                  type="text"
                  value={safra}
                  onChange={(e) => setSafra(e.target.value)}
                  placeholder="24/25"
                  className="mt-1 px-3 py-1.5 rounded-lg border border-aletis-grafite-claro/20 text-sm w-32"
                />
              </div>

              <div>
                <h3 className="text-xs font-display font-semibold text-foreground mb-2">
                  📊 Categorias detectadas — selecione as que deseja importar como custos:
                </h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {parsed.resumoPorCategoria.map((c) => (
                    <label
                      key={c.categoria}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-aletis-grafite-claro/15 hover:bg-aletis-cream/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.categoria)}
                        onChange={() => toggle(c.categoria)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs font-body font-semibold">{c.categoria}</span>
                          <span className="text-xs font-mono tabular-nums">{fmtBRL(c.total)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {c.count} transações · tipo: {c.tipo} · {c.exemplos.slice(0, 2).join(' / ')}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setParsed(null)} className="px-3 py-1.5 rounded-lg text-xs border border-aletis-grafite-claro/20">Voltar</button>
                <button
                  onClick={aplicar}
                  disabled={selected.size === 0 || loading}
                  className="px-4 py-1.5 rounded-lg text-xs bg-aletis-verde text-white font-semibold hover:bg-aletis-verde-escuro disabled:opacity-50"
                >
                  Importar {selected.size} categorias
                </button>
              </div>
            </>
          )}

          {result && (
            <div className="rounded-lg bg-aletis-verde/10 border border-aletis-verde/30 p-3 text-xs text-foreground">
              <div className="flex items-center gap-2 mb-1">
                <Check className="w-4 h-4" />
                <strong>{result.inserted} categorias importadas</strong>
              </div>
              {result.errors.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">⚠ {result.errors.length} erros</summary>
                  <ul className="text-[11px] list-disc list-inside mt-1">
                    {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
              <button
                type="button"
                onClick={onSuccess}
                className="mt-2 px-3 py-1 rounded-lg text-xs bg-aletis-verde text-white font-semibold hover:bg-aletis-verde-escuro"
              >
                Atualizar dashboard
              </button>
            </div>
          )}
    </AppDialog>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-premium p-2">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-display font-semibold tabular-nums truncate">{value}</p>
    </div>
  )
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
