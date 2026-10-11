import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch } from '../hooks/useApi'
import { queryClient } from '../lib/query-client'

export interface AuthUser {
  id: string
  username: string
  nome: string
  primeiroNome: string
  iniciais: string
  cargo: string
  email: string
  consultorId?: string
  avatarUrl?: string
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  user: AuthUser
  status: AuthStatus
  login: (username: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const ANONYMOUS_USER: AuthUser = {
  id: '',
  username: '',
  nome: '',
  primeiroNome: '',
  iniciais: '',
  cargo: '',
  email: '',
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser>(ANONYMOUS_USER)
  const [status, setStatus] = useState<AuthStatus>('loading')

  const clearLocalSession = useCallback(() => {
    queryClient.clear()
    try {
      window.localStorage.removeItem('aletis:user')
      window.localStorage.removeItem('aletis:session')
      window.sessionStorage.clear()
    } catch {
      // Storage pode estar indisponível em navegação privada.
    }
    setUser(ANONYMOUS_USER)
    setStatus('unauthenticated')
  }, [])

  const refreshSession = useCallback(async () => {
    try {
      const authenticatedUser = await apiFetch<AuthUser>('/auth/me')
      setUser(authenticatedUser)
      setStatus('authenticated')
    } catch {
      clearLocalSession()
    }
  }, [clearLocalSession])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  useEffect(() => {
    const handleExpiredSession = () => clearLocalSession()
    window.addEventListener('aletis:auth-expired', handleExpiredSession)
    return () => window.removeEventListener('aletis:auth-expired', handleExpiredSession)
  }, [clearLocalSession])

  const login = useCallback(async (username: string, password: string) => {
    const authenticatedUser = await apiFetch<AuthUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    queryClient.clear()
    setUser(authenticatedUser)
    setStatus('authenticated')
    return authenticatedUser
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch {
      // Mesmo sem rede, a interface deve encerrar a sessão local.
    } finally {
      clearLocalSession()
    }
  }, [clearLocalSession])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    login,
    logout,
    refreshSession,
  }), [login, logout, refreshSession, status, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
