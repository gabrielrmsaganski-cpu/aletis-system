import { useState, useEffect, useCallback } from 'react'

const API_BASE = '/api'

/**
 * Fastify rejeita POST/PUT com `Content-Type: application/json` e body vazio
 * ("Body cannot be empty..."). Só mandamos o header quando há body de fato.
 */
function buildInit(options?: RequestInit): RequestInit {
  const hasBody = options?.body !== undefined && options?.body !== null
  const headers: Record<string, string> = hasBody ? { 'Content-Type': 'application/json' } : {}
  if (options?.headers) {
    const incoming = options.headers as Record<string, string>
    for (const [k, v] of Object.entries(incoming)) headers[k] = v
  }
  return { ...options, headers }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, buildInit(options))
  const json = await res.json()
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `API error ${res.status}`)
  }
  return json.data ?? json
}

export async function apiFetchFull<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, buildInit(options))
  const json = await res.json()
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `API error ${res.status}`)
  }
  return json as T
}

export function useApi<T>(path: string, fallback: T) {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(() => {
    setLoading(true)
    setError(null)
    apiFetch<T>(path)
      .then(setData)
      .catch((err) => {
        console.warn(`[API] ${path} falhou, usando fallback:`, err.message)
        setError(err.message)
      })
      .finally(() => setLoading(false))
  }, [path])

  useEffect(() => { refetch() }, [refetch])

  return { data, loading, error, refetch }
}

export function useApiFull<T>(path: string, fallback: T) {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(() => {
    setLoading(true)
    setError(null)
    apiFetchFull<T>(path)
      .then(setData)
      .catch((err) => {
        console.warn(`[API] ${path} falhou, usando fallback:`, err.message)
        setError(err.message)
      })
      .finally(() => setLoading(false))
  }, [path])

  useEffect(() => { refetch() }, [refetch])

  return { data, loading, error, refetch }
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
