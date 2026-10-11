import { describe, expect, it } from 'vitest'
import { DEFAULT_CRM_VIEW, foldCrmSearch, patchCrmView, readCrmView } from '../../../web/src/components/crm/crmViewState'
import { parseNavigationPreferences, toolVisit, withToolVisit } from '../../../web/src/navigation/navigationPreferences'
import { getToolByRoute } from '../../../web/src/navigation/toolCatalog'

describe('contexto de navegação do consultor', () => {
  it('reabre filtros, ordenação e visualização do CRM a partir de uma URL compartilhada', () => {
    const original = new URLSearchParams('escritorio=Canarana&novo=1')
    const params = patchCrmView(original, {
      searchQuery: 'João', stageFilter: 'negociacao', operationalFilter: 'atrasados',
      viewMode: 'kanban', sortKey: 'nome', sortDir: 'asc',
    })
    expect(readCrmView(new URLSearchParams(params.toString()))).toEqual({
      searchQuery: 'João', stageFilter: 'negociacao', operationalFilter: 'atrasados',
      viewMode: 'kanban', sortKey: 'nome', sortDir: 'asc', officeFilter: 'Canarana',
    })
    expect(params.get('novo')).toBe('1')
    expect(original.get('q')).toBeNull()
    expect(patchCrmView(params, DEFAULT_CRM_VIEW).toString()).toBe('novo=1')
  })

  it('normaliza entradas inválidas e encontra nomes com ou sem acento', () => {
    expect(readCrmView(new URLSearchParams('estagio=inexistente&prioridade=xyz&ordem=xyz&visualizacao=xyz'))).toEqual(DEFAULT_CRM_VIEW)
    expect(foldCrmSearch('  SÃO João ')).toBe('sao joao')
  })

  it('mantém o CRM ativo em fichas, mas não guarda a ficha como ferramenta recente', () => {
    expect(getToolByRoute('/clientes/cliente-a/checklist')?.id).toBe('crm-aletis')
    expect(toolVisit('/clientes/cliente-a', '?area=workflow')).toBeNull()
    expect(toolVisit('/crm', '?q=Joao&escritorio=Canarana&novo=1&clienteId=cliente-a')).toEqual({ toolId: 'crm-aletis', route: '/crm?escritorio=Canarana&q=Joao' })
  })

  it('recupera preferências válidas sem duplicar ferramentas nem preservar destinos estranhos', () => {
    const preferences = parseNavigationPreferences(JSON.stringify({
      favorites: ['crm-aletis', 'crm-aletis', 'desconhecida'],
      recent: [
        { toolId: 'crm-aletis', route: '/crm?escritorio=Canarana' },
        { toolId: 'crm-aletis', route: '/crm?escritorio=Aletis' },
        { toolId: 'alix', route: '//outro.exemplo' },
        { toolId: 'crm-aletis', route: '/clientes/cliente-a' },
      ],
    }))
    expect(preferences).toEqual({ favorites: ['crm-aletis'], recent: [{ toolId: 'crm-aletis', route: '/crm?escritorio=Canarana' }] })
    expect(withToolVisit(preferences, { toolId: 'crm-aletis', route: '/crm?prioridade=hoje' }).recent).toEqual([{ toolId: 'crm-aletis', route: '/crm?prioridade=hoje' }])
    expect(parseNavigationPreferences('conteúdo inválido')).toEqual({ favorites: [], recent: [] })
  })
})
