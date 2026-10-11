import { useCallback, useEffect, useRef, useState } from 'react'
import { TOKEN_KEY, type ClienteMe } from './types'
import { apiCall } from './utils'

/** Cada resposta pertence à geração e ao token que iniciaram a consulta. */
export function usePortalSession() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [cliente, setCliente] = useState<ClienteMe | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const currentToken = useRef(token)
  const currentCliente = useRef(cliente)
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const invalidate = useCallback(() => { generation.current += 1; request.current?.abort(); request.current = null }, [])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; invalidate() } }, [invalidate])
  const authenticate = useCallback((nextToken: string | null, nextCliente: ClienteMe | null) => {
    invalidate()
    currentToken.current = nextToken; currentCliente.current = nextCliente
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken)
    else localStorage.removeItem(TOKEN_KEY)
    setToken(nextToken); setCliente(nextCliente); setSessionError(null)
  }, [invalidate])
  const refreshCliente = useCallback(async () => {
    const startedToken = currentToken.current
    if (!startedToken) return
    invalidate()
    const version = generation.current
    const controller = new AbortController(); request.current = controller
    setSessionError(null)
    const response = await apiCall<ClienteMe>('/api/portal/auth/me', { token: startedToken, signal: controller.signal })
    if (!mounted.current || controller.signal.aborted || version !== generation.current || currentToken.current !== startedToken) return
    request.current = null
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) authenticate(null, null)
      else setSessionError('Não foi possível recuperar seu atendimento. Seu acesso foi mantido; tente novamente.')
      return
    }
    currentCliente.current = response.data; setCliente(response.data)
  }, [authenticate, invalidate])
  const rotateToken = useCallback((nextToken: string) => authenticate(nextToken, currentCliente.current ? { ...currentCliente.current, forcaTrocaSenha: false } : null), [authenticate])
  const logout = useCallback(() => {
    const previousToken = currentToken.current
    authenticate(null, null)
    if (previousToken) void apiCall('/api/portal/auth/logout', { method: 'POST', token: previousToken })
  }, [authenticate])
  return { token, cliente, sessionError, authenticate, refreshCliente, rotateToken, logout }
}
