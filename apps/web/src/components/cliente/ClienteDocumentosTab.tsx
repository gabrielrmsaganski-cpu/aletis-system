import { Link } from 'react-router-dom'
// ============================================================
// ClienteDocumentosTab — listagem + upload de documentos do cliente
// ============================================================
// Substitui o placeholder anterior. Usa /api/clientes/:id/documentos
// que reusa portal_upload (cofre digital, com controle de duplicidade
// via SHA256 e categorização por tipo).
// ============================================================
import { useEffect, useState, useRef, useMemo } from 'react'
import { apiFetch } from '../../hooks/useApi'
import ClientePortalDocumentosPanel from './ClientePortalDocumentosPanel'
import ClientePortalAtendimentoPanel from './ClientePortalAtendimentoPanel'
import { DSCard, DSEmpty, DSTable, DSBadge, DSButton } from '../ds'
import { MotionDialog } from '../ui'
import {
  CheckCircle2,
  FileCheck,
  Upload,
  Download,
  Trash2,
  FileText,
  AlertCircle,
  Hash,
  Edit3,
  Save,
  Loader2,
  Sparkles,
  FolderOpen,
  Search,
  Files,
  ClipboardList,
  MessageSquare,
  Plus,
  X,
} from 'lucide-react'

interface Documento {
  id: string
  nome: string
  mime: string
  tamanho: number
  categoria: string
  enviadoPor: 'cliente' | 'consultor'
  enviadoEm: string
  sha256?: string
  resumoIa?: string
  resumoOrigem?: 'openai' | 'fallback'
  resumoModelo?: string
  resumoGeradoEm?: string
  analiseErro?: string
  estadoProcessamento?: 'queued' | 'processing' | 'extracting' | 'completed' | 'completed_basic' | 'failed'
  tipoDocumentoIa?: string
  tipoDocumento?: string
  pastaDocumento?: DocumentFolder
  processo?: DocumentProcess
  camposEditaveis?: EditableDocumentField[]
  textoExtraidoChars?: number
  observacaoConsultor?: string
  categoriaInteligente?: string
  grupoDocumento?: string
  prioridadeDocumento?: 'alta' | 'media' | 'baixa'
  precisaRevisao?: boolean
  sinais?: string[]
  demandaIds?: string[]
  importacoes?: Array<{
    batchId?: string
    pacote?: string
    caminhoRelativo?: string
    importadoEm: string
  }>
  downloadUrl: string
}

type DocumentFolder = 'notas_fiscais_xml' | 'contratos' | 'processos' | 'cadastro' | 'financeiro' | 'patrimonio' | 'agro' | 'outros'
type DocumentProcessStatus = 'nao_iniciado' | 'em_analise' | 'aguardando_documentos' | 'pendente' | 'aprovado' | 'concluido' | 'arquivado'
type DocumentProcess = { status: DocumentProcessStatus; etapa: string; responsavel: string; dataDocumento: string; vencimento: string }
type EditableDocumentField = { id: string; nome: string; valor: string; origem: 'ia' | 'revisado' | 'manual' }

interface DemandaOption {
  id: string
  codigo?: string
  titulo: string
  status: string
}

const CATEGORIAS: Array<{ id: string; label: string; tone: 'positive' | 'warning' | 'neutral' | 'negative' | 'info' | 'gold' }> = [
  { id: 'fiscal', label: 'Notas fiscais e XML', tone: 'gold' },
  { id: 'contrato', label: 'Contratos e processos', tone: 'info' },
  { id: 'identidade', label: 'Cadastro e documentos pessoais', tone: 'neutral' },
  { id: 'patrimonio', label: 'Patrimônio e garantias', tone: 'positive' },
  { id: 'agro', label: 'Agro e produção', tone: 'positive' },
  { id: 'outros', label: 'Outros', tone: 'neutral' },
]

const DOCUMENT_FOLDERS: Array<{ id: DocumentFolder; label: string; description: string; icon: typeof FolderOpen }> = [
  { id: 'notas_fiscais_xml', label: 'Notas fiscais e XML', description: 'NF-e, NFS-e, DANFE e arquivos XML', icon: FileCheck },
  { id: 'contratos', label: 'Contratos e acordos', description: 'Contratos, aditivos, CCB e confissões', icon: ClipboardList },
  { id: 'processos', label: 'Processos', description: 'Judicial, negociação e acompanhamento', icon: Files },
  { id: 'cadastro', label: 'Cadastro e pessoais', description: 'RG, CPF, CNH, certidões e endereços', icon: FileText },
  { id: 'financeiro', label: 'Financeiro', description: 'Extratos, planilhas, DRE e fluxo', icon: FileText },
  { id: 'patrimonio', label: 'Patrimônio e garantias', description: 'Matrículas, CAR, CCIR, ITR e máquinas', icon: FolderOpen },
  { id: 'agro', label: 'Agro e produção', description: 'Safra, custeio, laudos e insumos', icon: FolderOpen },
  { id: 'outros', label: 'Outros documentos', description: 'Arquivos ainda não classificados', icon: FolderOpen },
]

const FOLDER_LABEL: Record<DocumentFolder, string> = Object.fromEntries(DOCUMENT_FOLDERS.map((folder) => [folder.id, folder.label])) as Record<DocumentFolder, string>
const PROCESS_STATUS_LABEL: Record<DocumentProcessStatus, string> = {
  nao_iniciado: 'Sem andamento', em_analise: 'Em análise', aguardando_documentos: 'Aguardando documentos',
  pendente: 'Pendente', aprovado: 'Aprovado', concluido: 'Concluído', arquivado: 'Arquivado',
}

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.label]))
const CAT_TONE: Record<string, any> = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.tone]))
const INTEL_GROUP_LABEL: Record<string, string> = {
  cadastro: 'Cadastro',
  patrimonio: 'Patrimônio',
  financeiro: 'Financeiro',
  juridico: 'Jurídico',
  operacional: 'Operacional / Outros',
  revisao: 'Revisão',
}
const INTEL_CAT_LABEL: Record<string, string> = {
  identidade: 'Identidade',
  endereco: 'Endereço',
  patrimonio_imovel: 'Matrícula / Imóvel',
  ambiental_car: 'CAR / Ambiental',
  fiscal_rural: 'CCIR / ITR / CAFIR',
  contrato_arrendamento: 'Arrendamento',
  contrato_bancario: 'Contrato bancário',
  renegociacao: 'Renegociação',
  processo_judicial: 'Processo judicial',
  maquinario: 'Máquina / Implemento',
  divida_confissao: 'Confissão de dívida',
  proposta: 'Proposta',
  revisao_ocr: 'Revisar OCR',
  outros: 'Outros',
}

const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return s
  }
}

const humanizeFieldName = (value: string) => value
  .replace(/\.(\d+)\./g, ' $1 · ')
  .replace(/[._-]+/g, ' ')
  .replace(/([a-zá-ú])([A-Z])/g, '$1 $2')
  .replace(/\b\w/g, (letter) => letter.toUpperCase())
  .trim()

interface Props {
  clienteId: string
  clienteNome?: string
  onOpenOfficialDocuments?: () => void
}

type UploadQueueItem = {
  id: string
  name: string
  size: number
  categoria: string
  sourcePath?: string
  status: 'pending' | 'uploading' | 'done' | 'duplicate' | 'error'
  message?: string
}

function inferUploadCategory(file: File, selectedCategory: string): string {
  if (selectedCategory !== 'auto') return selectedCategory
  const sourcePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
  const value = sourcePath.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/cnh|identidade|certidao|nascimento|casamento|documentos pessoais/.test(value)) return 'identidade'
  if (/matricula|car\b|ccir|itr|imovel|fazenda|area|kml|outorga|planta/.test(value)) return 'patrimonio'
  if (/laudo|vistoria|safra|custeio|insumo|nota fiscal|nf |quadro safra|producao/.test(value)) return 'agro'
  if (/irpf|declaracao|recibo|fiscal/.test(value)) return 'fiscal'
  if (/contrato|acordo|confissao|proposta|divida|ccb|cessao|scr|registrato|processo|aditivo/.test(value)) return 'contrato'
  return 'outros'
}

const docPanelClass = 'rounded-lg border border-aletis-borda bg-card shadow-none'
const docInputClass = 'rounded-xl border border-aletis-borda bg-card px-3 py-2 text-sm text-foreground transition focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/20 dark:border-white/10 dark:bg-white/5 dark:text-white'
const docPrimaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-aletis-verde px-3.5 text-xs font-semibold text-white shadow-none transition hover:bg-aletis-verde-escuro disabled:cursor-not-allowed disabled:opacity-50'
const docSecondaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3.5 text-xs font-semibold text-foreground transition hover:bg-aletis-cream-papel disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10'
const docIconButtonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-xl border border-aletis-borda bg-card text-[var(--text-soft)] transition hover:bg-aletis-cream-papel hover:text-aletis-verde dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10'
const docEditPanelClass = 'block rounded-lg border border-aletis-borda bg-card p-4 shadow-none dark:border-white/10 dark:bg-white/5'
const docEditLabelClass = 'text-[11px] font-body font-semibold uppercase text-muted-foreground dark:text-white/50'

export default function ClienteDocumentosTab(props: Props) {
  return <ClienteDocumentosContent key={props.clienteId} {...props} />
}

function ClienteDocumentosContent({ clienteId, clienteNome, onOpenOfficialDocuments }: Props) {
  const [list, setList] = useState<Documento[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workspaceView, setWorkspaceView] = useState<'arquivos' | 'solicitacoes' | 'atendimento'>('arquivos')
  const [filterFolder, setFilterFolder] = useState<DocumentFolder | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<'recentes' | 'nome'>('recentes')
  const [uploading, setUploading] = useState(false)
  const [demandas, setDemandas] = useState<DemandaOption[]>([])
  const [uploadDemandId, setUploadDemandId] = useState('')
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [uploadCategoria, setUploadCategoria] = useState<string>('auto')
  const [editing, setEditing] = useState<Documento | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const folderRef = useRef<HTMLInputElement | null>(null)

  const reload = () => {
    setError(null)
    apiFetch<Documento[]>(`/clientes/${encodeURIComponent(clienteId)}/documentos`)
      .then(setList)
      .catch((err) => setError(String(err?.message || err)))
  }
  useEffect(reload, [clienteId])
  useEffect(() => {
    if (!list?.some((doc) => ['queued', 'processing', 'extracting'].includes(doc.estadoProcessamento || ''))) return
    const timer = window.setTimeout(reload, 3000)
    return () => window.clearTimeout(timer)
  }, [clienteId, list])
  useEffect(() => {
    apiFetch<DemandaOption[]>(`/clientes/${encodeURIComponent(clienteId)}/demandas`)
      .then(setDemandas)
      .catch(() => setDemandas([]))
  }, [clienteId])

  const filtered = useMemo(() => {
    if (!list) return null
    const query = searchQuery.trim().toLocaleLowerCase('pt-BR')
    const result = list.filter((document) => {
      if (filterFolder && (document.pastaDocumento || 'outros') !== filterFolder) return false
      if (!query) return true
      const searchable = [
        document.nome, document.tipoDocumento, document.tipoDocumentoIa, document.resumoIa,
        document.observacaoConsultor, document.processo?.etapa, document.processo?.responsavel,
        ...(document.camposEditaveis ?? []).flatMap((field) => [field.nome, field.valor]),
      ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')
      return searchable.includes(query)
    })
    return result.sort((a, b) => sortMode === 'nome'
      ? a.nome.localeCompare(b.nome, 'pt-BR')
      : new Date(b.enviadoEm).getTime() - new Date(a.enviadoEm).getTime())
  }, [filterFolder, list, searchQuery, sortMode])

  const folderCounts = useMemo(() => {
    const result = Object.fromEntries(DOCUMENT_FOLDERS.map((folder) => [folder.id, 0])) as Record<DocumentFolder, number>
    for (const document of list ?? []) result[document.pastaDocumento || 'outros'] += 1
    return result
  }, [list])

  const counts = useMemo(() => {
    if (!list) return null
    const out: Record<string, number> = {}
    for (const d of list) out[d.categoria] = (out[d.categoria] ?? 0) + 1
    const totalBytes = list.reduce((s, d) => s + d.tamanho, 0)
    const comResumo = list.filter((d) => d.resumoIa).length
    return { porCategoria: out, totalBytes, total: list.length, comResumo }
  }, [list])

  const reviewDocs = useMemo(() => {
    if (!list) return []
    return list
      .filter((d) => d.precisaRevisao || d.analiseErro || (d.sinais?.length ?? 0) > 0)
      .sort((a, b) => {
        const pa = a.prioridadeDocumento === 'alta' ? 0 : a.prioridadeDocumento === 'media' ? 1 : 2
        const pb = b.prioridadeDocumento === 'alta' ? 0 : b.prioridadeDocumento === 'media' ? 1 : 2
        return pa - pb
      })
      .slice(0, 6)
  }, [list])

  async function uploadOne(file: File, categoria: string, batchId: string) {
    const sourcePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const sourcePackage = sourcePath.includes('/') ? sourcePath.split('/')[0] : 'Upload CRM'
    const query = new URLSearchParams({
      categoria,
      importBatchId: batchId,
      sourcePackage,
      sourcePath,
    })
    if (uploadDemandId) query.set('demandaId', uploadDemandId)
    const fd = new FormData()
    fd.append('file', file)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 90_000)
    let res: Response
    try {
      res = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/documentos?${query}`, { method: 'POST', body: fd, signal: controller.signal })
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw new Error('O envio excedeu 90 segundos. O arquivo pode ser reenviado sem gerar duplicidade.')
      throw error
    } finally {
      window.clearTimeout(timer)
    }
    const json = await res.json().catch(() => ({ success: false, error: `Resposta inválida do servidor (HTTP ${res.status})` }))
    if (!res.ok || json.success === false) {
      throw new Error(json.error || `HTTP ${res.status}`)
    }
    return { duplicate: json.duplicate === true }
  }

  async function handleUploadFiles(files: FileList | File[] | null | undefined) {
    const selected = Array.from(files ?? [])
    if (selected.length === 0) return
    const batchId = `crm-web-${Date.now()}`
    const batch = selected.map((file, index) => {
      const sourcePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      return {
      id: `${batchId}-${index}-${sourcePath}`,
      name: file.name,
      size: file.size,
      sourcePath,
      categoria: inferUploadCategory(file, uploadCategoria),
      status: 'pending' as const,
    }})
    setUploadQueue(batch)
    setUploading(true)
    setError(null)
    setUploadNotice(null)
    let ok = 0
    let duplicates = 0
    const failed: string[] = []
    try {
      let cursor = 0
      const worker = async () => {
        while (cursor < selected.length) {
          const index = cursor++
          const file = selected[index]
          const itemId = batch[index].id
          try {
            setUploadQueue((prev) => prev.map((item) => (
              item.id === itemId ? { ...item, status: 'uploading', message: 'Enviando arquivo...' } : item
            )))
            const result = await uploadOne(file, batch[index].categoria, batchId)
            if (result.duplicate) duplicates += 1
            else ok += 1
            setUploadQueue((prev) => prev.map((item) => (
              item.id === itemId
                ? { ...item, status: result.duplicate ? 'duplicate' : 'done', message: result.duplicate ? 'Já existia; vínculo atualizado' : 'Recebido; análise em segundo plano' }
                : item
            )))
          } catch (err: any) {
            const message = String(err?.message || err)
            failed.push(`${file.name}: ${message}`)
            setUploadQueue((prev) => prev.map((item) => (
              item.id === itemId ? { ...item, status: 'error', message } : item
            )))
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, selected.length) }, worker))
      if (ok > 0 || duplicates > 0 || failed.length > 0) {
        const success = ok > 0 ? `${ok} novo(s)` : ''
        const duplicateNotice = duplicates > 0 ? `${duplicates} já existente(s), vínculos atualizados` : ''
        const failure = failed.length > 0 ? `${failed.length} falha(s): ${failed.slice(0, 2).join(' | ')}` : ''
        setUploadNotice([success, duplicateNotice, failure].filter(Boolean).join(' · '))
      }
      reload()
    } finally {
      setUploading(false)
      setDragActive(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete(doc: Documento) {
    if (!confirm(`Excluir "${doc.nome}"? Esta ação não pode ser desfeita.`)) return
    try {
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/documentos/${encodeURIComponent(doc.id)}`, {
        method: 'DELETE',
      })
      reload()
      setEditing(null)
    } catch (err: any) {
      setError(String(err?.message || err))
    }
  }

  async function handleSaveDoc(doc: Documento, patch: Partial<Documento>) {
    await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/documentos/${encodeURIComponent(doc.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: patch.nome,
        categoria: patch.categoria,
        resumoIa: patch.resumoIa,
        observacaoConsultor: patch.observacaoConsultor,
        demandaIds: patch.demandaIds,
        pastaDocumento: patch.pastaDocumento,
        tipoDocumento: patch.tipoDocumento,
        processo: patch.processo,
        camposEditaveis: patch.camposEditaveis,
      }),
    })
    setEditing(null)
    reload()
  }

  async function handleAnalyzeDoc(doc: Documento) {
    const updated = await apiFetch<Documento>(
      `/clientes/${encodeURIComponent(clienteId)}/documentos/${encodeURIComponent(doc.id)}/analisar`,
      { method: 'POST' },
    )
    setEditing(updated)
    reload()
  }

  function openPortalDocument(id: string) {
    const existing = list?.find((documento) => documento.id === id)
    if (existing) { setEditing(existing); return }
    void apiFetch<Documento[]>(`/clientes/${encodeURIComponent(clienteId)}/documentos`).then((documentos) => {
      setList(documentos)
      const documento = documentos.find((item) => item.id === id)
      if (documento) setEditing(documento)
      else setUploadNotice('O documento ainda não está disponível na listagem. Atualize em instantes.')
    }).catch((requestError) => setUploadNotice(requestError instanceof Error ? requestError.message : 'Não foi possível abrir o documento.'))
  }

  const workspaceNav = (
    <nav className="flex gap-1 overflow-x-auto rounded-lg border border-aletis-borda bg-card p-1.5 shadow-none" aria-label="Áreas de arquivos e processos">
      {[
        { id: 'arquivos' as const, label: 'Acervo organizado', icon: FolderOpen },
        { id: 'solicitacoes' as const, label: 'Solicitações do portal', icon: ClipboardList },
        { id: 'atendimento' as const, label: 'Atendimento e mensagens', icon: MessageSquare },
      ].map((item) => {
        const Icon = item.icon
        return <button key={item.id} type="button" onClick={() => setWorkspaceView(item.id)} className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition ${workspaceView === item.id ? 'bg-aletis-verde text-white' : 'text-[var(--text-soft)] hover:bg-aletis-bege'}`}><Icon className="h-3.5 w-3.5" />{item.label}</button>
      })}
    </nav>
  )

  if (workspaceView === 'solicitacoes') {
    return <div className="space-y-4 animate-fade-in">{workspaceNav}<Link to={`/clientes/${encodeURIComponent(clienteId)}?area=fiscal`} className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-aletis-borda bg-card p-4 text-sm font-semibold text-foreground">Fiscal / SEFAZ · notas, consultas e autorizações<span>Abrir área fiscal →</span></Link><ClientePortalDocumentosPanel clienteId={clienteId} clienteNome={clienteNome} onOpenDocumento={openPortalDocument} /></div>
  }

  if (workspaceView === 'atendimento') {
    return <div className="space-y-4 animate-fade-in">{workspaceNav}<ClientePortalAtendimentoPanel clienteId={clienteId} /></div>
  }

  if (error) {
    return (
      <div className="space-y-4">{workspaceNav}<DSCard className="rounded-lg border-red-300 bg-red-50/30 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300">Erro: {error}</p>
        <DSButton variant="secondary" size="sm" onClick={reload} className="mt-2">
          Tentar novamente
        </DSButton>
      </DSCard></div>
    )
  }

  if (list === null) {
    return (
      <div className="space-y-4">{workspaceNav}<DSCard className="rounded-lg shadow-none">
        <div className="h-32 bg-aletis-borda/30 rounded animate-pulse" />
      </DSCard></div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {workspaceNav}
      {/* Header com upload */}
      <DSCard
        className={`rounded-lg shadow-none transition-colors ${dragActive ? 'border-aletis-verde bg-aletis-verde/5' : ''}`}
      >
        <div
          onDragEnter={(e) => {
            e.preventDefault()
            if (e.dataTransfer?.types?.includes('Files')) setDragActive(true)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragActive(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            void handleUploadFiles(e.dataTransfer.files)
          }}
        >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="w-10 h-10 rounded-xl border border-aletis-borda bg-aletis-bege/45 flex items-center justify-center flex-shrink-0">
              <FileCheck className="w-5 h-5 text-foreground" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-display font-semibold text-foreground dark:text-white">
                Documentos do cliente
              </h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/60">
                Cofre digital de {clienteNome || clienteId}. Arraste vários arquivos aqui ou selecione manualmente; tudo fica anexado a este cliente.
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground dark:text-white/50">
                Limite operacional: até 20 MB por arquivo. O envio termina primeiro; OCR e IA continuam em segundo plano sem bloquear a tela.
              </p>
              {uploadNotice && (
                <p className="mt-1 text-[11px] font-semibold text-foreground">{uploadNotice}</p>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border pt-4">
            <select
              aria-label="Categoria dos arquivos enviados"
              value={uploadCategoria}
              onChange={(e) => setUploadCategoria(e.target.value)}
              className={`${docInputClass} h-9 min-w-0 max-w-full text-xs`}
            >
              <option value="auto">Organizar automaticamente</option>
              {CATEGORIAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={uploadDemandId}
              onChange={(e) => setUploadDemandId(e.target.value)}
              className={`${docInputClass} h-9 min-w-0 w-full text-xs sm:w-60`}
              title="Vincular arquivos a uma demanda"
            >
              <option value="">Sem demanda específica</option>
              {demandas.map((demanda) => (
                <option key={demanda.id} value={demanda.id}>
                  {demanda.codigo ? `${demanda.codigo} · ` : ''}{demanda.titulo}
                </option>
              ))}
            </select>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleUploadFiles(e.target.files)
              }}
            />
            <input
              ref={(node) => {
                folderRef.current = node
                if (node) node.setAttribute('webkitdirectory', '')
              }}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleUploadFiles(e.target.files)
              }}
            />
            <DSButton
              variant="secondary"
              size="sm"
              onClick={() => folderRef.current?.click()}
              disabled={uploading}
              className="h-9 rounded-xl"
              title="Enviar uma pasta completa preservando sua organização"
            >
              <FolderOpen className="w-4 h-4" />
              Enviar pasta
            </DSButton>
            <DSButton
              variant="primary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="h-9 rounded-xl"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Enviando…' : 'Enviar arquivos'}
            </DSButton>
          </div>
        </div>
        {uploadQueue.length > 0 && (
          <div className="mt-4 rounded-lg border border-aletis-borda bg-aletis-cream-papel/55 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-display font-semibold text-foreground dark:text-white">
                Fila de upload
              </p>
              {!uploading && (
                <button
                  type="button"
                  onClick={() => setUploadQueue([])}
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-white hover:text-aletis-verde"
                >
                  limpar fila
                </button>
              )}
            </div>
            <div className="space-y-2">
              {uploadQueue.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-aletis-borda bg-card px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                    item.status === 'done' || item.status === 'duplicate'
                      ? 'bg-emerald-100 text-emerald-700'
                      : item.status === 'error'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-aletis-verde/10 text-foreground'
                  }`}>
                    {item.status === 'uploading'
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : item.status === 'done' || item.status === 'duplicate'
                        ? <CheckCircle2 className="h-4 w-4" />
                        : item.status === 'error'
                          ? <AlertCircle className="h-4 w-4" />
                          : <FileText className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground dark:text-white" title={item.sourcePath || item.name}>
                      {item.sourcePath || item.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground dark:text-white/50">
                      {CAT_LABEL[item.categoria] ?? item.categoria} · {fmtBytes(item.size)} · {item.message || 'aguardando'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </DSCard>

      {counts && counts.total > 0 && (
        <DSCard className="!p-4 rounded-lg shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-display font-semibold text-foreground dark:text-white">Pastas do cliente</p>
              <p className="mt-1 text-xs text-[var(--text-soft)]">{counts.total} arquivo(s) · {fmtBytes(counts.totalBytes)} · {counts.comResumo} com leitura da IA</p>
            </div>
            <div className="flex max-w-full flex-wrap gap-2">
              <label className="relative min-w-0 flex-1 basis-64">
                <span className="sr-only">Buscar documentos do cliente</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar arquivo, dado, responsável..." className={`${docInputClass} h-10 w-full pl-9 pr-9`} />
                {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground hover:bg-aletis-bege"><X className="h-3.5 w-3.5" /></button>}
              </label>
              <select aria-label="Ordenar documentos" value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)} className={`${docInputClass} h-10 text-xs`}><option value="recentes">Mais recentes</option><option value="nome">Nome A–Z</option></select>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-2">
            {DOCUMENT_FOLDERS.map((folder) => {
              const Icon = folder.icon
              const selected = filterFolder === folder.id
              return <button key={folder.id} type="button" onClick={() => setFilterFolder(selected ? null : folder.id)} className={`min-w-0 rounded-xl border p-3 text-left transition ${selected ? 'border-aletis-verde bg-aletis-verde text-white shadow-sm' : 'border-aletis-borda bg-card hover:border-aletis-verde/40 hover:bg-aletis-bege/30'}`}><div className="flex items-start gap-2.5"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-white/15' : 'bg-aletis-bege text-foreground'}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold">{folder.label}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${selected ? 'bg-white/15' : 'bg-aletis-bege text-foreground'}`}>{folderCounts[folder.id]}</span></span><span className={`mt-1 block text-[11px] leading-snug ${selected ? 'text-white/70' : 'text-muted-foreground'}`}>{folder.description}</span></span></div></button>
            })}
          </div>
          {reviewDocs.length > 0 && <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-amber-900"><strong>{reviewDocs.length} arquivo(s) precisam de conferência.</strong> Abra o documento para corrigir a leitura e completar os dados.</p><button type="button" onClick={() => { setFilterFolder(null); setSearchQuery('') }} className="shrink-0 text-xs font-semibold text-amber-900 hover:underline">Ver todos</button></div>}
        </DSCard>
      )}

      {/* Tabela ou Empty */}
      {(filtered ?? []).length === 0 ? (
        <DSCard className="rounded-lg shadow-none">
          <DSEmpty
            icon={<AlertCircle className="w-6 h-6" />}
            title={
              filterFolder || searchQuery
                ? 'Nenhum documento encontrado'
                : 'Nenhum documento ainda'
            }
            description={
              filterFolder || searchQuery
                ? 'Limpe a pasta ou a busca para visualizar os outros arquivos do cliente.'
                : 'Faça o primeiro upload — contratos, RG/CPF, CCIR, ITR, comprovantes financeiros etc.'
            }
            cta={
              <DSButton
                variant="primary"
                onClick={() => {
                  if (filterFolder === 'patrimonio') setUploadCategoria('patrimonio')
                  if (filterFolder === 'financeiro' || filterFolder === 'contratos' || filterFolder === 'processos') setUploadCategoria('contrato')
                  if (filterFolder === 'cadastro') setUploadCategoria('identidade')
                  if (filterFolder === 'notas_fiscais_xml') setUploadCategoria('fiscal')
                  if (filterFolder === 'agro') setUploadCategoria('agro')
                  fileRef.current?.click()
                }}
              >
                <Upload className="w-4 h-4" /> Enviar documento
              </DSButton>
            }
          />
        </DSCard>
      ) : (
        <DSCard className="!p-0 overflow-hidden rounded-lg shadow-none">
          <div className="divide-y divide-aletis-borda md:hidden">
            {(filtered ?? []).map((d) => (
              <article key={d.id} className="p-3">
                <div className="flex items-start gap-2.5">
                  <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-display font-semibold leading-snug text-foreground dark:text-white">
                      {d.nome}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <DSBadge tone={CAT_TONE[d.categoria] ?? 'neutral'}>{FOLDER_LABEL[d.pastaDocumento || 'outros']}</DSBadge>
                      {d.processo && d.processo.status !== 'nao_iniciado' && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">{PROCESS_STATUS_LABEL[d.processo.status]}</span>}
                      {d.categoriaInteligente && (
                        <span className="rounded-full bg-aletis-bege/60 px-2 py-0.5 text-[11px] font-semibold text-[var(--text-soft)]">
                          {INTEL_CAT_LABEL[d.categoriaInteligente] ?? d.categoriaInteligente}
                        </span>
                      )}
                      {['queued', 'processing', 'extracting'].includes(d.estadoProcessamento || '') && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" /> IA processando
                        </span>
                      )}
                    </div>
                    {d.resumoIa && (
                      <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-[var(--text-soft)] dark:text-white/60">
                        <span className="font-semibold text-foreground">IA:</span> {d.resumoIa}
                      </p>
                    )}
                    {Boolean(d.precisaRevisao || d.sinais?.length) && (
                      <p className={`mt-2 text-[11px] leading-relaxed ${d.precisaRevisao ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground dark:text-white/45'}`}>
                        {d.precisaRevisao ? 'Revisar leitura · ' : ''}
                        {(d.sinais ?? []).slice(0, 3).join(' · ')}
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                      <span>{fmtBytes(d.tamanho)}</span>
                      <span>{fmtDate(d.enviadoEm)}</span>
                      <span>{d.enviadoPor === 'cliente' ? 'Cliente (portal)' : 'Consultor'}</span>
                      <span className="truncate" title={d.sha256 || undefined}>{d.sha256 ? `# ${d.sha256.slice(0, 8)}...` : 'sem hash'}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditing(d)}
                    className={docIconButtonClass}
                    title="Editar"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAnalyzeDoc(d).catch((err) => setError(String(err?.message || err)))}
                    className={`${docIconButtonClass} hover:text-aletis-dourado`}
                    title="Atualizar resumo IA"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={d.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${docIconButtonClass} text-foreground`}
                    title="Baixar"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(d)}
                    className={`${docIconButtonClass} text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20`}
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden md:block">
          <DSTable<Documento>
            dense
            columns={[
              {
                key: 'nome',
                label: 'Documento',
                render: (d) => (
                  <div className="min-w-0 flex items-start gap-2">
                    <FileText className="w-4 h-4 text-[var(--text-soft)] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-display font-semibold text-foreground dark:text-white truncate block">
                        {d.nome}
                      </span>
                      {['queued', 'processing', 'extracting'].includes(d.estadoProcessamento || '') && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" /> OCR e IA em processamento
                        </span>
                      )}
                      {d.resumoIa && (
                        <p className="mt-1 text-[11px] leading-snug text-[var(--text-soft)] dark:text-white/60 line-clamp-2">
                          <span className="font-semibold text-foreground">IA:</span> {d.resumoIa}
                        </p>
                      )}
                      {d.analiseErro && (
                        <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                          Análise parcial: {d.analiseErro}
                        </p>
                      )}
                      {d.observacaoConsultor && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground dark:text-white/50 line-clamp-1">
                          Obs.: {d.observacaoConsultor}
                        </p>
                      )}
                      {Boolean(d.precisaRevisao || d.sinais?.length) && (
                        <p className={`mt-1 text-[11px] ${d.precisaRevisao ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground dark:text-white/45'}`}>
                          {d.precisaRevisao ? 'Revisar leitura · ' : ''}
                          {(d.sinais ?? []).slice(0, 3).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                key: 'categoria',
                label: 'Pasta e processo',
                render: (d) => (
                  <div className="space-y-1">
                    <DSBadge tone={CAT_TONE[d.categoria] ?? 'neutral'}>{FOLDER_LABEL[d.pastaDocumento || 'outros']}</DSBadge>
                    <span className="block text-[11px] font-semibold text-[var(--text-soft)] dark:text-white/60">{d.tipoDocumento || INTEL_CAT_LABEL[d.categoriaInteligente || ''] || 'Tipo não informado'}</span>
                    {d.processo && d.processo.status !== 'nao_iniciado' && <span className="block text-[11px] text-sky-700">{PROCESS_STATUS_LABEL[d.processo.status]}{d.processo.etapa ? ` · ${d.processo.etapa}` : ''}</span>}
                  </div>
                ),
              },
              {
                key: 'tamanho',
                label: 'Tamanho',
                align: 'right',
                render: (d) => <span className="font-mono text-xs">{fmtBytes(d.tamanho)}</span>,
              },
              {
                key: 'origem',
                label: 'Origem',
                render: (d) => (
                  <div className="space-y-1">
                    <span className="block text-[11px] text-[var(--text-soft)] dark:text-white/50">
                      {d.enviadoPor === 'cliente' ? 'Cliente (portal)' : 'Consultor (interno)'}
                    </span>
                    {d.resumoOrigem && (
                      <DSBadge tone={d.resumoOrigem === 'openai' ? 'positive' : 'warning'}>
                        {d.resumoOrigem === 'openai' ? 'IA ALETIS' : 'Resumo local'}
                      </DSBadge>
                    )}
                  </div>
                ),
              },
              {
                key: 'enviadoEm',
                label: 'Data',
                render: (d) => (
                  <span className="text-[11px] text-muted-foreground dark:text-white/60">
                    {fmtDate(d.enviadoEm)}
                  </span>
                ),
              },
              {
                key: 'hash',
                label: 'SHA256',
                render: (d) =>
                  d.sha256 ? (
                    <span
                      className="font-mono text-[11px] text-[var(--text-soft)] dark:text-white/40"
                      title={d.sha256}
                    >
                      <Hash className="w-2.5 h-2.5 inline -mt-0.5" /> {d.sha256.slice(0, 8)}…
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (d) => (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(d)}
                      className={docIconButtonClass}
                      title="Editar"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAnalyzeDoc(d).catch((err) => setError(String(err?.message || err)))}
                      className={`${docIconButtonClass} hover:text-aletis-dourado`}
                      title="Atualizar resumo IA"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={d.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${docIconButtonClass} text-foreground`}
                      title="Baixar"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDelete(d)}
                      className={`${docIconButtonClass} text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20`}
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ),
              },
            ]}
            rows={filtered ?? []}
            rowKey={(d) => d.id}
          />
          </div>
        </DSCard>
      )}

      {editing && (
        <DocumentoEditModal
          key={`${editing.id}-${editing.resumoGeradoEm || 'current'}`}
          doc={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => handleSaveDoc(editing, patch)}
          onDelete={() => handleDelete(editing)}
          onAnalyze={() => handleAnalyzeDoc(editing)}
          demandas={demandas}
          onOpenOfficialDocuments={onOpenOfficialDocuments}
        />
      )}
    </div>
  )
}

function DocumentoEditModal({
  doc,
  onClose,
  onSave,
  onDelete,
  onAnalyze,
  demandas,
  onOpenOfficialDocuments,
}: {
  doc: Documento
  onClose: () => void
  onSave: (patch: Partial<Documento>) => Promise<void>
  onDelete: () => Promise<void>
  onAnalyze: () => Promise<void>
  demandas: DemandaOption[]
  onOpenOfficialDocuments?: () => void
}) {
  const [nome, setNome] = useState(doc.nome)
  const [categoria, setCategoria] = useState(doc.categoria || 'outros')
  const [resumoIa, setResumoIa] = useState(doc.resumoIa || '')
  const [observacaoConsultor, setObservacaoConsultor] = useState(doc.observacaoConsultor || '')
  const [demandaIds, setDemandaIds] = useState<string[]>(doc.demandaIds || [])
  const [pastaDocumento, setPastaDocumento] = useState<DocumentFolder>(doc.pastaDocumento || 'outros')
  const [tipoDocumento, setTipoDocumento] = useState(doc.tipoDocumento || doc.tipoDocumentoIa || '')
  const [processo, setProcesso] = useState<DocumentProcess>(doc.processo || { status: 'nao_iniciado', etapa: '', responsavel: '', dataDocumento: '', vencimento: '' })
  const [camposEditaveis, setCamposEditaveis] = useState<EditableDocumentField[]>((doc.camposEditaveis || []).map((field) => ({ ...field, nome: humanizeFieldName(field.nome) })))
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      await onSave({ nome, categoria, resumoIa, observacaoConsultor, demandaIds, pastaDocumento, tipoDocumento, processo, camposEditaveis })
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  function updateField(id: string, patch: Partial<EditableDocumentField>) {
    setCamposEditaveis((current) => current.map((field) => field.id === id
      ? { ...field, ...patch, origem: field.origem === 'ia' ? 'revisado' : field.origem }
      : field))
  }

  function addField() {
    const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setCamposEditaveis((current) => [...current, { id, nome: 'Novo dado', valor: '', origem: 'manual' }])
  }

  async function analyze() {
    setAnalyzing(true)
    setError(null)
    try {
      await onAnalyze()
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <MotionDialog
      title="Editar documento"
      subtitle={`${fmtBytes(doc.tamanho)} · ${doc.mime} · ${fmtDate(doc.enviadoEm)}`}
      eyebrow="Documento do cliente"
      icon={<FileText size={20} />}
      onClose={onClose}
      size="xl"
      bodyClassName="space-y-4 bg-aletis-cream-papel/35"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-red-200 bg-card px-3.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 sm:w-auto"
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <a
              href={doc.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={docSecondaryButtonClass}
            >
              <Download className="h-4 w-4" /> Baixar
            </a>
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenOfficialDocuments?.()
              }}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-verde/30 bg-card px-3.5 text-xs font-semibold text-foreground transition hover:bg-aletis-verde/10"
            >
              <FileText className="h-4 w-4" /> Gerar documento
            </button>
            <button
              type="button"
              onClick={analyze}
              disabled={analyzing || saving}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-dourado/40 bg-card px-3.5 text-xs font-semibold text-aletis-dourado transition hover:bg-aletis-dourado/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Atualizar IA
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className={docPrimaryButtonClass}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          <section className={docEditPanelClass}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-aletis-borda bg-muted text-foreground">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className={docEditLabelClass}>Arquivo em revisão</p>
                  <h3 className="mt-1 break-words font-display text-lg font-bold leading-tight text-foreground dark:text-white">
                    {nome || doc.nome}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-soft)] dark:text-white/60">
                    {FOLDER_LABEL[pastaDocumento]} · enviado por {doc.enviadoPor === 'cliente' ? 'cliente' : 'consultor'}
                  </p>
                </div>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[360px]">
                <DocMeta label="Tamanho" value={fmtBytes(doc.tamanho)} />
                <DocMeta label="Formato" value={doc.mime} />
                <DocMeta label="Enviado em" value={fmtDate(doc.enviadoEm)} />
              </div>
            </div>
          </section>

          <section className={docEditPanelClass}>
            <div className="mb-4">
              <p className={docEditLabelClass}>Cadastro do documento</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Ajuste o nome, a pasta e o tipo usado para localizar este arquivo no cliente.
              </p>
            </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_240px_210px]">
            <label className="block">
              <span className={docEditLabelClass}>Nome</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={`mt-1 w-full ${docInputClass}`}
              />
            </label>
            <label className="block">
              <span className={docEditLabelClass}>Pasta no acervo</span>
              <select
                value={pastaDocumento}
                onChange={(e) => setPastaDocumento(e.target.value as DocumentFolder)}
                className={`mt-1 w-full ${docInputClass}`}
              >
                {DOCUMENT_FOLDERS.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={docEditLabelClass}>Tipo de documento</span>
              <input value={tipoDocumento} onChange={(event) => setTipoDocumento(event.target.value)} placeholder="Ex.: NF-e, contrato bancário" className={`mt-1 w-full ${docInputClass}`} />
            </label>
          </div>
          <label className="mt-3 block max-w-xs">
            <span className={docEditLabelClass}>Categoria interna</span>
            <select value={categoria} onChange={(event) => setCategoria(event.target.value)} className={`mt-1 w-full ${docInputClass}`}>{CATEGORIAS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          </label>
          </section>

          <section className={docEditPanelClass}>
            <div className="mb-4">
              <p className={docEditLabelClass}>Andamento e uso no processo</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Registre onde este documento está sendo usado, quem acompanha e quais datas precisam ser controladas.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="block"><span className={docEditLabelClass}>Situação</span><select value={processo.status} onChange={(event) => setProcesso((current) => ({ ...current, status: event.target.value as DocumentProcessStatus }))} className={`mt-1 w-full ${docInputClass}`}>{Object.entries(PROCESS_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="block"><span className={docEditLabelClass}>Etapa / finalidade</span><input value={processo.etapa} onChange={(event) => setProcesso((current) => ({ ...current, etapa: event.target.value }))} placeholder="Ex.: conferência do contrato" className={`mt-1 w-full ${docInputClass}`} /></label>
              <label className="block"><span className={docEditLabelClass}>Responsável</span><input value={processo.responsavel} onChange={(event) => setProcesso((current) => ({ ...current, responsavel: event.target.value }))} placeholder="Nome do responsável" className={`mt-1 w-full ${docInputClass}`} /></label>
              <label className="block"><span className={docEditLabelClass}>Data do documento</span><input type="date" value={processo.dataDocumento} onChange={(event) => setProcesso((current) => ({ ...current, dataDocumento: event.target.value }))} className={`mt-1 w-full ${docInputClass}`} /></label>
              <label className="block"><span className={docEditLabelClass}>Vencimento / prazo</span><input type="date" value={processo.vencimento} onChange={(event) => setProcesso((current) => ({ ...current, vencimento: event.target.value }))} className={`mt-1 w-full ${docInputClass}`} /></label>
            </div>
          </section>

          <section className={docEditPanelClass}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><p className={docEditLabelClass}>Dados extraídos e complementares</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Revise qualquer valor lido pela IA e acrescente novos campos específicos deste documento ou processo.</p></div>
              <button type="button" onClick={addField} className={docSecondaryButtonClass}><Plus className="h-3.5 w-3.5" />Adicionar informação</button>
            </div>
            {camposEditaveis.length === 0 ? <button type="button" onClick={addField} className="w-full rounded-xl border border-dashed border-aletis-borda bg-aletis-cream-papel/40 px-4 py-6 text-sm font-semibold text-foreground hover:border-aletis-verde/40">Nenhum campo extraído. Clique para adicionar a primeira informação.</button> : <div className="space-y-2">{camposEditaveis.map((field) => <div key={field.id} className="grid gap-2 rounded-xl border border-aletis-borda bg-aletis-cream-papel/35 p-3 md:grid-cols-[minmax(180px,0.75fr)_minmax(260px,1.25fr)_auto] md:items-start"><label><span className={docEditLabelClass}>Campo</span><input value={field.nome} onChange={(event) => updateField(field.id, { nome: event.target.value })} className={`mt-1 w-full ${docInputClass}`} /></label><label><span className={docEditLabelClass}>Valor</span><textarea rows={2} value={field.valor} onChange={(event) => updateField(field.id, { valor: event.target.value })} className={`mt-1 w-full resize-y ${docInputClass}`} /></label><div className="flex items-center justify-between gap-2 md:mt-6"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${field.origem === 'ia' ? 'bg-violet-50 text-violet-700' : field.origem === 'revisado' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>{field.origem === 'ia' ? 'Extraído pela IA' : field.origem === 'revisado' ? 'Revisado' : 'Adicionado'}</span><button type="button" onClick={() => setCamposEditaveis((current) => current.filter((item) => item.id !== field.id))} aria-label={`Remover campo ${field.nome}`} className={`${docIconButtonClass} text-red-600 hover:bg-red-50`}><Trash2 className="h-3.5 w-3.5" /></button></div></div>)}</div>}
          </section>

          {demandas.length > 0 && (
            <section className={docEditPanelClass}>
              <div className="mb-3">
                <p className={docEditLabelClass}>Demandas relacionadas</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  O mesmo arquivo pode apoiar mais de uma negociação ou assunto deste cliente.
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {demandas.map((demanda) => {
                  const checked = demandaIds.includes(demanda.id)
                  return (
                    <label key={demanda.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-aletis-borda bg-aletis-cream-papel/45 px-3 py-2.5 transition hover:border-aletis-verde/40">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setDemandaIds((current) => checked
                          ? current.filter((id) => id !== demanda.id)
                          : [...current, demanda.id])}
                        className="mt-0.5 h-4 w-4 accent-aletis-verde"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-foreground dark:text-white">
                          {demanda.codigo ? `${demanda.codigo} · ` : ''}{demanda.titulo}
                        </span>
                        <span className="mt-0.5 block text-[11px] uppercase text-muted-foreground">{demanda.status.replace(/_/g, ' ')}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </section>
          )}

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
            <label className={docEditPanelClass}>
              <span className={docEditLabelClass}>Resumo IA / parecer rápido</span>
              <textarea
                value={resumoIa}
                onChange={(e) => setResumoIa(e.target.value)}
                rows={6}
                className={`mt-2 w-full resize-y leading-relaxed ${docInputClass}`}
              />
            </label>

            <label className={docEditPanelClass}>
              <span className={docEditLabelClass}>Observação do consultor</span>
              <textarea
                value={observacaoConsultor}
                onChange={(e) => setObservacaoConsultor(e.target.value)}
                rows={6}
                placeholder="Pendências, conferências, próximos passos ou uso desse arquivo no processo."
                className={`mt-2 w-full resize-y leading-relaxed ${docInputClass}`}
              />
            </label>
          </section>

          <section className={docEditPanelClass}>
          <div className="mb-4">
            <p className={docEditLabelClass}>Metadados e classificação inteligente</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Informações técnicas para auditoria, OCR, conferência da ALIX e organização do cofre digital.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <DocMeta label="Hash SHA256" value={doc.sha256 || 'não informado'} mono />
            <DocMeta label="Texto extraído" value={doc.textoExtraidoChars ? `${doc.textoExtraidoChars.toLocaleString('pt-BR')} caracteres` : 'não informado'} />
            <DocMeta label="Análise IA" value={doc.resumoGeradoEm ? fmtDate(doc.resumoGeradoEm) : 'não gerada'} />
            <DocMeta label="Grupo inteligente" value={INTEL_GROUP_LABEL[doc.grupoDocumento || ''] ?? doc.grupoDocumento ?? 'não classificado'} />
            <DocMeta label="Tipo inteligente" value={INTEL_CAT_LABEL[doc.categoriaInteligente || ''] ?? doc.categoriaInteligente ?? 'não classificado'} />
            <DocMeta label="Revisão" value={doc.precisaRevisao ? 'Revisar OCR/classificação' : 'Sem alerta automático'} />
          </div>
          </section>
          {doc.analiseErro && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Análise parcial: {doc.analiseErro}
            </p>
          )}
          {(doc.sinais?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-aletis-borda bg-card px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Sinais detectados pela ALIX</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(doc.sinais ?? []).map((sinal) => (
                  <span key={sinal} className="rounded-full border border-aletis-borda bg-aletis-bege/60 px-2 py-1 text-[11px] font-semibold text-[var(--text-soft)]">
                    {sinal}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
    </MotionDialog>
  )
}

function DocMeta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-aletis-borda bg-aletis-cream-papel/55 p-3 text-xs text-[var(--text-soft)] dark:bg-white/5 dark:border-white/10 dark:text-white/60">
      <p className="text-[11px] font-bold uppercase text-muted-foreground dark:text-white/40">{label}</p>
      <p className={`mt-1 break-words leading-relaxed [overflow-wrap:anywhere] ${mono ? 'font-mono text-[11px]' : 'font-semibold text-foreground dark:text-white'}`} title={value}>
        {value}
      </p>
    </div>
  )
}
