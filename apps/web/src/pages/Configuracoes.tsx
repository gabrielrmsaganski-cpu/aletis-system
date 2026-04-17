/**
 * Configurações (Settings)
 *
 * Pagina de configuracoes do sistema ALETIS organizada em 4 abas:
 * Perfil (dados do consultor), Aparencia (tema claro/escuro),
 * Fontes de Dados (monitoramento de /api/fontes/status) e
 * Preferencias (moeda, formato de data, notificacoes). Todas as
 * preferencias sao persistidas no localStorage e o tema e
 * aplicado via classe .dark no documento.
 */
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  User as UserIcon,
  Palette,
  Database,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  Save,
} from 'lucide-react'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

// ── Types ────────────────────────────────────────────────────
type TabId = 'perfil' | 'aparencia' | 'fontes' | 'preferencias'

interface FonteEntry {
  nome: string
  descricao: string
  categoria: string
  url: string
  status: 'online' | 'degraded' | 'offline' | 'unknown'
  ultimaAtualizacao: string | null
  latenciaMs: number | null
  erros24h: number
  ultimoErro: string | null
  ttlSegundos: number
}

interface FontesStatus {
  fontes: FonteEntry[]
  resumo: { total: number; online: number; degraded: number; offline: number; unknown: number }
  ultimaVerificacao: string
}

interface PerfilForm {
  nome: string
  cargo: string
  email: string
  telefone: string
  oab: string
}

interface Preferencias {
  moeda: 'BRL' | 'USD'
  formatoData: 'DD/MM/YYYY' | 'YYYY-MM-DD'
  notificacoesEmail: boolean
  notificacoesPush: boolean
  resumoDiario: boolean
  alertasMercado: boolean
}

// ── Storage keys ─────────────────────────────────────────────
const PERFIL_KEY = 'aletis:perfil'
const PREFS_KEY = 'aletis:preferencias'
const TEMA_KEY = 'aletis:tema'

const DEFAULT_PERFIL: PerfilForm = {
  nome: 'Christian Kohler',
  cargo: 'Consultor Sênior — Reestruturação Rural',
  email: 'christian@aletis.com.br',
  telefone: '(45) 99999-0000',
  oab: '',
}

const DEFAULT_PREFS: Preferencias = {
  moeda: 'BRL',
  formatoData: 'DD/MM/YYYY',
  notificacoesEmail: true,
  notificacoesPush: false,
  resumoDiario: true,
  alertasMercado: true,
}

// ── Helpers ──────────────────────────────────────────────────
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function saveJSON<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

function fmtLatency(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  return `${Math.floor(h / 24)}d atrás`
}

// ── Status chip ──────────────────────────────────────────────
function StatusChip({ status }: { status: FonteEntry['status'] }) {
  const cfg = {
    online: { icon: CheckCircle2, label: 'Online', cls: 'bg-positivo/10 text-positivo border-positivo/30' },
    degraded: { icon: AlertTriangle, label: 'Degradado', cls: 'bg-aletis-dourado/10 text-aletis-dourado border-aletis-dourado/30' },
    offline: { icon: XCircle, label: 'Offline', cls: 'bg-alerta/10 text-alerta border-alerta/30' },
    unknown: { icon: HelpCircle, label: 'Desconhecido', cls: 'bg-aletis-bege text-aletis-grafite-claro border-aletis-borda' },
  }[status]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

// ── Main Component ───────────────────────────────────────────
export default function Configuracoes() {
  const [params, setParams] = useSearchParams()
  const initialTab = (params.get('tab') as TabId) || 'perfil'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const { toasts, show: showToast, dismiss: dismissToast } = useToast()

  // ── Perfil state ──
  const [perfil, setPerfil] = useState<PerfilForm>(() => loadJSON(PERFIL_KEY, DEFAULT_PERFIL))

  // ── Aparencia state ──
  const [tema, setTema] = useState<'claro' | 'escuro'>(() => {
    try { return (localStorage.getItem(TEMA_KEY) as 'claro' | 'escuro') || 'claro' } catch { return 'claro' }
  })

  // ── Preferencias state ──
  const [prefs, setPrefs] = useState<Preferencias>(() => loadJSON(PREFS_KEY, DEFAULT_PREFS))

  // ── Fontes state ──
  const [fontes, setFontes] = useState<FontesStatus | null>(null)
  const [fontesLoading, setFontesLoading] = useState(false)

  // Tab param sync
  useEffect(() => {
    if (params.get('tab') !== activeTab) {
      const next = new URLSearchParams(params)
      next.set('tab', activeTab)
      setParams(next, { replace: true })
    }
  }, [activeTab])

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'escuro')
  }, [tema])

  // Fetch fontes when tab opens
  const loadFontes = async () => {
    setFontesLoading(true)
    try {
      const res = await fetch('/api/fontes/status')
      const json = await res.json()
      const data: FontesStatus | undefined = json.dados || json.data
      if (data) setFontes(data)
    } catch (err) {
      showToast(`Erro ao carregar fontes: ${(err as Error).message}`, 'warning')
    } finally {
      setFontesLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'fontes' && !fontes) loadFontes()
  }, [activeTab])

  const fontesPorCategoria = useMemo(() => {
    if (!fontes) return new Map<string, FonteEntry[]>()
    const map = new Map<string, FonteEntry[]>()
    for (const f of fontes.fontes) {
      const list = map.get(f.categoria) || []
      list.push(f)
      map.set(f.categoria, list)
    }
    return map
  }, [fontes])

  // ── Handlers ──
  const handleSavePerfil = () => {
    saveJSON(PERFIL_KEY, perfil)
    showToast('Perfil atualizado com sucesso', 'success')
  }

  const handleSavePrefs = () => {
    saveJSON(PREFS_KEY, prefs)
    showToast('Preferências salvas', 'success')
  }

  const handleSaveTema = (next: 'claro' | 'escuro') => {
    setTema(next)
    try { localStorage.setItem(TEMA_KEY, next) } catch { /* ignore */ }
    showToast(`Tema ${next === 'claro' ? 'claro' : 'escuro'} aplicado`, 'success')
  }

  return (
    <div className="min-h-screen">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
          Configurações
        </h1>
        <p className="text-sm font-body text-aletis-grafite-claro mt-1">
          Perfil, aparência, fontes de dados e preferências do sistema.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-aletis-borda mb-6">
        <nav className="flex gap-0 overflow-x-auto" role="tablist">
          {([
            { id: 'perfil', label: 'Perfil', icon: UserIcon },
            { id: 'aparencia', label: 'Aparência', icon: Palette },
            { id: 'fontes', label: 'Fontes de Dados', icon: Database },
            { id: 'preferencias', label: 'Preferências', icon: SlidersHorizontal },
          ] as const).map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-body font-medium whitespace-nowrap border-b-2 transition-all duration-200 inline-flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'border-aletis-verde text-aletis-verde'
                    : 'border-transparent text-aletis-grafite-claro hover:text-aletis-grafite-escuro hover:border-aletis-borda'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Perfil ── */}
      {activeTab === 'perfil' && (
        <div className="card-premium p-6 max-w-3xl animate-fade-in">
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro mb-4">Dados do Perfil</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome completo">
              <input type="text" value={perfil.nome} onChange={e => setPerfil({ ...perfil, nome: e.target.value })} className="input-field py-2.5 text-sm" />
            </Field>
            <Field label="Cargo / Função">
              <input type="text" value={perfil.cargo} onChange={e => setPerfil({ ...perfil, cargo: e.target.value })} className="input-field py-2.5 text-sm" />
            </Field>
            <Field label="Email">
              <input type="email" value={perfil.email} onChange={e => setPerfil({ ...perfil, email: e.target.value })} className="input-field py-2.5 text-sm" />
            </Field>
            <Field label="Telefone">
              <input type="tel" value={perfil.telefone} onChange={e => setPerfil({ ...perfil, telefone: e.target.value })} className="input-field py-2.5 text-sm" />
            </Field>
            <Field label="OAB (opcional)">
              <input type="text" value={perfil.oab} onChange={e => setPerfil({ ...perfil, oab: e.target.value })} placeholder="OAB/UF 000000" className="input-field py-2.5 text-sm" />
            </Field>
          </div>
          <div className="flex justify-end mt-6">
            <button onClick={handleSavePerfil} className="btn-primary inline-flex items-center gap-2 text-sm px-5 py-2.5">
              <Save className="w-4 h-4" />
              Salvar Perfil
            </button>
          </div>
        </div>
      )}

      {/* ── Aparencia ── */}
      {activeTab === 'aparencia' && (
        <div className="card-premium p-6 max-w-3xl animate-fade-in">
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro mb-4">Tema e Aparência</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TemaCard active={tema === 'claro'} onClick={() => handleSaveTema('claro')} nome="Claro" descricao="Fundo bege claro, ideal para o dia a dia." preview="bg-aletis-bege" />
            <TemaCard active={tema === 'escuro'} onClick={() => handleSaveTema('escuro')} nome="Escuro" descricao="Fundo grafite escuro, ideal para pouca luz." preview="bg-aletis-grafite-escuro" />
          </div>
          <p className="text-xs font-body text-aletis-grafite-claro mt-4">
            O tema é aplicado imediatamente e persistido no navegador.
          </p>
        </div>
      )}

      {/* ── Fontes de Dados ── */}
      {activeTab === 'fontes' && (
        <div className="space-y-5 animate-fade-in">
          {/* Resumo */}
          {fontes && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <ResumoCard label="Total" valor={fontes.resumo.total} cor="text-aletis-grafite-escuro" />
              <ResumoCard label="Online" valor={fontes.resumo.online} cor="text-positivo" />
              <ResumoCard label="Degradado" valor={fontes.resumo.degraded} cor="text-aletis-dourado" />
              <ResumoCard label="Offline" valor={fontes.resumo.offline} cor="text-alerta" />
              <ResumoCard label="Desconhecido" valor={fontes.resumo.unknown} cor="text-aletis-grafite-claro" />
            </div>
          )}

          <div className="card-premium p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">Fontes Registradas</h2>
                {fontes && (
                  <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
                    Última verificação: {new Date(fontes.ultimaVerificacao).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
              <button onClick={loadFontes} disabled={fontesLoading} className="btn-outline inline-flex items-center gap-2 text-xs px-3 py-2 disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${fontesLoading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>

            {fontesLoading && !fontes && (
              <div className="text-center py-10 text-sm text-aletis-grafite-claro">Carregando fontes...</div>
            )}

            {!fontesLoading && !fontes && (
              <div className="text-center py-10 text-sm text-aletis-grafite-claro">
                Nenhum dado disponível. Clique em Atualizar.
              </div>
            )}

            {fontes && Array.from(fontesPorCategoria.entries()).map(([cat, lista]) => (
              <div key={cat} className="mb-6 last:mb-0">
                <h3 className="text-xs font-body font-semibold text-aletis-verde uppercase tracking-wider mb-2">
                  {cat}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-aletis-borda text-left">
                        <th className="py-2 pr-3 text-xs font-body font-semibold text-aletis-grafite-claro uppercase tracking-wider">Fonte</th>
                        <th className="py-2 pr-3 text-xs font-body font-semibold text-aletis-grafite-claro uppercase tracking-wider">Status</th>
                        <th className="py-2 pr-3 text-xs font-body font-semibold text-aletis-grafite-claro uppercase tracking-wider">Latência</th>
                        <th className="py-2 pr-3 text-xs font-body font-semibold text-aletis-grafite-claro uppercase tracking-wider">Atualização</th>
                        <th className="py-2 pr-3 text-xs font-body font-semibold text-aletis-grafite-claro uppercase tracking-wider">Erros 24h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map(f => (
                        <tr key={f.nome} className="border-b border-aletis-borda/50 last:border-0">
                          <td className="py-2.5 pr-3">
                            <div className="font-body font-medium text-aletis-grafite-escuro">{f.nome}</div>
                            <div className="text-xs text-aletis-grafite-claro">{f.descricao}</div>
                          </td>
                          <td className="py-2.5 pr-3"><StatusChip status={f.status} /></td>
                          <td className="py-2.5 pr-3 text-aletis-grafite-medio">{fmtLatency(f.latenciaMs)}</td>
                          <td className="py-2.5 pr-3 text-aletis-grafite-medio">{fmtAgo(f.ultimaAtualizacao)}</td>
                          <td className="py-2.5 pr-3 text-aletis-grafite-medio">{f.erros24h}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Preferencias ── */}
      {activeTab === 'preferencias' && (
        <div className="card-premium p-6 max-w-3xl animate-fade-in">
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro mb-4">Preferências do Sistema</h2>

          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Moeda padrão">
                <select value={prefs.moeda} onChange={e => setPrefs({ ...prefs, moeda: e.target.value as Preferencias['moeda'] })} className="input-field py-2.5 text-sm appearance-none cursor-pointer">
                  <option value="BRL">Real (BRL)</option>
                  <option value="USD">Dólar (USD)</option>
                </select>
              </Field>
              <Field label="Formato de data">
                <select value={prefs.formatoData} onChange={e => setPrefs({ ...prefs, formatoData: e.target.value as Preferencias['formatoData'] })} className="input-field py-2.5 text-sm appearance-none cursor-pointer">
                  <option value="DD/MM/YYYY">DD/MM/AAAA</option>
                  <option value="YYYY-MM-DD">AAAA-MM-DD (ISO)</option>
                </select>
              </Field>
            </div>

            <div className="border-t border-aletis-borda pt-4">
              <h3 className="text-sm font-body font-semibold text-aletis-grafite-escuro mb-3">Notificações</h3>
              <div className="space-y-2">
                <ToggleRow label="Notificações por email" descricao="Receba atualizações de propostas e clientes" checked={prefs.notificacoesEmail} onChange={v => setPrefs({ ...prefs, notificacoesEmail: v })} />
                <ToggleRow label="Notificações push" descricao="Alertas em tempo real no navegador" checked={prefs.notificacoesPush} onChange={v => setPrefs({ ...prefs, notificacoesPush: v })} />
                <ToggleRow label="Resumo diário" descricao="Email diário às 8h com indicadores e pipeline" checked={prefs.resumoDiario} onChange={v => setPrefs({ ...prefs, resumoDiario: v })} />
                <ToggleRow label="Alertas de mercado" descricao="Variações significativas de Selic, dólar e commodities" checked={prefs.alertasMercado} onChange={v => setPrefs({ ...prefs, alertasMercado: v })} />
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={handleSavePrefs} className="btn-primary inline-flex items-center gap-2 text-sm px-5 py-2.5">
                <Save className="w-4 h-4" />
                Salvar Preferências
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Small helpers ────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-body text-aletis-grafite-claro uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function TemaCard({ active, onClick, nome, descricao, preview }: { active: boolean; onClick: () => void; nome: string; descricao: string; preview: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border-2 transition-all p-4 ${active ? 'border-aletis-verde bg-aletis-verde/5' : 'border-aletis-borda hover:border-aletis-verde/50'}`}
    >
      <div className={`${preview} h-20 rounded-lg border border-aletis-borda mb-3`} />
      <div className="flex items-center justify-between">
        <span className="font-body font-semibold text-aletis-grafite-escuro">{nome}</span>
        {active && <CheckCircle2 className="w-4 h-4 text-aletis-verde" />}
      </div>
      <p className="text-xs text-aletis-grafite-claro mt-1">{descricao}</p>
    </button>
  )
}

function ResumoCard({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div className="card-premium p-4">
      <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-display font-bold ${cor} mt-0.5`}>{valor}</p>
    </div>
  )
}

function ToggleRow({ label, descricao, checked, onChange }: { label: string; descricao: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 py-2.5 cursor-pointer">
      <div>
        <p className="text-sm font-body font-medium text-aletis-grafite-escuro">{label}</p>
        <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">{descricao}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors mt-1 ${checked ? 'bg-aletis-verde' : 'bg-aletis-borda'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </label>
  )
}
