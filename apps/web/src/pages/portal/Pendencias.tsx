// ============================================================
// Portal — Inbox de pendências e upload espontâneo.
// ============================================================
// PendenciasInbox: lista pendências obrigatórias com upload por item.
// UploadEspontaneo: drop-zone para enviar docs sem solicitação prévia.
// ============================================================
import { useRef, useState } from 'react'
import {
  Inbox,
  Upload as UploadIcon,
  Loader2,
  CheckCheck,
  CheckCircle2,
  Clock,
  Circle,
  AlertCircle,
} from 'lucide-react'
import { CATEGORIA_LABEL, type PendenciaDTO, type UploadDTO } from './types'
import { apiCall, relativeTime } from './utils'
import { ErrorBanner } from './Auth'

export function PendenciasInbox({ token, pendencias, onChange }: {
  token: string
  pendencias: PendenciaDTO[]
  onChange: () => Promise<void>
}) {
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  if (pendencias.length === 0) {
    return (
      <div className="card-premium p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-aletis-sage/30 flex items-center justify-center">
            <CheckCheck className="w-5 h-5 text-aletis-verde" />
          </div>
          <div>
            <p className="font-display text-base font-bold text-aletis-verde">Nenhum documento pendente</p>
            <p className="font-body text-[13px] text-aletis-verde-medio">Quando seu consultor pedir um documento, ele aparece aqui.</p>
          </div>
        </div>
      </div>
    )
  }

  async function handleArquivo(p: PendenciaDTO, file: File) {
    setEnviando(p.id); setErro(null)
    const buf = await file.arrayBuffer()
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
    const resp = await apiCall<UploadDTO>('/api/portal/upload', {
      method: 'POST',
      token,
      body: JSON.stringify({
        nome: file.name,
        mime: file.type || 'application/octet-stream',
        conteudoBase64: b64,
        pendenciaId: p.id,
        categoria: p.categoria,
      }),
    })
    setEnviando(null)
    if (!resp.ok) { setErro(resp.error); return }
    await onChange()
  }

  return (
    <div className="card-premium p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-aletis-gold/15 border border-aletis-gold/40 flex items-center justify-center">
            <Inbox className="w-5 h-5 text-aletis-gold-escuro" />
          </div>
          <div>
            <p className="font-display text-base font-bold text-aletis-verde">Documentos pendentes</p>
            <p className="font-body text-[12.5px] text-aletis-verde-medio">
              {pendencias.filter((p) => p.status === 'pendente').length} aguardando · envie pelo botão de cada item
            </p>
          </div>
        </div>
      </div>
      {erro && <div className="mb-3"><ErrorBanner message={erro} /></div>}
      <ul className="space-y-2">
        {pendencias.map((p) => {
          const podeEnviar = p.status === 'pendente' || p.status === 'rejeitado'
          const inputId = `up-${p.id}`
          return (
            <li
              key={p.id}
              className={`rounded-xl border px-4 py-3 transition ${
                p.status === 'aprovado' ? 'border-aletis-sage/45 bg-aletis-sage/15' :
                p.status === 'rejeitado' ? 'border-red-200 bg-red-50' :
                p.status === 'enviado' ? 'border-aletis-gold/30 bg-aletis-gold/5' :
                'border-aletis-cream-escuro bg-aletis-cream-papel'
              }`}
            >
              <div className="flex items-start gap-3">
                <PendenciaIcon status={p.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="font-display font-bold text-[14px] text-aletis-verde">{p.titulo}</p>
                    <span className="font-display text-[9.5px] uppercase tracking-widest text-aletis-verde-medio bg-white/60 border border-aletis-cream-escuro/60 px-2 py-0.5 rounded-full">
                      {CATEGORIA_LABEL[p.categoria]}
                    </span>
                    {p.obrigatorio && (
                      <span className="font-display text-[9.5px] uppercase tracking-widest text-aletis-gold-escuro">obrigatório</span>
                    )}
                  </div>
                  {p.descricao && (
                    <p className="mt-1 font-body text-[12.5px] leading-snug text-aletis-verde-medio">
                      {p.descricao}
                    </p>
                  )}
                  {p.observacao && p.status === 'rejeitado' && (
                    <p className="mt-1 font-body text-[12.5px] text-red-700">
                      <strong>Devolução:</strong> {p.observacao}
                    </p>
                  )}
                  {p.solicitadoPor && (
                    <p className="mt-1 font-body text-[11px] text-aletis-verde-claro">
                      Solicitado por {p.solicitadoPor} · {relativeTime(p.solicitadoEm)}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {podeEnviar ? (
                    <>
                      <input
                        id={inputId}
                        type="file"
                        className="sr-only"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.docx,.doc,.csv,.txt"
                        onChange={(e) => {
                          const f = e.target.files?.[0]; if (f) handleArquivo(p, f)
                        }}
                      />
                      <label
                        htmlFor={inputId}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition ${
                          enviando === p.id
                            ? 'bg-aletis-cream text-aletis-verde-medio'
                            : 'bg-aletis-verde text-aletis-cream hover:bg-aletis-verde-medio'
                        }`}
                      >
                        {enviando === p.id ? <Loader2 size={12} className="animate-spin" /> : <UploadIcon size={12} />}
                        {enviando === p.id ? 'enviando…' : 'enviar'}
                      </label>
                    </>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wider ${
                      p.status === 'aprovado' ? 'bg-aletis-verde text-aletis-cream' :
                      p.status === 'enviado' ? 'bg-aletis-gold/20 text-aletis-gold-escuro' :
                      'bg-aletis-cream text-aletis-verde-medio'
                    }`}>
                      {p.status === 'aprovado' ? <CheckCheck size={12} /> : p.status === 'enviado' ? <Clock size={12} /> : <CheckCircle2 size={12} />}
                      {p.status}
                    </span>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PendenciaIcon({ status }: { status: PendenciaDTO['status'] }) {
  if (status === 'aprovado') return <CheckCheck className="w-5 h-5 mt-0.5 text-aletis-verde-medio flex-shrink-0" />
  if (status === 'enviado') return <Clock className="w-5 h-5 mt-0.5 text-aletis-gold-escuro flex-shrink-0" />
  if (status === 'rejeitado') return <AlertCircle className="w-5 h-5 mt-0.5 text-red-600 flex-shrink-0" />
  return <Circle className="w-5 h-5 mt-0.5 text-aletis-verde-medio flex-shrink-0" />
}

export function UploadEspontaneo({ token, onUploaded }: { token: string; onUploaded: () => Promise<void> }) {
  const [drag, setDrag] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setEnviando(true); setErro(null)
    for (const f of Array.from(files)) {
      const buf = await f.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      const r = await apiCall('/api/portal/upload', {
        method: 'POST',
        token,
        body: JSON.stringify({ nome: f.name, mime: f.type, conteudoBase64: b64 }),
      })
      if (!r.ok) { setErro(r.error); break }
    }
    setEnviando(false)
    await onUploaded()
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
      className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
        drag ? 'border-aletis-gold bg-aletis-gold/5' : 'border-aletis-cream-escuro bg-aletis-cream-papel'
      }`}
    >
      <UploadIcon className="w-7 h-7 mx-auto text-aletis-verde-medio mb-2" />
      <p className="font-display text-sm font-bold text-aletis-verde">
        Enviar um documento ao seu consultor
      </p>
      <p className="mt-1 font-body text-[12.5px] text-aletis-verde-medio">
        Arraste arquivos aqui ou
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="ml-1 text-aletis-gold-escuro font-semibold hover:underline"
        >
          clique para escolher
        </button>
        . PDF, foto ou planilha · até 25MB cada.
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.docx,.doc,.csv,.txt"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {enviando && (
        <p className="mt-3 inline-flex items-center gap-1.5 font-body text-[12.5px] text-aletis-verde-medio">
          <Loader2 size={12} className="animate-spin" /> Enviando…
        </p>
      )}
      {erro && <p className="mt-3 font-body text-[12.5px] text-red-700">{erro}</p>}
    </div>
  )
}
