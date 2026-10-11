import { useState, useEffect, useCallback, useRef } from 'react'
import { SharedReadPool } from '../lib/SharedReadPool'

const API_BASE = '/api'

/**
 * Fastify rejeita POST/PUT com `Content-Type: application/json` e body vazio
 * ("Body cannot be empty..."). Só mandamos o header quando há body de fato.
 */
export type ApiRequestInit = RequestInit & { timeoutMs?: number }

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
  }
}

function buildInit(options?: ApiRequestInit): RequestInit {
  const hasBody = options?.body !== undefined && options?.body !== null
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData
  const headers = new Headers(options?.headers)
  if (hasBody && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const { timeoutMs: _timeout, ...init } = options || {}
  return { ...init, credentials: options?.credentials ?? 'include', headers }
}

function notifyExpiredSession(status: number, path: string): void {
  if (status !== 401 || path === '/auth/login') return
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aletis:auth-expired'))
  }
}

async function requestJsonTransport(path: string, options?: ApiRequestInit): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const callerSignal = options?.signal
  const abortFromCaller = () => controller.abort()
  if (callerSignal?.aborted) controller.abort()
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = globalThis.setTimeout(() => controller.abort(), Math.max(5_000, options?.timeoutMs ?? 90_000))
  try {
    const res = await fetch(`${API_BASE}${path}`, buildInit({ ...options, signal: controller.signal }))
    const raw = await res.text()
    let json: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Envelope inválido')
      json = parsed as Record<string, unknown>
    } catch {
      throw new Error(/<\/?(?:html|body|!doctype)\b/i.test(raw)
        ? `A API não concluiu a solicitação (HTTP ${res.status}). Tente novamente.`
        : `A API retornou uma resposta inválida (HTTP ${res.status}). Tente novamente.`)
    }
    if (!res.ok || json.success === false || json.sucesso === false) {
      notifyExpiredSession(res.status, path)
      throw new ApiError(
        typeof json.error === 'string' ? json.error : typeof json.message === 'string' ? json.message : `API error ${res.status}`,
        res.status,
        typeof json.code === 'string' ? json.code : undefined,
        json,
      )
    }
    return json
  } catch (error) {
    // Troca de tela/cancelamento não é timeout nem uma falha a exibir ao usuário.
    if (callerSignal?.aborted) throw new DOMException('Solicitação cancelada.', 'AbortError')
    if (controller.signal.aborted) throw new ApiError(
      (options?.method || 'GET').toUpperCase() === 'GET'
        ? 'A leitura demorou mais que o esperado. Tente novamente.'
        : 'A confirmação da gravação demorou mais que o esperado. Atualize o registro antes de tentar novamente.',
      0, 'request_timeout',
    )
    throw error
  } finally {
    globalThis.clearTimeout(timer)
    callerSignal?.removeEventListener('abort', abortFromCaller)
  }
}

const sharedReads = new SharedReadPool<Record<string, unknown>>()
const shareableOptions = new Set(['method', 'signal', 'headers', 'credentials', 'timeoutMs', 'cache', 'mode', 'redirect', 'referrer', 'referrerPolicy', 'integrity'])
function requestJson(path: string, options?: ApiRequestInit): Promise<Record<string, unknown>> {
  if ((options?.method || 'GET').toUpperCase() !== 'GET') {
    sharedReads.invalidate()
    return requestJsonTransport(path, options).finally(() => sharedReads.invalidate())
  }
  if (path.startsWith('/auth/') || Object.keys(options || {}).some(key => !shareableOptions.has(key))) return requestJsonTransport(path, options)
  const init = buildInit(options)
  const headers = Array.from(new Headers(init.headers).entries()).sort(([a], [b]) => a.localeCompare(b))
  const key = JSON.stringify([path, headers, init.credentials, options?.timeoutMs ?? 90_000, init.cache, init.mode, init.redirect, init.referrer, init.referrerPolicy, init.integrity])
  return sharedReads.read(key, signal => requestJsonTransport(path, { ...options, signal }), options?.signal)
}

export async function apiFetch<T>(path: string, options?: ApiRequestInit): Promise<T> {
  const json = await requestJson(path, options)
  return (Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json) as T
}

export async function apiFetchFull<T>(path: string, options?: ApiRequestInit): Promise<T> {
  return await requestJson(path, options) as T
}

function useApiResource<T>(path: string | null, fallback: T, full: boolean) {
  const fallbackRef = useRef(fallback)
  fallbackRef.current = fallback
  const sequence = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const [state, setState] = useState<{ path: string | null; data: T; loading: boolean; error: string | null }>({
    path, data: fallback, loading: Boolean(path), error: null,
  })

  const cancel = useCallback(() => {
    sequence.current += 1
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  const refetch = useCallback(() => {
    cancel()
    const requestId = sequence.current
    if (!path) {
      setState({ path, data: fallbackRef.current, loading: false, error: null })
      return
    }
    const controller = new AbortController()
    controllerRef.current = controller
    setState(current => ({ path, data: current.path === path ? current.data : fallbackRef.current, loading: true, error: null }))
    const fetcher = full ? apiFetchFull<T> : apiFetch<T>
    fetcher(path, { signal: controller.signal })
      .then(data => {
        if (sequence.current === requestId && !controller.signal.aborted) {
          setState({ path, data, loading: false, error: null })
        }
      })
      .catch((error: Error) => {
        if (sequence.current !== requestId || controller.signal.aborted) return
        setState(current => ({ ...current, loading: false, error: error.message }))
      })
  }, [path, full, cancel])

  useEffect(() => { refetch(); return cancel }, [refetch, cancel])
  // Na troca de entidade, nem um único render deve apresentar dados da anterior.
  const current = state.path === path ? state : { path, data: fallback, loading: Boolean(path), error: null }
  return { data: current.data, loading: current.loading, error: current.error, refetch }
}

export function useApi<T>(path: string | null, fallback: T) {
  return useApiResource(path, fallback, false)
}

export function useApiFull<T>(path: string, fallback: T) {
  return useApiResource(path, fallback, true)
}

export function useApiPost<TReq, TRes>(path: string) {
  const [data, setData] = useState<TRes | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(async (body: TReq): Promise<TRes | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<TRes>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setData(result)
      return result
    } catch (err) {
      const msg = (err as Error).message
      setError(msg)
      console.warn(`[API POST] ${path} falhou:`, msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [path])

  return { data, loading, error, execute }
}
