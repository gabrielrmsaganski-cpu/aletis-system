/**
 * PortalCliente — SPA do cliente final ALETIS.
 *
 * Servida em /portal-cliente sem layout do consultor. Onda 1 desta SPA:
 *   1. Login com senha + magic-link + esqueci-senha
 *   2. Magic redeem + reset de senha via query string (?magic=...|?reset=...)
 *   3. Hero Pulse: o cliente entende em 3s onde o caso está
 *   4. Inbox de documentos pendentes
 *   5. Upload self-service do cliente
 *   6. Badge de mensagens não lidas
 *   7. Cofre digital (uploads enviados)
 *   8. Identidade visual oficial (BrandMark + paleta nova)
 *
 * O conteúdo é 100% derivado da API; nada mockado.
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
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
  Sparkles,
  Inbox,
  Upload as UploadIcon,
  Vault,
  Heart,
  ChevronRight,
  Mail,
  ArrowRight,
  Loader2,
  CheckCheck,
  XCircle,
  PaperclipIcon as Paperclip,
} from 'lucide-react'
import BrandMark from '../components/ui/BrandMark'

/* ──────────────────────────────────────────────────────────────
 * Constantes / tipos
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

interface PulseDTO {
  clienteId: string
  nome: string
  estagioAtual: { id: string; label: string; estagioRaw: string }
  proximoPasso: string
  pendencias: { total: number; pendentes: number; aguardandoRevisao: number }
  mensagensNaoLidas: number
  ultimaAtualizacao: string
  healthScore: number
  consultor: string | null
  economiaEstimada: number
}

interface PendenciaDTO {
  id: string
  clienteId: string
  titulo: string
  descricao?: string
  categoria: 'fiscal' | 'contrato' | 'identidade' | 'patrimonio' | 'agro' | 'outros'
  obrigatorio: boolean
  status: 'pendente' | 'enviado' | 'aprovado' | 'rejeitado'
  uploadId?: string
  solicitadoPor?: string
  solicitadoEm: string
  enviadoEm?: string
  observacao?: string
}

interface UploadDTO {
  id: string
  clienteId: string
  pendenciaId?: string
  nomeOriginal: string
  mime: string
  tamanho: number
  categoria?: string
  enviadoPor: 'cliente' | 'consultor'
  enviadoEm: string
  url?: string
}

interface ParcelaDTO {
  numero: number
  vencimento: string
  valor: number
  status: 'futuro' | 'proximo' | 'pago' | 'atrasado'
  pagoEm?: string
}

interface CronogramaDTO {
  totalAberto: number
  parcelaPadrao: number
  totalParcelas: number
  parcelas: ParcelaDTO[]
}

interface MemoriaBlocoDTO {
  chave: 'origem' | 'descoberta' | 'plano' | 'pago'
  titulo: string
  valor: number
  descricao: string
}

interface MemoriaSimplificadaDTO {
  economia: number
  original: number
  atual: number
  pago: number
  blocos: MemoriaBlocoDTO[]
}

interface AuditoriaEventoDTO {
  id: number
  tipo: string
  canal?: string
  criadoEm: string
  ip?: string
  detalhes?: Record<string, unknown>
}

/* ──────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────── */
const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatBRLShort = (v: number): string => {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1)} bi`
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)} mi`
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`
  return formatBRL(v)
}

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

function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const diff = Date.now() - then
    const min = Math.floor(diff / 60_000)
    if (min < 1) return 'agora há pouco'
    if (min < 60) return `há ${min} min`
    const h = Math.floor(min / 60)
    if (h < 24) return `há ${h}h`
    const d = Math.floor(h / 24)
    if (d < 7) return `há ${d}d`
    return formatDate(iso)
  } catch {
    return iso
  }
}

function fmtBytes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`
  return `${n} B`
}

const CATEGORIA_LABEL: Record<PendenciaDTO['categoria'], string> = {
  fiscal: 'Fiscal',
  contrato: 'Contrato',
  identidade: 'Identidade',
  patrimonio: 'Patrimônio',
  agro: 'Agro',
  outros: 'Outros',
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

/* ──────────────────────────────────────────────────────────────
 * LOGIN — 3 modos: senha · magic link · esqueci senha
 * ──────────────────────────────────────────────────────────── */
type LoginMode = 'senha' | 'magic' | 'forgot'

function LoginScreen({
  onLogin,
}: {
  onLogin: (token: string, cliente: ClienteMe) => void
}) {
  const [mode, setMode] = useState<LoginMode>('senha')
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const handleSubmitSenha = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null); setInfo(null); setCarregando(true)
    const resp = await apiCall<{ token: string; cliente: ClienteMe }>('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, senha }),
    })
    setCarregando(false)
    if (!resp.ok) { setErro(resp.error); return }
    localStorage.setItem(TOKEN_KEY, resp.data.token)
    onLogin(resp.data.token, resp.data.cliente)
  }

  const handleSubmitMagic = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null); setInfo(null); setCarregando(true)
    await apiCall('/api/portal/auth/magic/request', {
      method: 'POST',
      body: JSON.stringify({ identificador: usuario }),
    })
    setCarregando(false)
    setInfo('Pronto! Se a conta existir, enviamos um link de acesso por e-mail e/ou WhatsApp em alguns segundos. Verifique sua caixa de entrada.')
  }

  const handleSubmitForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null); setInfo(null); setCarregando(true)
    await apiCall('/api/portal/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({ identificador: usuario }),
    })
    setCarregando(false)
    setInfo('Se a conta existir, enviamos um link para redefinir a senha. O link vale por 30 minutos.')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundColor: '#080d09',
        backgroundImage:
          'linear-gradient(140deg, rgba(8,13,9,0.97) 0%, rgba(13,22,17,0.94) 45%, rgba(36,58,44,0.92) 100%), url(/brand/pattern/repetidor.png)',
        backgroundSize: 'auto, 360px',
        backgroundBlendMode: 'normal, soft-light',
      }}
    >
      {/* glow ambiente */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 18%, rgba(203,157,82,0.18) 0%, transparent 38%), radial-gradient(circle at 82% 70%, rgba(178,189,161,0.14) 0%, transparent 45%)',
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <BrandMark variant="stacked" tone="cream" size={56} />
          <p className="mt-4 font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-aletis-gold">
            Portal do Cliente
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-brand-lg p-8 sm:p-10 border border-aletis-cream-escuro/60">
          <div className="flex gap-1 p-1 mb-6 rounded-full bg-aletis-cream/70">
            {([
              { id: 'senha', label: 'Senha', icon: Lock },
              { id: 'magic', label: 'Link mágico', icon: Sparkles },
            ] as const).map((m) => {
              const active = mode === m.id || (mode === 'forgot' && m.id === 'senha')
              const Icon = m.icon
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setMode(m.id); setErro(null); setInfo(null) }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full font-display text-[11.5px] font-semibold uppercase tracking-wider transition ${
                    active
                      ? 'bg-aletis-verde text-aletis-cream shadow-brand-sm'
                      : 'text-aletis-verde-medio hover:text-aletis-verde'
                  }`}
                >
                  <Icon size={12} />
                  {m.label}
                </button>
              )
            })}
          </div>

          {mode === 'senha' && (
            <form onSubmit={handleSubmitSenha} className="space-y-4">
              <Field
                icon={User}
                label="E-mail, CPF/CNPJ ou usuário"
                value={usuario}
                onChange={setUsuario}
                onChangeRaw={(raw) => /^[\d.\-/\s]*$/.test(raw) ? maskCPF(raw) : raw.trim().toLowerCase()}
                placeholder="000.000.000-00 ou seu@email"
                autoComplete="username"
              />
              <Field
                icon={Lock}
                type="password"
                label="Senha"
                value={senha}
                onChange={setSenha}
                placeholder="Sua senha"
                autoComplete="current-password"
                minLength={4}
              />
              {erro && <ErrorBanner message={erro} />}
              {info && <InfoBanner message={info} />}
              <button
                type="submit"
                disabled={carregando || !usuario || !senha}
                className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {carregando ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                {carregando ? 'Entrando…' : 'Entrar'}
              </button>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setErro(null); setInfo(null) }}
                className="w-full text-center text-[12.5px] font-body text-aletis-verde-medio hover:text-aletis-gold-escuro transition"
              >
                Esqueci minha senha
              </button>
            </form>
          )}

          {mode === 'magic' && (
            <form onSubmit={handleSubmitMagic} className="space-y-4">
              <p className="font-body text-[13px] leading-relaxed text-aletis-verde-medio">
                Enviaremos um link de acesso direto para o seu e-mail e/ou WhatsApp. Sem senha, válido por 15 minutos.
              </p>
              <Field
                icon={Mail}
                label="E-mail, CPF/CNPJ ou telefone"
                value={usuario}
                onChange={setUsuario}
                onChangeRaw={(raw) => /^[\d.\-/\s]*$/.test(raw) ? maskCPF(raw) : raw.trim().toLowerCase()}
                placeholder="seu@email · 000.000.000-00"
                autoComplete="username"
              />
              {erro && <ErrorBanner message={erro} />}
              {info && <InfoBanner message={info} />}
              <button
                type="submit"
                disabled={carregando || !usuario}
                className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {carregando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {carregando ? 'Enviando…' : 'Receber link de acesso'}
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleSubmitForgot} className="space-y-4">
              <p className="font-body text-[13px] leading-relaxed text-aletis-verde-medio">
                Informe seu e-mail ou CPF/CNPJ. Se você tiver uma conta, enviaremos um link para redefinir a senha.
              </p>
              <Field
                icon={Mail}
                label="E-mail ou CPF/CNPJ"
                value={usuario}
                onChange={setUsuario}
                placeholder="seu@email"
                autoComplete="username"
              />
              {erro && <ErrorBanner message={erro} />}
              {info && <InfoBanner message={info} />}
              <button
                type="submit"
                disabled={carregando || !usuario}
                className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {carregando ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {carregando ? 'Enviando…' : 'Enviar link de redefinição'}
              </button>
              <button
                type="button"
                onClick={() => { setMode('senha'); setErro(null); setInfo(null) }}
                className="w-full text-center text-[12.5px] font-body text-aletis-verde-medio hover:text-aletis-gold-escuro transition"
              >
                ← voltar para login com senha
              </button>
            </form>
          )}

          <div className="flex items-center justify-center gap-2 mt-6 text-[11.5px] text-aletis-verde-medio font-body">
            <Shield className="w-3.5 h-3.5 text-aletis-gold-escuro" />
            Acesso seguro · scrypt + JWT · trilha de auditoria
          </div>
        </div>

        <p className="text-center mt-8 text-aletis-cream/55 font-body text-sm italic">
          "Verdade nos números. Prosperidade nos acordos."
        </p>
      </div>
    </div>
  )
}

function Field({
  icon: Icon, label, value, onChange, onChangeRaw, type = 'text', placeholder, autoComplete, minLength,
}: {
  icon: React.ElementType
  label: string
  value: string
  onChange: (v: string) => void
  onChangeRaw?: (raw: string) => string
  type?: 'text' | 'password' | 'email'
  placeholder?: string
  autoComplete?: string
  minLength?: number
}) {
  return (
    <div>
      <label className="block text-[12.5px] font-display font-semibold uppercase tracking-wider text-aletis-verde-medio mb-1.5">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-verde-medio" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(onChangeRaw ? onChangeRaw(e.target.value) : e.target.value)}
          placeholder={placeholder}
          className="w-full pl-11 pr-3 py-3 rounded-xl border border-aletis-borda bg-white text-aletis-verde placeholder:text-aletis-verde-claro focus:outline-none focus:ring-2 focus:ring-aletis-gold/35 focus:border-aletis-gold transition-all text-base"
          autoComplete={autoComplete}
          required
          minLength={minLength}
        />
      </div>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <p className="text-sm font-body">{message}</p>
    </div>
  )
}

function InfoBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-aletis-sage/20 border border-aletis-sage/40 text-aletis-verde">
      <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-aletis-verde-medio" />
      <p className="text-sm font-body">{message}</p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * RESET DE SENHA (via ?reset=TOKEN)
 * ──────────────────────────────────────────────────────────── */
function ResetSenhaScreen({
  token,
  onConcluido,
}: {
  token: string
  onConcluido: () => void
}) {
  const [novaSenha, setNovaSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [carregando, setCarregando] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (novaSenha.length < 8) { setErro('Senha precisa ter ao menos 8 caracteres'); return }
    if (novaSenha !== confirma) { setErro('As senhas não conferem'); return }
    setCarregando(true)
    const resp = await apiCall('/api/portal/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ token, novaSenha }),
    })
    setCarregando(false)
    if (!resp.ok) { setErro(resp.error); return }
    setSucesso(true)
    setTimeout(onConcluido, 2_000)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundColor: '#080d09',
        backgroundImage:
          'linear-gradient(140deg, rgba(8,13,9,0.97), rgba(13,22,17,0.94) 50%, rgba(36,58,44,0.92)), url(/brand/pattern/repetidor.png)',
        backgroundSize: 'auto, 360px',
        backgroundBlendMode: 'normal, soft-light',
      }}
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <BrandMark variant="stacked" tone="cream" size={48} />
        </div>
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-brand-lg p-8 border border-aletis-cream-escuro/60">
          {sucesso ? (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-aletis-sage/30 mb-4">
                <CheckCircle2 className="w-7 h-7 text-aletis-verde" />
              </div>
              <h2 className="font-display text-xl font-bold text-aletis-verde">Senha atualizada</h2>
              <p className="mt-2 font-body text-sm text-aletis-verde-medio">Você já pode entrar com sua nova senha.</p>
            </div>
          ) : (
            <>
              <h2 className="font-display text-xl font-bold text-aletis-verde mb-1">Nova senha</h2>
              <p className="font-body text-[13px] text-aletis-verde-medio mb-5">
                Escolha uma senha com ao menos 8 caracteres. Recomendamos misturar letras e números.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Field
                  icon={Lock}
                  type="password"
                  label="Nova senha"
                  value={novaSenha}
                  onChange={setNovaSenha}
                  placeholder="••••••••"
                  minLength={8}
                />
                <Field
                  icon={Lock}
                  type="password"
                  label="Confirmar senha"
                  value={confirma}
                  onChange={setConfirma}
                  placeholder="••••••••"
                  minLength={8}
                />
                {erro && <ErrorBanner message={erro} />}
                <button type="submit" disabled={carregando || !novaSenha || !confirma} className="btn-primary w-full py-4 disabled:opacity-60">
                  {carregando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  {carregando ? 'Salvando…' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * TROCAR SENHA (modal autenticado)
 * ──────────────────────────────────────────────────────────── */
function TrocarSenhaModal({
  token,
  obrigatorio,
  onClose,
  onTrocou,
}: {
  token: string
  obrigatorio: boolean
  onClose: () => void
  onTrocou: () => void
}) {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (novaSenha.length < 8) { setErro('Nova senha precisa ter ao menos 8 caracteres'); return }
    if (novaSenha !== confirma) { setErro('Confirmação não confere'); return }
    setCarregando(true)
    const resp = await apiCall('/api/portal/auth/trocar-senha', {
      method: 'POST',
      token,
      body: JSON.stringify({ senhaAtual, novaSenha }),
    })
    setCarregando(false)
    if (!resp.ok) { setErro(resp.error); return }
    onTrocou()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-aletis-verde-escuro/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-7 shadow-brand-lg border border-aletis-cream-escuro/60">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-aletis-verde">Trocar senha</h2>
          {!obrigatorio && (
            <button onClick={onClose} className="text-aletis-verde-medio hover:text-aletis-verde">
              <XCircle size={20} />
            </button>
          )}
        </div>
        {obrigatorio && (
          <div className="mb-4 p-3 rounded-xl bg-aletis-gold/10 border border-aletis-gold/40 text-aletis-gold-escuro text-[12.5px] font-body">
            Por segurança, você precisa cadastrar uma senha pessoal antes de continuar.
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field icon={Lock} type="password" label={obrigatorio ? 'Senha temporária' : 'Senha atual'} value={senhaAtual} onChange={setSenhaAtual} placeholder="••••••••" minLength={4} />
          <Field icon={Lock} type="password" label="Nova senha" value={novaSenha} onChange={setNovaSenha} placeholder="mínimo 8 caracteres" minLength={8} />
          <Field icon={Lock} type="password" label="Confirmar nova senha" value={confirma} onChange={setConfirma} placeholder="repita a senha" minLength={8} />
          {erro && <ErrorBanner message={erro} />}
          <button type="submit" disabled={carregando} className="btn-primary w-full py-3 mt-2">
            {carregando ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * STEPPER
 * ──────────────────────────────────────────────────────────── */
function NegotiationProgress({ steps }: { steps: StepperItem[] }) {
  if (steps.length === 0) return null
  return (
    <div className="card-premium p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={14} className="text-aletis-gold-escuro" />
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-aletis-gold-escuro">
          Estágio da Negociação
        </p>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2">
        {steps.map((s, i) => (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center min-w-[68px]">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                  s.done
                    ? 'bg-aletis-verde-medio text-aletis-cream'
                    : s.current
                    ? 'bg-aletis-gold text-aletis-verde shadow-brand-gold'
                    : 'bg-aletis-cream border border-aletis-cream-escuro text-aletis-verde-claro'
                }`}
              >
                {s.done ? <CheckCircle2 size={16} /> : s.current ? <Circle size={16} fill="currentColor" /> : i + 1}
              </div>
              <p
                className={`mt-2 text-[10.5px] font-display font-medium uppercase tracking-wider text-center leading-tight ${
                  s.current ? 'text-aletis-verde' : 'text-aletis-verde-medio'
                }`}
              >
                {s.label}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-px min-w-[12px] ${s.done ? 'bg-aletis-verde-medio' : 'bg-aletis-cream-escuro'}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * HERO PULSE — onde o cliente está em 3s
 * ──────────────────────────────────────────────────────────── */
function HeroPulse({ pulse, onJumpPendencias, onJumpChat }: {
  pulse: PulseDTO
  onJumpPendencias: () => void
  onJumpChat: () => void
}) {
  const health = pulse.healthScore
  const healthColor = health >= 80 ? 'text-aletis-verde-medio' : health >= 60 ? 'text-aletis-gold-escuro' : 'text-red-600'
  const healthRing = health >= 80 ? 'stroke-aletis-verde-medio' : health >= 60 ? 'stroke-aletis-gold' : 'stroke-red-500'
  const dash = (health / 100) * 264 // 2π · 42

  return (
    <section
      className="relative overflow-hidden rounded-3xl p-7 lg:p-8 text-aletis-cream shadow-brand-lg"
      style={{
        backgroundImage:
          'linear-gradient(135deg, rgba(13,22,17,0.97) 0%, rgba(23,37,27,0.94) 45%, rgba(36,58,44,0.92) 100%), url(/brand/pattern/repetidor.png)',
        backgroundColor: '#0d1611',
        backgroundSize: 'auto, 360px',
        backgroundBlendMode: 'normal, soft-light',
      }}
    >
      {/* Watermark sutil */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -bottom-12 opacity-[0.06]">
        <svg width={300} height={300} viewBox="0 0 64 64" fill="none">
          <rect x="6" y="6" width="52" height="52" rx="2" stroke="#ede9d9" strokeWidth="2.4"/>
          <path d="M19 50 L32 16 L45 50 Z" stroke="#ede9d9" strokeWidth="2.4" />
          <rect x="24" y="36" width="16" height="3.6" fill="#ede9d9"/>
        </svg>
      </span>

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-aletis-gold/40 bg-aletis-gold/10 px-3 py-1 font-display text-[10.5px] font-semibold uppercase tracking-widest text-aletis-gold">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aletis-gold opacity-65" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-aletis-gold" />
            </span>
            {pulse.estagioAtual.label}
          </div>
          <h2 className="mt-3 font-display text-2xl md:text-3xl font-bold leading-tight text-aletis-cream">
            {pulse.proximoPasso}
          </h2>
          <div className="mt-4 flex items-center gap-2 font-body text-[13px] text-aletis-sage">
            <Clock size={14} />
            Última atualização {relativeTime(pulse.ultimaAtualizacao)}
            {pulse.consultor && (
              <>
                <span className="opacity-40">·</span>
                <span>seu consultor: <span className="text-aletis-cream font-semibold">{pulse.consultor}</span></span>
              </>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <PulseStat label="Pendências" value={pulse.pendencias.pendentes} accent="gold" onClick={pulse.pendencias.pendentes > 0 ? onJumpPendencias : undefined} />
            <PulseStat label="Em revisão" value={pulse.pendencias.aguardandoRevisao} accent="sage" />
            <PulseStat label="Mensagens novas" value={pulse.mensagensNaoLidas} accent={pulse.mensagensNaoLidas > 0 ? 'gold' : 'sage'} onClick={pulse.mensagensNaoLidas > 0 ? onJumpChat : undefined} />
            <PulseStat label="Economia" value={formatBRLShort(pulse.economiaEstimada)} accent="cream" />
          </div>
        </div>

        {/* Health Ring */}
        <div className="hidden lg:flex flex-col items-center self-center">
          <div className="relative w-[120px] h-[120px]">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.10)" strokeWidth="6" fill="none"/>
              <circle
                cx="50" cy="50" r="42"
                strokeWidth="6" fill="none" strokeLinecap="round"
                className={healthRing}
                stroke="currentColor"
                strokeDasharray={`${dash} 999`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-display text-3xl font-bold ${healthColor.replace('text-', 'text-aletis-cream') /* keep cream on dark */}`}>
                {health}
              </span>
              <span className="font-display text-[9px] uppercase tracking-widest text-aletis-sage mt-0.5">
                <Heart size={10} className="inline -mt-0.5" /> saúde
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PulseStat({
  label, value, accent, onClick,
}: {
  label: string
  value: number | string
  accent: 'gold' | 'sage' | 'cream'
  onClick?: () => void
}) {
  const accentColor = accent === 'gold' ? 'text-aletis-gold' : accent === 'sage' ? 'text-aletis-sage-claro' : 'text-aletis-cream'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`text-left rounded-xl border border-aletis-sage/15 bg-aletis-cream/[0.04] px-4 py-3 ${
        onClick ? 'hover:border-aletis-gold/45 hover:bg-aletis-cream/[0.08] cursor-pointer transition' : ''
      }`}
    >
      <p className={`font-display text-2xl font-bold tabular-nums ${accentColor}`}>{value}</p>
      <p className="mt-0.5 font-display text-[9.5px] uppercase tracking-widest text-aletis-sage">{label}</p>
    </Tag>
  )
}

/* ──────────────────────────────────────────────────────────────
 * INBOX DE PENDÊNCIAS
 * ──────────────────────────────────────────────────────────── */
function PendenciasInbox({ token, pendencias, onChange }: {
  token: string
  pendencias: PendenciaDTO[]
  onChange: () => Promise<void>
}) {
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  if (pendencias.length === 0) {
    return (
      <div className="card-premium p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-aletis-sage/30 flex items-center justify-center">
            <CheckCheck className="w-5 h-5 text-aletis-verde" />
          </div>
          <div>
            <p className="font-display text-base font-bold text-aletis-verde">Nenhum documento pendente</p>
            <p className="font-body text-[13px] text-aletis-verde-medio">Quando seu consultor pedir um documento, ele aparece aqui.</p>
          </div>
        </div>
      </div>
    )
  }

  async function handleArquivo(p: PendenciaDTO, file: File) {
    setEnviando(p.id); setErro(null)
    const buf = await file.arrayBuffer()
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
    const resp = await apiCall<UploadDTO>('/api/portal/upload', {
      method: 'POST',
      token,
      body: JSON.stringify({
        nome: file.name,
        mime: file.type || 'application/octet-stream',
        conteudoBase64: b64,
        pendenciaId: p.id,
        categoria: p.categoria,
      }),
    })
    setEnviando(null)
    if (!resp.ok) { setErro(resp.error); return }
    await onChange()
  }

  return (
    <div className="card-premium p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-aletis-gold/15 border border-aletis-gold/40 flex items-center justify-center">
            <Inbox className="w-5 h-5 text-aletis-gold-escuro" />
          </div>
          <div>
            <p className="font-display text-base font-bold text-aletis-verde">Documentos pendentes</p>
            <p className="font-body text-[12.5px] text-aletis-verde-medio">
              {pendencias.filter((p) => p.status === 'pendente').length} aguardando · envie pelo botão de cada item
            </p>
          </div>
        </div>
      </div>
      {erro && <div className="mb-3"><ErrorBanner message={erro} /></div>}
      <ul className="space-y-2">
        {pendencias.map((p) => {
          const podeEnviar = p.status === 'pendente' || p.status === 'rejeitado'
          const inputId = `up-${p.id}`
          return (
            <li
              key={p.id}
              className={`rounded-xl border px-4 py-3 transition ${
                p.status === 'aprovado' ? 'border-aletis-sage/45 bg-aletis-sage/15' :
                p.status === 'rejeitado' ? 'border-red-200 bg-red-50' :
                p.status === 'enviado' ? 'border-aletis-gold/30 bg-aletis-gold/5' :
                'border-aletis-cream-escuro bg-aletis-cream-papel'
              }`}
            >
              <div className="flex items-start gap-3">
                <PendenciaIcon status={p.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="font-display font-bold text-[14px] text-aletis-verde">{p.titulo}</p>
                    <span className="font-display text-[9.5px] uppercase tracking-widest text-aletis-verde-medio bg-white/60 border border-aletis-cream-escuro/60 px-2 py-0.5 rounded-full">
                      {CATEGORIA_LABEL[p.categoria]}
                    </span>
                    {p.obrigatorio && (
                      <span className="font-display text-[9.5px] uppercase tracking-widest text-aletis-gold-escuro">obrigatório</span>
                    )}
                  </div>
                  {p.descricao && (
                    <p className="mt-1 font-body text-[12.5px] leading-snug text-aletis-verde-medio">
                      {p.descricao}
                    </p>
                  )}
                  {p.observacao && p.status === 'rejeitado' && (
                    <p className="mt-1 font-body text-[12.5px] text-red-700">
                      <strong>Devolução:</strong> {p.observacao}
                    </p>
                  )}
                  {p.solicitadoPor && (
                    <p className="mt-1 font-body text-[11px] text-aletis-verde-claro">
                      Solicitado por {p.solicitadoPor} · {relativeTime(p.solicitadoEm)}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {podeEnviar ? (
                    <>
                      <input
                        id={inputId}
                        type="file"
                        className="sr-only"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.docx,.doc,.csv,.txt"
                        onChange={(e) => {
                          const f = e.target.files?.[0]; if (f) handleArquivo(p, f)
                        }}
                      />
                      <label
                        htmlFor={inputId}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition ${
                          enviando === p.id
                            ? 'bg-aletis-cream text-aletis-verde-medio'
                            : 'bg-aletis-verde text-aletis-cream hover:bg-aletis-verde-medio'
                        }`}
                      >
                        {enviando === p.id ? <Loader2 size={12} className="animate-spin" /> : <UploadIcon size={12} />}
                        {enviando === p.id ? 'enviando…' : 'enviar'}
                      </label>
                    </>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wider ${
                      p.status === 'aprovado' ? 'bg-aletis-verde text-aletis-cream' :
                      p.status === 'enviado' ? 'bg-aletis-gold/20 text-aletis-gold-escuro' :
                      'bg-aletis-cream text-aletis-verde-medio'
                    }`}>
                      {p.status === 'aprovado' ? <CheckCheck size={12} /> : p.status === 'enviado' ? <Clock size={12} /> : <CheckCircle2 size={12} />}
                      {p.status}
                    </span>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PendenciaIcon({ status }: { status: PendenciaDTO['status'] }) {
  if (status === 'aprovado') return <CheckCheck className="w-5 h-5 mt-0.5 text-aletis-verde-medio flex-shrink-0" />
  if (status === 'enviado') return <Clock className="w-5 h-5 mt-0.5 text-aletis-gold-escuro flex-shrink-0" />
  if (status === 'rejeitado') return <AlertCircle className="w-5 h-5 mt-0.5 text-red-600 flex-shrink-0" />
  return <Circle className="w-5 h-5 mt-0.5 text-aletis-verde-medio flex-shrink-0" />
}

/* ──────────────────────────────────────────────────────────────
 * COFRE DIGITAL — uploads enviados
 * ──────────────────────────────────────────────────────────── */
function CofreDigital({ uploads, token }: { uploads: UploadDTO[]; token: string }) {
  if (uploads.length === 0) {
    return (
      <div className="card-premium p-6 text-center">
        <Vault className="w-8 h-8 mx-auto text-aletis-verde-medio mb-2" />
        <p className="font-body text-[13px] text-aletis-verde-medio">Seu cofre digital está vazio. Documentos que você enviar aparecerão aqui.</p>
      </div>
    )
  }
  return (
    <div className="card-premium p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-aletis-sage/25 border border-aletis-sage/40 flex items-center justify-center">
          <Vault className="w-5 h-5 text-aletis-verde" />
        </div>
        <div>
          <p className="font-display text-base font-bold text-aletis-verde">Meu cofre digital</p>
          <p className="font-body text-[12.5px] text-aletis-verde-medio">{uploads.length} arquivo(s) enviado(s)</p>
        </div>
      </div>
      <ul className="divide-y divide-aletis-cream-escuro/50">
        {uploads.map((u) => (
          <li key={u.id} className="py-2.5 flex items-center gap-3">
            <Paperclip size={14} className="text-aletis-gold-escuro flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm font-medium text-aletis-verde truncate">{u.nomeOriginal}</p>
              <p className="font-body text-[11px] text-aletis-verde-medio">
                {fmtBytes(u.tamanho)} · {relativeTime(u.enviadoEm)} {u.categoria ? `· ${u.categoria}` : ''}
              </p>
            </div>
            {u.url && (
              <a
                href={u.url + (token ? `?t=${encodeURIComponent(token)}` : '')}
                target="_blank"
                rel="noreferrer"
                onClick={async (e) => {
                  // Auth via header não funciona em <a>. Para download autenticado,
                  // baixamos via fetch + blob:
                  e.preventDefault()
                  const r = await fetch(u.url!, { headers: { Authorization: `Bearer ${token}` } })
                  if (!r.ok) return
                  const blob = await r.blob()
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = u.nomeOriginal
                  a.click()
                  setTimeout(() => URL.revokeObjectURL(url), 2_000)
                }}
                className="text-aletis-verde-medio hover:text-aletis-gold-escuro transition"
              >
                <Download size={16} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * CRONOGRAMA DE PAGAMENTOS
 * ──────────────────────────────────────────────────────────── */
function CronogramaCard({ cronograma }: { cronograma: CronogramaDTO | null }) {
  if (!cronograma || cronograma.parcelas.length === 0) return null
  const proxima = cronograma.parcelas.find((p) => p.status === 'proximo')
  const futuras = cronograma.parcelas.filter((p) => p.status !== 'pago').slice(0, 6)
  const pagas = cronograma.parcelas.filter((p) => p.status === 'pago').length

  return (
    <div className="card-premium p-6">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-aletis-gold/15 border border-aletis-gold/40 flex items-center justify-center">
            <Clock className="w-5 h-5 text-aletis-gold-escuro" />
          </div>
          <div>
            <p className="font-display text-base font-bold text-aletis-verde">Cronograma de pagamentos</p>
            <p className="font-body text-[12.5px] text-aletis-verde-medio">
              {pagas} pagas · {cronograma.totalParcelas - pagas} restantes · parcela média {formatBRL(cronograma.parcelaPadrao)}
            </p>
          </div>
        </div>
        {proxima && (
          <div className="rounded-xl border border-aletis-gold/40 bg-aletis-gold/10 px-4 py-2">
            <p className="font-display text-[10px] uppercase tracking-widest text-aletis-gold-escuro">Próximo vencimento</p>
            <p className="font-display text-lg font-bold text-aletis-verde tabular-nums">
              {formatBRL(proxima.valor)} · <span className="text-aletis-gold-escuro">{formatDate(proxima.vencimento)}</span>
            </p>
          </div>
        )}
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {futuras.map((p) => (
          <li
            key={p.numero}
            className={`rounded-xl border px-4 py-3 flex items-center gap-3 transition ${
              p.status === 'pago' ? 'border-aletis-sage/45 bg-aletis-sage/15' :
              p.status === 'atrasado' ? 'border-red-200 bg-red-50' :
              p.status === 'proximo' ? 'border-aletis-gold/45 bg-aletis-gold/10 shadow-brand-sm' :
              'border-aletis-cream-escuro bg-aletis-cream-papel'
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-display font-bold text-sm ${
              p.status === 'pago' ? 'bg-aletis-verde-medio text-aletis-cream' :
              p.status === 'proximo' ? 'bg-aletis-gold text-aletis-verde' :
              'bg-aletis-cream border border-aletis-cream-escuro text-aletis-verde-medio'
            }`}>
              {p.numero}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-bold text-aletis-verde tabular-nums">{formatBRL(p.valor)}</p>
              <p className="font-body text-[11.5px] text-aletis-verde-medio">
                vencimento {formatDate(p.vencimento)}
                {p.status === 'proximo' && <span className="ml-1 text-aletis-gold-escuro font-bold">· próximo</span>}
                {p.status === 'atrasado' && <span className="ml-1 text-red-700 font-bold">· em atraso</span>}
              </p>
            </div>
            {p.status === 'proximo' && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-wider bg-aletis-verde text-aletis-cream hover:bg-aletis-verde-medio"
                title="Em breve: gerar boleto/PIX"
                disabled
              >
                Pagar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * MEMÓRIA DE CÁLCULO SIMPLIFICADA — versão "do leigo"
 * ──────────────────────────────────────────────────────────── */
function MemoriaSimplificada({ memoria }: { memoria: MemoriaSimplificadaDTO | null }) {
  if (!memoria) return null
  const max = Math.max(memoria.original, memoria.atual, memoria.pago, 1)
  const economiaPct = memoria.original > 0 ? Math.round((memoria.economia / memoria.original) * 100) : 0

  return (
    <div className="card-premium p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-aletis-sage/25 border border-aletis-sage/40 flex items-center justify-center">
          <FileText className="w-5 h-5 text-aletis-verde" />
        </div>
        <div>
          <p className="font-display text-base font-bold text-aletis-verde">Como chegamos a esse número</p>
          <p className="font-body text-[12.5px] text-aletis-verde-medio">
            Memória de cálculo em linguagem simples — peça também a versão técnica auditável ao seu consultor.
          </p>
        </div>
      </div>

      {memoria.economia > 0 && (
        <div className="mb-5 rounded-2xl border border-aletis-gold/40 bg-gradient-to-br from-aletis-gold/15 to-aletis-cream-papel px-5 py-4">
          <p className="font-display text-[10.5px] uppercase tracking-widest text-aletis-gold-escuro">
            Você descobriu que devia menos
          </p>
          <p className="mt-1 font-display text-3xl sm:text-4xl font-bold text-aletis-verde tabular-nums">
            {formatBRL(memoria.economia)} <span className="text-base text-aletis-gold-escuro font-semibold">· {economiaPct}%</span>
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {memoria.blocos.map((b) => {
          const w = Math.round((b.valor / max) * 100)
          const accent = b.chave === 'descoberta' ? 'gold' : b.chave === 'pago' ? 'sage' : b.chave === 'plano' ? 'verde' : 'cinza'
          const barCls = accent === 'gold' ? 'bg-aletis-gold' :
            accent === 'sage' ? 'bg-aletis-verde-medio' :
            accent === 'verde' ? 'bg-aletis-verde' :
            'bg-aletis-cream-escuro'
          return (
            <li key={b.chave}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className="font-display text-[12.5px] font-semibold uppercase tracking-wider text-aletis-verde-medio">
                  {b.titulo}
                </p>
                <p className="font-display text-base font-bold text-aletis-verde tabular-nums">{formatBRL(b.valor)}</p>
              </div>
              <div className="h-1.5 bg-aletis-cream-escuro/60 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.max(2, w)}%` }} />
              </div>
              <p className="mt-1.5 font-body text-[12.5px] leading-snug text-aletis-verde-medio">{b.descricao}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * TRILHA DE AUDITORIA + EXPORT LGPD
 * ──────────────────────────────────────────────────────────── */
const TIPO_LABEL: Record<string, string> = {
  login: 'Você entrou no portal',
  login_falhou: 'Tentativa de login com erro',
  logout: 'Você saiu',
  magic_solicitado: 'Link mágico solicitado',
  magic_consumido: 'Você entrou via link mágico',
  reset_solicitado: 'Reset de senha solicitado',
  reset_concluido: 'Senha redefinida',
  senha_alterada: 'Senha alterada',
  documento_enviado: 'Documento enviado por você',
  mensagem_enviada: 'Mensagem enviada',
  doc_visualizado: 'Documento visualizado',
  pendencia_criada: 'Consultor solicitou um documento',
  pendencia_resolvida: 'Pendência revisada pelo consultor',
}

function AuditoriaTimeline({ eventos, token }: { eventos: AuditoriaEventoDTO[]; token: string }) {
  const [exporting, setExporting] = useState(false)

  async function exportarDados() {
    setExporting(true)
    try {
      const r = await fetch('/api/portal/exportar-meus-dados', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error('falha')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `aletis-meus-dados-${Date.now()}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2_000)
    } finally {
      setExporting(false)
    }
  }

  if (eventos.length === 0) return null

  return (
    <div className="card-premium p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-aletis-cream-papel border border-aletis-cream-escuro flex items-center justify-center">
            <Shield className="w-5 h-5 text-aletis-verde-medio" />
          </div>
          <div>
            <p className="font-display text-base font-bold text-aletis-verde">Trilha de auditoria</p>
            <p className="font-body text-[12.5px] text-aletis-verde-medio">
              Tudo que aconteceu na sua conta — você sempre pode conferir e baixar (LGPD).
            </p>
          </div>
        </div>
        <button
          onClick={exportarDados}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wider bg-aletis-cream text-aletis-verde border border-aletis-cream-escuro hover:bg-white hover:border-aletis-gold/45 transition disabled:opacity-60"
        >
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {exporting ? 'gerando…' : 'baixar meus dados'}
        </button>
      </div>
      <ol className="relative border-l-2 border-aletis-cream-escuro pl-5 space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-2">
        {eventos.slice(0, 30).map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[26px] top-1 w-3 h-3 rounded-full bg-aletis-sage border-2 border-white shadow-brand-sm" />
            <p className="font-display text-[10.5px] uppercase tracking-widest text-aletis-verde-medio">
              {formatDateTime(e.criadoEm)} {e.canal ? `· ${e.canal}` : ''}
            </p>
            <p className="mt-0.5 font-body text-[13px] text-aletis-verde">
              {TIPO_LABEL[e.tipo] || e.tipo}
              {e.ip && <span className="ml-2 font-mono text-[11px] text-aletis-verde-claro">{e.ip}</span>}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * UPLOAD ESPONTÂNEO — botão drag-drop
 * ──────────────────────────────────────────────────────────── */
function UploadEspontaneo({ token, onUploaded }: { token: string; onUploaded: () => Promise<void> }) {
  const [drag, setDrag] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setEnviando(true); setErro(null)
    for (const f of Array.from(files)) {
      const buf = await f.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      const r = await apiCall('/api/portal/upload', {
        method: 'POST',
        token,
        body: JSON.stringify({ nome: f.name, mime: f.type, conteudoBase64: b64 }),
      })
      if (!r.ok) { setErro(r.error); break }
    }
    setEnviando(false)
    await onUploaded()
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
      className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
        drag ? 'border-aletis-gold bg-aletis-gold/5' : 'border-aletis-cream-escuro bg-aletis-cream-papel'
      }`}
    >
      <UploadIcon className="w-7 h-7 mx-auto text-aletis-verde-medio mb-2" />
      <p className="font-display text-sm font-bold text-aletis-verde">
        Enviar um documento ao seu consultor
      </p>
      <p className="mt-1 font-body text-[12.5px] text-aletis-verde-medio">
        Arraste arquivos aqui ou
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="ml-1 text-aletis-gold-escuro font-semibold hover:underline"
        >
          clique para escolher
        </button>
        . PDF, foto ou planilha · até 25MB cada.
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.docx,.doc,.csv,.txt"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {enviando && (
        <p className="mt-3 inline-flex items-center gap-1.5 font-body text-[12.5px] text-aletis-verde-medio">
          <Loader2 size={12} className="animate-spin" /> Enviando…
        </p>
      )}
      {erro && <p className="mt-3 font-body text-[12.5px] text-red-700">{erro}</p>}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * DASHBOARD
 * ──────────────────────────────────────────────────────────── */
function ClientDashboard({
  token,
  cliente,
  onLogout,
}: {
  token: string
  cliente: ClienteMe
  onLogout: () => void
  onRefreshCliente: () => Promise<void>
}) {
  const [pulse, setPulse] = useState<PulseDTO | null>(null)
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [stepper, setStepper] = useState<StepperItem[]>([])
  const [timeline, setTimeline] = useState<TimelineEventoDTO[]>([])
  const [documentos, setDocumentos] = useState<DocumentoDTO[]>([])
  const [pendencias, setPendencias] = useState<PendenciaDTO[]>([])
  const [uploads, setUploads] = useState<UploadDTO[]>([])
  const [cronograma, setCronograma] = useState<CronogramaDTO | null>(null)
  const [memoria, setMemoria] = useState<MemoriaSimplificadaDTO | null>(null)
  const [auditoria, setAuditoria] = useState<AuditoriaEventoDTO[]>([])
  const [mensagens, setMensagens] = useState<MensagemDTO[]>([])
  const [chatInput, setChatInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [showTrocarSenha, setShowTrocarSenha] = useState(cliente.forcaTrocaSenha)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const pendenciasRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  const fetchTudo = useCallback(async () => {
    const [pl, c, s, t, d, p, u, cr, me, au, m] = await Promise.all([
      apiCall<PulseDTO>('/api/portal/pulse', { token }),
      apiCall<Contrato>('/api/portal/contrato', { token }),
      apiCall<StepperItem[]>('/api/portal/stepper', { token }),
      apiCall<TimelineEventoDTO[]>('/api/portal/timeline', { token }),
      apiCall<DocumentoDTO[]>('/api/portal/documentos', { token }),
      apiCall<PendenciaDTO[]>('/api/portal/pendencias', { token }),
      apiCall<UploadDTO[]>('/api/portal/uploads', { token }),
      apiCall<CronogramaDTO>('/api/portal/cronograma', { token }),
      apiCall<MemoriaSimplificadaDTO>('/api/portal/memoria-simplificada', { token }),
      apiCall<AuditoriaEventoDTO[]>('/api/portal/auditoria', { token }),
      apiCall<MensagemDTO[]>('/api/portal/mensagens', { token }),
    ])
    if (pl.ok) setPulse(pl.data)
    if (c.ok) setContrato(c.data)
    if (s.ok) setStepper(s.data)
    if (t.ok) setTimeline(t.data)
    if (d.ok) setDocumentos(d.data)
    if (p.ok) setPendencias(p.data)
    if (u.ok) setUploads(u.data)
    if (cr.ok) setCronograma(cr.data)
    if (me.ok) setMemoria(me.data)
    if (au.ok) setAuditoria(au.data)
    if (m.ok) setMensagens(m.data)
  }, [token])

  useEffect(() => { fetchTudo() }, [fetchTudo])

  // Polling leve de pulse (15s); mensagens via SSE separado.
  useEffect(() => {
    const h = window.setInterval(async () => {
      const pl = await apiCall<PulseDTO>('/api/portal/pulse', { token })
      if (pl.ok) setPulse(pl.data)
    }, 15_000)
    return () => window.clearInterval(h)
  }, [token])

  // Stream de mensagens via SSE — em tempo real (substitui polling).
  // Fallback gracios para polling se SSE falhar.
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    // EventSource não suporta headers customizados — passamos token na URL.
    // Em produção, validar token via cookie HTTP-only seria mais seguro.
    const url = `/api/portal/mensagens/stream?_t=${encodeURIComponent(token)}`
    let es: EventSource | null = null
    try {
      es = new EventSource(url, { withCredentials: false })
      es.addEventListener('snapshot', (ev: MessageEvent) => {
        try { setMensagens(JSON.parse(ev.data) as MensagemDTO[]) } catch { /* ignore */ }
      })
      es.addEventListener('mensagem', (ev: MessageEvent) => {
        try {
          const m = JSON.parse(ev.data) as MensagemDTO
          setMensagens((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m])
        } catch { /* ignore */ }
      })
      es.onerror = () => { /* retry automático nativo */ }
    } catch { /* SSE bloqueado; polling abaixo cobre */ }
    // Polling-fallback de baixa frequência caso SSE não conecte
    const fallback = window.setInterval(async () => {
      if (!es || es.readyState === 2 /* CLOSED */) {
        const m = await apiCall<MensagemDTO[]>('/api/portal/mensagens', { token })
        if (m.ok) setMensagens(m.data)
      }
    }, 30_000)
    return () => {
      es?.close()
      window.clearInterval(fallback)
    }
  }, [token])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  const handleSendMessage = async () => {
    const texto = chatInput.trim()
    if (!texto || enviando) return
    setEnviando(true)
    const resp = await apiCall<MensagemDTO>('/api/portal/mensagens', {
      method: 'POST', token,
      body: JSON.stringify({ texto }),
    })
    setEnviando(false)
    if (resp.ok) {
      setMensagens((prev) => [...prev, resp.data])
      setChatInput('')
    }
  }

  const naoLidas = useMemo(
    () => mensagens.filter((m) => m.de === 'consultor' && !m.lidaEm).length,
    [mensagens],
  )

  const refreshPendencias = useCallback(async () => {
    const [p, u, pl] = await Promise.all([
      apiCall<PendenciaDTO[]>('/api/portal/pendencias', { token }),
      apiCall<UploadDTO[]>('/api/portal/uploads', { token }),
      apiCall<PulseDTO>('/api/portal/pulse', { token }),
    ])
    if (p.ok) setPendencias(p.data)
    if (u.ok) setUploads(u.data)
    if (pl.ok) setPulse(pl.data)
  }, [token])

  return (
    <div className="min-h-screen bg-aletis-cream-marfim">
      {/* Nav superior */}
      <nav className="bg-white border-b border-aletis-cream-escuro/70 shadow-brand-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BrandMark variant="full" tone="verde" size={28} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => chatRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="relative px-3 py-1.5 rounded-full text-xs font-display font-semibold uppercase tracking-wider text-aletis-verde-medio hover:bg-aletis-cream flex items-center gap-1.5"
            >
              <MessageCircle size={14} />
              <span className="hidden sm:inline">Chat</span>
              {naoLidas > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-aletis-gold text-aletis-verde text-[10px] font-bold flex items-center justify-center">
                  {naoLidas}
                </span>
              )}
            </button>
            <div className="hidden sm:flex flex-col items-end mr-2">
              <p className="font-body text-sm font-bold text-aletis-verde leading-none">{cliente.nome}</p>
              <p className="font-body text-[11px] text-aletis-verde-medio leading-none mt-0.5">{cliente.cidade} · {cliente.uf}</p>
            </div>
            <button
              onClick={() => setShowTrocarSenha(true)}
              className="p-1.5 rounded-full text-aletis-verde-medio hover:bg-aletis-cream"
              title="Trocar senha"
              aria-label="Trocar senha"
            >
              <Key size={14} />
            </button>
            <button
              onClick={onLogout}
              className="p-1.5 rounded-full text-aletis-verde-medio hover:bg-red-50 hover:text-red-700"
              title="Sair" aria-label="Sair"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Cabeçalho de saudação */}
        <header>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-aletis-verde tracking-tight">
            {getGreeting()}, {cliente.nome.split(' ')[0]}
          </h1>
          <p className="mt-1 font-body text-[14px] text-aletis-verde-medio">
            {contrato
              ? `Aqui está o resumo da sua negociação com ${contrato.credor}.`
              : 'Carregando sua negociação…'}
          </p>
        </header>

        {/* Hero Pulse */}
        {pulse && (
          <HeroPulse
            pulse={pulse}
            onJumpPendencias={() => pendenciasRef.current?.scrollIntoView({ behavior: 'smooth' })}
            onJumpChat={() => chatRef.current?.scrollIntoView({ behavior: 'smooth' })}
          />
        )}

        {/* Stepper */}
        {stepper.length > 0 && <NegotiationProgress steps={stepper} />}

        {/* Resumo financeiro */}
        {contrato && (
          <section>
            <SectionTitle icon={DollarSign} title="Resumo financeiro" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiTile label="Dívida original" value={formatBRL(contrato.valorTotalDivida)} icon={DollarSign} />
              <KpiTile label="Saldo em aberto" value={formatBRL(contrato.saldoEmAberto)} icon={TrendingDown} accent="sage" />
              <KpiTile label="Você economizou" value={formatBRL(contrato.economia)} icon={Sparkles} accent="gold" />
            </div>
            {contrato.dividas.length > 0 && (
              <div className="card-premium mt-4 overflow-hidden">
                <div className="px-4 py-3 border-b border-aletis-cream-escuro/60 bg-aletis-cream-papel">
                  <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-aletis-verde-medio">
                    Contratos por credor ({contrato.dividas.length})
                  </p>
                </div>
                <ul className="divide-y divide-aletis-cream-escuro/50">
                  {contrato.dividas.map((d, i) => (
                    <li key={i} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm font-bold text-aletis-verde truncate">{d.credor}</p>
                        <p className="font-body text-[12px] text-aletis-verde-medio">{d.contrato} · venc. {formatDate(d.vencimento)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-sm font-bold text-aletis-verde tabular-nums">{formatBRL(d.valorAtualizado)}</p>
                        {d.valorOriginal !== d.valorAtualizado && (
                          <p className="font-body text-[11px] text-aletis-verde-medio line-through">{formatBRL(d.valorOriginal)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Cronograma de pagamentos */}
        {cronograma && cronograma.parcelas.length > 0 && (
          <section><CronogramaCard cronograma={cronograma} /></section>
        )}

        {/* Memória de cálculo simplificada */}
        {memoria && (
          <section><MemoriaSimplificada memoria={memoria} /></section>
        )}

        {/* Pendências + Upload espontâneo */}
        <section ref={pendenciasRef} className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
          <PendenciasInbox token={token} pendencias={pendencias} onChange={refreshPendencias} />
          <div className="space-y-4">
            <UploadEspontaneo token={token} onUploaded={refreshPendencias} />
            <CofreDigital uploads={uploads} token={token} />
          </div>
        </section>

        {/* Documentos do consultor */}
        {documentos.length > 0 && (
          <section>
            <SectionTitle icon={FileText} title="Documentos do consultor" />
            <div className="card-premium divide-y divide-aletis-cream-escuro/50">
              {documentos.map((d) => (
                <div key={d.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-aletis-cream flex items-center justify-center">
                    <FileText size={16} className="text-aletis-verde-medio" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm font-medium text-aletis-verde truncate">{d.nome}</p>
                    <p className="font-body text-[11px] text-aletis-verde-medio">{formatDate(d.data)} · {d.tipo}</p>
                  </div>
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-wider text-aletis-verde hover:bg-aletis-cream"
                    >
                      <Eye size={12} /> ver
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Timeline */}
        {timeline.length > 0 && (
          <section>
            <SectionTitle icon={Clock} title="Histórico do caso" />
            <div className="card-premium p-6">
              <ol className="relative border-l-2 border-aletis-cream-escuro pl-5 space-y-4">
                {timeline.slice(0, 8).map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[26px] top-1 w-3 h-3 rounded-full bg-aletis-gold border-2 border-white shadow-brand-sm" />
                    <p className="font-display text-[10.5px] uppercase tracking-widest text-aletis-verde-medio">
                      {formatDateTime(e.data)} · {e.tipo}
                    </p>
                    <p className="mt-0.5 font-body text-[13px] text-aletis-verde">{e.descricao}</p>
                    {e.detalhes && <p className="mt-0.5 font-body text-[12px] text-aletis-verde-medio">{e.detalhes}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* Auditoria + Export LGPD */}
        {auditoria.length > 0 && (
          <section><AuditoriaTimeline eventos={auditoria} token={token} /></section>
        )}

        {/* Chat */}
        <section ref={chatRef}>
          <SectionTitle
            icon={MessageCircle}
            title="Chat com seu consultor"
            badge={naoLidas > 0 ? `${naoLidas} nova(s)` : undefined}
          />
          <div className="card-premium overflow-hidden">
            <div className="max-h-80 overflow-y-auto p-4 space-y-3">
              {mensagens.length === 0 ? (
                <p className="text-center font-body text-[13px] text-aletis-verde-medio py-6">
                  Nenhuma mensagem ainda. Comece a conversa abaixo.
                </p>
              ) : (
                mensagens.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.de === 'cliente' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                        m.de === 'cliente'
                          ? 'bg-aletis-verde text-aletis-cream'
                          : 'bg-aletis-cream-papel border border-aletis-cream-escuro text-aletis-verde'
                      }`}
                    >
                      <p className="font-body text-[13px] whitespace-pre-wrap leading-snug">{m.texto}</p>
                      <p className={`mt-1 font-body text-[10px] ${m.de === 'cliente' ? 'text-aletis-cream/65' : 'text-aletis-verde-medio'}`}>
                        {m.autorNome} · {formatDateTime(m.criadoEm)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-aletis-cream-escuro/60 p-3 flex gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() }
                }}
                placeholder="Escreva uma mensagem para seu consultor… (Enter envia, Shift+Enter quebra linha)"
                rows={2}
                className="flex-1 resize-none rounded-xl border border-aletis-cream-escuro px-3 py-2 font-body text-[13px] text-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-gold/35 focus:border-aletis-gold"
              />
              <button
                onClick={handleSendMessage}
                disabled={enviando || !chatInput.trim()}
                className="btn-primary px-5 disabled:opacity-50"
                aria-label="Enviar mensagem"
              >
                {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </section>

        <footer className="pt-8 pb-2 text-center font-body text-[11px] text-aletis-verde-medio">
          ALETIS · Verdade nos números, prosperidade nos acordos. ·{' '}
          <a href="/portal-cliente" className="hover:text-aletis-gold-escuro">Portal do Cliente</a>
        </footer>
      </div>

      {showTrocarSenha && (
        <TrocarSenhaModal
          token={token}
          obrigatorio={cliente.forcaTrocaSenha}
          onClose={() => setShowTrocarSenha(false)}
          onTrocou={() => {
            setShowTrocarSenha(false)
          }}
        />
      )}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} className="text-aletis-gold-escuro" />
      <h2 className="font-display text-base font-bold uppercase tracking-wider text-aletis-verde">
        {title}
      </h2>
      {badge && (
        <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-display font-bold uppercase tracking-wider bg-aletis-gold text-aletis-verde">
          {badge}
        </span>
      )}
    </div>
  )
}

function KpiTile({ label, value, icon: Icon, accent }: {
  label: string
  value: string
  icon: React.ElementType
  accent?: 'sage' | 'gold'
}) {
  const ringCls = accent === 'gold' ? 'border-aletis-gold/40 bg-gradient-to-br from-white to-aletis-gold/8' :
    accent === 'sage' ? 'border-aletis-sage/40' : 'border-aletis-cream-escuro/70'
  const iconCls = accent === 'gold' ? 'bg-aletis-gold/20 text-aletis-gold-escuro border-aletis-gold/40' :
    accent === 'sage' ? 'bg-aletis-sage/25 text-aletis-verde border-aletis-sage/40' :
    'bg-aletis-cream text-aletis-verde-medio border-aletis-cream-escuro/60'
  return (
    <div className={`rounded-2xl border ${ringCls} p-5 shadow-brand-sm hover:shadow-brand transition`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${iconCls}`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="font-display text-[10.5px] font-semibold uppercase tracking-widest text-aletis-verde-medio">{label}</p>
      </div>
      <p className="font-display text-2xl sm:text-3xl font-bold text-aletis-verde tabular-nums">
        {value}
      </p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
 * ROOT — handle URL params (?magic, ?reset) + sessão JWT
 * ──────────────────────────────────────────────────────────── */
export default function PortalCliente() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [cliente, setCliente] = useState<ClienteMe | null>(null)
  const [verificando, setVerificando] = useState<boolean>(true)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [magicErro, setMagicErro] = useState<string | null>(null)

  // Processa magic/reset da URL no mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const magic = url.searchParams.get('magic')
    const reset = url.searchParams.get('reset')

    if (reset) {
      setResetToken(reset)
      setVerificando(false)
      url.searchParams.delete('reset')
      window.history.replaceState({}, '', url.toString())
      return
    }

    if (magic) {
      ;(async () => {
        const r = await apiCall<{ token: string; cliente: ClienteMe }>('/api/portal/auth/magic/redeem', {
          method: 'POST',
          body: JSON.stringify({ token: magic }),
        })
        url.searchParams.delete('magic')
        window.history.replaceState({}, '', url.toString())
        if (r.ok) {
          localStorage.setItem(TOKEN_KEY, r.data.token)
          setToken(r.data.token)
          setCliente(r.data.cliente)
        } else {
          setMagicErro(r.error || 'Link mágico inválido ou expirado.')
        }
        setVerificando(false)
      })()
      return
    }
    setVerificando(false)
  }, [])

  const refreshCliente = useCallback(async () => {
    if (!token) return
    const resp = await apiCall<ClienteMe>('/api/portal/auth/me', { token })
    if (!resp.ok) {
      localStorage.removeItem(TOKEN_KEY)
      setToken(null); setCliente(null)
      return
    }
    setCliente(resp.data)
  }, [token])

  useEffect(() => {
    if (token && !cliente) refreshCliente()
  }, [token, cliente, refreshCliente])

  if (verificando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-aletis-cream-marfim">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-aletis-gold-escuro" />
          <p className="font-body text-[12.5px] text-aletis-verde-medio">Validando seu acesso…</p>
        </div>
      </div>
    )
  }

  if (resetToken) {
    return (
      <ResetSenhaScreen
        token={resetToken}
        onConcluido={() => {
          setResetToken(null)
        }}
      />
    )
  }

  if (!token || !cliente) {
    return (
      <>
        {magicErro && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100]">
            <ErrorBanner message={magicErro} />
          </div>
        )}
        <LoginScreen
          onLogin={(t, c) => { setToken(t); setCliente(c) }}
        />
      </>
    )
  }

  return (
    <ClientDashboard
      token={token}
      cliente={cliente}
      onRefreshCliente={refreshCliente}
      onLogout={() => {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null); setCliente(null)
      }}
    />
  )
}
