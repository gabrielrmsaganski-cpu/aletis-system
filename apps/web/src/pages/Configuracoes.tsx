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
  ShieldCheck,
  KeyRound,
  Copy,
  Trash2,
  Power,
  UserPlus,
  Search,
  MailOpen,
} from 'lucide-react'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { apiFetch, apiFetchFull } from '../hooks/useApi'
import { InlineButton } from '../components/ui'

// ── Types ────────────────────────────────────────────────────
type TabId = 'perfil' | 'aparencia' | 'fontes' | 'preferencias' | 'acessos'

interface PortalClienteRow {
  id: string
  nome: string
  cpfCnpj: string
  email: string
  cidade: string
  uf: string
  estagio: string
  consultor: string
  portal: null | {
    usuario: string
    ativo: boolean
    criadoEm: string
    atualizadoEm: string
    ultimoLoginEm?: string
    forcaTrocaSenha: boolean
  }
  mensagensNaoLidas: number
}

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

  // ── Acessos Portal Cliente state ──
  const [clientesPortal, setClientesPortal] = useState<PortalClienteRow[]>([])
  const [acessosLoading, setAcessosLoading] = useState(false)
  const [buscaAcessos, setBuscaAcessos] = useState('')
  const [filtroAcessos, setFiltroAcessos] = useState<'todos' | 'com' | 'sem' | 'inativos'>('todos')
  const [modalSenha, setModalSenha] = useState<{
    cliente: PortalClienteRow
    usuario: string
    senhaTemporaria: string
  } | null>(null)
  const [acaoPendente, setAcaoPendente] = useState<string | null>(null)

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

  // Fetch fontes when tab opens (envelope { sucesso, dados })
  const loadFontes = async () => {
    setFontesLoading(true)
    try {
      const json = await apiFetchFull<{ dados?: FontesStatus; data?: FontesStatus }>('/fontes/status')
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

  // ── Acessos Portal Cliente ────────────────────────────────────
  const loadClientesPortal = async () => {
    setAcessosLoading(true)
    try {
      const data = await apiFetch<PortalClienteRow[]>('/portal-admin/clientes')
      setClientesPortal(data)
    } catch (err) {
      showToast(`Erro: ${(err as Error).message}`, 'warning')
    } finally {
      setAcessosLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'acessos' && clientesPortal.length === 0) loadClientesPortal()
  }, [activeTab])

  const criarOuResetarAcesso = async (cli: PortalClienteRow) => {
    setAcaoPendente(cli.id)
    try {
      const data = await apiFetch<{ usuario: string; senhaTemporaria: string }>(
        `/clientes/${cli.id}/portal-access`,
        { method: 'POST', body: JSON.stringify({}) },
      )
      setModalSenha({
        cliente: cli,
        usuario: data.usuario,
        senhaTemporaria: data.senhaTemporaria,
      })
      await loadClientesPortal()
      showToast(cli.portal ? 'Senha resetada' : 'Acesso criado', 'success')
    } catch (err) {
      showToast((err as Error).message || 'Falha ao criar acesso', 'error')
    } finally {
      setAcaoPendente(null)
    }
  }

  const toggleAtivo = async (cli: PortalClienteRow) => {
    if (!cli.portal) return
    setAcaoPendente(cli.id)
    try {
      const data = await apiFetch<{ ativo: boolean }>(
        `/clientes/${cli.id}/portal-access`,
        { method: 'PATCH', body: JSON.stringify({ ativo: !cli.portal.ativo }) },
      )
      await loadClientesPortal()
      showToast(data.ativo ? 'Acesso ativado' : 'Acesso desativado', 'success')
    } catch (err) {
      showToast((err as Error).message || 'Falha', 'error')
    } finally {
      setAcaoPendente(null)
    }
  }

  const revogarAcesso = async (cli: PortalClienteRow) => {
    if (!cli.portal) return
    if (!window.confirm(`Revogar acesso de ${cli.nome}? O cliente precisará de nova senha.`)) return
    setAcaoPendente(cli.id)
    try {
      await apiFetch(`/clientes/${cli.id}/portal-access`, { method: 'DELETE' })
      await loadClientesPortal()
      showToast('Acesso revogado', 'success')
    } catch (err) {
      showToast((err as Error).message || 'Falha', 'error')
    } finally {
      setAcaoPendente(null)
    }
  }

  const copiarParaClipboard = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      showToast('Copiado', 'success')
    } catch {
      showToast('Não foi possível copiar', 'warning')
    }
  }

  const clientesFiltrados = useMemo(() => {
    const q = buscaAcessos.trim().toLowerCase()
    return clientesPortal.filter((c) => {
      if (filtroAcessos === 'com' && !c.portal) return false
      if (filtroAcessos === 'sem' && c.portal) return false
      if (filtroAcessos === 'inativos' && (!c.portal || c.portal.ativo)) return false
      if (!q) return true
      return (
        c.nome.toLowerCase().includes(q) ||
        c.cpfCnpj.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.portal?.usuario.toLowerCase().includes(q) ?? false)
      )
    })
  }, [clientesPortal, buscaAcessos, filtroAcessos])

  const resumoAcessos = useMemo(() => {
    const total = clientesPortal.length
    const com = clientesPortal.filter((c) => c.portal).length
    const ativos = clientesPortal.filter((c) => c.portal?.ativo).length
    const mensagens = clientesPortal.reduce((acc, c) => acc + c.mensagensNaoLidas, 0)
    return { total, com, sem: total - com, ativos, mensagens }
  }, [clientesPortal])

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
            { id: 'acessos', label: 'Acessos Portal Cliente', icon: ShieldCheck },
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
            <InlineButton variant="primary" size="md" icon={Save} onClick={handleSavePerfil}>
              Salvar Perfil
            </InlineButton>
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
              <InlineButton
                variant="outline"
                size="sm"
                icon={RefreshCw}
                onClick={loadFontes}
                loading={fontesLoading}
              >
                Atualizar
              </InlineButton>
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
              <InlineButton variant="primary" size="md" icon={Save} onClick={handleSavePrefs}>
                Salvar Preferências
              </InlineButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Acessos Portal Cliente ── */}
      {activeTab === 'acessos' && (
        <div className="animate-fade-in space-y-5">
          {/* Cabeçalho com ações */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
                Acessos Portal Cliente
              </h2>
              <p className="text-sm font-body text-aletis-grafite-claro mt-0.5">
                Gerencie logins e senhas que os clientes usam no Portal (/portal-cliente).
              </p>
            </div>
            <button
              onClick={loadClientesPortal}
              disabled={acessosLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-aletis-borda text-sm font-body text-aletis-grafite-medio hover:bg-aletis-bege self-start"
            >
              <RefreshCw className={`w-4 h-4 ${acessosLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>

          {/* Resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <ResumoCard label="Clientes" valor={resumoAcessos.total} cor="text-aletis-grafite-escuro" />
            <ResumoCard label="Com acesso" valor={resumoAcessos.com} cor="text-aletis-verde" />
            <ResumoCard label="Sem acesso" valor={resumoAcessos.sem} cor="text-aletis-grafite-medio" />
            <ResumoCard label="Ativos" valor={resumoAcessos.ativos} cor="text-positivo" />
            <ResumoCard label="Msg não lidas" valor={resumoAcessos.mensagens} cor="text-aletis-dourado" />
          </div>

          {/* Filtros + busca */}
          <div className="card-premium p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro" />
              <input
                type="text"
                value={buscaAcessos}
                onChange={(e) => setBuscaAcessos(e.target.value)}
                placeholder="Buscar por nome, CPF/CNPJ, email ou usuário…"
                className="input-field pl-10 py-2.5 text-sm w-full"
              />
            </div>
            <select
              value={filtroAcessos}
              onChange={(e) => setFiltroAcessos(e.target.value as typeof filtroAcessos)}
              className="input-field py-2.5 text-sm md:w-56"
            >
              <option value="todos">Todos</option>
              <option value="com">Com acesso criado</option>
              <option value="sem">Sem acesso</option>
              <option value="inativos">Somente inativos</option>
            </select>
          </div>

          {/* Tabela */}
          <div className="card-premium overflow-hidden">
            {acessosLoading && clientesPortal.length === 0 ? (
              <div className="p-10 text-center text-sm font-body text-aletis-grafite-claro">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                Carregando clientes…
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <div className="p-10 text-center text-sm font-body text-aletis-grafite-claro">
                Nenhum cliente encontrado com esses filtros.
              </div>
            ) : (
              <div className="divide-y divide-aletis-borda/60">
                {clientesFiltrados.map((cli) => (
                  <div
                    key={cli.id}
                    className="px-4 sm:px-6 py-4 flex flex-col lg:flex-row lg:items-center gap-4"
                  >
                    {/* Identificação */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                          {cli.nome}
                        </p>
                        {cli.portal ? (
                          cli.portal.ativo ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-positivo/10 text-positivo border border-positivo/30">
                              <CheckCircle2 className="w-3 h-3" /> Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-alerta/10 text-alerta border border-alerta/30">
                              <XCircle className="w-3 h-3" /> Inativo
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-aletis-bege text-aletis-grafite-medio border border-aletis-borda">
                            Sem acesso
                          </span>
                        )}
                        {cli.portal?.forcaTrocaSenha && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-aletis-dourado/10 text-aletis-dourado-escuro border border-aletis-dourado/30">
                            <KeyRound className="w-3 h-3" /> Trocar senha
                          </span>
                        )}
                        {cli.mensagensNaoLidas > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-aletis-verde/10 text-aletis-verde border border-aletis-verde/30">
                            <MailOpen className="w-3 h-3" /> {cli.mensagensNaoLidas} msg
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
                        {cli.cpfCnpj} · {cli.cidade}/{cli.uf} · {cli.estagio}
                      </p>
                      {cli.portal && (
                        <p className="text-xs font-body text-aletis-grafite-medio mt-1 flex items-center gap-1 flex-wrap">
                          <span className="font-mono bg-aletis-bege px-1.5 py-0.5 rounded">
                            {cli.portal.usuario}
                          </span>
                          {cli.portal.ultimoLoginEm && (
                            <span>
                              último login: {fmtAgo(cli.portal.ultimoLoginEm)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex flex-wrap gap-2">
                      {!cli.portal ? (
                        <button
                          onClick={() => criarOuResetarAcesso(cli)}
                          disabled={acaoPendente === cli.id}
                          className="btn-primary inline-flex items-center gap-1.5 text-xs px-3 py-2 disabled:opacity-60"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Criar acesso
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => criarOuResetarAcesso(cli)}
                            disabled={acaoPendente === cli.id}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-aletis-dourado/10 text-aletis-dourado-escuro border border-aletis-dourado/30 hover:bg-aletis-dourado/20 disabled:opacity-60"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            Resetar senha
                          </button>
                          <button
                            onClick={() => toggleAtivo(cli)}
                            disabled={acaoPendente === cli.id}
                            className={`inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border disabled:opacity-60 ${
                              cli.portal.ativo
                                ? 'bg-aletis-bege text-aletis-grafite-medio border-aletis-borda hover:bg-aletis-bege/70'
                                : 'bg-positivo/10 text-positivo border-positivo/30 hover:bg-positivo/20'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {cli.portal.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            onClick={() => revogarAcesso(cli)}
                            disabled={acaoPendente === cli.id}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-alerta/5 text-alerta border border-alerta/30 hover:bg-alerta/10 disabled:opacity-60"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Revogar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="rounded-xl border border-aletis-borda/60 bg-aletis-bege/40 p-4 text-xs font-body text-aletis-grafite-medio leading-relaxed">
            <strong className="text-aletis-grafite-escuro">Como funciona:</strong> ao criar o
            acesso, o sistema gera uma senha temporária de uso único.{' '}
            <strong>Copie e envie ao cliente com segurança</strong> (WhatsApp, email); no primeiro
            login, o cliente será obrigado a definir uma nova senha. Se o cliente esquecer a senha,
            basta clicar em <em>Resetar senha</em> — uma nova senha temporária será gerada. Você
            pode <em>desativar</em> o acesso temporariamente (o login passa a ser recusado) ou{' '}
            <em>revogar</em> (apaga a credencial).
          </div>
        </div>
      )}

      {/* Modal: senha temporária */}
      {modalSenha && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-aletis-dourado/15 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-aletis-dourado-escuro" />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">
                  Senha temporária gerada
                </h2>
                <p className="text-xs text-aletis-grafite-claro font-body">
                  Copie agora — não será exibida novamente
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-aletis-bege border border-aletis-borda">
                <p className="text-[11px] uppercase tracking-wider text-aletis-grafite-claro font-body mb-1">
                  Cliente
                </p>
                <p className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                  {modalSenha.cliente.nome}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-aletis-bege border border-aletis-borda flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-aletis-grafite-claro font-body mb-1">
                    Usuário
                  </p>
                  <p className="text-sm font-mono font-semibold text-aletis-grafite-escuro break-all">
                    {modalSenha.usuario}
                  </p>
                </div>
                <button
                  onClick={() => copiarParaClipboard(modalSenha.usuario)}
                  className="p-2 rounded-lg hover:bg-aletis-borda flex-shrink-0"
                  title="Copiar"
                >
                  <Copy className="w-4 h-4 text-aletis-grafite-medio" />
                </button>
              </div>
              <div className="p-3 rounded-xl bg-aletis-dourado/10 border border-aletis-dourado/30 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-aletis-dourado-escuro font-body mb-1">
                    Senha temporária
                  </p>
                  <p className="text-lg font-mono font-bold text-aletis-grafite-escuro tracking-wider break-all">
                    {modalSenha.senhaTemporaria}
                  </p>
                </div>
                <button
                  onClick={() => copiarParaClipboard(modalSenha.senhaTemporaria)}
                  className="p-2 rounded-lg hover:bg-aletis-dourado/20 flex-shrink-0"
                  title="Copiar"
                >
                  <Copy className="w-4 h-4 text-aletis-dourado-escuro" />
                </button>
              </div>
              <p className="text-xs text-aletis-grafite-medio font-body">
                Envie as credenciais ao cliente por canal seguro. Ele será forçado a trocar a senha
                no primeiro login.
              </p>
            </div>
            <div className="flex gap-3 pt-5">
              <button
                onClick={() =>
                  copiarParaClipboard(
                    `ALETIS — Portal do Cliente\nAcesse: ${window.location.origin}/portal-cliente\nUsuário: ${modalSenha.usuario}\nSenha temporária: ${modalSenha.senhaTemporaria}\n(Você será solicitado a criar uma nova senha no primeiro acesso.)`
                  )
                }
                className="flex-1 py-2.5 rounded-xl border border-aletis-borda text-aletis-grafite-medio hover:bg-aletis-bege text-sm font-body font-medium inline-flex items-center justify-center gap-1.5"
              >
                <Copy className="w-4 h-4" />
                Copiar mensagem pronta
              </button>
              <button
                onClick={() => setModalSenha(null)}
                className="btn-primary flex-1 py-2.5 text-sm"
              >
                Fechar
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
