// ============================================================
// QuickActionsBar — barra de comandos do cliente.
// Ações agrupadas por categoria em dropdowns para reduzir
// poluição visual. Cada grupo expande em itens relacionados.
// ============================================================
import { useState, useEffect, useRef, useId, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../../hooks/useApi'
import {
  Sparkles,
  Store,
  Repeat,
  Thermometer,
  Bot,
  FileText,
  Presentation,
  Download,
  MessageCircle,
  Loader2,
  Plus,
  ClipboardCheck,
  ChevronDown,
  UploadCloud,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import type { Cliente } from './useClienteData'

const SimuladorRenegociacao = lazy(() => import('../../gestao-financeira/SimuladorRenegociacao'))
const StressTestModal = lazy(() => import('../../gestao-financeira/StressTestModal'))
const MarketplaceModal = lazy(() => import('../../gestao-financeira/MarketplaceModal'))
const NarrativaModal = lazy(() => import('../../gestao-financeira/NarrativaModal'))
const WizardOnboarding = lazy(() => import('../../gestao-financeira/WizardOnboarding'))
const ClienteIntelligentIntake = lazy(() => import('./ClienteIntelligentIntake'))

interface Props {
  urlId: string
  cliente: Cliente
  apiId: string | undefined
  onReload: () => Promise<void>
}

export default function QuickActionsBar({ urlId, cliente, apiId, onReload }: Props) {
  const navigate = useNavigate()
  const [group, setGroup] = useState<{ clienteId: string; id: string | null } | null>(null)
  const grupoId = group?.clienteId === apiId ? group?.id ?? null : null
  const [lookupState, setLookupState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [lookupAttempt, setLookupAttempt] = useState(0)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const scopeController = useRef<AbortController | null>(null)
  const [showSim, setShowSim] = useState(false)
  const [showStress, setShowStress] = useState(false)
  const [showMarket, setShowMarket] = useState(false)
  const [showNarr, setShowNarr] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [autoImporting, setAutoImporting] = useState(false)
  const [showIntelligentIntake, setShowIntelligentIntake] = useState(false)

  // Resolve o grupo GF do cliente (primeiro grupo encontrado).
  useEffect(() => {
    const controller = new AbortController()
    scopeController.current = controller
    setGroup(null)
    setLookupState(apiId ? 'loading' : 'ready')
    setFeedback(null)
    setShowSim(false)
    setShowStress(false)
    setShowMarket(false)
    setShowNarr(false)
    setShowWizard(false)
    setShowIntelligentIntake(false)
    setExporting(null)
    setAutoImporting(false)
    if (!apiId) return () => controller.abort()
    apiFetch<{ grupos: Array<{ id: string }> }>(
      `/gestao-financeira/grupos?clienteId=${encodeURIComponent(apiId)}`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (controller.signal.aborted) return
        setGroup({ clienteId: apiId, id: r.grupos?.[0]?.id ?? null })
        setLookupState('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLookupState('error')
        setFeedback({ tone: 'error', text: `Não foi possível consultar o financeiro. ${error instanceof Error ? error.message : 'Tente novamente.'}` })
      })
    return () => controller.abort()
  }, [apiId, lookupAttempt])

  async function autoImport() {
    const controller = scopeController.current
    if (!apiId || !controller || controller.signal.aborted || lookupState !== 'ready' || autoImporting) return
    setAutoImporting(true)
    setFeedback(null)
    try {
      const r = await apiFetch<{ grupo: { id: string } }>(
        '/gestao-financeira/auto-import-crm',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: apiId }), signal: controller.signal },
      )
      if (controller.signal.aborted) return
      if (r.grupo?.id) {
        setGroup({ clienteId: apiId, id: r.grupo.id })
        setFeedback({ tone: 'success', text: 'Financeiro preparado com os dados cadastrados deste cliente.' })
        await onReload()
      } else throw new Error('O servidor não confirmou o grupo financeiro criado.')
    } catch (error) {
      if (!controller.signal.aborted) setFeedback({ tone: 'error', text: `Não foi possível preparar o financeiro. ${error instanceof Error ? error.message : 'Tente novamente.'}` })
    } finally {
      if (!controller.signal.aborted) setAutoImporting(false)
    }
  }

  async function exportFile(format: 'pdf' | 'pptx' | 'xlsm') {
    const controller = scopeController.current
    if (!grupoId || !controller || controller.signal.aborted || exporting) return
    const config = {
      pdf: { endpoint: 'kit-banco-pdf', filename: `KitBanco_${cliente.nome}.pdf`, label: 'Kit Banco PDF' },
      pptx: { endpoint: 'diagnostico-pptx', filename: `Diagnostico_${cliente.nome}.pptx`, label: 'Apresentação do diagnóstico' },
      xlsm: { endpoint: 'export-xlsm', filename: `R.OP.001_${cliente.nome}.xlsm`, label: 'Planilha Excel' },
    }[format]
    setExporting(format)
    setFeedback(null)
    try {
      const url = `/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/${config.endpoint}`
      const resp = await fetch(url, {
        credentials: 'include',
        signal: controller.signal,
        ...(format === 'xlsm' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versao: 'v2' }) } : {}),
      })
      if (!resp.ok) {
        const payload = await resp.json().catch(() => null) as { message?: string; error?: string } | null
        throw new Error(payload?.message || payload?.error || `O servidor respondeu com HTTP ${resp.status}.`)
      }
      if (/json|text\/html/i.test(resp.headers.get('Content-Type') || '')) throw new Error('O servidor não retornou um arquivo para download.')
      const blob = await resp.blob()
      if (controller.signal.aborted) return
      if (!blob.size) throw new Error('O arquivo gerado está vazio.')
      downloadBlob(blob, resp.headers.get('Content-Disposition'), config.filename)
      setFeedback({ tone: 'success', text: `${config.label}: arquivo gerado e download iniciado.` })
    } catch (error) {
      if (!controller.signal.aborted) setFeedback({ tone: 'error', text: `Não foi possível exportar. ${error instanceof Error ? error.message : 'Tente novamente.'}` })
    } finally {
      if (!controller.signal.aborted) setExporting(null)
    }
  }

  function whatsapp() {
    const phone = (cliente.telefone || '').replace(/\D/g, '')
    if (phone.length < 10) {
      setFeedback({ tone: 'error', text: 'Cadastre um telefone válido para abrir a conversa no WhatsApp.' })
      return
    }
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`
    const msg = encodeURIComponent(`Olá ${cliente.nome}, aqui é a ALETIS. Gostaríamos de conversar sobre sua reestruturação financeira.`)
    window.open(`https://wa.me/${fullPhone}?text=${msg}`, '_blank')
  }

  return (
    <>
      <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-aletis-borda bg-card px-3 py-2 shadow-none">
        <span className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-xl bg-aletis-bege/60 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
          <Sparkles className="h-3.5 w-3.5 text-aletis-dourado" />
          Ações rápidas
        </span>

        {!grupoId ? (
          <ActionBtn
            label={autoImporting ? 'Preparando…' : lookupState === 'loading' ? 'Consultando financeiro…' : lookupState === 'error' ? 'Reconsultar financeiro' : 'Preparar financeiro'}
            icon={autoImporting || lookupState === 'loading' ? Loader2 : Plus}
            tone="primary"
            onClick={lookupState === 'error' ? () => setLookupAttempt((current) => current + 1) : autoImport}
            disabled={!apiId || autoImporting || lookupState === 'loading'}
            spin={autoImporting || lookupState === 'loading'}
            tooltip="Cria grupo de gestão financeira pré-populado a partir do CRM"
          />
        ) : (
          <>
            {/* Simular */}
            <ActionDropdown label="Simular" icon={Repeat}>
              <DropdownItem
                label="Renegociação"
                icon={Repeat}
                onClick={() => setShowSim(true)}
                description="PRICE/SAC/BULLET"
              />
              <DropdownItem
                label="Stress test"
                icon={Thermometer}
                onClick={() => setShowStress(true)}
                description="Queda de preço/rendimento"
              />
            </ActionDropdown>

            {/* Exportar */}
            <ActionDropdown label="Exportar" icon={Download}>
              <DropdownItem
                label={exporting === 'pdf' ? 'Gerando…' : 'Kit Banco PDF'}
                icon={exporting === 'pdf' ? Loader2 : FileText}
                spin={exporting === 'pdf'}
                onClick={() => exportFile('pdf')}
                disabled={!!exporting}
                description="PDF 13 seções"
              />
              <DropdownItem
                label={exporting === 'pptx' ? 'Gerando…' : 'PPT Diagnóstico'}
                icon={exporting === 'pptx' ? Loader2 : Presentation}
                spin={exporting === 'pptx'}
                onClick={() => exportFile('pptx')}
                disabled={!!exporting}
                description="13 slides com charts"
              />
              <DropdownItem
                label={exporting === 'xlsm' ? 'Gerando…' : 'Exportar .xlsm'}
                icon={exporting === 'xlsm' ? Loader2 : Download}
                spin={exporting === 'xlsm'}
                onClick={() => exportFile('xlsm')}
                disabled={!!exporting}
                description="Exportação Excel"
              />
            </ActionDropdown>

            {/* Assistentes */}
            <ActionDropdown label="Assistentes" icon={Sparkles}>
              <DropdownItem
                label="Narrativa ALIX"
                icon={Bot}
                onClick={() => setShowNarr(true)}
                description="Análise textual contextual"
              />
              <DropdownItem
                label="Wizard GF"
                icon={Sparkles}
                onClick={() => setShowWizard(true)}
                description="Onboarding guiado 4 passos"
              />
              <DropdownItem
                label="Marketplace"
                icon={Store}
                onClick={() => setShowMarket(true)}
                description="Aplicar template de outros grupos"
              />
            </ActionDropdown>
          </>
        )}

        <Sep />
        <ActionBtn
          label="Entrada IA"
          icon={UploadCloud}
          tone="ai"
          onClick={() => setShowIntelligentIntake(true)}
          tooltip="Enviar arquivos, analisar com IA e encaminhar para o local correto"
        />
        <ActionBtn
          label="Dossiê Vivo"
          icon={FileText}
          onClick={() => navigate(`/clientes/${urlId}/dossie-vivo`)}
          tooltip="Visão unificada de documentos, pendências, demandas e propostas"
        />
        <ActionBtn
          label="Checklist"
          icon={ClipboardCheck}
          tone="primary"
          onClick={() => navigate(`/clientes/${urlId}/checklist`)}
          tooltip="R.OP.003 / 004 / 005 — Checklist de assessoria"
        />
        <ActionBtn label="WhatsApp" icon={MessageCircle} onClick={whatsapp} tooltip="Abrir WhatsApp Web" />
      </div>
      {feedback && <div role={feedback.tone === 'error' ? 'alert' : 'status'} className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${feedback.tone === 'error' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{feedback.tone === 'error' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}<span>{feedback.text}</span></div>}

      {/* Modais lazy */}
      {showSim && grupoId && (
        <Suspense fallback={null}>
          <SimuladorRenegociacao grupoId={grupoId} onClose={() => setShowSim(false)} />
        </Suspense>
      )}
      {showStress && grupoId && (
        <Suspense fallback={null}>
          <StressTestModal grupoId={grupoId} onClose={() => setShowStress(false)} />
        </Suspense>
      )}
      {showMarket && grupoId && (
        <Suspense fallback={null}>
          <MarketplaceModal grupoId={grupoId} onClose={() => setShowMarket(false)} onApplied={onReload} />
        </Suspense>
      )}
      {showNarr && grupoId && (
        <Suspense fallback={null}>
          <NarrativaModal grupoId={grupoId} onClose={() => setShowNarr(false)} />
        </Suspense>
      )}
      {showWizard && apiId && (
        <Suspense fallback={null}>
          <WizardOnboarding
            clienteId={apiId}
            clienteNome={cliente.nome}
            onClose={() => setShowWizard(false)}
            onSuccess={async (gid) => {
              if (scopeController.current?.signal.aborted) return
              setShowWizard(false)
              setGroup({ clienteId: apiId, id: gid })
              await onReload()
            }}
          />
        </Suspense>
      )}
      {showIntelligentIntake && apiId && (
        <Suspense fallback={null}>
          <ClienteIntelligentIntake
            clienteId={apiId}
            clienteNome={cliente.nome}
            urlId={urlId}
            onClose={() => setShowIntelligentIntake(false)}
            onReload={onReload}
          />
        </Suspense>
      )}
    </>
  )
}

// ────────────────────────────────────────────────────────────
// ActionBtn — botão simples (mantido igual, estilo aletis)
// ────────────────────────────────────────────────────────────
interface ActionBtnProps {
  label: string
  icon: typeof Sparkles
  onClick: () => void
  disabled?: boolean
  spin?: boolean
  tone?: 'primary' | 'ai' | 'default'
  tooltip?: string
}

function ActionBtn({ label, icon: Icon, onClick, disabled, spin, tone, tooltip }: ActionBtnProps) {
  const cls =
    tone === 'primary'
      ? 'bg-aletis-verde text-white hover:bg-aletis-verde-escuro'
      : tone === 'ai'
      ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:opacity-90'
      : 'bg-card border border-aletis-borda text-foreground hover:bg-aletis-bege/40'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={`inline-flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[11px] font-body font-semibold transition-all disabled:opacity-50 ${cls}`}
    >
      <Icon className={`w-3 h-3 ${spin ? 'animate-spin' : ''}`} />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

// ────────────────────────────────────────────────────────────
// ActionDropdown — botão que expande em menu de itens
// ────────────────────────────────────────────────────────────
function ActionDropdown({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon: typeof Sparkles
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-aletis-borda bg-card px-3 text-[11px] font-body font-semibold text-foreground transition-all hover:bg-aletis-bege/40"
      >
        <Icon className="w-3 h-3" />
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* backdrop para fechar ao clicar fora */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div id={menuId} onClick={(event) => { if ((event.target as HTMLElement).closest('button:not(:disabled)')) setOpen(false) }} className="absolute left-0 top-full z-50 mt-1 min-w-[240px] animate-fade-in rounded-xl border border-aletis-borda bg-card py-1 shadow-sm">
            {children}
          </div>
        </>
      )}
    </div>
  )
}

interface DropdownItemProps {
  label: string
  icon: typeof Sparkles
  onClick: () => void
  disabled?: boolean
  spin?: boolean
  description?: string
}

function DropdownItem({ label, icon: Icon, onClick, disabled, spin, description }: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-aletis-bege/40 disabled:opacity-50"
    >
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground ${spin ? 'animate-spin' : ''}`} />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-foreground">{label}</p>
        {description && <p className="truncate text-[11px] text-muted-foreground">{description}</p>}
      </div>
    </button>
  )
}

function Sep() {
  return <span className="hidden h-5 w-px flex-shrink-0 bg-aletis-borda sm:block" />
}

function downloadBlob(blob: Blob, contentDisposition: string | null, fallback: string) {
  const dl = document.createElement('a')
  dl.href = URL.createObjectURL(blob)
  const m = (contentDisposition ?? '').match(/filename="?([^"]+)"?/)
  dl.download = m?.[1] ?? fallback
  dl.click()
  setTimeout(() => URL.revokeObjectURL(dl.href), 30_000)
}
