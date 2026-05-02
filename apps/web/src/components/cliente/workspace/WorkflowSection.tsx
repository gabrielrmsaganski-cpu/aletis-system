// ============================================================
// WorkflowSection — processo, documentos e colaboração.
// Concentra: Processo TEX (17 etapas), Documentos, Fluxo de Caixa,
// Comentários colaborativos, Changelog, Timeline e Chat Portal.
// ============================================================
import { useEffect, useState, lazy, Suspense } from 'react'
import { apiFetch } from '../../../hooks/useApi'
import {
  Workflow,
  FileText,
  MessageSquare,
  History,
  Clock,
  Send,
  Wallet,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'
import { fmtData, fmtDataHora } from './utils'

const ProcessoAssessoriaTab = lazy(() => import('../../processo/ProcessoAssessoriaTab'))
const ClienteDocumentosTab = lazy(() => import('../ClienteDocumentosTab'))
const ClienteFluxoCaixaTab = lazy(() => import('../ClienteFluxoCaixaTab'))
const ChangelogPanel = lazy(() => import('../../gestao-financeira/ChangelogPanel'))
const ComentariosPanel = lazy(() => import('../../gestao-financeira/ComentariosPanel'))

type WfTab = 'processo' | 'documentos' | 'colaboracao' | 'fluxo' | 'timeline'

interface Props {
  data: UseClienteDataReturn
}

const TABS: { key: WfTab; label: string; emoji: string; icon: typeof Workflow }[] = [
  { key: 'processo', label: 'Processo TEX', emoji: '⏱️', icon: Workflow },
  { key: 'documentos', label: 'Documentos', emoji: '📁', icon: FileText },
  { key: 'colaboracao', label: 'Colaboração', emoji: '💬', icon: MessageSquare },
  { key: 'fluxo', label: 'Fluxo de caixa', emoji: '💰', icon: Wallet },
  { key: 'timeline', label: 'Timeline & Chat', emoji: '🕐', icon: Clock },
]

export default function WorkflowSection({ data }: Props) {
  const { cliente, apiId } = data
  const [active, setActive] = useState<WfTab>('processo')
  const [grupoId, setGrupoId] = useState<string | null>(null)

  useEffect(() => {
    if (!apiId) return
    apiFetch<{ grupos: Array<{ id: string }> }>(`/gestao-financeira/grupos?clienteId=${apiId}`)
      .then((r) => { if (r.grupos?.[0]) setGrupoId(r.grupos[0].id) })
      .catch(() => {})
  }, [apiId])

  if (!cliente || !apiId) return null

  return (
    <div className="space-y-3 animate-fade-in">
      <header className="card-premium p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-aletis-grafite-escuro to-aletis-grafite-medio flex items-center justify-center flex-shrink-0">
          <Workflow className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-aletis-grafite-escuro uppercase font-semibold tracking-wider">
            🔄 processo & colaboração
          </p>
          <h2 className="text-base font-display font-bold text-aletis-grafite-escuro">Workflow</h2>
          <p className="text-xs font-body text-aletis-grafite-medio mt-0.5">
            Processo TEX (17 etapas com SLAs), documentos canônicos, comentários colaborativos com SSE em tempo real,
            changelog de auditoria, fluxo de caixa e timeline do cliente.
          </p>
        </div>
      </header>

      {/* Sub-tabs */}
      <nav className="card-premium px-2 py-1.5 flex gap-1 overflow-x-auto" role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-body font-semibold inline-flex items-center gap-1.5 transition-colors ${
                isActive ? 'bg-aletis-grafite-escuro text-white' : 'text-aletis-grafite-escuro hover:bg-aletis-bege/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </nav>

      {active === 'processo' && (
        <Suspense fallback={<Sk />}>
          <ProcessoAssessoriaTab clienteId={apiId} clienteNome={cliente.nome} />
        </Suspense>
      )}
      {active === 'documentos' && (
        <Suspense fallback={<Sk />}>
          <ClienteDocumentosTab clienteId={apiId} />
        </Suspense>
      )}
      {active === 'colaboracao' && (
        <ColaboracaoView grupoId={grupoId} />
      )}
      {active === 'fluxo' && (
        <Suspense fallback={<Sk />}>
          <ClienteFluxoCaixaTab clienteId={apiId} />
        </Suspense>
      )}
      {active === 'timeline' && (
        <TimelineView clienteId={apiId} clienteNome={cliente.nome} />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function ColaboracaoView({ grupoId }: { grupoId: string | null }) {
  if (!grupoId) {
    return (
      <div className="card-premium p-8 text-center">
        <MessageSquare className="w-6 h-6 text-aletis-grafite-claro/40 mx-auto mb-2" />
        <p className="text-xs text-aletis-grafite-claro">
          Comentários e Changelog requerem grupo de gestão financeira ativo.
          Crie via <strong>auto-import</strong> na Operação ou QuickActionsBar.
        </p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Suspense fallback={<Sk />}>
        <ComentariosPanel grupoId={grupoId} />
      </Suspense>
      <Suspense fallback={<Sk />}>
        <ChangelogPanel grupoId={grupoId} />
      </Suspense>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
interface TimelineEvent {
  id: string
  tipo: string
  data: string
  titulo?: string
  descricao?: string
  detalhes?: string
  usuario?: string
}

interface PortalMsg {
  id: string
  de: 'cliente' | 'consultor' | 'sistema'
  autorNome: string
  texto: string
  criadoEm: string
}

function TimelineView({ clienteId, clienteNome }: { clienteId: string; clienteNome: string }) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [portalAtivo, setPortalAtivo] = useState(false)
  const [portalMsgs, setPortalMsgs] = useState<PortalMsg[]>([])
  const [chat, setChat] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    apiFetch<any>(`/clientes/${clienteId}`)
      .then((d) => {
        setTimeline(Array.isArray(d?.timeline) ? d.timeline : [])
        setPortalAtivo(!!d?.portalAcesso?.ativo)
        setPortalMsgs(Array.isArray(d?.portalMensagens) ? d.portalMensagens : [])
      })
      .catch(() => {})
  }, [clienteId])

  // poll de mensagens do portal
  useEffect(() => {
    if (!portalAtivo) return
    let cancelled = false
    const fetchMsgs = async () => {
      try {
        const r = await apiFetch<{ success: boolean; data: PortalMsg[] }>(
          `/clientes/${clienteId}/portal-mensagens`,
        )
        if (!cancelled && r?.success) setPortalMsgs(r.data)
      } catch {}
    }
    fetchMsgs()
    const id = window.setInterval(fetchMsgs, 10_000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [clienteId, portalAtivo])

  async function enviar() {
    const t = chat.trim()
    if (!t) return
    setSending(true)
    try {
      const r = await apiFetch<{ success: boolean; data: PortalMsg }>(
        `/clientes/${clienteId}/portal-mensagens`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: t }) },
      )
      if (r?.success) {
        setPortalMsgs((p) => [...p, r.data])
        setChat('')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Timeline */}
      <section className="card-premium p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-aletis-verde" />
          <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Timeline do cliente</h3>
          <span className="text-[10px] text-aletis-grafite-claro ml-auto">{timeline.length} evento(s)</span>
        </div>
        {timeline.length === 0 ? (
          <p className="text-xs text-aletis-grafite-claro italic text-center py-4">Sem eventos registrados.</p>
        ) : (
          <ol className="relative pl-4 border-l-2 border-aletis-borda">
            {timeline.slice().reverse().map((ev) => (
              <li key={ev.id} className="mb-3 ml-2">
                <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-aletis-verde" />
                <p className="text-[10px] font-mono text-aletis-grafite-claro uppercase tracking-wider">
                  {fmtData(ev.data)} · {ev.tipo}
                </p>
                <p className="text-xs font-semibold text-aletis-grafite-escuro mt-0.5">
                  {ev.titulo ?? ev.descricao?.slice(0, 80) ?? 'Evento'}
                </p>
                {(ev.detalhes ?? ev.descricao) && (
                  <p className="text-[11px] text-aletis-grafite-medio mt-0.5 leading-snug">
                    {ev.detalhes ?? ev.descricao}
                  </p>
                )}
                {ev.usuario && (
                  <p className="text-[10px] text-aletis-grafite-claro mt-0.5">por {ev.usuario}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Chat Portal */}
      <section className="card-premium p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-aletis-verde" />
          <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro">Chat Portal Cliente</h3>
          <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
            portalAtivo ? 'bg-emerald-100 text-emerald-700' : 'bg-aletis-grafite-claro/15 text-aletis-grafite-medio'
          }`}>
            {portalAtivo ? 'ativo' : 'sem acesso'}
          </span>
        </div>
        {!portalAtivo ? (
          <p className="text-xs text-aletis-grafite-claro italic">
            {clienteNome} não tem acesso ao portal cliente. Crie um acesso para iniciar conversas.
          </p>
        ) : (
          <>
            <div className="space-y-2 max-h-72 overflow-y-auto mb-2 bg-aletis-bege/20 rounded-lg p-2">
              {portalMsgs.length === 0 ? (
                <p className="text-xs text-aletis-grafite-claro italic text-center py-3">Nenhuma mensagem ainda.</p>
              ) : portalMsgs.map((m) => (
                <div key={m.id} className={`flex ${m.de === 'consultor' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-2 py-1.5 rounded-lg text-xs ${
                    m.de === 'consultor' ? 'bg-aletis-verde text-white' :
                    m.de === 'cliente' ? 'bg-white border border-aletis-borda' :
                    'bg-amber-50 border border-amber-200 text-amber-900'
                  }`}>
                    <p className="text-[9px] font-semibold opacity-70">{m.autorNome}</p>
                    <p className="leading-snug whitespace-pre-wrap">{m.texto}</p>
                    <p className="text-[9px] opacity-60 mt-0.5">{fmtDataHora(m.criadoEm)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enviar()}
                placeholder="Digite sua resposta…"
                className="flex-1 px-2 py-1.5 rounded border border-aletis-borda text-xs"
              />
              <button
                onClick={enviar}
                disabled={!chat.trim() || sending}
                className="px-3 py-1.5 rounded bg-aletis-verde text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1"
              >
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Sk() {
  return (
    <div className="space-y-2">
      <div className="h-12 rounded-xl bg-gray-100 animate-pulse" />
      <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
    </div>
  )
}
