/**
 * CusteioAgricola — Plano Simples de Custeio Agrícola 2026.
 *
 * Lista de planos (filtráveis por cliente/safra/status), botão de
 * criação, editor em drawer com tabs (Proponente → Imóvel → Glebas
 * → Orçamento → Cronograma → Comercialização → Avalistas),
 * auto-save debounced (1.5s), painel lateral com indicadores
 * (VPL, TIR, payback, margem) e botão de PDF.
 *
 * Rotas:
 *   /custeio          → lista
 *   /custeio/:id      → abre editor direto no plano
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Wheat,
  Plus,
  Download,
  Copy,
  Trash2,
  X,
  Loader2,
  User,
  Map as MapIcon,
  Layers,
  DollarSign,
  Calendar,
  Handshake,
  Shield,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Search,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import type {
  PlanoCusteio,
  PlanoCusteioCreatePayload,
  PlanoCusteioUpdatePayload,
  IndicadoresProjeto,
  ItemOrcamento,
  DesembolsoParcela,
  Gleba,
  ImovelRural,
  AvalistaInfo,
  DadosProponente,
  OrcamentoProjeto,
  PlanoComercializacao,
  StatusPlanoCusteio,
} from '@aletis/shared-types'

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

const fmtBRL = (v: number | undefined): string =>
  v === undefined || v === null || Number.isNaN(v)
    ? '—'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtDate = (iso?: string): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR')
}

const fmtPct = (v: number | undefined): string =>
  v === undefined || v === null || Number.isNaN(v)
    ? '—'
    : `${(v * 100).toFixed(2).replace('.', ',')}%`

const STATUS_COR: Record<StatusPlanoCusteio, string> = {
  rascunho: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/70',
  em_analise: 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  aprovado: 'bg-green-50 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  rejeitado: 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-300',
}

const STATUS_LABEL: Record<StatusPlanoCusteio, string> = {
  rascunho: 'Rascunho',
  em_analise: 'Em análise',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
}

type TabKey = 'proponente' | 'imoveis' | 'glebas' | 'orcamento' | 'cronograma' | 'comercializacao' | 'avais'

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'proponente', label: 'Proponente', icon: User },
  { key: 'imoveis', label: 'Imóvel(is)', icon: MapIcon },
  { key: 'glebas', label: 'Glebas', icon: Layers },
  { key: 'orcamento', label: 'Orçamento', icon: DollarSign },
  { key: 'cronograma', label: 'Cronograma', icon: Calendar },
  { key: 'comercializacao', label: 'Comercialização', icon: Handshake },
  { key: 'avais', label: 'Avalistas', icon: Shield },
]

function genId(prefix = 'tmp'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// ────────────────────────────────────────────────────────
// Página raiz
// ────────────────────────────────────────────────────────

export default function CusteioAgricola() {
  const { id: idParam } = useParams<{ id?: string }>()
  const navigate = useNavigate()

  const [planos, setPlanos] = useState<PlanoCusteio[]>([])
  const [loading, setLoading] = useState(true)
  const [fClienteId, setFClienteId] = useState('')
  const [fSafra, setFSafra] = useState('')
  const [fStatus, setFStatus] = useState<'' | StatusPlanoCusteio>('')

  const [planoAtual, setPlanoAtual] = useState<PlanoCusteio | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modalNovoOpen, setModalNovoOpen] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    const query = new URLSearchParams()
    if (fClienteId) query.set('clienteId', fClienteId)
    if (fSafra) query.set('safra', fSafra)
    if (fStatus) query.set('status', fStatus)
    try {
      const res = await apiFetch<{ total: number; planos: PlanoCusteio[] }>(
        `/custeio?${query.toString()}`,
      )
      setPlanos(res.planos || [])
    } catch (err) {
      console.warn('[Custeio] falha ao listar', err)
      setPlanos([])
    } finally {
      setLoading(false)
    }
  }, [fClienteId, fSafra, fStatus])

  useEffect(() => {
    loadList()
  }, [loadList])

  // Se vier /custeio/:id, carrega e abre drawer
  useEffect(() => {
    if (!idParam) return
    apiFetch<PlanoCusteio>(`/custeio/${idParam}`)
      .then((p) => {
        setPlanoAtual(p)
        setDrawerOpen(true)
      })
      .catch((err) => console.warn('[Custeio] plano não encontrado', err))
  }, [idParam])

  function abrirPlano(p: PlanoCusteio) {
    setPlanoAtual(p)
    setDrawerOpen(true)
    navigate(`/custeio/${p.id}`)
  }

  function fecharDrawer() {
    setDrawerOpen(false)
    setPlanoAtual(null)
    navigate('/custeio')
    loadList()
  }

  async function criarPlano(payload: PlanoCusteioCreatePayload) {
    const plano = await apiFetch<PlanoCusteio>('/custeio', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setModalNovoOpen(false)
    setPlanoAtual(plano)
    setDrawerOpen(true)
    navigate(`/custeio/${plano.id}`)
    loadList()
  }

  async function duplicarPlano(p: PlanoCusteio) {
    const novaSafra = prompt(`Nova safra (ex: "${p.safra}" → "2026/27"):`, bumpSafra(p.safra))
    if (!novaSafra) return
    try {
      const novo = await apiFetch<PlanoCusteio>(`/custeio/${p.id}/duplicar`, {
        method: 'POST',
        body: JSON.stringify({ novaSafra }),
      })
      loadList()
      abrirPlano(novo)
    } catch (err) {
      alert('Falha ao duplicar: ' + (err as Error).message)
    }
  }

  async function deletarPlano(p: PlanoCusteio) {
    if (!confirm(`Remover o plano de custeio da safra ${p.safra} (${p.proponente.nome})?`)) return
    try {
      await apiFetch(`/custeio/${p.id}`, { method: 'DELETE' })
      loadList()
    } catch (err) {
      alert('Falha ao remover: ' + (err as Error).message)
    }
  }

  function baixarPdf(p: PlanoCusteio) {
    const url = `/api/custeio/${p.id}/pdf`
    window.open(url, '_blank')
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-aletis-verde dark:text-white flex items-center gap-2">
            <Wheat className="text-aletis-dourado" size={28} />
            Plano Simples de Custeio Agrícola
          </h1>
          <p className="text-sm text-aletis-grafite-medio dark:text-white/60 mt-1">
            Gera o pleito de crédito de custeio de safra no padrão BNDES/Sicredi (V. 1.1/2026).
          </p>
        </div>
        <button
          onClick={() => setModalNovoOpen(true)}
          className="bg-aletis-verde text-white px-4 py-2 rounded-lg hover:bg-aletis-verde-escuro transition flex items-center gap-2 shadow-sm"
        >
          <Plus size={18} /> Novo Plano
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-white/5 rounded-xl p-4 shadow-sm flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-semibold text-aletis-grafite-medio dark:text-white/60 uppercase tracking-wide">
            Cliente ID
          </label>
          <input
            type="text"
            value={fClienteId}
            onChange={(e) => setFClienteId(e.target.value)}
            placeholder="ex: cli_abc"
            className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm focus:outline-none focus:border-aletis-dourado"
          />
        </div>
        <div className="w-40">
          <label className="text-xs font-semibold text-aletis-grafite-medio dark:text-white/60 uppercase tracking-wide">
            Safra
          </label>
          <input
            type="text"
            value={fSafra}
            onChange={(e) => setFSafra(e.target.value)}
            placeholder="2025/26"
            className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm focus:outline-none focus:border-aletis-dourado"
          />
        </div>
        <div className="w-44">
          <label className="text-xs font-semibold text-aletis-grafite-medio dark:text-white/60 uppercase tracking-wide">
            Status
          </label>
          <select
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value as typeof fStatus)}
            className="mt-1 w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm focus:outline-none focus:border-aletis-dourado"
          >
            <option value="">Todos</option>
            <option value="rascunho">Rascunho</option>
            <option value="em_analise">Em análise</option>
            <option value="aprovado">Aprovado</option>
            <option value="rejeitado">Rejeitado</option>
          </select>
        </div>
        <button
          onClick={loadList}
          className="px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg text-sm text-aletis-grafite-medio dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5 transition flex items-center gap-2"
        >
          <Search size={14} /> Filtrar
        </button>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-white/5 rounded-xl shadow-sm overflow-x-auto custom-scrollbar">
        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <Loader2 className="animate-spin text-aletis-dourado" size={28} />
          </div>
        ) : planos.length === 0 ? (
          <div className="p-10 text-center text-aletis-grafite-medio dark:text-white/50">
            <Wheat size={40} className="mx-auto mb-3 opacity-40" />
            <p>Nenhum plano de custeio encontrado.</p>
            <button
              onClick={() => setModalNovoOpen(true)}
              className="mt-3 text-sm text-aletis-dourado underline"
            >
              Criar primeiro plano
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/10">
              <tr className="text-left text-[11px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/60">
                <th className="px-4 py-3">Proponente</th>
                <th className="px-4 py-3">Safra</th>
                <th className="px-4 py-3">Cultura(s)</th>
                <th className="px-4 py-3">Área (ha)</th>
                <th className="px-4 py-3 text-right">Valor Solicitado</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Atualizado</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {planos.map((p) => {
                const culturas = Array.from(new Set(p.glebas.map((g) => g.cultura).filter(Boolean)))
                const area = p.glebas.reduce((a, g) => a + (g.areaHa || 0), 0)
                return (
                  <tr
                    key={p.id}
                    className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50/70 dark:hover:bg-white/5 transition cursor-pointer"
                    onClick={() => abrirPlano(p)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-aletis-grafite dark:text-white">
                        {p.proponente.nome}
                      </div>
                      <div className="text-[11px] text-aletis-grafite-medio dark:text-white/50">
                        {p.clienteId}
                      </div>
                    </td>
                    <td className="px-4 py-3">{p.safra}</td>
                    <td className="px-4 py-3 text-aletis-grafite-medio dark:text-white/70">
                      {culturas.join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3">{area.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {fmtBRL(p.projeto.valorSolicitado)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COR[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-aletis-grafite-medio dark:text-white/50">
                      {fmtDate(p.atualizadoEm)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <button
                          title="Baixar PDF"
                          onClick={() => baixarPdf(p)}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/10 text-aletis-grafite-medio"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          title="Duplicar para nova safra"
                          onClick={() => duplicarPlano(p)}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/10 text-aletis-grafite-medio"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          title="Excluir"
                          onClick={() => deletarPlano(p)}
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Novo Plano */}
      {modalNovoOpen && (
        <ModalNovoPlano onClose={() => setModalNovoOpen(false)} onCriar={criarPlano} />
      )}

      {/* Drawer Editor */}
      {drawerOpen && planoAtual && (
        <PlanoEditor
          plano={planoAtual}
          onClose={fecharDrawer}
          onUpdate={(p) => setPlanoAtual(p)}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────
// Modal — criar novo plano
// ────────────────────────────────────────────────────────

function ModalNovoPlano({
  onClose,
  onCriar,
}: {
  onClose: () => void
  onCriar: (p: PlanoCusteioCreatePayload) => void
}) {
  const [clienteId, setClienteId] = useState('')
  const [safra, setSafra] = useState('2025/26')
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<'PF' | 'PJ'>('PF')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [saving, setSaving] = useState(false)

  function submit() {
    if (!clienteId || !safra || !nome || !cpfCnpj) {
      alert('Preencha clienteId, safra, nome e CPF/CNPJ.')
      return
    }
    setSaving(true)
    onCriar({
      clienteId,
      safra,
      proponente: {
        nome,
        tipo,
        cpfCnpj: cpfCnpj.replace(/\D/g, ''),
      },
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-aletis-verde-escuro rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-aletis-verde dark:text-white flex items-center gap-2">
            <Plus size={20} /> Novo Plano de Custeio
          </h2>
          <button onClick={onClose} aria-label="Fechar modal" className="p-1.5 rounded-lg text-aletis-grafite-medio hover:text-aletis-grafite">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Cliente ID">
            <input
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="form-input"
              placeholder="cli_..."
            />
          </Field>
          <Field label="Safra">
            <input
              value={safra}
              onChange={(e) => setSafra(e.target.value)}
              className="form-input"
              placeholder="2025/26"
            />
          </Field>
          <Field label="Nome do Proponente">
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="form-input" />
          </Field>
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <Field label="Tipo">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'PF' | 'PJ')}
                className="form-input"
              >
                <option value="PF">PF</option>
                <option value="PJ">PJ</option>
              </select>
            </Field>
            <Field label="CPF/CNPJ">
              <input
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                className="form-input"
                placeholder="somente dígitos"
              />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-aletis-grafite-medio hover:bg-gray-100 dark:hover:bg-white/10 rounded"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 text-sm bg-aletis-verde text-white rounded hover:bg-aletis-verde-escuro transition disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Criar Plano
          </button>
        </div>
      </div>
      <style>{`
        .form-input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; font-size: 0.875rem; }
        .form-input:focus { outline: none; border-color: #c9a84c; }
        .dark .form-input { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: white; }
      `}</style>
    </div>
  )
}

// ────────────────────────────────────────────────────────
// Editor (Drawer)
// ────────────────────────────────────────────────────────

function PlanoEditor({
  plano,
  onClose,
  onUpdate,
}: {
  plano: PlanoCusteio
  onClose: () => void
  onUpdate: (p: PlanoCusteio) => void
}) {
  const [tab, setTab] = useState<TabKey>('proponente')
  const [draft, setDraft] = useState<PlanoCusteio>(plano)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [indicadores, setIndicadores] = useState<IndicadoresProjeto | null>(plano.resultadoEsperado ?? null)
  const [indLoading, setIndLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDraft(plano)
  }, [plano])

  /** Marca dirty e agenda auto-save. */
  function patch<K extends keyof PlanoCusteio>(key: K, value: PlanoCusteio[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  // Auto-save debounced
  useEffect(() => {
    if (!dirty) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const body: PlanoCusteioUpdatePayload = {
          proponente: draft.proponente,
          imoveis: draft.imoveis,
          glebas: draft.glebas,
          projeto: draft.projeto,
          orcamento: draft.orcamento,
          cronograma: draft.cronograma,
          comercializacao: draft.comercializacao,
          avalistas: draft.avalistas,
          observacoes: draft.observacoes,
          status: draft.status,
        }
        const atualizado = await apiFetch<PlanoCusteio>(`/custeio/${draft.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        onUpdate(atualizado)
        setDirty(false)
      } catch (err) {
        console.warn('[Custeio] falha ao salvar', err)
      } finally {
        setSaving(false)
      }
    }, 1500)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [dirty, draft, onUpdate])

  async function recalcular() {
    setIndLoading(true)
    try {
      const ind = await apiFetch<IndicadoresProjeto>(`/custeio/${draft.id}/indicadores?persistir=1`)
      setIndicadores(ind)
    } catch (err) {
      console.warn('[Custeio] falha indicadores', err)
    } finally {
      setIndLoading(false)
    }
  }

  function baixarPdf() {
    window.open(`/api/custeio/${draft.id}/pdf`, '_blank')
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-stretch justify-end">
      <div className="bg-white dark:bg-aletis-verde-escuro w-full max-w-6xl h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-white/10">
          <div>
            <div className="text-xs text-aletis-grafite-medio dark:text-white/50 uppercase tracking-wider">
              Plano de Custeio — Safra {draft.safra} · v{draft.versao}
            </div>
            <h2 className="text-lg font-bold text-aletis-verde dark:text-white flex items-center gap-2">
              <Wheat size={18} className="text-aletis-dourado" />
              {draft.proponente.nome || '(sem nome)'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-xs text-aletis-grafite-medio flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Salvando…
              </span>
            )}
            {!saving && !dirty && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle2 size={12} /> Salvo
              </span>
            )}
            <button
              onClick={baixarPdf}
              className="px-3 py-1.5 text-sm bg-aletis-verde text-white rounded hover:bg-aletis-verde-escuro flex items-center gap-1"
            >
              <Download size={14} /> PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-aletis-grafite-medio hover:bg-gray-100 dark:hover:bg-white/10 rounded"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs + content */}
        <div className="flex-1 flex overflow-hidden">
          <nav className="w-48 border-r border-gray-100 dark:border-white/10 overflow-y-auto">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`w-full flex items-center gap-2 px-4 py-3 text-sm transition ${
                    active
                      ? 'bg-aletis-verde/5 dark:bg-white/5 text-aletis-verde dark:text-white border-l-4 border-aletis-dourado font-medium'
                      : 'text-aletis-grafite-medio dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/5 border-l-4 border-transparent'
                  }`}
                >
                  <Icon size={16} /> {t.label}
                </button>
              )
            })}
          </nav>

          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'proponente' && <TabProponente draft={draft} setDraft={(v) => patch('proponente', v)} />}
            {tab === 'imoveis' && <TabImoveis draft={draft} setDraft={(v) => patch('imoveis', v)} />}
            {tab === 'glebas' && (
              <TabGlebas
                draft={draft}
                setGlebas={(v) => patch('glebas', v)}
                imoveis={draft.imoveis}
              />
            )}
            {tab === 'orcamento' && <TabOrcamento draft={draft} setOrcamento={(v) => patch('orcamento', v)} />}
            {tab === 'cronograma' && <TabCronograma draft={draft} setCronograma={(v) => patch('cronograma', v)} />}
            {tab === 'comercializacao' && (
              <TabComercializacao
                draft={draft}
                setProjeto={(v) => patch('projeto', v)}
                setComercializacao={(v) => patch('comercializacao', v)}
              />
            )}
            {tab === 'avais' && <TabAvalistas draft={draft} setAvalistas={(v) => patch('avalistas', v)} />}
          </div>

          {/* Side panel — indicadores */}
          <aside className="w-72 border-l border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-aletis-grafite-medio dark:text-white/60 flex items-center gap-1">
                <TrendingUp size={14} /> Indicadores
              </h3>
              <button
                onClick={recalcular}
                disabled={indLoading}
                className="text-xs text-aletis-dourado hover:underline disabled:opacity-50 flex items-center gap-1"
              >
                {indLoading && <Loader2 size={10} className="animate-spin" />}
                Recalcular
              </button>
            </div>
            {!indicadores ? (
              <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
                Clique em "Recalcular" para gerar VPL, TIR, payback e margem.
              </p>
            ) : (
              <div className="space-y-3">
                <KV label="VPL" value={fmtBRL(indicadores.vpl)} highlight />
                <KV label="TIR (a.a.)" value={`${indicadores.tirAnual.toFixed(2).replace('.', ',')}%`} />
                <KV label="Payback" value={`${indicadores.paybackMeses} meses`} />
                <KV label="Margem Líquida" value={fmtPct(indicadores.margemLiquida)} />
                <KV label="Necess. Capital Giro" value={fmtBRL(indicadores.necessidadeCapitalGiro)} />
                <KV label="Receita Bruta" value={fmtBRL(indicadores.receitaBrutaTotal)} />
                <KV label="Custo Total" value={fmtBRL(indicadores.custoTotal)} />
                <KV label="Taxa Desconto" value={`${indicadores.taxaDescontoAnual.toFixed(2)}% a.a.`} />
                {indicadores.avisos && indicadores.avisos.length > 0 && (
                  <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded text-[11px] text-yellow-800 dark:text-yellow-300">
                    {indicadores.avisos.map((a, i) => (
                      <div key={i} className="flex items-start gap-1 mb-1">
                        <AlertCircle size={10} className="mt-0.5 flex-shrink-0" />
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

function KV({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50">
        {label}
      </div>
      <div
        className={`text-sm font-medium ${
          highlight ? 'text-aletis-verde dark:text-aletis-dourado text-base' : 'text-aletis-grafite dark:text-white'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────
// Tabs
// ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-aletis-grafite-medio dark:text-white/60 uppercase tracking-wide">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

const inputCls =
  'w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm focus:outline-none focus:border-aletis-dourado'

// ── Proponente ──
function TabProponente({
  draft,
  setDraft,
}: {
  draft: PlanoCusteio
  setDraft: (v: DadosProponente) => void
}) {
  const p = draft.proponente
  function up<K extends keyof DadosProponente>(k: K, v: DadosProponente[K]) {
    setDraft({ ...p, [k]: v })
  }
  const ater = p.ater ?? {}
  function upAter(k: keyof NonNullable<DadosProponente['ater']>, v: string) {
    setDraft({ ...p, ater: { ...ater, [k]: v } })
  }
  return (
    <div className="space-y-5 max-w-2xl">
      <section>
        <h3 className="text-sm font-bold text-aletis-verde dark:text-white mb-3">Proponente</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <input className={inputCls} value={p.nome} onChange={(e) => up('nome', e.target.value)} />
          </Field>
          <Field label="Tipo">
            <select
              className={inputCls}
              value={p.tipo}
              onChange={(e) => up('tipo', e.target.value as 'PF' | 'PJ')}
            >
              <option value="PF">Pessoa Física</option>
              <option value="PJ">Pessoa Jurídica</option>
            </select>
          </Field>
          <Field label="CPF/CNPJ">
            <input className={inputCls} value={p.cpfCnpj} onChange={(e) => up('cpfCnpj', e.target.value)} />
          </Field>
          <Field label="E-mail">
            <input className={inputCls} value={p.email ?? ''} onChange={(e) => up('email', e.target.value)} />
          </Field>
          <Field label="Telefone 1">
            <input
              className={inputCls}
              value={p.telefone1 ?? ''}
              onChange={(e) => up('telefone1', e.target.value)}
            />
          </Field>
          <Field label="Telefone 2">
            <input
              className={inputCls}
              value={p.telefone2 ?? ''}
              onChange={(e) => up('telefone2', e.target.value)}
            />
          </Field>
          <Field label="Grupo / Cooperativa">
            <input className={inputCls} value={p.grupo ?? ''} onChange={(e) => up('grupo', e.target.value)} />
          </Field>
        </div>
      </section>
      <section>
        <h3 className="text-sm font-bold text-aletis-verde dark:text-white mb-3">ATER</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Empresa ATER">
            <input className={inputCls} value={ater.nomeEmpresa ?? ''} onChange={(e) => upAter('nomeEmpresa', e.target.value)} />
          </Field>
          <Field label="CNPJ ATER">
            <input className={inputCls} value={ater.cnpj ?? ''} onChange={(e) => upAter('cnpj', e.target.value)} />
          </Field>
          <Field label="Serviço Prestado">
            <input className={inputCls} value={ater.servicoPrestado ?? ''} onChange={(e) => upAter('servicoPrestado', e.target.value)} />
          </Field>
          <Field label="CPF Técnico">
            <input className={inputCls} value={ater.cpfTecnico ?? ''} onChange={(e) => upAter('cpfTecnico', e.target.value)} />
          </Field>
        </div>
      </section>
    </div>
  )
}

// ── Imóveis ──
function TabImoveis({ draft, setDraft }: { draft: PlanoCusteio; setDraft: (v: ImovelRural[]) => void }) {
  const imoveis = draft.imoveis
  function add() {
    setDraft([
      ...imoveis,
      {
        id: genId('im'),
        nome: `Imóvel ${imoveis.length + 1}`,
        areaTotalHa: 0,
        municipio: '',
        uf: '',
        regimeExploracao: 'proprietario',
      },
    ])
  }
  function up(i: number, patch: Partial<ImovelRural>) {
    setDraft(imoveis.map((im, idx) => (idx === i ? { ...im, ...patch } : im)))
  }
  function del(i: number) {
    setDraft(imoveis.filter((_, idx) => idx !== i))
  }
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-aletis-verde dark:text-white">Imóveis Rurais</h3>
        <button
          onClick={add}
          className="text-xs text-aletis-dourado hover:underline flex items-center gap-1"
        >
          <Plus size={12} /> Adicionar imóvel
        </button>
      </div>
      {imoveis.length === 0 && (
        <p className="text-sm text-aletis-grafite-medio dark:text-white/50">Nenhum imóvel cadastrado.</p>
      )}
      {imoveis.map((im, i) => (
        <div
          key={im.id}
          className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-100 dark:border-white/10"
        >
          <div className="flex items-center justify-between mb-3">
            <strong className="text-sm">{im.nome || `Imóvel ${i + 1}`}</strong>
            <button
              onClick={() => del(i)}
              className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-1 rounded"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome do Imóvel">
              <input className={inputCls} value={im.nome} onChange={(e) => up(i, { nome: e.target.value })} />
            </Field>
            <Field label="Matrícula">
              <input className={inputCls} value={im.matricula ?? ''} onChange={(e) => up(i, { matricula: e.target.value })} />
            </Field>
            <Field label="NIRF/CIB">
              <input className={inputCls} value={im.nirfCib ?? ''} onChange={(e) => up(i, { nirfCib: e.target.value })} />
            </Field>
            <Field label="CAR">
              <input className={inputCls} value={im.car ?? ''} onChange={(e) => up(i, { car: e.target.value })} />
            </Field>
            <Field label="SNCR">
              <input className={inputCls} value={im.sncr ?? ''} onChange={(e) => up(i, { sncr: e.target.value })} />
            </Field>
            <Field label="Regime Exploração">
              <select
                className={inputCls}
                value={im.regimeExploracao}
                onChange={(e) => up(i, { regimeExploracao: e.target.value as ImovelRural['regimeExploracao'] })}
              >
                <option value="proprietario">Proprietário</option>
                <option value="arrendatario">Arrendatário</option>
                <option value="parceiro">Parceiro</option>
                <option value="comodatario">Comodatário</option>
                <option value="posseiro">Posseiro</option>
              </select>
            </Field>
            <Field label="Município">
              <input className={inputCls} value={im.municipio} onChange={(e) => up(i, { municipio: e.target.value })} />
            </Field>
            <Field label="UF">
              <input className={inputCls} value={im.uf} onChange={(e) => up(i, { uf: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} />
            </Field>
            <Field label="Área Total (ha)">
              <input
                type="number"
                className={inputCls}
                value={im.areaTotalHa}
                onChange={(e) => up(i, { areaTotalHa: Number(e.target.value) })}
              />
            </Field>
            <Field label="Área Beneficiada (ha)">
              <input
                type="number"
                className={inputCls}
                value={im.areaBeneficiadaHa ?? 0}
                onChange={(e) => up(i, { areaBeneficiadaHa: Number(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Glebas ──
function TabGlebas({
  draft,
  setGlebas,
  imoveis,
}: {
  draft: PlanoCusteio
  setGlebas: (v: Gleba[]) => void
  imoveis: ImovelRural[]
}) {
  const glebas = draft.glebas
  function add() {
    setGlebas([
      ...glebas,
      {
        id: genId('gl'),
        nomeGleba: `Gleba ${glebas.length + 1}`,
        imovelId: imoveis[0]?.id ?? '',
        cultura: 'Soja',
        areaHa: 0,
        finalidade: 'custeio',
      },
    ])
  }
  function up(i: number, patch: Partial<Gleba>) {
    setGlebas(glebas.map((g, idx) => (idx === i ? { ...g, ...patch } : g)))
  }
  function del(i: number) {
    setGlebas(glebas.filter((_, idx) => idx !== i))
  }
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-aletis-verde dark:text-white">
          Glebas Beneficiadas ({glebas.length}/15)
        </h3>
        <button
          onClick={add}
          disabled={glebas.length >= 15}
          className="text-xs text-aletis-dourado hover:underline flex items-center gap-1 disabled:opacity-40"
        >
          <Plus size={12} /> Adicionar gleba
        </button>
      </div>
      {glebas.length === 0 && (
        <p className="text-sm text-aletis-grafite-medio dark:text-white/50">Nenhuma gleba cadastrada.</p>
      )}
      {glebas.map((g, i) => (
        <div
          key={g.id}
          className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-100 dark:border-white/10"
        >
          <div className="flex items-center justify-between mb-3">
            <strong className="text-sm">{g.nomeGleba}</strong>
            <button
              onClick={() => del(i)}
              className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-1 rounded"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome da Gleba">
              <input className={inputCls} value={g.nomeGleba} onChange={(e) => up(i, { nomeGleba: e.target.value })} />
            </Field>
            <Field label="Imóvel">
              <select
                className={inputCls}
                value={g.imovelId}
                onChange={(e) => up(i, { imovelId: e.target.value })}
              >
                <option value="">—</option>
                {imoveis.map((im) => (
                  <option key={im.id} value={im.id}>
                    {im.nome}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cultura">
              <input className={inputCls} value={g.cultura} onChange={(e) => up(i, { cultura: e.target.value })} />
            </Field>
            <Field label="Cultivar/Variedade">
              <input className={inputCls} value={g.cultivar ?? ''} onChange={(e) => up(i, { cultivar: e.target.value })} />
            </Field>
            <Field label="Área (ha)">
              <input
                type="number"
                className={inputCls}
                value={g.areaHa}
                onChange={(e) => up(i, { areaHa: Number(e.target.value) })}
              />
            </Field>
            <Field label="Finalidade">
              <select
                className={inputCls}
                value={g.finalidade}
                onChange={(e) => up(i, { finalidade: e.target.value as Gleba['finalidade'] })}
              >
                <option value="custeio">Custeio</option>
                <option value="investimento">Investimento</option>
                <option value="comercializacao">Comercialização</option>
              </select>
            </Field>
            <Field label="Ciclo (texto)">
              <input className={inputCls} value={g.cicloProducao ?? ''} onChange={(e) => up(i, { cicloProducao: e.target.value })} placeholder="2025-10 a 2026-03" />
            </Field>
            <Field label="Sistema de Plantio">
              <input className={inputCls} value={g.sistemaPlantio ?? ''} onChange={(e) => up(i, { sistemaPlantio: e.target.value })} />
            </Field>
            <Field label="Latitude (centróide)">
              <input
                type="number"
                step="0.000001"
                className={inputCls}
                value={g.centroide?.lat ?? ''}
                onChange={(e) =>
                  up(i, {
                    centroide: {
                      ...g.centroide,
                      lat: Number(e.target.value),
                      lon: g.centroide?.lon ?? 0,
                    },
                  })
                }
              />
            </Field>
            <Field label="Longitude (centróide)">
              <input
                type="number"
                step="0.000001"
                className={inputCls}
                value={g.centroide?.lon ?? ''}
                onChange={(e) =>
                  up(i, {
                    centroide: {
                      lat: g.centroide?.lat ?? 0,
                      lon: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Orçamento ──
function TabOrcamento({
  draft,
  setOrcamento,
}: {
  draft: PlanoCusteio
  setOrcamento: (v: ItemOrcamento[]) => void
}) {
  const itens = draft.orcamento
  function add() {
    setOrcamento([
      ...itens,
      {
        id: genId('it'),
        categoria: 'sementes',
        fase: 'Insumo pré-plantio/ plantio',
        descricao: '',
        unidade: 'kg',
        quantidade: 0,
        precoUnitario: 0,
        valorTotal: 0,
      },
    ])
  }
  function up(i: number, patch: Partial<ItemOrcamento>) {
    setOrcamento(
      itens.map((it, idx) => {
        if (idx !== i) return it
        const novo = { ...it, ...patch }
        novo.valorTotal = (novo.quantidade || 0) * (novo.precoUnitario || 0)
        return novo
      }),
    )
  }
  function del(i: number) {
    setOrcamento(itens.filter((_, idx) => idx !== i))
  }
  const total = itens.reduce((a, it) => a + (it.valorTotal || 0), 0)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-aletis-verde dark:text-white">
          Orçamento ({itens.length}/120) — Total {fmtBRL(total)}
        </h3>
        <button
          onClick={add}
          disabled={itens.length >= 120}
          className="text-xs text-aletis-dourado hover:underline flex items-center gap-1 disabled:opacity-40"
        >
          <Plus size={12} /> Adicionar item
        </button>
      </div>
      {itens.length === 0 && (
        <p className="text-sm text-aletis-grafite-medio dark:text-white/50">Nenhum item.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-white/5 text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/60">
            <tr>
              <th className="p-2 text-left">Categoria</th>
              <th className="p-2 text-left">Fase</th>
              <th className="p-2 text-left">Descrição</th>
              <th className="p-2 text-left">Unid.</th>
              <th className="p-2 text-right">Qtd</th>
              <th className="p-2 text-right">Preço Unit.</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => (
              <tr key={it.id} className="border-b border-gray-50 dark:border-white/5">
                <td className="p-1">
                  <select
                    className={inputCls + ' !py-1'}
                    value={it.categoria}
                    onChange={(e) => up(i, { categoria: e.target.value as ItemOrcamento['categoria'] })}
                  >
                    {['sementes','fertilizantes','defensivos','combustivel','arrendamento','servicos_maquinas','mao_obra','seguros','financeiras','ater','outros'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td className="p-1">
                  <select
                    className={inputCls + ' !py-1'}
                    value={it.fase}
                    onChange={(e) => up(i, { fase: e.target.value as ItemOrcamento['fase'] })}
                  >
                    <option value="Insumo pré-plantio/ plantio">Insumo pré-plantio</option>
                    <option value="Insumo tratos culturais">Insumo tratos</option>
                    <option value="Insumo colheita">Insumo colheita</option>
                    <option value="Serviço pré-plantio/ plantio">Serv. pré-plantio</option>
                    <option value="Serviço tratos culturais">Serv. tratos</option>
                    <option value="Serviço colheita">Serv. colheita</option>
                    <option value="ATER - Elaboração PS">ATER - Elab. PS</option>
                    <option value="ATER - Elaboração PS + orientação">ATER - PS + orient.</option>
                  </select>
                </td>
                <td className="p-1">
                  <input className={inputCls + ' !py-1'} value={it.descricao} onChange={(e) => up(i, { descricao: e.target.value })} />
                </td>
                <td className="p-1 w-16">
                  <input className={inputCls + ' !py-1'} value={it.unidade} onChange={(e) => up(i, { unidade: e.target.value })} />
                </td>
                <td className="p-1 w-20">
                  <input type="number" className={inputCls + ' !py-1 text-right'} value={it.quantidade} onChange={(e) => up(i, { quantidade: Number(e.target.value) })} />
                </td>
                <td className="p-1 w-28">
                  <input type="number" className={inputCls + ' !py-1 text-right'} value={it.precoUnitario} onChange={(e) => up(i, { precoUnitario: Number(e.target.value) })} />
                </td>
                <td className="p-1 text-right font-medium">{fmtBRL(it.valorTotal)}</td>
                <td className="p-1">
                  <button onClick={() => del(i)} className="text-red-500 p-1">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Cronograma ──
function TabCronograma({
  draft,
  setCronograma,
}: {
  draft: PlanoCusteio
  setCronograma: (v: DesembolsoParcela[]) => void
}) {
  const parcelas = draft.cronograma
  function add() {
    setCronograma([
      ...parcelas,
      {
        id: genId('cr'),
        fase: 'Pré-plantio/plantio',
        dataPrevista: new Date().toISOString().slice(0, 10),
        valor: 0,
      },
    ])
  }
  function up(i: number, patch: Partial<DesembolsoParcela>) {
    setCronograma(parcelas.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }
  function del(i: number) {
    setCronograma(parcelas.filter((_, idx) => idx !== i))
  }
  const total = parcelas.reduce((a, p) => a + (p.valor || 0), 0)
  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-aletis-verde dark:text-white">
          Cronograma de Desembolso — Total {fmtBRL(total)}
        </h3>
        <button onClick={add} className="text-xs text-aletis-dourado hover:underline flex items-center gap-1">
          <Plus size={12} /> Adicionar parcela
        </button>
      </div>
      {parcelas.length === 0 && (
        <p className="text-sm text-aletis-grafite-medio dark:text-white/50">Nenhuma parcela.</p>
      )}
      {parcelas.map((p, i) => (
        <div key={p.id} className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 border border-gray-100 dark:border-white/10 grid grid-cols-1 sm:grid-cols-[1fr_150px_150px_auto] gap-3 items-end">
          <Field label="Fase">
            <select
              className={inputCls}
              value={p.fase}
              onChange={(e) => up(i, { fase: e.target.value as DesembolsoParcela['fase'] })}
            >
              <option value="Pré-plantio/plantio">Pré-plantio / plantio</option>
              <option value="Tratos culturais">Tratos culturais</option>
              <option value="Colheita">Colheita</option>
              <option value="Outra">Outra</option>
            </select>
          </Field>
          <Field label="Data Prevista">
            <input
              type="date"
              className={inputCls}
              value={p.dataPrevista.slice(0, 10)}
              onChange={(e) => up(i, { dataPrevista: e.target.value })}
            />
          </Field>
          <Field label="Valor">
            <input
              type="number"
              className={inputCls}
              value={p.valor}
              onChange={(e) => up(i, { valor: Number(e.target.value) })}
            />
          </Field>
          <button onClick={() => del(i)} className="text-red-500 p-2">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Comercialização ──
function TabComercializacao({
  draft,
  setProjeto,
  setComercializacao,
}: {
  draft: PlanoCusteio
  setProjeto: (v: OrcamentoProjeto) => void
  setComercializacao: (v: PlanoComercializacao) => void
}) {
  const proj = draft.projeto
  const com = draft.comercializacao ?? {
    canalVenda: 'cooperativa' as const,
  }
  function upP(k: keyof OrcamentoProjeto, v: OrcamentoProjeto[keyof OrcamentoProjeto]) {
    setProjeto({ ...proj, [k]: v } as OrcamentoProjeto)
  }
  function upC<K extends keyof PlanoComercializacao>(k: K, v: PlanoComercializacao[K]) {
    setComercializacao({ ...com, [k]: v })
  }
  return (
    <div className="space-y-5 max-w-2xl">
      <section>
        <h3 className="text-sm font-bold text-aletis-verde dark:text-white mb-3">Projeto / Fontes</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ciclo">
            <select
              className={inputCls}
              value={proj.ciclo}
              onChange={(e) => upP('ciclo', e.target.value as OrcamentoProjeto['ciclo'])}
            >
              <option value="Temporário">Temporário</option>
              <option value="Permanente">Permanente</option>
            </select>
          </Field>
          <Field label="Valor Solicitado (R$)">
            <input type="number" className={inputCls} value={proj.valorSolicitado} onChange={(e) => upP('valorSolicitado', Number(e.target.value))} />
          </Field>
          <Field label="Contrapartida (R$)">
            <input type="number" className={inputCls} value={proj.valorContrapartida} onChange={(e) => upP('valorContrapartida', Number(e.target.value))} />
          </Field>
          <Field label="Valor Total (R$)">
            <input type="number" className={inputCls} value={proj.valorTotal} onChange={(e) => upP('valorTotal', Number(e.target.value))} />
          </Field>
          <Field label="Produtividade esperada">
            <input type="number" className={inputCls} value={proj.produtividadeEsperada ?? 0} onChange={(e) => upP('produtividadeEsperada', Number(e.target.value))} />
          </Field>
          <Field label="Unidade produtividade">
            <input className={inputCls} value={proj.unidadeProdutividade ?? ''} onChange={(e) => upP('unidadeProdutividade', e.target.value)} placeholder="sc/ha" />
          </Field>
          <Field label="Preço Projetado (R$/unid)">
            <input type="number" className={inputCls} value={proj.precoProjetado ?? 0} onChange={(e) => upP('precoProjetado', Number(e.target.value))} />
          </Field>
          <Field label="Receita Bruta Projetada (R$)">
            <input type="number" className={inputCls} value={proj.receitaBrutaProjetada ?? 0} onChange={(e) => upP('receitaBrutaProjetada', Number(e.target.value))} />
          </Field>
          <Field label="Finalidade (texto)">
            <input className={inputCls} value={proj.finalidade ?? ''} onChange={(e) => upP('finalidade', e.target.value)} />
          </Field>
        </div>
      </section>
      <section>
        <h3 className="text-sm font-bold text-aletis-verde dark:text-white mb-3">Comercialização</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Canal de Venda">
            <select
              className={inputCls}
              value={com.canalVenda}
              onChange={(e) => upC('canalVenda', e.target.value as PlanoComercializacao['canalVenda'])}
            >
              <option value="cooperativa">Cooperativa</option>
              <option value="trading">Trading</option>
              <option value="mercado_spot">Mercado Spot</option>
              <option value="contrato_futuro">Contrato Futuro</option>
              <option value="outro">Outro</option>
            </select>
          </Field>
          <Field label="Comprador Principal">
            <input className={inputCls} value={com.compradorPrincipal ?? ''} onChange={(e) => upC('compradorPrincipal', e.target.value)} />
          </Field>
          <Field label="% Travado">
            <input type="number" className={inputCls} value={com.percentualTravado ?? 0} onChange={(e) => upC('percentualTravado', Number(e.target.value))} />
          </Field>
          <Field label="Preço Referência">
            <input type="number" className={inputCls} value={com.precoReferencia ?? 0} onChange={(e) => upC('precoReferencia', Number(e.target.value))} />
          </Field>
          <Field label="Fonte do Preço">
            <input className={inputCls} value={com.fontePreco ?? ''} onChange={(e) => upC('fontePreco', e.target.value)} placeholder="CEPEA, ESALQ, DSM…" />
          </Field>
        </div>
      </section>
    </div>
  )
}

// ── Avalistas ──
function TabAvalistas({
  draft,
  setAvalistas,
}: {
  draft: PlanoCusteio
  setAvalistas: (v: AvalistaInfo[]) => void
}) {
  const avalistas = draft.avalistas
  function add() {
    setAvalistas([
      ...avalistas,
      {
        id: genId('av'),
        nome: '',
        cpfCnpj: '',
        tipo: 'PF',
        tipoGarantia: 'aval',
      },
    ])
  }
  function up(i: number, patch: Partial<AvalistaInfo>) {
    setAvalistas(avalistas.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  }
  function del(i: number) {
    setAvalistas(avalistas.filter((_, idx) => idx !== i))
  }
  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-aletis-verde dark:text-white">Avalistas e Garantias</h3>
        <button onClick={add} className="text-xs text-aletis-dourado hover:underline flex items-center gap-1">
          <Plus size={12} /> Adicionar avalista
        </button>
      </div>
      {avalistas.length === 0 && (
        <p className="text-sm text-aletis-grafite-medio dark:text-white/50">Nenhum avalista cadastrado.</p>
      )}
      {avalistas.map((a, i) => (
        <div key={a.id} className="bg-gray-50 dark:bg-white/5 rounded-lg p-4 border border-gray-100 dark:border-white/10">
          <div className="flex items-center justify-between mb-3">
            <strong className="text-sm">{a.nome || `Avalista ${i + 1}`}</strong>
            <button onClick={() => del(i)} className="text-red-500 p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10">
              <Trash2 size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome"><input className={inputCls} value={a.nome} onChange={(e) => up(i, { nome: e.target.value })} /></Field>
            <Field label="CPF/CNPJ"><input className={inputCls} value={a.cpfCnpj} onChange={(e) => up(i, { cpfCnpj: e.target.value })} /></Field>
            <Field label="Tipo">
              <select className={inputCls} value={a.tipo} onChange={(e) => up(i, { tipo: e.target.value as 'PF' | 'PJ' })}>
                <option value="PF">PF</option>
                <option value="PJ">PJ</option>
              </select>
            </Field>
            <Field label="Tipo Garantia">
              <select
                className={inputCls}
                value={a.tipoGarantia}
                onChange={(e) => up(i, { tipoGarantia: e.target.value as AvalistaInfo['tipoGarantia'] })}
              >
                <option value="aval">Aval</option>
                <option value="penhor_agricola">Penhor Agrícola</option>
                <option value="hipoteca">Hipoteca</option>
                <option value="alienacao_fiduciaria">Alienação Fiduciária</option>
                <option value="outro">Outro</option>
              </select>
            </Field>
            <Field label="Valor Garantia">
              <input type="number" className={inputCls} value={a.valorGarantia ?? 0} onChange={(e) => up(i, { valorGarantia: Number(e.target.value) })} />
            </Field>
            <Field label="Parentesco">
              <input className={inputCls} value={a.parentesco ?? ''} onChange={(e) => up(i, { parentesco: e.target.value })} />
            </Field>
          </div>
        </div>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────
// Utils
// ────────────────────────────────────────────────────────

/** Tenta incrementar "YY/YY+1" ou "YYYY/YY". Se não reconhecer, retorna original. */
function bumpSafra(safra: string): string {
  const m = safra.match(/^(\d{2,4})\/(\d{2,4})$/)
  if (!m) return safra
  const a = Number(m[1])
  const b = Number(m[2])
  if (Number.isNaN(a) || Number.isNaN(b)) return safra
  return `${a + 1}/${b + 1}`.replace(/^(\d{2,4})\/(\d{2,4})$/, (_, x, y) =>
    `${String(x).padStart(m[1].length, '0')}/${String(y).padStart(m[2].length, '0')}`,
  )
}
