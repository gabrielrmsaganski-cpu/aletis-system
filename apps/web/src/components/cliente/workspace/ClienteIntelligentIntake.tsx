import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  FilePlus2,
  FolderOpen,
  Landmark,
  Loader2,
  Send,
  Sparkles,
  UploadCloud,
} from 'lucide-react'
import { MotionDialog } from '../../ui'

type Destination = 'propostas' | 'negociacao' | 'financeiro' | 'cadastro' | 'documentos'

type UploadedDocument = {
  id: string
  nome: string
  resumoIa?: string
  grupoDocumento?: string
  categoriaInteligente?: string
  prioridadeDocumento?: string
  precisaRevisao?: boolean
  estadoProcessamento?: 'queued' | 'processing' | 'extracting' | 'completed' | 'completed_basic' | 'failed'
  analiseErro?: string
  downloadUrl: string
}

type DeepAnalysis = {
  tipoDocumento: string
  resumoExecutivo: string
  achadosChave: string[]
  riscos: string[]
  lacunas: string[]
  acoesSugeridas: string[]
  status: 'llm' | 'deterministic'
}

type IntakeItem = {
  key: string
  file: File
  status: 'pending' | 'uploading' | 'analyzing' | 'ready' | 'error'
  message?: string
  document?: UploadedDocument
  analysis?: DeepAnalysis
  destination?: { destino: Destination; motivo: string }
  creditor?: string
  registering?: 'proposal' | 'negotiation'
  confirming?: boolean
  routingConfirmed?: boolean
  registered?: string
}

interface Props {
  clienteId: string
  clienteNome: string
  urlId: string
  onClose: () => void
  onReload: () => Promise<void>
}

const destinationMeta: Record<Destination, { label: string; description: string; className: string }> = {
  propostas: {
    label: 'Propostas',
    description: 'Extrair uma proposta e criar um rascunho revisável.',
    className: 'border-violet-200 bg-violet-50 text-violet-800',
  },
  negociacao: {
    label: 'Negociação',
    description: 'Abrir o acompanhamento no Deal Room do cliente.',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  financeiro: {
    label: 'Gestão financeira',
    description: 'Usar o arquivo como evidência na gestão e nos cenários.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  cadastro: {
    label: 'Cadastro',
    description: 'Conferir dados identificados antes de atualizar o cliente.',
    className: 'border-sky-200 bg-sky-50 text-sky-800',
  },
  documentos: {
    label: 'Cofre do cliente',
    description: 'Organizar no cofre e usar como contexto das demais áreas.',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  },
}

function errorMessage(response: Response, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string }
    return parsed.error || `HTTP ${response.status}`
  } catch {
    return /<\/?(?:html|body|!doctype)\b/i.test(raw)
      ? `O servidor demorou para responder (HTTP ${response.status}). Tente novamente.`
      : `Resposta inválida do servidor (HTTP ${response.status}).`
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const raw = await response.text()
  if (!response.ok) throw new Error(errorMessage(response, raw))
  try {
    const parsed = JSON.parse(raw) as { success?: boolean; error?: string; data?: T }
    if (parsed.success === false) throw new Error(parsed.error || 'A operação não foi concluída.')
    return (parsed.data ?? parsed) as T
  } catch (error) {
    if (error instanceof Error && !/Unexpected token/.test(error.message)) throw error
    throw new Error(errorMessage(response, raw))
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function inferCategory(file: File): string {
  const value = `${file.name} ${(file as File & { webkitRelativePath?: string }).webkitRelativePath || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/cnh|identidade|certidao|cpf|rg/.test(value)) return 'identidade'
  if (/matricula|car\b|ccir|itr|imovel|fazenda|area|kml|outorga|planta/.test(value)) return 'patrimonio'
  if (/laudo|vistoria|safra|custeio|insumo|nota fiscal|nf |producao/.test(value)) return 'agro'
  if (/irpf|declaracao|recibo|fiscal/.test(value)) return 'fiscal'
  if (/contrato|acordo|confissao|proposta|divida|ccb|cessao|scr|registrato|processo|aditivo/.test(value)) return 'contrato'
  return 'outros'
}

export default function ClienteIntelligentIntake({ clienteId, clienteNome, urlId, onClose, onReload }: Props) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const folderRef = useRef<HTMLInputElement | null>(null)
  const [items, setItems] = useState<IntakeItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const patchItem = (key: string, patch: Partial<IntakeItem>) => {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item))
  }

  async function waitForDocument(item: IntakeItem, initial: UploadedDocument): Promise<UploadedDocument> {
    if (['completed', 'completed_basic'].includes(initial.estadoProcessamento || '')) return initial
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await wait(attempt === 0 ? 1_000 : 3_000)
      const documents = await requestJson<UploadedDocument[]>(
        `/api/clientes/${encodeURIComponent(clienteId)}/documentos`,
      )
      const current = documents.find((document) => document.id === initial.id) || initial
      patchItem(item.key, {
        document: current,
        status: 'analyzing',
        message: current.estadoProcessamento === 'extracting'
          ? 'Texto lido. A IA está estruturando e conferindo os dados…'
          : 'OCR e leitura documental em segundo plano…',
      })
      if (current.estadoProcessamento === 'failed') {
        throw new Error(current.analiseErro || 'A leitura automática falhou. Use a ação de reanalisar no cofre.')
      }
      if (['completed', 'completed_basic'].includes(current.estadoProcessamento || '')) return current
    }
    throw new Error('A análise continua em segundo plano. O arquivo já está salvo e pode ser acompanhado no cofre do cliente.')
  }

  async function processFile(item: IntakeItem) {
    patchItem(item.key, { status: 'uploading', message: 'Enviando e guardando o arquivo no cofre…' })
    const form = new FormData()
    form.append('file', item.file)
    const query = new URLSearchParams({ categoria: inferCategory(item.file), importBatchId: `entrada-ia-${Date.now()}` })
    const upload = await requestJson<UploadedDocument>(
      `/api/clientes/${encodeURIComponent(clienteId)}/documentos?${query}`,
      { method: 'POST', body: form },
    )
    const document = await waitForDocument(item, upload)
    patchItem(item.key, { status: 'analyzing', document, message: 'A IA está verificando evidências e o destino correto…' })
    const analysis = await requestJson<{
      documento: UploadedDocument
      analise: DeepAnalysis
      encaminhamento: { destino: Destination; motivo: string }
    }>(
      `/api/clientes/${encodeURIComponent(clienteId)}/documentos/${encodeURIComponent(document.id)}/inteligencia`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
    )
    patchItem(item.key, {
      status: 'ready',
      message: undefined,
      document: analysis.documento,
      analysis: analysis.analise,
      destination: analysis.encaminhamento,
    })
  }

  async function addFiles(input: FileList | File[] | null | undefined) {
    const files = Array.from(input ?? []).filter((file) => file.size > 0)
    if (!files.length || busy) return
    const next = files.map((file, index): IntakeItem => ({
      key: `${Date.now()}-${index}-${file.name}`,
      file,
      status: 'pending',
    }))
    setItems((current) => [...next, ...current])
    setBusy(true)
    setNotice(null)
    let completed = 0
    let cursor = 0
    const workers = Array.from({ length: Math.min(3, next.length) }, async () => {
      while (cursor < next.length) {
        const index = cursor
        cursor += 1
        const item = next[index]
        try {
          await processFile(item)
          completed += 1
        } catch (error) {
          patchItem(item.key, { status: 'error', message: error instanceof Error ? error.message : 'Falha ao processar este arquivo.' })
        }
      }
    })
    await Promise.all(workers)
    setBusy(false)
    void onReload()
    setNotice(`${completed} arquivo${completed === 1 ? '' : 's'} analisado${completed === 1 ? '' : 's'} e organizado${completed === 1 ? '' : 's'} no cliente.`)
  }

  async function createProposal(item: IntakeItem) {
    if (!item.document) return
    patchItem(item.key, { registering: 'proposal' })
    try {
      const source = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/documentos/${encodeURIComponent(item.document.id)}/download`)
      if (!source.ok) throw new Error('Não foi possível recuperar o arquivo original para a proposta.')
      const blob = await source.blob()
      const form = new FormData()
      form.append('file', new File([blob], item.file.name, { type: item.file.type || blob.type }))
      form.append('clienteId', clienteId)
      form.append('clienteNome', clienteNome)
      const result = await requestJson<{ id: string; titulo: string }>(
        '/api/propostas/upload', { method: 'POST', body: form },
      )
      await confirmRouting(item)
      patchItem(item.key, { registered: `Proposta em rascunho criada: ${result.titulo || result.id}` })
      void onReload()
    } catch (error) {
      patchItem(item.key, { message: error instanceof Error ? error.message : 'Não foi possível criar a proposta.' })
    } finally {
      patchItem(item.key, { registering: undefined })
    }
  }

  async function createNegotiation(item: IntakeItem) {
    const credor = item.creditor?.trim()
    if (!credor) {
      patchItem(item.key, { message: 'Informe o credor antes de criar a negociação.' })
      return
    }
    patchItem(item.key, { registering: 'negotiation' })
    try {
      await requestJson('/api/deal-room/negociacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          credor,
          observacoes: `Criada a partir do documento “${item.document?.nome || item.file.name}”. ${item.analysis?.resumoExecutivo || ''}`.slice(0, 3000),
        }),
      })
      await confirmRouting(item)
      patchItem(item.key, { registered: `Negociação com ${credor} criada no Deal Room.` })
      void onReload()
    } catch (error) {
      patchItem(item.key, { message: error instanceof Error ? error.message : 'Não foi possível criar a negociação.' })
    } finally {
      patchItem(item.key, { registering: undefined })
    }
  }

  async function confirmRouting(item: IntakeItem) {
    if (!item.document || !item.destination || item.confirming || item.routingConfirmed) return
    patchItem(item.key, { confirming: true, message: undefined })
    try {
      await requestJson<UploadedDocument>(
        `/api/clientes/${encodeURIComponent(clienteId)}/documentos/${encodeURIComponent(item.document.id)}/confirmar-encaminhamento`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destino: item.destination.destino }),
        },
      )
      patchItem(item.key, { routingConfirmed: true })
      void onReload()
    } catch (error) {
      patchItem(item.key, { message: error instanceof Error ? error.message : 'Não foi possível confirmar o encaminhamento.' })
    } finally {
      patchItem(item.key, { confirming: false })
    }
  }

  function openDestination(destination: Destination) {
    const area = destination === 'financeiro' ? 'gestao' : destination === 'cadastro' ? 'identidade' : destination === 'documentos' ? 'workflow' : 'negociacao'
    onClose()
    navigate(`/clientes/${urlId}?area=${area}`)
  }

  return (
    <MotionDialog
      title="Entrada inteligente"
      eyebrow="CRM · COFRE DOCUMENTAL"
      subtitle="Envie documentos, propostas ou planilhas. A IA lê, confere evidências e sugere o cadastro no lugar certo."
      icon={<BrainCircuit className="h-5 w-5" />}
      onClose={onClose}
      size="xl"
      bodyClassName="p-0"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">O arquivo sempre fica preservado no cofre; cadastros são confirmados por você.</p>
          <button type="button" onClick={onClose} className="rounded-xl border border-aletis-borda px-3 py-2 text-xs font-semibold text-foreground hover:bg-aletis-bege">Concluir</button>
        </div>
      }
    >
      <div className="max-h-[calc(92dvh-190px)] overflow-y-auto bg-aletis-cream-papel/45 p-4 md:p-5">
        <section
          className={`rounded-lg border-2 border-dashed p-5 transition ${dragging ? 'border-aletis-verde bg-aletis-verde/5' : 'border-aletis-borda bg-card'}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={(event) => { event.preventDefault(); setDragging(false) }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files) }}
        >
          <div className="flex flex-col items-center text-center">
            <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-aletis-verde text-white shadow-none"><UploadCloud className="h-5 w-5" /></span>
            <h3 className="text-sm font-semibold text-foreground">Solte os arquivos do cliente aqui</h3>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--text-soft)]">PDF, imagens, Word e planilhas até 25 MB por arquivo. A IA extrai conteúdo, identifica riscos e orienta a área responsável.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-aletis-verde px-3.5 py-2 text-xs font-semibold text-white hover:bg-aletis-verde-escuro disabled:opacity-50"><FilePlus2 className="h-4 w-4" />Selecionar arquivos</button>
              <button type="button" disabled={busy} onClick={() => folderRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-aletis-borda bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-aletis-bege disabled:opacity-50"><FolderOpen className="h-4 w-4" />Enviar pasta</button>
            </div>
          </div>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(event) => { void addFiles(event.target.files); event.target.value = '' }} />
          <input ref={(node) => { folderRef.current = node; node?.setAttribute('webkitdirectory', '') }} type="file" multiple className="hidden" onChange={(event) => { void addFiles(event.target.files); event.target.value = '' }} />
        </section>

        {notice && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{notice}</p>}

        {items.length > 0 && (
          <section className="mt-4 space-y-3">
            <div className="flex items-center gap-2 px-1"><Sparkles className="h-4 w-4 text-aletis-dourado" /><h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-soft)]">Leitura e encaminhamento</h3></div>
            {items.map((item) => <IntakeCard key={item.key} item={item} onCreditor={(creditor) => patchItem(item.key, { creditor })} onProposal={() => void createProposal(item)} onNegotiation={() => void createNegotiation(item)} onConfirmRouting={() => void confirmRouting(item)} onOpen={() => openDestination(item.destination?.destino || 'documentos')} />)}
          </section>
        )}
      </div>
    </MotionDialog>
  )
}

function IntakeCard({ item, onCreditor, onProposal, onNegotiation, onConfirmRouting, onOpen }: { item: IntakeItem; onCreditor: (value: string) => void; onProposal: () => void; onNegotiation: () => void; onConfirmRouting: () => void; onOpen: () => void }) {
  const loading = item.status === 'uploading' || item.status === 'analyzing'
  const meta = item.destination ? destinationMeta[item.destination.destino] : undefined
  return (
    <article className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.status === 'error' ? 'bg-red-50 text-red-600' : item.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-aletis-bege text-foreground'}`}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : item.status === 'error' ? <AlertTriangle className="h-4 w-4" /> : item.status === 'ready' ? <CheckCircle2 className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="break-all text-sm font-semibold text-foreground">{item.file.name}</h4>{meta && <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${meta.className}`}>{meta.label}</span>}</div>
          {loading && <p className="mt-1 text-xs text-[var(--text-soft)]">{item.message}</p>}
          {item.status === 'error' && <p className="mt-1 text-xs text-red-700">{item.message}</p>}
          {item.status === 'ready' && item.analysis && meta && (
            <div className="mt-3 space-y-3">
              <p className="text-xs leading-relaxed text-[var(--text-soft)]"><strong className="text-foreground">{item.analysis.tipoDocumento}.</strong> {item.analysis.resumoExecutivo}</p>
              <div className="rounded-xl bg-aletis-bege/60 px-3 py-2 text-xs text-[var(--text-soft)]"><strong className="text-foreground">Encaminhamento:</strong> {item.destination?.motivo} {meta.description}</div>
              {item.analysis.riscos.length > 0 && <p className="text-[11px] leading-relaxed text-amber-800"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{item.analysis.riscos.slice(0, 2).join(' · ')}</p>}
              <p className="text-[11px] font-medium text-muted-foreground">Sugestão da IA — nenhuma informação é cadastrada sem sua confirmação.</p>
              {item.registered ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{item.registered}</p> : <RoutingAction item={item} onCreditor={onCreditor} onProposal={onProposal} onNegotiation={onNegotiation} onConfirmRouting={onConfirmRouting} onOpen={onOpen} />}
              {item.message && !item.registered && <p className="text-xs text-red-700">{item.message}</p>}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function RoutingAction({ item, onCreditor, onProposal, onNegotiation, onConfirmRouting, onOpen }: { item: IntakeItem; onCreditor: (value: string) => void; onProposal: () => void; onNegotiation: () => void; onConfirmRouting: () => void; onOpen: () => void }) {
  const destination = item.destination?.destino
  if (destination === 'propostas') return <button type="button" disabled={!!item.registering || item.confirming} onClick={onProposal} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50">{item.registering === 'proposal' || item.confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}Confirmar e criar proposta</button>
  if (destination === 'negociacao') return <div className="flex flex-wrap items-center gap-2"><input value={item.creditor || ''} onChange={(event) => onCreditor(event.target.value)} placeholder="Credor identificado" className="h-9 min-w-[190px] rounded-xl border border-aletis-borda px-3 text-xs outline-none focus:border-aletis-verde" /><button type="button" disabled={!!item.registering || item.confirming} onClick={onNegotiation} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{item.registering === 'negotiation' || item.confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Landmark className="h-3.5 w-3.5" />}Confirmar e criar negociação</button></div>
  if (item.routingConfirmed) return <button type="button" onClick={onOpen} className="inline-flex items-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-aletis-bege">Abrir área confirmada <ArrowRight className="h-3.5 w-3.5" /></button>
  return <button type="button" disabled={item.confirming} onClick={onConfirmRouting} className="inline-flex items-center gap-2 rounded-xl bg-aletis-verde px-3 py-2 text-xs font-semibold text-white hover:bg-aletis-verde-escuro disabled:opacity-50">{item.confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Confirmar encaminhamento</button>
}
