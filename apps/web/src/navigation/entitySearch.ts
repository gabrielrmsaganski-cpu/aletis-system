/** Busca textual sobre os resumos reais fornecidos pela API. */
export interface SearchEntity {
  id: string
  kind: 'cliente' | 'proposta'
  title: string
  description: string
  route: string
  status?: string
}

export const ENTITY_RESULT_LIMIT = 6

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('A busca recebeu uma resposta inválida.')
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

export function clientSearchEntities(value: unknown): SearchEntity[] {
  return records(value).flatMap((item) => {
    const id = text(item.id)
    if (!id) return []
    return [{
      id: `cliente:${id}`,
      kind: 'cliente' as const,
      title: text(item.nome) || 'Cliente sem nome no cadastro',
      description: [text(item.cidade), text(item.uf), text(item.credor), text(item.consultor), id].filter(Boolean).join(' · '),
      route: `/clientes/${encodeURIComponent(id)}`,
      status: text(item.estagio).replace(/_/g, ' '),
    }]
  })
}

export function proposalSearchEntities(value: unknown): SearchEntity[] {
  return records(value).flatMap((item) => {
    const id = text(item.id)
    if (!id) return []
    return [{
      id: `proposta:${id}`,
      kind: 'proposta' as const,
      title: text(item.titulo) || 'Proposta sem título no cadastro',
      description: [text(item.clienteNome), text(item.credor), id].filter(Boolean).join(' · '),
      route: `/propostas?proposta=${encodeURIComponent(id)}`,
      status: text(item.status).replace(/_/g, ' '),
    }]
  })
}

export function filterSearchEntities(entities: SearchEntity[], query: string, limit = ENTITY_RESULT_LIMIT): { items: SearchEntity[]; total: number } {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return { items: [], total: 0 }
  const matches = entities.filter((item) => {
    const haystack = normalizeSearch(`${item.title} ${item.description}`)
    return terms.every((term) => haystack.includes(term))
  }).sort((a, b) => {
    const prefix = normalizeSearch(query)
    const rank = Number(!normalizeSearch(a.title).startsWith(prefix)) - Number(!normalizeSearch(b.title).startsWith(prefix))
    return rank || a.title.localeCompare(b.title, 'pt-BR')
  })
  return { items: matches.slice(0, Math.max(0, limit)), total: matches.length }
}
