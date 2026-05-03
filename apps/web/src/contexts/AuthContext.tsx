// ============================================================
// AuthContext — usuário corrente do sistema.
//
// Fonte única de verdade para Header, Sidebar e qualquer componente
// que precise saber quem é o consultor logado. Substitui hardcodes
// "Christian Kohler" / "CK" espalhados pela UI.
//
// Boot strategy:
//   1. Cache local (localStorage 'aletis:user') para evitar flash
//   2. Fetch /api/auth/me em paralelo — quando responder, atualiza
//   3. Fallback para FALLBACK_USER se ambos falharem
//
// O backend retorna do JWT (quando login real estiver implementado)
// ou de env vars CONSULTOR_*.
// ============================================================
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch } from '../hooks/useApi'

export interface AuthUser {
  /** ID estável (usado em comentários, changelog, audit). */
  id: string
  /** Nome completo. */
  nome: string
  /** Primeiro nome — exibido em headers compactos. */
  primeiroNome: string
  /** Iniciais (2 letras) para avatar fallback. */
  iniciais: string
  /** Cargo/role. */
  cargo: string
  /** E-mail. */
  email: string
  /** URL do avatar (opcional). */
  avatarUrl?: string
}

interface AuthContextValue {
  user: AuthUser
  /** Atualiza o usuário (após login bem-sucedido ou edição de perfil). */
  setUser: (user: AuthUser) => void
  /** Faz logout — limpa storage e volta para fallback. */
  logout: () => void
}

const FALLBACK_USER: AuthUser = {
  id: 'consultor-001',
  nome: 'Christian Kohler',
  primeiroNome: 'Christian',
  iniciais: 'CK',
  cargo: 'Consultor sênior',
  email: 'christian@aletis.com.br',
}

const STORAGE_KEY = 'aletis:user'

function loadUserFromStorage(): AuthUser {
  if (typeof window === 'undefined') return FALLBACK_USER
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return FALLBACK_USER
    const parsed = JSON.parse(raw) as Partial<AuthUser>
    if (!parsed?.nome) return FALLBACK_USER
    return {
      ...FALLBACK_USER,
      ...parsed,
      iniciais: parsed.iniciais ?? deriveIniciais(parsed.nome ?? FALLBACK_USER.nome),
      primeiroNome: parsed.primeiroNome ?? (parsed.nome ?? FALLBACK_USER.nome).split(' ')[0],
    }
  } catch {
    return FALLBACK_USER
  }
}

export function deriveIniciais(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser>(() => loadUserFromStorage())

  // Sync entre abas (storage event)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      setUserState(loadUserFromStorage())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  // Boot: tenta /api/auth/me (backend é a fonte de verdade)
  useEffect(() => {
    let cancelled = false
    apiFetch<Partial<AuthUser>>('/auth/me')
      .then((data) => {
        if (cancelled || !data?.nome) return
        const next: AuthUser = {
          ...FALLBACK_USER,
          ...data,
          iniciais: data.iniciais ?? deriveIniciais(data.nome),
          primeiroNome: data.primeiroNome ?? data.nome.split(' ')[0],
        }
        setUserState(next)
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {}
      })
      .catch(() => {
        // backend offline / sem auth — segue com cache local
      })
    return () => { cancelled = true }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      setUser: (next) => {
        setUserState(next)
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {}
      },
      logout: () => {
        try {
          window.localStorage.removeItem(STORAGE_KEY)
        } catch {}
        setUserState(FALLBACK_USER)
      },
    }),
    [user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
