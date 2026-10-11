import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Archive, CheckCircle2, Download, Eye, FileText, Search, Sparkles, Vault, X } from 'lucide-react'
import { CATEGORIA_LABEL, type PendenciaDTO, type UploadDTO } from './types'
import { fmtBytes, formatDateTime } from './utils'
import { portalDownloadPath, publicAnalysisLabel, publicDriveLabel } from './DocumentWorkflow'

const actionClass = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-aletis-cream-escuro px-3 text-xs font-semibold text-foreground hover:bg-aletis-cream disabled:opacity-50'
const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function CofreDigital({ uploads, token, pendencias = [] }: { uploads: UploadDTO[]; token: string; pendencias?: PendenciaDTO[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'todos' | 'pedido' | 'avulso'>('todos')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewing, setPreviewing] = useState<UploadDTO | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(20)
  const requestNames = useMemo(() => new Map(pendencias.map(p => [p.id, p.titulo])), [pendencias])
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR')
    return [...uploads].filter(u => (filter === 'todos' || (filter === 'pedido' ? Boolean(u.pendenciaId) : !u.pendenciaId)) && (!q || `${u.nomeOriginal} ${u.categoria || ''} ${u.id} ${requestNames.get(u.pendenciaId || '') || ''}`.toLocaleLowerCase('pt-BR').includes(q))).sort((a, b) => b.enviadoEm.localeCompare(a.enviadoEm))
  }, [uploads, search, filter, requestNames])
  useEffect(() => setVisible(20), [search, filter])
  useEffect(() => setSelected(previous => new Set([...previous].filter(id => uploads.some(u => u.id === id)))), [uploads])
  const shown = filtered.slice(0, visible)
  const toggleOne = (id: string) => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const downloadOne = async (upload: UploadDTO) => {
    const url = portalDownloadPath(upload)
    if (!url) throw new Error(`O arquivo “${upload.nomeOriginal}” está indisponível. Fale com a equipe.`)
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'same-origin' })
    if (!response.ok) throw new Error(response.status === 401 ? 'Sua sessão terminou. Entre novamente para baixar o arquivo.' : `Não foi possível baixar “${upload.nomeOriginal}”. Tente novamente.`)
    return response.blob()
  }
  const singleDownload = async (upload: UploadDTO) => {
    setError(null); setBusy(true)
    try { saveBlob(await downloadOne(upload), upload.nomeOriginal) }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível baixar o arquivo.') }
    finally { setBusy(false) }
  }
  const bulkDownload = async () => {
    const items = uploads.filter(u => selected.has(u.id))
    if (!items.length) return
    setError(null)
    if (items.length > 20 || items.reduce((sum, u) => sum + u.tamanho, 0) > 50 * 1024 * 1024) { setError('Para baixar juntos, selecione até 20 arquivos e 50 MB. Arquivos maiores podem ser baixados individualmente.'); return }
    setBusy(true)
    try {
      const Zip = (await import('jszip')).default
      const zip = new Zip()
      for (const [index, upload] of items.entries()) {
        const name = upload.nomeOriginal.replace(/[\\/]/g, '_')
        zip.file(`${String(index + 1).padStart(2, '0')}-${name}`, await downloadOne(upload))
      }
      saveBlob(await zip.generateAsync({ type: 'blob' }), `documentos-aletis-${new Date().toISOString().slice(0, 10)}.zip`)
      setSelected(new Set())
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível concluir o pacote. Tente baixar os arquivos individualmente.') }
    finally { setBusy(false) }
  }
  return <>
    <section className="card-premium min-w-0 p-4 sm:p-6" aria-labelledby="portal-upload-history">
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-aletis-sage/40 bg-aletis-sage/20 text-foreground"><Vault size={21} /></div>
        <div className="min-w-0 flex-1"><h3 id="portal-upload-history" className="font-display text-lg font-bold text-foreground">Documentos e comprovantes de envio</h3><p className="mt-1 text-sm text-muted-foreground">{uploads.length} arquivo(s) · {fmtBytes(uploads.reduce((sum, u) => sum + (u.tamanho || 0), 0))}</p></div>
        {selected.size > 0 && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void bulkDownload()} disabled={busy} className={actionClass}><Download size={14} />{busy ? 'Preparando…' : `Baixar ${selected.size} selecionado(s)`}</button><button type="button" onClick={() => setSelected(new Set())} className={actionClass}>Limpar seleção</button></div>}
      </div>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">O recebimento confirma que seu arquivo chegou. A leitura da ALIX, a organização e a conferência do pedido são etapas separadas; você pode acompanhá-las aqui.</p>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {uploads.length === 0 ? <p className="rounded-xl bg-muted p-5 text-sm text-muted-foreground">Os arquivos enviados e seus comprovantes aparecerão aqui.</p> : <>
        <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block"><span className="sr-only">Buscar documentos ou comprovantes</span><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do arquivo, pedido ou comprovante" className="min-h-11 w-full min-w-0 rounded-xl border border-aletis-cream-escuro py-2 pl-10 pr-3 text-sm focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/20" /></label>
          <label><span className="sr-only">Tipo de envio</span><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)} className="min-h-11 w-full rounded-xl border border-aletis-cream-escuro bg-card px-3 text-sm text-foreground"><option value="todos">Todos os envios</option><option value="pedido">Vinculados a um pedido</option><option value="avulso">Outros documentos</option></select></label>
        </div>
        <ul className="space-y-3">{shown.map(u => <li key={u.id} className="min-w-0 rounded-2xl border border-aletis-cream-escuro bg-card p-4">
          <div className="flex items-start gap-3">
            <label className="flex h-10 w-8 shrink-0 cursor-pointer items-center justify-center"><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} aria-label={`Selecionar ${u.nomeOriginal}`} className="h-4 w-4 accent-aletis-verde" /></label>
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-foreground">{u.nomeOriginal}</p><p className="mt-1 text-xs text-muted-foreground">{fmtBytes(u.tamanho)} · {formatDateTime(u.enviadoEm)} · {u.enviadoPor === 'consultor' ? 'Enviado pela equipe' : 'Enviado por você'}</p><p className="mt-1 break-words text-xs text-muted-foreground">{requestNames.get(u.pendenciaId || '') || (u.pendenciaId ? 'Documento solicitado' : 'Outro documento')}{u.categoria ? ` · ${CATEGORIA_LABEL[u.categoria as PendenciaDTO['categoria']] || u.categoria}` : ''}</p></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full bg-aletis-sage/20 px-2.5 py-1.5 text-foreground"><CheckCircle2 size={12} />Recebido</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-aletis-cream px-2.5 py-1.5 text-foreground"><Sparkles size={12} />{publicAnalysisLabel(u.analiseStatus)}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-aletis-cream px-2.5 py-1.5 text-foreground"><Archive size={12} />{publicDriveLabel(u.driveStatus)}</span>
          </div>
          {u.review && <p className={`mt-3 whitespace-pre-wrap break-words rounded-xl p-3 text-xs leading-relaxed ${u.review.status === 'aprovado' ? 'bg-aletis-sage/15 text-foreground' : 'bg-amber-50 text-amber-900'}`}><strong>{u.review.status === 'aprovado' ? 'Conferido pela equipe' : 'Conferência: ajuste solicitado'}</strong>{u.review.revisadoEm ? ` · ${formatDateTime(u.review.revisadoEm)}` : ''}{u.review.observacao ? `\n${u.review.observacao}` : ''}</p>}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="break-all text-[11px] text-muted-foreground">Comprovante: {u.id}</p>{portalDownloadPath(u) && <div className="flex shrink-0 gap-2">{(u.mime === 'application/pdf' || ['image/jpeg', 'image/png', 'image/webp'].includes(u.mime)) && <button type="button" onClick={() => setPreviewing(u)} className={actionClass} aria-label={`Visualizar ${u.nomeOriginal}`}><Eye size={14} />Ver</button>}<button type="button" disabled={busy} onClick={() => void singleDownload(u)} className={actionClass} aria-label={`Baixar ${u.nomeOriginal}`}><Download size={14} />Baixar</button></div>}</div>
        </li>)}</ul>
        {!filtered.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum documento corresponde à busca.</p>}
        {filtered.length > shown.length && <button type="button" onClick={() => setVisible(value => value + 20)} className={`${actionClass} mt-4 w-full`}>Mostrar mais · {shown.length} de {filtered.length}</button>}
      </>}
    </section>
    {previewing && <PreviewModal key={previewing.id} upload={previewing} token={token} onClose={() => setPreviewing(null)} />}
  </>
}

function PreviewModal({ upload, token, onClose }: { upload: UploadDTO; token: string; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let revokeUrl: string | null = null
    const path = portalDownloadPath(upload)
    if (!path) { setError('O documento não está disponível para visualização.'); return }
    fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'same-origin', signal: controller.signal }).then(response => { if (!response.ok) throw new Error('Não foi possível abrir o arquivo. Tente baixá-lo ou fale com a equipe.'); return response.blob() }).then(blob => { if (controller.signal.aborted) return; revokeUrl = URL.createObjectURL(blob); setBlobUrl(revokeUrl) }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => { controller.abort(); if (revokeUrl) URL.revokeObjectURL(revokeUrl) }
  }, [upload, token])
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60" /><Dialog.Content className="fixed left-1/2 top-1/2 z-[91] flex max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
    <div className="flex items-start gap-3 border-b border-aletis-cream-escuro px-4 py-3"><FileText size={18} className="mt-1 shrink-0 text-aletis-gold-escuro" /><div className="min-w-0 flex-1"><Dialog.Title className="break-words text-sm font-bold text-foreground">{upload.nomeOriginal}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">Documento recebido em {formatDateTime(upload.enviadoEm)} · {fmtBytes(upload.tamanho)}</Dialog.Description></div><Dialog.Close className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-aletis-cream" aria-label="Fechar documento"><X size={18} /></Dialog.Close></div>
    <div className="min-h-48 flex-1 overflow-auto bg-aletis-cream/30">{error ? <p role="alert" className="p-6 text-sm text-red-800">{error}</p> : !blobUrl ? <p role="status" className="p-6 text-sm text-muted-foreground">Carregando documento…</p> : upload.mime.startsWith('image/') ? <img src={blobUrl} alt={upload.nomeOriginal} className="mx-auto max-h-[75dvh] max-w-full object-contain" /> : upload.mime === 'application/pdf' ? <iframe src={blobUrl} title={upload.nomeOriginal} className="h-[75dvh] w-full border-0" /> : <div className="p-6 text-sm text-foreground"><p>Este tipo de arquivo pode ser baixado para abrir no seu dispositivo.</p><a href={blobUrl} download={upload.nomeOriginal} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-aletis-verde px-4 font-semibold text-white"><Download size={16} />Baixar arquivo</a></div>}</div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}

export { PreviewModal as PortalDocumentPreview }
