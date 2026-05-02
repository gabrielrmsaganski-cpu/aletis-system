// ============================================================
// ImportXlsmModal — upload de R.OP.001 v2.0 preenchido
// e parse server-side
// ============================================================
import { useState } from 'react'
import { X, Upload, Check, AlertTriangle, Loader2 } from 'lucide-react'

interface Props {
  grupoId: string
  onClose: () => void
  onSuccess: () => void
}

export default function ImportXlsmModal({ grupoId, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [versao, setVersao] = useState<'v1' | 'v2'>('v2')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload() {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const resp = await fetch(`/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/import-xlsm?versao=${versao}`, {
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
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl">
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-center justify-between">
          <div>
            <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro">📤 Importar R.OP.001 .xlsm</h2>
            <p className="text-[11px] text-aletis-grafite-claro">Upload do diagnóstico preenchido pelo cliente</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center">
            <X className="w-5 h-5 text-aletis-grafite-claro" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900">
            <strong>Atenção:</strong> os dados serão somados aos existentes (não há replace). Para começar do zero, delete o grupo antes de importar.
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-aletis-grafite-claro font-semibold">Versão da planilha</label>
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
            <label className="text-[11px] uppercase tracking-wider text-aletis-grafite-claro font-semibold">Arquivo .xlsm</label>
            <input
              type="file"
              accept=".xlsm,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full mt-1 text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-aletis-verde/10 file:text-aletis-verde file:font-semibold hover:file:bg-aletis-verde/20"
            />
            {file && (
              <p className="text-[10px] text-aletis-grafite-claro mt-1">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {result && (
            <div className="rounded-lg bg-aletis-verde/10 border border-aletis-verde/30 p-3 text-xs text-aletis-verde space-y-1">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                <strong>Importação concluída</strong>
              </div>
              <ul className="text-[11px] space-y-0.5 mt-1">
                <li>Membros: {result.imported.membros}</li>
                <li>Culturas: {result.imported.culturas}</li>
                <li>Contratos: {result.imported.contratos}</li>
                <li>Custos: {result.imported.custos}</li>
                <li>Fazendas: {result.imported.fazendas}</li>
                <li>Demandas: {result.imported.demandas}</li>
              </ul>
              {result.warnings?.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">⚠ {result.warnings.length} avisos</summary>
                  <ul className="text-[10px] list-disc list-inside mt-1">
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
