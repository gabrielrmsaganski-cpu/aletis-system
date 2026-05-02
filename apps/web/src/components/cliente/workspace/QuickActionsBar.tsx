// ============================================================
// QuickActionsBar — barra de comandos épicos do cliente.
// Promove ações que estavam escondidas atrás de 3-4 cliques.
// Inclui: Wizard GF, Marketplace, Simulador, Stress, Narrativa,
// Kit Banco PDF, PPT diagnóstico, Backup, Edit cliente.
// ============================================================
import { useState, useEffect, lazy, Suspense } from 'react'
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
  Edit3,
  MessageCircle,
  Loader2,
  Plus,
} from 'lucide-react'
import type { Cliente } from './useClienteData'

const SimuladorRenegociacao = lazy(() => import('../../gestao-financeira/SimuladorRenegociacao'))
const StressTestModal = lazy(() => import('../../gestao-financeira/StressTestModal'))
const MarketplaceModal = lazy(() => import('../../gestao-financeira/MarketplaceModal'))
const NarrativaModal = lazy(() => import('../../gestao-financeira/NarrativaModal'))
const WizardOnboarding = lazy(() => import('../../gestao-financeira/WizardOnboarding'))

interface Props {
  urlId: string
  cliente: Cliente
  apiId: string | undefined
  onReload: () => Promise<void>
}

export default function QuickActionsBar({ urlId, cliente, apiId, onReload }: Props) {
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [showSim, setShowSim] = useState(false)
  const [showStress, setShowStress] = useState(false)
  const [showMarket, setShowMarket] = useState(false)
  const [showNarr, setShowNarr] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [autoImporting, setAutoImporting] = useState(false)

  // Resolve o grupo GF do cliente (primeiro grupo encontrado).
  useEffect(() => {
    if (!apiId) return
    apiFetch<{ grupos: Array<{ id: string }> }>(
      `/gestao-financeira/grupos?clienteId=${encodeURIComponent(apiId)}`,
    )
      .then((r) => {
        if (r.grupos?.[0]) setGrupoId(r.grupos[0].id)
      })
      .catch(() => {})
  }, [apiId])

  async function autoImport() {
    if (!apiId) return
    setAutoImporting(true)
    try {
      const r = await apiFetch<{ grupo: { id: string } }>(
        '/gestao-financeira/auto-import-crm',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: apiId }) },
      )
      if (r.grupo?.id) {
        setGrupoId(r.grupo.id)
        await onReload()
      }
    } finally {
      setAutoImporting(false)
    }
  }

  async function exportPdf() {
    if (!grupoId) return
    setExporting('pdf')
    try {
      const url = `/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/kit-banco-pdf`
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      downloadBlob(blob, resp.headers.get('Content-Disposition'), `KitBanco_${cliente.nome}.pdf`)
    } finally {
      setExporting(null)
    }
  }

  async function exportPptx() {
    if (!grupoId) return
    setExporting('pptx')
    try {
      const url = `/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/diagnostico-pptx`
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      downloadBlob(blob, resp.headers.get('Content-Disposition'), `Diagnostico_${cliente.nome}.pptx`)
    } finally {
      setExporting(null)
    }
  }

  async function exportXlsm() {
    if (!grupoId) return
    setExporting('xlsm')
    try {
      const url = `/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/export-xlsm`
      const resp = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versao: 'v2' }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      downloadBlob(blob, resp.headers.get('Content-Disposition'), `R.OP.001_${cliente.nome}.xlsm`)
    } finally {
      setExporting(null)
    }
  }

  function whatsapp() {
    const phone = cliente.telefone.replace(/\D/g, '')
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`
    const msg = encodeURIComponent(`Olá ${cliente.nome}, aqui é a ALETIS. Gostaríamos de conversar sobre sua reestruturação financeira.`)
    window.open(`https://wa.me/${fullPhone}?text=${msg}`, '_blank')
  }

  return (
    <>
      <div className="mt-3 card-premium px-3 py-2 flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] font-mono uppercase tracking-wider text-aletis-grafite-claro font-semibold flex-shrink-0">
          ⚡ ações
        </span>

        {!grupoId ? (
          <ActionBtn
            label={autoImporting ? 'Importando…' : 'Auto-import GF'}
            icon={autoImporting ? Loader2 : Plus}
            tone="primary"
            onClick={autoImport}
            disabled={autoImporting}
            spin={autoImporting}
            tooltip="Cria grupo de gestão financeira pré-populado a partir do CRM"
          />
        ) : (
          <>
            <ActionBtn
              label="Simular renegociação"
              icon={Repeat}
              tone="primary"
              onClick={() => setShowSim(true)}
              tooltip="PRICE/SAC/BULLET — compara nova proposta vs contrato atual"
            />
            <ActionBtn
              label="Stress test"
              icon={Thermometer}
              onClick={() => setShowStress(true)}
              tooltip="Simula queda de preço/rendimento"
            />
            <ActionBtn
              label="Narrativa Aletéia"
              icon={Bot}
              tone="ai"
              onClick={() => setShowNarr(true)}
              tooltip="Gera análise textual via LLM (Claude Foundry)"
            />
            <ActionBtn
              label="Marketplace"
              icon={Store}
              onClick={() => setShowMarket(true)}
              tooltip="Aplicar template de outros grupos"
            />
            <Sep />
            <ActionBtn
              label={exporting === 'pdf' ? 'Gerando…' : 'Kit banco PDF'}
              icon={exporting === 'pdf' ? Loader2 : FileText}
              spin={exporting === 'pdf'}
              onClick={exportPdf}
              disabled={!!exporting}
              tooltip="PDF profissional (13 seções) para apresentar ao banco"
            />
            <ActionBtn
              label={exporting === 'pptx' ? 'Gerando…' : 'PPT diagnóstico'}
              icon={exporting === 'pptx' ? Loader2 : Presentation}
              spin={exporting === 'pptx'}
              onClick={exportPptx}
              disabled={!!exporting}
              tooltip=".pptx 13 slides com charts nativos"
            />
            <ActionBtn
              label={exporting === 'xlsm' ? 'Gerando…' : 'Exportar .xlsm'}
              icon={exporting === 'xlsm' ? Loader2 : Download}
              spin={exporting === 'xlsm'}
              onClick={exportXlsm}
              disabled={!!exporting}
              tooltip="R.OP.001 v2.0 com VBA preservado"
            />
          </>
        )}

        <Sep />
        <ActionBtn label="Wizard GF" icon={Sparkles} onClick={() => setShowWizard(true)} tooltip="Onboarding guiado em 4 passos" />
        <ActionBtn label="WhatsApp" icon={MessageCircle} onClick={whatsapp} tooltip="Abrir WhatsApp Web" />
      </div>

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
              setShowWizard(false)
              setGrupoId(gid)
              await onReload()
            }}
          />
        </Suspense>
      )}
    </>
  )
}

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
    tone === 'primary' ? 'bg-aletis-verde text-white hover:bg-aletis-verde-escuro' :
    tone === 'ai' ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:opacity-90' :
    'bg-white border border-aletis-borda text-aletis-grafite-escuro hover:bg-aletis-bege/40'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-body font-semibold inline-flex items-center gap-1.5 transition-all disabled:opacity-50 ${cls}`}
    >
      <Icon className={`w-3 h-3 ${spin ? 'animate-spin' : ''}`} />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

function Sep() {
  return <span className="w-px h-5 bg-aletis-borda flex-shrink-0" />
}

function downloadBlob(blob: Blob, contentDisposition: string | null, fallback: string) {
  const dl = document.createElement('a')
  dl.href = URL.createObjectURL(blob)
  const m = (contentDisposition ?? '').match(/filename="?([^"]+)"?/)
  dl.download = m?.[1] ?? fallback
  dl.click()
  setTimeout(() => URL.revokeObjectURL(dl.href), 30_000)
}
