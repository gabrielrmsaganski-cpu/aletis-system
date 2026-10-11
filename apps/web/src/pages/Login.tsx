import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, LockKeyhole, LogIn, ShieldCheck, UserRound } from 'lucide-react'
import BrandMark from '../components/ui/BrandMark'
import { useAuth } from '../contexts/AuthContext'

interface LoginLocationState {
  from?: string
}

function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard'
  }
  if (value === '/login' || value.startsWith('/portal-cliente')) return '/dashboard'
  return value
}

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usernameInput = useRef<HTMLInputElement>(null)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    usernameInput.current?.focus()
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim() || !password) return
    setSubmitting(true)
    setError(null)

    try {
      await login(username, password)
      const from = safeReturnPath((location.state as LoginLocationState | null)?.from)
      navigate(from, { replace: true })
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Não foi possível entrar. Tente novamente.')
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-aletis-verde-profundo text-aletis-cream">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage: 'url(/brand/pattern/repetidor.png)',
          backgroundPosition: 'center',
          backgroundSize: '360px',
          mixBlendMode: 'soft-light',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 16% 20%, rgba(203,157,82,0.18), transparent 34%), radial-gradient(circle at 82% 76%, rgba(178,189,161,0.13), transparent 38%), linear-gradient(135deg, rgba(8,13,9,0.98), rgba(23,37,27,0.92))',
        }}
      />

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 xl:gap-20">
        <section className="hidden max-w-xl lg:block" aria-label="Apresentação ALETIS">
          <BrandMark variant="full" tone="white" size={62} />
          <div className="mt-12 h-px w-20 bg-aletis-gold" />
          <p className="mt-8 max-w-lg font-display text-4xl font-semibold leading-tight tracking-tight text-aletis-cream xl:text-5xl">
            Inteligência e gestão para decisões que movem o agro.
          </p>
          <p className="mt-6 max-w-md font-body text-base leading-7 text-aletis-sage-claro/80">
            Ambiente interno de relacionamento, análises financeiras, documentos e inteligência estratégica da equipe ALETIS.
          </p>
          <div className="mt-10 flex items-center gap-3 text-sm text-aletis-sage">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-aletis-gold/35 bg-aletis-gold/10">
              <ShieldCheck size={19} className="text-aletis-gold" />
            </span>
            <span>
              <strong className="block font-semibold text-aletis-cream">Acesso protegido</strong>
              Sessão criptografada e exclusiva para a equipe.
            </span>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md" aria-labelledby="login-title">
          <div className="mb-8 flex justify-center lg:hidden">
            <BrandMark variant="stacked" tone="white" size={54} />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.97] p-6 text-aletis-verde shadow-elevation-4 backdrop-blur-xl sm:p-9">
            <div className="mb-7">
              <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-aletis-verde text-aletis-gold shadow-brand">
                <LockKeyhole size={21} />
              </span>
              <p className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-aletis-gold-escuro">
                Ambiente interno
              </p>
              <h1 id="login-title" className="font-display text-2xl font-bold tracking-tight text-aletis-verde sm:text-3xl">
                Bem-vindo à ALETIS
              </h1>
              <p className="mt-2 font-body text-sm leading-6 text-aletis-verde-medio">
                Entre com seu usuário e senha para acessar o sistema.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="username" className="mb-2 block font-body text-xs font-semibold text-aletis-verde">
                  Usuário
                </label>
                <div className="relative">
                  <UserRound aria-hidden="true" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-aletis-verde-medio/65" />
                  <input
                    ref={usernameInput}
                    id="username"
                    name="username"
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value.toLowerCase())}
                    placeholder="Digite seu usuário"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={submitting}
                    required
                    className="h-12 w-full rounded-xl border border-stone-200 bg-stone-50/80 pl-11 pr-4 font-body text-sm text-aletis-verde outline-none transition placeholder:text-stone-400 hover:border-aletis-sage focus:border-aletis-gold focus:bg-white focus:ring-4 focus:ring-aletis-gold/15 disabled:cursor-wait disabled:opacity-65"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block font-body text-xs font-semibold text-aletis-verde">
                  Senha
                </label>
                <div className="relative">
                  <LockKeyhole aria-hidden="true" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-aletis-verde-medio/65" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    disabled={submitting}
                    required
                    className="h-12 w-full rounded-xl border border-stone-200 bg-stone-50/80 pl-11 pr-12 font-body text-sm text-aletis-verde outline-none transition placeholder:text-stone-400 hover:border-aletis-sage focus:border-aletis-gold focus:bg-white focus:ring-4 focus:ring-aletis-gold/15 disabled:cursor-wait disabled:opacity-65"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-aletis-verde-medio transition hover:bg-aletis-cream hover:text-aletis-verde"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !username.trim() || !password}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-aletis-verde px-5 font-display text-sm font-semibold text-aletis-cream shadow-brand transition  hover:bg-aletis-verde-medio hover:shadow-brand-lg focus-visible:ring-4 focus-visible:ring-aletis-gold/25 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                {submitting ? 'Validando acesso…' : 'Entrar no sistema'}
              </button>
            </form>

            <div className="mt-7 flex items-center justify-center gap-2 border-t border-stone-200 pt-5 font-body text-[11px] text-stone-500">
              <ShieldCheck size={14} className="text-aletis-gold-escuro" />
              Sessão segura com expiração automática
            </div>
          </div>

          <p className="mt-6 text-center font-body text-[11px] text-aletis-sage/70">
            Acesso restrito à equipe ALETIS
          </p>
        </section>
      </div>
    </main>
  )
}
