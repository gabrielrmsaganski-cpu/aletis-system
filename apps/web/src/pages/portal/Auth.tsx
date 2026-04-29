// ============================================================
// Portal — telas e modais de autenticação.
// LoginScreen (3 modos: senha · magic · forgot), ResetSenhaScreen
// (entrada via ?reset=<token>), TrocarSenhaModal (autenticado), e os
// blocos UI compartilhados Field/ErrorBanner/InfoBanner.
// ============================================================
import React, { useState } from 'react'
import {
  Lock,
  User,
  Mail,
  LogIn,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  Shield,
} from 'lucide-react'
import BrandMark from '../../components/ui/BrandMark'
import { TOKEN_KEY, type ClienteMe } from './types'
import { apiCall, maskCPF } from './utils'

export type LoginMode = 'senha' | 'magic' | 'forgot'

export function LoginScreen({
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
          &ldquo;Verdade nos números. Prosperidade nos acordos.&rdquo;
        </p>
      </div>
    </div>
  )
}

export function Field({
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

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <p className="text-sm font-body">{message}</p>
    </div>
  )
}

export function InfoBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-aletis-sage/20 border border-aletis-sage/40 text-aletis-verde">
      <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-aletis-verde-medio" />
      <p className="text-sm font-body">{message}</p>
    </div>
  )
}

export function ResetSenhaScreen({
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

export function TrocarSenhaModal({
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
            <button
              onClick={onClose}
              aria-label="Fechar modal"
              className="text-aletis-verde-medio hover:text-aletis-verde p-1.5 rounded-lg"
            >
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
