export const CRM_STAGES = ['lead', 'prospeccao', 'qualificacao', 'analise', 'proposta', 'negociacao', 'acordo', 'acompanhamento', 'concluido', 'encerrado'] as const
export const CRM_SORT_KEYS = ['nome', 'cidade', 'credor', 'valorDivida', 'estagio', 'saudeFinanceira', 'consultor', 'scoreOperacional'] as const
export const CRM_OPERATIONAL_FILTERS = ['todos', 'prioridade', 'atrasados', 'hoje', 'semAcao', 'parados'] as const
export type CrmViewState = {
  viewMode: 'list' | 'kanban'
  searchQuery: string
  stageFilter: 'todos' | typeof CRM_STAGES[number]
  operationalFilter: typeof CRM_OPERATIONAL_FILTERS[number]
  officeFilter: string
  sortKey: typeof CRM_SORT_KEYS[number]
  sortDir: 'asc' | 'desc'
}
export const DEFAULT_CRM_VIEW: CrmViewState = { viewMode: 'list', searchQuery: '', stageFilter: 'todos', operationalFilter: 'todos', officeFilter: 'todos', sortKey: 'scoreOperacional', sortDir: 'desc' }
const KEYS: Record<keyof CrmViewState, string> = { viewMode: 'visualizacao', searchQuery: 'q', stageFilter: 'estagio', operationalFilter: 'prioridade', officeFilter: 'escritorio', sortKey: 'ordem', sortDir: 'direcao' }

export function readCrmView(params: URLSearchParams): CrmViewState {
  const stage = params.get('estagio')
  const operational = params.get('prioridade')
  const sort = params.get('ordem')
  return {
    viewMode: params.get('visualizacao') === 'kanban' ? 'kanban' : 'list',
    searchQuery: (params.get('q') ?? '').slice(0, 160),
    stageFilter: CRM_STAGES.includes(stage as typeof CRM_STAGES[number]) ? stage as CrmViewState['stageFilter'] : 'todos',
    operationalFilter: CRM_OPERATIONAL_FILTERS.includes(operational as CrmViewState['operationalFilter']) ? operational as CrmViewState['operationalFilter'] : 'todos',
    officeFilter: params.get('escritorio')?.trim().slice(0, 160) || 'todos',
    sortKey: CRM_SORT_KEYS.includes(sort as CrmViewState['sortKey']) ? sort as CrmViewState['sortKey'] : 'scoreOperacional',
    sortDir: params.get('direcao') === 'asc' ? 'asc' : 'desc',
  }
}

/** Mantém a URL compartilhável e preserva parâmetros de entrada que não são filtros. */
export function patchCrmView(params: URLSearchParams, patch: Partial<CrmViewState>): URLSearchParams {
  const next = new URLSearchParams(params)
  const view = { ...readCrmView(params), ...patch }
  for (const [key, param] of Object.entries(KEYS) as Array<[keyof CrmViewState, string]>) {
    if (view[key] === DEFAULT_CRM_VIEW[key]) next.delete(param)
    else next.set(param, view[key])
  }
  return next
}

export function foldCrmSearch(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim() }
