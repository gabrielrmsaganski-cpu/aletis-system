/**
 * PortalCliente (Portal do Cliente)
 *
 * SPA independente (sem sidebar) servida em /portal-cliente. Login
 * real via JWT contra a API (POST /api/portal/auth/login). Após
 * autenticar, o token é guardado em localStorage e usado para buscar
 * contrato, stepper de negociação, timeline, documentos e mensagens
 * (chat com o consultor). Nenhum dado mockado.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  LogIn,
  User,
  Lock,
  FileText,
  Download,
  Eye,
  TrendingDown,
  Send,
  CheckCircle2,
  Circle,
  MessageCircle,
  DollarSign,
  Shield,
  AlertCircle,
  LogOut,
  Key,
  Clock,
} from 'lucide-react'

/* ────────────────────────────────────────────────────────────
 * Constantes e tipos
 * ──────────────────────────────────────────────────────────── */
const TOKEN_KEY = 'aletis.portal.token'

interface ClienteMe {
  id: string
  nome: string
  cpfCnpj: string
  cidade: string
  uf: string
  email: string
  telefone: string
  atividade: string
  areaTotalHa: number
  culturas: string[]
  estagio: string
  consultor: string
  credor: string
  dataCadastro: string
  forcaTrocaSenha: boolean
}

interface ContratoDivida {
  contrato: string
  valorOriginal: number
  valorAtualizado: number
  vencimento: string
  status: string
  credor: string
}

interface ContratoPagamento {
  data: string
  valor: number
  descricao: string
  tipo: string
}

interface Contrato {
  credor: string
  valorTotalDivida: number
  valorTotalPago: number
  saldoEmAberto: number
  economia: number
  dividas: ContratoDivida[]
  pagamentos: ContratoPagamento[]
}

interface StepperItem {
  id: string
  label: string
  done: boolean
  current: boolean
}

interface TimelineEventoDTO {
  data: string
  tipo: string
  descricao: string
  detalhes?: string
}

interface DocumentoDTO {
  id: string
  nome: string
  data: string
  tipo: 'proposta' | 'contrato' | 'comprovante'
  url?: string
  canView: boolean
}

interface MensagemDTO {
  id: string
  de: 'cliente' | 'consultor' | 'sistema'
  autorNome: string
  texto: string
  criadoEm: string
  lidaEm?: string
}

/* ────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────── */
const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}

/** Wrapper de fetch autenticado. */
async function apiCall<T = unknown>(
  path: string,
  init?: RequestInit & { token?: string | null }
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (init?.token) headers['Authorization'] = `Bearer ${init.token}`
  try {
    const resp = await fetch(path, { ...init, headers })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        error: (json as { error?: string }).error || `Erro ${resp.status}`,
      }
    }
    return { ok: true, data: (json as { data: T }).data }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'Falha de rede',
    }
  }
}

/* ────────────────────────────────────────────────────────────
 * LOGIN SCREEN
 * ──────────────────────────────────────────────────────────── */
function LoginScreen({
  onLogin,
}: {
  onLogin: (token: string, cliente: ClienteMe) => void
}) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const resp = await apiCall<{ token: string; cliente: ClienteMe }>('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, senha }),
    })
    setCarregando(false)
    if (!resp.ok) {
      setErro(resp.error)
      return
    }
    localStorage.setItem(TOKEN_KEY, resp.data.token)
    onLogin(resp.data.token, resp.data.cliente)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-aletis-verde-escuro via-aletis-verde to-aletis-verde-medio flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-5">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
                              radial-gradient(circle at 75% 75%, white 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-aletis-verde to-aletis-verde-medio mb-4 shadow-lg">
              <span className="text-aletis-dourado font-display font-bold text-2xl">A</span>
            </div>
            <h1 className="text-2xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
              ALETIS
            </h1>
            <p className="text-aletis-grafite-claro font-body text-sm mt-1">Portal do Cliente</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-body font-medium text-aletis-grafite-escuro mb-1.5">
                Usuário ou CPF/CNPJ
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-aletis-grafite-claro" />
                <input
                  type="text"
                  value={usuario}
                  onChange={(e) => {
                    const raw = e.target.value
                    // Se for só dígitos/pontos/traços, aplica máscara CPF/CNPJ; senão, texto livre (email/usuário)
                    if (/^[\d.\-/\s]*$/.test(raw)) setUsuario(maskCPF(raw))
                    else setUsuario(raw.trim().toLowerCase())
                  }}
                  placeholder="000.000.000-00 ou email"
                  className="input-field pl-11 py-3.5 text-base"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-body font-medium text-aletis-grafite-escuro mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-aletis-grafite-claro" />
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Sua senha"
                  className="input-field pl-11 py-3.5 text-base"
                  autoComplete="current-password"
                  required
                  minLength={4}
                />
              </div>
            </div>

            {erro && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm font-body">{erro}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={carregando || !usuario || !senha}
              className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <LogIn className="w-5 h-5" />
              {carregando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <div className="flex items-center justify-center gap-2 mt-6 text-xs text-aletis-grafite-claro font-body">
            <Shield className="w-3.5 h-3.5" />
            Acesso seguro e criptografado
          </div>
        </div>

        <p className="text-center mt-8 text-white/60 font-body text-sm italic">
          "Verdade nos números. Prosperidade nos acordos."
        </p>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
 * TROCAR SENHA (forçada no primeiro login)
 * ──────────────────────────────────────────────────────────── */
function TrocarSenhaModal({
  token,
  obrigatorio,
  onClose,
  onSuccess,
}: {
  token: string
  obrigatorio: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (novaSenha !== confirmar) {
      setErro('Nova senha e confirmação não conferem')
      return
    }
    if (novaSenha.length < 8) {
      setErro('Nova senha deve ter ao menos 8 caracteres')
      return
    }
    setLoading(true)
    const resp = await apiCall<{ trocada: boolean }>('/api/portal/auth/trocar-senha', {
      method: 'POST',
      token,
      body: JSON.stringify({ senhaAtual, novaSenha }),
    })
    setLoading(false)
    if (!resp.ok) {
      setErro(resp.error)
      return
    }
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-aletis-dourado/15 flex items-center justify-center">
            <Key className="w-5 h-5 text-aletis-dourado-escuro" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">
              {obrigatorio ? 'Defina sua nova senha' : 'Trocar senha'}
            </h2>
            <p className="text-xs text-aletis-grafite-claro font-body">
              {obrigatorio ? 'Primeiro acesso — troca obrigatória' : 'Altere sua senha com segurança'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-body font-medium text-aletis-grafite-escuro mb-1.5">
              Senha atual
            </label>
            <input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className="input-field py-3"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-body font-medium text-aletis-grafite-escuro mb-1.5">
              Nova senha (mín. 8 caracteres)
            </label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="input-field py-3"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-body font-medium text-aletis-grafite-escuro mb-1.5">
              Confirme a nova senha
            </label>
            <input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className="input-field py-3"
              minLength={8}
              required
            />
          </div>
          {erro && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm font-body">{erro}</p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            {!obrigatorio && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-aletis-borda text-aletis-grafite-medio hover:bg-aletis-bege text-sm font-body font-medium"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1 py-3 text-sm disabled:opacity-60"
            >
              {loading ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
 * STEPPER
 * ──────────────────────────────────────────────────────────── */
function NegotiationProgress({ steps }: { steps: StepperItem[] }) {
  if (!steps.length) return null
  return (
    <div className="card-premium p-6 sm:p-8">
      <h2 className="text-lg sm:text-xl font-display font-bold text-aletis-grafite-escuro mb-6">
        Status da Negociação
      </h2>

      <div className="hidden md:block">
        <div className="flex items-center justify-between relative">
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-aletis-borda" />

          {steps.map((step, i) => (
            <div
              key={step.id}
              className="relative flex flex-col items-center"
              style={{ width: `${100 / steps.length}%` }}
            >
              {i > 0 && step.done && (
                <div
                  className="absolute top-5 right-1/2 h-0.5 bg-aletis-verde"
                  style={{ width: '100%' }}
                />
              )}
              {i > 0 && step.current && (
                <div
                  className="absolute top-5 right-1/2 h-0.5 bg-aletis-dourado"
                  style={{ width: '100%' }}
                />
              )}

              <div
                className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                  step.done
                    ? 'bg-aletis-verde border-aletis-verde text-white'
                    : step.current
                    ? 'bg-aletis-dourado border-aletis-dourado text-white animate-pulse-slow shadow-lg shadow-aletis-dourado/30'
                    : 'bg-white border-aletis-borda text-aletis-grafite-claro'
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : step.current ? (
                  <div className="w-3 h-3 rounded-full bg-white" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
              </div>

              <p
                className={`mt-3 text-xs sm:text-sm font-body text-center leading-tight ${
                  step.done
                    ? 'text-aletis-verde font-semibold'
                    : step.current
                    ? 'text-aletis-dourado-escuro font-bold'
                    : 'text-aletis-grafite-claro'
                }`}
              >
                {step.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="md:hidden space-y-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1
          return (
            <div key={step.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${
                    step.done
                      ? 'bg-aletis-verde border-aletis-verde text-white'
                      : step.current
                      ? 'bg-aletis-dourado border-aletis-dourado text-white animate-pulse-slow'
                      : 'bg-white border-aletis-borda text-aletis-grafite-claro'
                  }`}
                >
                  {step.done ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : step.current ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  ) : (
                    <Circle className="w-3.5 h-3.5" />
                  )}
                </div>
                {!isLast && (
                  <div className={`w-0.5 h-6 ${step.done ? 'bg-aletis-verde' : 'bg-aletis-borda'}`} />
                )}
              </div>
              <p
                className={`text-sm font-body pt-1.5 ${
                  step.done
                    ? 'text-aletis-verde font-semibold'
                    : step.current
                    ? 'text-aletis-dourado-escuro font-bold'
                    : 'text-aletis-grafite-claro'
                }`}
              >
                {step.label}
                {step.current && (
                  <span className="ml-2 inline-block w-2 h-2 rounded-full bg-aletis-dourado animate-pulse" />
                )}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
 * DASHBOARD
 * ──────────────────────────────────────────────────────────── */
function ClientDashboard({
  token,
  cliente,
  onLogout,
  onRefreshCliente,
}: {
  token: string
  cliente: ClienteMe
  onLogout: () => void
  onRefreshCliente: () => Promise<void>
}) {
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [stepper, setStepper] = useState<StepperItem[]>([])
  const [timeline, setTimeline] = useState<TimelineEventoDTO[]>([])
  const [documentos, setDocumentos] = useState<DocumentoDTO[]>([])
  const [mensagens, setMensagens] = useState<MensagemDTO[]>([])
  const [chatInput, setChatInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [showTrocarSenha, setShowTrocarSenha] = useState(cliente.forcaTrocaSenha)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const fetchTudo = useCallback(async () => {
    const [c, s, t, d, m] = await Promise.all([
      apiCall<Contrato>('/api/portal/contrato', { token }),
      apiCall<StepperItem[]>('/api/portal/stepper', { token }),
      apiCall<TimelineEventoDTO[]>('/api/portal/timeline', { token }),
      apiCall<DocumentoDTO[]>('/api/portal/documentos', { token }),
      apiCall<MensagemDTO[]>('/api/portal/mensagens', { token }),
    ])
    if (c.ok) setContrato(c.data)
    if (s.ok) setStepper(s.data)
    if (t.ok) setTimeline(t.data)
    if (d.ok) setDocumentos(d.data)
    if (m.ok) setMensagens(m.data)
  }, [token])

  useEffect(() => {
    fetchTudo()
  }, [fetchTudo])

  // Polling leve de mensagens (15s)
  useEffect(() => {
    const h = window.setInterval(async () => {
      const m = await apiCall<MensagemDTO[]>('/api/portal/mensagens', { token })
      if (m.ok) setMensagens(m.data)
    }, 15000)
    return () => window.clearInterval(h)
  }, [token])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  const handleSendMessage = async () => {
    const texto = chatInput.trim()
    if (!texto || enviando) return
    setEnviando(true)
    const resp = await apiCall<MensagemDTO>('/api/portal/mensagens', {
      method: 'POST',
      token,
      body: JSON.stringify({ texto }),
    })
    setEnviando(false)
    if (resp.ok) {
      setMensagens((prev) => [...prev, resp.data])
      setChatInput('')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-aletis-bege to-white">
      {/* Nav */}
      <nav className="bg-white border-b border-aletis-borda/60 shadow-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-aletis-verde to-aletis-verde-medio flex items-center justify-center">
              <span className="text-aletis-dourado font-display font-bold text-sm">A</span>
            </div>
            <div>
              <span className="font-display font-bold text-aletis-grafite-escuro text-sm tracking-wide">
                ALETIS
              </span>
              <span className="text-xs text-aletis-grafite-claro font-body ml-2 hidden sm:inline">
                Portal do Cliente
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-body font-medium text-aletis-grafite-escuro">
                {cliente.nome}
              </p>
              <p className="text-[11px] font-body text-aletis-grafite-claro">
                {cliente.cidade} - {cliente.uf}
              </p>
            </div>
            <button
              onClick={() => setShowTrocarSenha(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-body font-medium text-aletis-grafite-medio hover:bg-aletis-bege flex items-center gap-1.5"
              title="Trocar senha"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Senha</span>
            </button>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded-lg text-xs font-body font-medium text-aletis-grafite-claro hover:bg-red-50 hover:text-alerta transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Cabeçalho */}
        <header>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
            {getGreeting()}, {cliente.nome.split(' ')[0]}
          </h1>
          <p className="text-aletis-grafite-claro font-body mt-2 text-base">
            {contrato
              ? `Aqui está o resumo da sua negociação com ${contrato.credor}.`
              : 'Carregando sua negociação…'}
          </p>
        </header>

        {/* Stepper */}
        <NegotiationProgress steps={stepper} />

        {/* Resumo financeiro */}
        {contrato && (
          <section>
            <h2 className="text-lg sm:text-xl font-display font-bold text-aletis-grafite-escuro mb-4">
              Resumo Financeiro
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card-premium p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-aletis-grafite-claro/10 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-aletis-grafite-medio" />
                  </div>
                  <p className="text-sm font-body text-aletis-grafite-claro">Dívida Original</p>
                </div>
                <p className="text-2xl sm:text-3xl font-display font-bold text-aletis-grafite-escuro">
                  {formatBRL(contrato.valorTotalDivida)}
                </p>
              </div>

              <div className="card-premium p-6 border-aletis-verde/30">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-positivo/10 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-positivo" />
                  </div>
                  <p className="text-sm font-body text-aletis-grafite-claro">Saldo em Aberto</p>
                </div>
                <p className="text-2xl sm:text-3xl font-display font-bold text-aletis-grafite-escuro">
                  {formatBRL(contrato.saldoEmAberto)}
                </p>
                {contrato.economia > 0 && (
                  <p className="text-sm font-body text-positivo font-semibold mt-2 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Economia de {formatBRL(contrato.economia)}
                  </p>
                )}
              </div>

              <div className="card-premium p-6 border-aletis-dourado/30 bg-gradient-to-br from-white to-aletis-dourado-claro/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-aletis-dourado/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-aletis-dourado" />
                  </div>
                  <p className="text-sm font-body text-aletis-grafite-claro">Total Pago</p>
                </div>
                <p className="text-2xl sm:text-3xl font-display font-bold text-aletis-grafite-escuro">
                  {formatBRL(contrato.valorTotalPago)}
                </p>
                <p className="text-xs font-body text-aletis-grafite-claro mt-2">
                  {contrato.pagamentos.length}{' '}
                  {contrato.pagamentos.length === 1 ? 'pagamento' : 'pagamentos'} registrados
                </p>
              </div>
            </div>

            {/* Contratos */}
            {contrato.dividas.length > 0 && (
              <div className="card-premium mt-4 overflow-hidden">
                <h3 className="text-sm font-body font-semibold text-aletis-grafite-medio uppercase tracking-wide px-6 py-3 border-b border-aletis-borda/60 bg-aletis-bege/40">
                  Contratos em Negociação
                </h3>
                <div className="divide-y divide-aletis-borda/60">
                  {contrato.dividas.map((d, i) => (
                    <div key={i} className="px-6 py-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-body font-medium text-aletis-grafite-escuro">
                          {d.contrato}
                        </p>
                        <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
                          {d.credor} · vence {formatDate(d.vencimento)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                          {formatBRL(d.valorAtualizado)}
                        </p>
                        <span className="inline-block mt-1 text-[10px] font-body uppercase tracking-wider px-2 py-0.5 rounded-full bg-aletis-bege text-aletis-grafite-medio">
                          {d.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Documentos */}
        <section>
          <h2 className="text-lg sm:text-xl font-display font-bold text-aletis-grafite-escuro mb-4">
            Documentos
          </h2>
          {documentos.length === 0 ? (
            <div className="card-premium p-8 text-center text-sm font-body text-aletis-grafite-claro">
              Nenhum documento disponível ainda.
            </div>
          ) : (
            <div className="card-premium divide-y divide-aletis-borda/60">
              {documentos.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-aletis-bege/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-alerta/5 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-alerta" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-body font-medium text-aletis-grafite-escuro truncate">
                      {doc.nome}
                    </p>
                    <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
                      {formatDate(doc.data)}
                    </p>
                  </div>
                  {doc.canView && doc.url ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-body font-medium text-aletis-verde bg-aletis-verde/5 hover:bg-aletis-verde/10 transition-colors flex-shrink-0"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="hidden sm:inline">Visualizar</span>
                    </a>
                  ) : (
                    <button
                      disabled
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-body font-medium text-aletis-grafite-claro opacity-60 cursor-not-allowed flex-shrink-0"
                    >
                      <Download className="w-4 h-4" />
                      <span className="hidden sm:inline">Indisponível</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Timeline */}
        {timeline.length > 0 && (
          <section>
            <h2 className="text-lg sm:text-xl font-display font-bold text-aletis-grafite-escuro mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-aletis-grafite-medio" />
              Acompanhamento
            </h2>
            <div className="card-premium p-6">
              <ol className="relative border-l-2 border-aletis-borda pl-5 space-y-5">
                {timeline.slice(0, 10).map((ev, i) => (
                  <li key={i} className="relative">
                    <div className="absolute -left-[27px] top-0 w-4 h-4 rounded-full bg-aletis-verde border-4 border-white shadow-sm" />
                    <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider">
                      {formatDate(ev.data)} · {ev.tipo}
                    </p>
                    <p className="text-sm font-body font-medium text-aletis-grafite-escuro mt-0.5">
                      {ev.descricao}
                    </p>
                    {ev.detalhes && (
                      <p className="text-xs font-body text-aletis-grafite-medio mt-1">
                        {ev.detalhes}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* Chat */}
        <section>
          <h2 className="text-lg sm:text-xl font-display font-bold text-aletis-grafite-escuro mb-4 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-aletis-verde" />
            Chat com {cliente.consultor || 'seu consultor'}
          </h2>
          <div className="card-premium overflow-hidden">
            <div className="px-5 sm:px-6 py-4 bg-gradient-to-r from-aletis-verde to-aletis-verde-medio flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-white font-display font-bold text-xs">
                  {(cliente.consultor || 'C').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-white font-body font-semibold text-sm">
                  {cliente.consultor || 'Consultor ALETIS'}
                </p>
                <p className="text-white/60 text-xs font-body">
                  Mensagens diretas, sem intermediários
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-positivo animate-pulse" />
                <span className="text-white/60 text-xs font-body">Online</span>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-5 space-y-4 max-h-96 overflow-y-auto custom-scrollbar bg-aletis-bege/30">
              {mensagens.length === 0 ? (
                <p className="text-center text-sm font-body text-aletis-grafite-claro py-8">
                  Inicie a conversa com seu consultor abaixo.
                </p>
              ) : (
                mensagens.map((msg) => {
                  const meu = msg.de === 'cliente'
                  return (
                    <div key={msg.id} className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-3 ${
                          meu
                            ? 'bg-aletis-verde text-white rounded-br-md'
                            : 'bg-white border border-aletis-borda text-aletis-grafite-escuro rounded-bl-md shadow-sm'
                        }`}
                      >
                        <p className="text-sm font-body leading-relaxed whitespace-pre-wrap">
                          {msg.texto}
                        </p>
                        <p
                          className={`text-[10px] font-body mt-1.5 ${
                            meu ? 'text-white/60' : 'text-aletis-grafite-claro'
                          }`}
                        >
                          {msg.autorNome} · {formatDateTime(msg.criadoEm)}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="px-5 sm:px-6 py-4 border-t border-aletis-borda/60 bg-white">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder="Digite sua mensagem..."
                  className="input-field py-3 text-sm flex-1"
                  maxLength={2000}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || enviando}
                  className="btn-primary px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <footer className="text-center py-8">
          <p className="text-sm font-body text-aletis-grafite-claro italic">
            "Verdade nos números. Prosperidade nos acordos."
          </p>
          <p className="text-xs font-body text-aletis-grafite-claro/60 mt-2">
            ALETIS Finanças Estratégicas
          </p>
        </footer>
      </div>

      {showTrocarSenha && (
        <TrocarSenhaModal
          token={token}
          obrigatorio={cliente.forcaTrocaSenha}
          onClose={() => setShowTrocarSenha(false)}
          onSuccess={async () => {
            setShowTrocarSenha(false)
            await onRefreshCliente()
          }}
        />
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
 * EXPORT
 * ──────────────────────────────────────────────────────────── */
export default function PortalCliente() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [cliente, setCliente] = useState<ClienteMe | null>(null)
  const [verificando, setVerificando] = useState<boolean>(Boolean(token))

  const refreshCliente = useCallback(async () => {
    if (!token) return
    const resp = await apiCall<ClienteMe>('/api/portal/auth/me', { token })
    if (!resp.ok) {
      localStorage.removeItem(TOKEN_KEY)
      setToken(null)
      setCliente(null)
      setVerificando(false)
      return
    }
    setCliente(resp.data)
    setVerificando(false)
  }, [token])

  useEffect(() => {
    if (token) refreshCliente()
    else setVerificando(false)
  }, [token, refreshCliente])

  if (verificando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-aletis-bege">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-aletis-dourado" />
      </div>
    )
  }

  if (!token || !cliente) {
    return (
      <LoginScreen
        onLogin={(t, c) => {
          setToken(t)
          setCliente(c)
        }}
      />
    )
  }

  return (
    <ClientDashboard
      token={token}
      cliente={cliente}
      onRefreshCliente={refreshCliente}
      onLogout={() => {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setCliente(null)
      }}
    />
  )
}
