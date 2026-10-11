import { useEffect, useRef, useState } from 'react'
import { apiFetch } from './useApi'
import { clientSearchEntities, proposalSearchEntities, filterSearchEntities, type SearchEntity } from '../navigation/entitySearch'

interface SearchState {
  query: string
  clients: SearchEntity[]
  proposals: SearchEntity[]
  totalClients: number
  totalProposals: number
  errors: string[]
  loading: boolean
}

const empty = (query = '', loading = false): SearchState => ({ query, clients: [], proposals: [], totalClients: 0, totalProposals: 0, errors: [], loading })

/** Cache curto, apenas enquanto a paleta está aberta; nunca reapresenta resultados de outra consulta. */
export function useEntitySearch(query: string, open: boolean) {
  const normalizedQuery = query.trim()
  const [state, setState] = useState<SearchState>(() => empty())
  const [attempt, setAttempt] = useState(0)
  const cacheRef = useRef<{ clients: SearchEntity[]; proposals: SearchEntity[]; at: number } | null>(null)

  useEffect(() => {
    if (!open || normalizedQuery.length < 2) {
      setState(empty(normalizedQuery))
      if (!open) cacheRef.current = null
      return
    }
    const controller = new AbortController()
    setState(empty(normalizedQuery, true))
    const timer = window.setTimeout(async () => {
      let cached = cacheRef.current
      const errors: string[] = []
      if (!cached || Date.now() - cached.at > 30_000) {
        const responses = await Promise.allSettled([
          apiFetch<unknown>('/clientes', { signal: controller.signal }).then(clientSearchEntities),
          apiFetch<unknown>('/propostas', { signal: controller.signal }).then(proposalSearchEntities),
        ])
        if (controller.signal.aborted) return
        const [clients, proposals] = responses
        if (clients.status === 'rejected') errors.push('Clientes indisponíveis nesta consulta.')
        if (proposals.status === 'rejected') errors.push('Propostas indisponíveis nesta consulta.')
        cached = {
          clients: clients.status === 'fulfilled' ? clients.value : [],
          proposals: proposals.status === 'fulfilled' ? proposals.value : [],
          at: Date.now(),
        }
        if (!errors.length) cacheRef.current = cached
      }
      if (controller.signal.aborted) return
      const clients = filterSearchEntities(cached.clients, normalizedQuery)
      const proposals = filterSearchEntities(cached.proposals, normalizedQuery)
      setState({ query: normalizedQuery, clients: clients.items, proposals: proposals.items, totalClients: clients.total, totalProposals: proposals.total, errors, loading: false })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [normalizedQuery, open, attempt])

  const current = open && state.query === normalizedQuery ? state : empty(normalizedQuery, open && normalizedQuery.length >= 2)
  return { ...current, retry: () => { cacheRef.current = null; setAttempt((value) => value + 1) } }
}
