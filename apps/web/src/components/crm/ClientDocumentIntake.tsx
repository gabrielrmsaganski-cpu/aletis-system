import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileStack,
  FileText,
  Layers3,
  Loader2,
  RefreshCw,
  ScanLine,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import {
  CLIENT_DOCUMENT_TYPE_LABEL,
  INTAKE_FIELD_LABELS,
  displayIntakeValue,
  formatFileSize,
  type ClientDocumentType,
  type IntakeConflict,
  type IntakeDocumentPreview,
  type IntakeProgress,
  type NovoClienteAnexo,
} from './clientOnboarding'

interface ClientDocumentIntakeProps {
  anexos: NovoClienteAnexo[]
  dossier: IntakeDocumentPreview | null
  progress: IntakeProgress | null
  loading: boolean
  disabled?: boolean
  conflitosResolvidos: Set<string>
  onFiles: (files: FileList | File[]) => void
  onTypeChange: (id: string, tipo: ClientDocumentType) => void
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onReanalyzeAll: () => void
  onApplyConflict: (conflict: IntakeConflict, optionIndex: number) => void
}

const TYPE_CLASSES: Record<ClientDocumentType, string> = {
  auto: 'border-slate-200 bg-slate-50 text-slate-700',
  proposta: 'border-blue-200 bg-blue-50 text-blue-800',
  contrato: 'border-amber-200 bg-amber-50 text-amber-800',
  identidade: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  fiscal: 'border-violet-200 bg-violet-50 text-violet-800',
  patrimonio: 'border-rose-200 bg-rose-50 text-rose-800',
  agro: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  documento: 'border-slate-200 bg-card text-slate-700',
  outros: 'border-slate-200 bg-slate-50 text-slate-700',
}

const TYPE_OPTIONS: ClientDocumentType[] = [
  'auto', 'proposta', 'contrato', 'identidade', 'fiscal', 'patrimonio', 'agro', 'outros',
]

function statusText(anexo: NovoClienteAnexo): string {
  if (anexo.status === 'aguardando') return 'Na fila de leitura'
  if (anexo.status === 'analisando') return 'Lendo e extraindo dados'
  if (anexo.status === 'enviando') return 'Salvando no cliente'
  if (anexo.status === 'enviado') return 'Salvo no cliente'
  if (anexo.status === 'erro') return anexo.error || 'Leitura não concluída'
  return `${anexo.preview?.textoExtraidoChars.toLocaleString('pt-BR') ?? 0} caracteres lidos`
}

export function ClientDocumentIntake({
  anexos,
  dossier,
  progress,
  loading,
  disabled,
  conflitosResolvidos,
  onFiles,
  onTypeChange,
  onRemove,
  onRetry,
  onReanalyzeAll,
  onApplyConflict,
}: ClientDocumentIntakeProps) {
  const [dragging, setDragging] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const totalBytes = useMemo(() => anexos.reduce((total, anexo) => total + anexo.file.size, 0), [anexos])
  const ready = anexos.filter((anexo) => anexo.status === 'pronto' || anexo.status === 'enviado').length
  const errors = anexos.filter((anexo) => anexo.status === 'erro').length
  const unresolved = (dossier?.conflitos || []).filter((item) => !conflitosResolvidos.has(item.campo))
  const basicDocuments = dossier?.documentos.filter((item) => item.processamento !== 'profundo').length || 0
  const visibleAttachments = showAll ? anexos : anexos.slice(0, 8)
  const progressValue = progress?.total ? Math.round((progress.concluidos / progress.total) * 100) : 0
  const categoryCounts = useMemo(() => {
    const counts = new Map<ClientDocumentType, number>()
    for (const anexo of anexos) {
      const tipo = anexo.tipo === 'auto' ? anexo.preview?.tipoArquivo || 'auto' : anexo.tipo
      counts.set(tipo, (counts.get(tipo) || 0) + 1)
    }
    return [...counts.entries()].filter(([tipo]) => tipo !== 'auto')
  }, [anexos])

  return (
    <section className="mb-5 overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-aletis-borda px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileStack className="h-4 w-4 text-foreground" />
            <h3 className="text-sm font-display font-semibold text-foreground">Dossiê inteligente</h3>
            {anexos.length > 0 && (
              <span className="rounded-full bg-aletis-verde/10 px-2 py-0.5 text-[11px] font-bold text-foreground">
                {anexos.length} arquivo(s)
              </span>
            )}
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Adicione o dossiê completo. Os arquivos entram em uma fila automática, são lidos, separados e usados para preencher o cadastro.
          </p>
        </div>
        {anexos.length > 0 && (
          <button
            type="button"
            onClick={onReanalyzeAll}
            disabled={disabled || loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-aletis-borda bg-card px-3 py-2 text-xs font-semibold text-[var(--text-soft)] hover:bg-aletis-bege/40 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reprocessar dossiê
          </button>
        )}
      </div>

      <label
        className={`m-4 flex min-h-32 cursor-pointer flex-col items-center justify-center border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? 'border-aletis-verde bg-emerald-50' : 'border-aletis-borda bg-aletis-bege/20 hover:border-aletis-verde/50 hover:bg-aletis-bege/35'
        } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={(event) => { event.preventDefault(); setDragging(false) }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files)
        }}
      >
        <UploadCloud className="h-7 w-7 text-foreground" />
        <span className="mt-2 text-sm font-bold text-foreground">Arraste todos os documentos ou selecione um lote de arquivos</span>
        <span className="mt-1 text-[11px] text-muted-foreground">PDF, Word, Excel, CSV, imagens e textos. Novos arquivos podem ser adicionados a qualquer momento.</span>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-aletis-verde px-3 py-2 text-xs font-semibold text-white">
          <FileText className="h-3.5 w-3.5" /> Selecionar arquivos
        </span>
        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp"
          onChange={(event) => {
            if (event.currentTarget.files) onFiles(event.currentTarget.files)
            event.currentTarget.value = ''
          }}
          className="hidden"
        />
      </label>

      {anexos.length > 0 && (
        <>
          <div className="grid grid-cols-2 border-y border-aletis-borda bg-aletis-bege/20 sm:grid-cols-4">
            <IntakeMetric label="Recebidos" value={String(anexos.length)} icon={Layers3} />
            <IntakeMetric label="Lidos" value={`${ready}/${anexos.length}`} icon={ScanLine} />
            <IntakeMetric label="Volume" value={formatFileSize(totalBytes)} icon={FileStack} />
            <IntakeMetric label="Revisões" value={String(unresolved.length + errors)} icon={AlertTriangle} alert={unresolved.length + errors > 0} />
          </div>

          {loading && progress && (
            <div className="border-b border-aletis-borda px-4 py-3" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 font-semibold text-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
                  Processando lote {progress.loteAtual} de {progress.totalLotes}
                </span>
                <span className="font-mono text-muted-foreground">{progress.concluidos}/{progress.total}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-aletis-borda/60">
                <div className="h-full rounded-full bg-aletis-verde transition-[width] duration-500" style={{ width: `${progressValue}%` }} />
              </div>
            </div>
          )}

          {dossier && ready > 0 && (
            <div className="border-b border-aletis-borda px-4 py-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-aletis-dourado" />
                    Síntese do dossiê
                  </p>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{dossier.resumo}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    {Math.round((dossier.confianca || 0) * 100)}% confiança
                  </span>
                  {basicDocuments > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      <ScanLine className="h-2.5 w-2.5" /> Leitura inicial em {basicDocuments} documento(s)
                    </span>
                  )}
                  {typeof dossier.completude === 'number' && (
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                      {Math.round(dossier.completude * 100)}% completo
                    </span>
                  )}
                  {categoryCounts.map(([tipo, total]) => (
                    <span key={tipo} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TYPE_CLASSES[tipo]}`}>
                      {total} {CLIENT_DOCUMENT_TYPE_LABEL[tipo]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {dossier && ((dossier.alertas?.length || 0) > 0 || (dossier.lacunasCriticas?.length || 0) > 0 || (dossier.acoesRecomendadas?.length || 0) > 0) && (
            <div className="grid border-b border-aletis-borda bg-aletis-bege/15 md:grid-cols-3">
              <DossierList title="Alertas encontrados" items={dossier.alertas || []} tone="alert" />
              <DossierList title="Dados ainda necessários" items={dossier.lacunasCriticas || []} tone="missing" />
              <DossierList title="Próximos passos" items={dossier.acoesRecomendadas || []} tone="action" />
            </div>
          )}

          {unresolved.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50/60 px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-amber-900">A IA encontrou {unresolved.length} divergência(s) entre documentos</p>
                  <p className="mt-0.5 text-[11px] text-amber-800">Escolha o dado correto. A opção com maior consenso já foi aplicada ao formulário.</p>
                  <div className="mt-3 space-y-3">
                    {unresolved.map((conflict) => (
                      <div key={conflict.campo} className="border-t border-amber-200 pt-2 first:border-0 first:pt-0">
                        <p className="text-[11px] font-bold uppercase text-amber-900">{INTAKE_FIELD_LABELS[conflict.campo] || conflict.campo}</p>
                        {conflict.recomendacao && <p className="mt-1 text-[11px] leading-relaxed text-amber-800">ALIX: {conflict.recomendacao}</p>}
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {conflict.opcoes.slice(0, 3).map((option, index) => (
                            <button
                              key={`${conflict.campo}-${index}`}
                              type="button"
                              onClick={() => onApplyConflict(conflict, index)}
                              className="max-w-full rounded-lg border border-amber-300 bg-card px-3 py-2 text-left text-xs text-foreground hover:border-aletis-verde hover:bg-emerald-50"
                            >
                              <span className="block max-w-72 truncate font-semibold">{displayIntakeValue(option.value)}</span>
                              <span className="mt-0.5 block max-w-72 truncate text-[11px] text-muted-foreground">{option.fontes.join(', ')}</span>
                              {option.recomendadoPelaIa && <span className="mt-1 block text-[11px] font-bold text-foreground">Recomendado pela ALIX</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="max-h-[34rem] divide-y divide-aletis-borda overflow-y-auto">
            {visibleAttachments.map((anexo) => {
              const tipoFinal = anexo.tipo === 'auto' ? anexo.preview?.tipoArquivo || 'auto' : anexo.tipo
              return (
                <div key={anexo.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_170px_auto] md:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${TYPE_CLASSES[tipoFinal]}`}>
                      {anexo.status === 'analisando' || anexo.status === 'enviando'
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : anexo.status === 'erro'
                          ? <AlertTriangle className="h-4 w-4" />
                          : anexo.status === 'pronto' || anexo.status === 'enviado'
                            ? <CheckCircle2 className="h-4 w-4" />
                            : <FileText className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground" title={anexo.file.name}>{anexo.file.name}</p>
                      <p className={`mt-0.5 truncate text-[11px] ${anexo.status === 'erro' ? 'text-red-700' : 'text-muted-foreground'}`}>
                        {formatFileSize(anexo.file.size)} · {statusText(anexo)}
                        {anexo.preview?.processamento === 'profundo' ? ` · ${anexo.preview.evidencias?.length || 0} evidência(s)` : ''}
                      </p>
                      {anexo.preview?.resumo && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--text-soft)]">{anexo.preview.resumo}</p>}
                    </div>
                  </div>
                  <select
                    value={anexo.tipo}
                    onChange={(event) => onTypeChange(anexo.id, event.target.value as ClientDocumentType)}
                    disabled={disabled || anexo.status === 'enviando'}
                    className="input-field bg-card py-2 text-xs"
                    aria-label={`Categoria de ${anexo.file.name}`}
                  >
                    {TYPE_OPTIONS.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo === 'auto' && anexo.preview
                          ? `IA: ${CLIENT_DOCUMENT_TYPE_LABEL[anexo.preview.tipoArquivo]}`
                          : CLIENT_DOCUMENT_TYPE_LABEL[tipo]}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-end gap-1">
                    {anexo.status === 'erro' && (
                      <button type="button" onClick={() => onRetry(anexo.id)} disabled={disabled} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-amber-700 hover:bg-amber-50 disabled:opacity-50" title="Tentar ler novamente">
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => onRemove(anexo.id)} disabled={disabled || anexo.status === 'enviando'} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:opacity-50" title="Remover documento">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {anexos.length > 8 && (
            <button type="button" onClick={() => setShowAll((current) => !current)} className="w-full border-t border-aletis-borda px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-aletis-bege/30">
              {showAll ? 'Mostrar menos' : `Mostrar todos os ${anexos.length} arquivos`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function DossierList({ title, items, tone }: { title: string; items: string[]; tone: 'alert' | 'missing' | 'action' }) {
  const colors = tone === 'alert'
    ? 'text-amber-800 border-amber-100'
    : tone === 'missing'
      ? 'text-rose-800 border-rose-100'
      : 'text-emerald-800 border-emerald-100'
  return (
    <div className={`border-b p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 ${colors}`}>
      <p className="text-[11px] font-bold uppercase">{title}</p>
      {items.length ? (
        <ul className="mt-2 space-y-1.5">
          {items.slice(0, 4).map((item, index) => <li key={`${title}-${index}`} className="text-[11px] leading-snug">{item}</li>)}
        </ul>
      ) : <p className="mt-2 text-[11px] opacity-70">Nenhum item crítico.</p>}
    </div>
  )
}

function IntakeMetric({ label, value, icon: Icon, alert }: { label: string; value: string; icon: typeof FileText; alert?: boolean }) {
  return (
    <div className="border-r border-aletis-borda px-4 py-3 last:border-r-0">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</p>
      <p className={`mt-0.5 text-base font-display font-semibold ${alert ? 'text-amber-700' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}
