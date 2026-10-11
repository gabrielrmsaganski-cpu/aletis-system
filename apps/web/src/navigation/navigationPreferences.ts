import { getToolByRoute, TOOL_CATALOG } from './toolCatalog'

export interface RecentTool { toolId: string; route: string }
export interface NavigationPreferences { favorites: string[]; recent: RecentTool[] }
export const NAVIGATION_KEY = 'aletis:navigation:v2'
export const NAVIGATION_EVENT = 'aletis:navigation:change'
export const EMPTY_NAVIGATION: NavigationPreferences = { favorites: [], recent: [] }

const queryKeys: Record<string, string[]> = {
  'crm-aletis': ['escritorio', 'q', 'estagio', 'prioridade', 'visualizacao', 'ordem', 'direcao'],
  alix: ['view'],
  ferramentas: ['q', 'categoria', 'favoritos'],
  configuracoes: ['tab'],
}

/** Guarda o contexto da ferramenta, sem transformar fichas de clientes em atalhos globais. */
export function toolVisit(pathname: string, search = ''): RecentTool | null {
  const tool = getToolByRoute(pathname)
  if (!tool || pathname !== tool.route) return null
  const source = new URLSearchParams(search)
  const params = new URLSearchParams()
  for (const key of queryKeys[tool.id] ?? []) {
    const value = source.get(key)?.trim().slice(0, 160)
    if (value) params.set(key, value)
  }
  return { toolId: tool.id, route: `${tool.route}${params.size ? `?${params}` : ''}` }
}

export function parseNavigationPreferences(raw: string | null): NavigationPreferences {
  try {
    const value = JSON.parse(raw || '{}') as Partial<NavigationPreferences>
    const ids = new Set(TOOL_CATALOG.map((tool) => tool.id))
    const favorites = Array.isArray(value.favorites)
      ? [...new Set(value.favorites.filter((id): id is string => typeof id === 'string' && ids.has(id)))].slice(0, 8)
      : []
    const recent: RecentTool[] = []
    for (const item of Array.isArray(value.recent) ? value.recent : []) {
      if (!item || typeof item.route !== 'string' || !item.route.startsWith('/') || item.route.startsWith('//')) continue
      const url = new URL(item.route, 'https://aletis.local')
      const visit = toolVisit(url.pathname, url.search)
      if (visit?.toolId === item.toolId && !recent.some((entry) => entry.toolId === item.toolId)) recent.push(visit)
      if (recent.length === 6) break
    }
    return { favorites, recent }
  } catch { return { favorites: [], recent: [] } }
}

export function withToolVisit(current: NavigationPreferences, visit: RecentTool): NavigationPreferences {
  return { ...current, recent: [visit, ...current.recent.filter((item) => item.toolId !== visit.toolId)].slice(0, 6) }
}
