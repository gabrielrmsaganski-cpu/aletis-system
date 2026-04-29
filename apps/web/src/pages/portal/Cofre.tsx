// ============================================================
// Portal — Cofre digital + Preview inline.
// ============================================================
// CofreDigital: lista uploads, busca, seleção múltipla, download
// individual e bulk (zip). Cada arquivo entra autenticado via JWT.
// PreviewModal: PDF (iframe) ou imagem (img), via blob URL revogada
// automaticamente ao desmontar.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { Vault, Download, Eye, PaperclipIcon as Paperclip } from 'lucide-react'
import type { UploadDTO } from './types'
import { fmtBytes, relativeTime } from './utils'

export function CofreDigital({ uploads, token }: { uploads: UploadDTO[]; token: string }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewing, setPreviewing] = useState<UploadDTO | null>(null)
  const [bulkDownloading, setBulkDownloading] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return uploads
    return uploads.filter(
      (u) =>
        u.nomeOriginal.toLowerCase().includes(q) ||
        (u.categoria ?? '').toLowerCase().includes(q),
    )
  }, [uploads, search])

  const allSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((u) => u.id)))
    }
  }
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Download autenticado de um único arquivo (em blob para forçar download). */
  const downloadOne = async (u: UploadDTO) => {
    if (!u.url) return null
    const r = await fetch(u.url, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return null
    return r.blob()
  }

  const handleSingleDownload = async (u: UploadDTO) => {
    const blob = await downloadOne(u)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = u.nomeOriginal
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2_000)
  }

  /** Bulk download — empacota selecionados num zip via JSZip. */
  const handleBulkDownload = async () => {
    if (selected.size === 0) return
    setBulkDownloading(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const items = uploads.filter((u) => selected.has(u.id))
      const queue = [...items]
      const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length > 0) {
          const u = queue.shift()
          if (!u) break
          const blob = await downloadOne(u).catch(() => null)
          if (blob) {
            const fname = ((): string => {
              let candidate = u.nomeOriginal
              let i = 1
              while (zip.file(candidate)) {
                const dot = u.nomeOriginal.lastIndexOf('.')
                candidate =
                  dot > 0
                    ? `${u.nomeOriginal.slice(0, dot)} (${i})${u.nomeOriginal.slice(dot)}`
                    : `${u.nomeOriginal} (${i})`
                i++
              }
              return candidate
            })()
            zip.file(fname, blob)
          }
        }
      })
      await Promise.all(workers)
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      const today = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `cofre-aletis-${today}.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4_000)
      setSelected(new Set())
    } finally {
      setBulkDownloading(false)
    }
  }

  const isPreviewableInline = (u: UploadDTO) => {
    const m = (u.mime || '').toLowerCase()
    return m.includes('pdf') || m.startsWith('image/')
  }

  return (
    <>
      <div className="card-premium p-6">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-aletis-sage/25 border border-aletis-sage/40 flex items-center justify-center">
            <Vault className="w-5 h-5 text-aletis-verde" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-bold text-aletis-verde">Meu cofre digital</p>
            <p className="font-body text-[12.5px] text-aletis-verde-medio">
              {uploads.length} arquivo{uploads.length !== 1 ? 's' : ''} ·{' '}
              {fmtBytes(uploads.reduce((s, u) => s + (u.tamanho || 0), 0))} no total
            </p>
          </div>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={handleBulkDownload}
              disabled={bulkDownloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-aletis-verde text-white text-[12px] font-body font-semibold hover:bg-aletis-verde-escuro transition disabled:opacity-60"
            >
              <Download size={14} />
              {bulkDownloading ? 'Empacotando…' : `Baixar ${selected.size} (.zip)`}
            </button>
          )}
        </div>

        {uploads.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-body text-[13px] text-aletis-verde-medio">
              Seu cofre digital está vazio. Documentos que você enviar aparecerão aqui.
            </p>
          </div>
        ) : (
          <>
            <div className="relative mb-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou categoria…"
                className="w-full pl-9 pr-3 py-2 text-sm font-body rounded-lg border border-aletis-cream-escuro focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/20"
              />
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-verde-medio pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>

            {filtered.length > 0 && (
              <div className="flex items-center gap-3 px-1 py-1.5 border-b border-aletis-cream-escuro/40 mb-1">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 rounded border-aletis-borda accent-aletis-verde cursor-pointer"
                  title={allSelected ? 'Limpar seleção' : 'Selecionar todos'}
                />
                <span className="text-[10px] font-body uppercase tracking-wider text-aletis-verde-medio flex-1">
                  Documento
                </span>
                <span className="text-[10px] font-body uppercase tracking-wider text-aletis-verde-medio">
                  Ações
                </span>
              </div>
            )}

            <ul className="divide-y divide-aletis-cream-escuro/50">
              {filtered.map((u) => (
                <li key={u.id} className="py-2.5 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleOne(u.id)}
                    className="w-3.5 h-3.5 rounded border-aletis-borda accent-aletis-verde cursor-pointer flex-shrink-0"
                  />
                  <Paperclip size={14} className="text-aletis-gold-escuro flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm font-medium text-aletis-verde truncate">{u.nomeOriginal}</p>
                    <p className="font-body text-[11px] text-aletis-verde-medio">
                      {fmtBytes(u.tamanho)} · {relativeTime(u.enviadoEm)} {u.categoria ? `· ${u.categoria}` : ''}
                    </p>
                  </div>
                  {u.url && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isPreviewableInline(u) && (
                        <button
                          type="button"
                          onClick={() => setPreviewing(u)}
                          className="text-aletis-verde-medio hover:text-aletis-gold-escuro transition"
                          title="Visualizar"
                        >
                          <Eye size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSingleDownload(u)}
                        className="text-aletis-verde-medio hover:text-aletis-gold-escuro transition"
                        title="Baixar"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {filtered.length === 0 && search && (
                <li className="py-6 text-center font-body text-[13px] text-aletis-verde-medio">
                  Nenhum documento corresponde a &ldquo;{search}&rdquo;.
                </li>
              )}
            </ul>
          </>
        )}
      </div>

      {previewing && (
        <PreviewModal upload={previewing} token={token} onClose={() => setPreviewing(null)} />
      )}
    </>
  )
}

/** Modal de preview inline — PDF via iframe blob, imagem via <img>. */
function PreviewModal({
  upload,
  token,
  onClose,
}: {
  upload: UploadDTO
  token: string
  onClose: () => void
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let revokeUrl: string | null = null
    let cancelled = false
    if (!upload.url) return
    fetch(upload.url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.blob()
      })
      .then((blob) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        revokeUrl = url
        setBlobUrl(url)
      })
      .catch((err) => !cancelled && setError(String(err?.message || err)))
    return () => {
      cancelled = true
      if (revokeUrl) URL.revokeObjectURL(revokeUrl)
    }
  }, [upload.url, token])

  const isImage = (upload.mime || '').toLowerCase().startsWith('image/')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <header className="px-5 py-3 border-b border-aletis-cream-escuro flex items-center gap-3">
          <Paperclip size={16} className="text-aletis-gold-escuro flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-sm font-bold text-aletis-verde truncate">{upload.nomeOriginal}</p>
            <p className="font-body text-[11px] text-aletis-verde-medio">
              {fmtBytes(upload.tamanho)} · {upload.mime}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-aletis-verde-medio hover:bg-aletis-cream transition"
            aria-label="Fechar"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-auto bg-aletis-cream/50">
          {error ? (
            <div className="p-8 text-center font-body text-sm text-aletis-grafite-escuro">
              Não consegui carregar o preview: {error}
            </div>
          ) : !blobUrl ? (
            <div className="p-8 text-center font-body text-sm text-aletis-verde-medio animate-pulse">
              Carregando…
            </div>
          ) : isImage ? (
            <img src={blobUrl} alt={upload.nomeOriginal} className="mx-auto max-w-full max-h-[80vh] object-contain" />
          ) : (
            <iframe
              src={blobUrl}
              title={upload.nomeOriginal}
              className="w-full"
              style={{ height: '80vh', border: 'none' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
