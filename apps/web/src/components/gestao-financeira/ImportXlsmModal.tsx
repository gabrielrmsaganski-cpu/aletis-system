// ============================================================
// ImportXlsmModal — upload de R.OP.001 v2.0 preenchido
// e parse server-side
// ============================================================
import { useState } from 'react'
import { X, Upload, Check, AlertTriangle, Loader2, FileSpreadsheet } from 'lucide-react'

interface Props {
  grupoId: string
  onClose: () => void
  onSuccess: () => void
}

export default function ImportXlsmModal({ grupoId, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [versao, setVersao] = useState<'v1' | 'v2'>('v2')
  const [replaceExisting, setReplaceExisting] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)

  const counters = result?.imported
    ? [
        ['Membros', result.imported.membros],
        ['Culturas', result.imported.culturas],
        ['Contratos', result.imported.contratos],
        ['Custos', result.imported.custos],
        ['Fazendas', result.imported.fazendas],
        ['Demandas', result.imported.demandas],
        ['Ativos extras', result.imported.ativosOutros],
        ['Passivos extras', result.imported.passivosOutros],
        ['Garantias', result.imported.garantias],
        ['Premissas', result.imported.premissas],
      ]
    : []

  async function upload() {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const params = new URLSearchParams({
        versao,
        replaceExisting: replaceExisting ? '1' : '0',
      })
      const resp = await fetch(`/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/import-xlsm?${params.toString()}`, {
        method: 'POST',
        body: fd,
      })
      const json = await resp.json()
      if (!resp.ok || !json.success) {
        throw new Error(json.error || `HTTP ${resp.status}`)
      }
      setResult(json.data)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card rounded-lg w-full max-w-2xl shadow-2xl">
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-center justify-between">
          <div>
            <h2 className="text-base font-display font-semibold text-foreground inline-flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-foreground" />
              Importar R.OP.001 .xlsm
            </h2>
            <p className="text-[11px] text-muted-foreground">Upload do diagnóstico preenchido pelo cliente</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900">
            <strong>Atenção:</strong> por padrão esta importação substitui os dados operacionais do grupo antes de carregar a planilha. Desmarque essa opção apenas para somar dados complementares.
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Versão da planilha</label>
            <div className="flex gap-2 mt-1">
              {(['v2', 'v1'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVersao(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-body ${versao === v ? 'bg-aletis-verde text-white' : 'border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5'}`}
                >
                  {v === 'v2' ? 'R.OP.001 v2.0 (28 sheets)' : 'R.OP.001 v1.0 (17 sheets)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Arquivo .xlsm</label>
            <input
              type="file"
              accept=".xlsm,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full mt-1 text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-aletis-verde/10 file:text-aletis-verde file:font-semibold hover:file:bg-aletis-verde/20"
            />
            {file && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-aletis-grafite-claro/15 bg-aletis-cream/20 p-3">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-foreground">
              <strong>Reimportação limpa:</strong> apagar membros, safras, custos, demandas, dívidas,
              fazendas, passivos, garantias, premissas, insights e snapshots antes de importar.
            </span>
          </label>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {result && (
            <div className="rounded-lg bg-aletis-verde/10 border border-aletis-verde/30 p-3 text-xs text-foreground space-y-1">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                <strong>Importação concluída</strong>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                {counters.map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-white/70 border border-aletis-verde/20 p-2">
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                    <div className="text-sm font-semibold text-foreground">{value ?? 0}</div>
                  </div>
                ))}
              </div>
              {result.coverage && (
                <div className="mt-2 rounded-lg bg-white/70 border border-aletis-verde/20 p-2 text-[11px] text-foreground">
                  <div>
                    {result.coverage.sheetsRead?.length ?? 0} de {result.coverage.workbookSheets ?? 0} abas lidas ·{' '}
                    {result.coverage.formulasDetected?.toLocaleString('pt-BR') ?? 0} fórmulas detectadas ·{' '}
                    macros {result.coverage.macrosDetected ? 'detectadas' : 'não detectadas'}
                  </div>
                  {result.coverage.sheetsRead?.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer">Ver abas processadas</summary>
                      <p className="mt-1 leading-relaxed">{result.coverage.sheetsRead.join(', ')}</p>
                    </details>
                  )}
                </div>
              )}
              {result.warnings?.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">{result.warnings.length} avisos</summary>
                  <ul className="text-[11px] list-disc list-inside mt-1">
                    {result.warnings.slice(0, 10).map((w: string, i: number) => <li key={i}>{w}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-aletis-grafite-claro/15 bg-aletis-cream/20 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs border border-aletis-grafite-claro/20 hover:bg-aletis-grafite-escuro/5"
          >
            {result ? 'Concluir' : 'Cancelar'}
          </button>
          {result ? (
            <button
              type="button"
              onClick={onSuccess}
              className="px-4 py-1.5 rounded-lg text-xs bg-aletis-verde text-white font-semibold hover:bg-aletis-verde-escuro"
            >
              Atualizar dashboard
            </button>
          ) : (
            <button
              type="button"
              onClick={upload}
              disabled={!file || uploading}
              className="px-4 py-1.5 rounded-lg text-xs bg-aletis-verde text-white font-semibold hover:bg-aletis-verde-escuro inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Importar
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
