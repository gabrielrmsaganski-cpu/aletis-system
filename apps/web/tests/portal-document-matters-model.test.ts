import { describe, expect, it } from 'vitest'
import { filterMatters, matterChartData, matterProgress, mergeMatterEvents, summarizeMatters, type PortalMatter, type PortalMatterEvent } from '../src/pages/portal/PortalMattersModel'

const matter = (patch: Partial<PortalMatter> = {}): PortalMatter => ({
  id: 'assunto-a', clienteId: 'cliente-sintetico', titulo: 'Revisão do crédito', resumo: 'Conferência documental',
  status: 'em_andamento', dependeDe: 'equipe', visibilidade: 'publicado', criadoEm: '2026-09-13T10:00:00Z', atualizadoEm: '2026-09-13T12:00:00Z', marcos: [], ...patch,
})
describe('Contagens e navegação dos assuntos do cliente', () => {
  it('não inventa percentual para assuntos sem etapas, mesmo se estiverem concluídos', () => {
    expect(matterProgress(matter({ status: 'concluido' }))).toMatchObject({ total: 0, percentual: null })
    expect(matterProgress(matter({ marcos: [{ id: 'cancelada', titulo: 'Etapa dispensada', status: 'cancelado' }] }))).toMatchObject({ total: 0, cancelados: 1, percentual: null })
  })
  it('mede apenas etapas efetivas e mantém em andamento separado de concluído', () => {
    const item = matter({ marcos: [{ id: '1', titulo: 'Conferir cadastro', status: 'concluido' }, { id: '2', titulo: 'Analisar arquivo', status: 'em_andamento' }, { id: '3', titulo: 'Preparar retorno', status: 'pendente' }, { id: '4', titulo: 'Dispensada', status: 'cancelado' }] })
    expect(matterProgress(item)).toEqual({ total: 3, concluidos: 1, emAndamento: 1, pendentes: 1, cancelados: 1, percentual: 33 })
  })
  it('não conta rascunhos nem trabalho cancelado como resultado entregue', () => {
    const items = [matter(), matter({ id: 'b', status: 'aguardando_cliente', dependeDe: 'cliente' }), matter({ id: 'c', status: 'concluido', dependeDe: 'nenhum', marcos: [{ id: 'c1', titulo: 'Entregue', status: 'concluido' }] }), matter({ id: 'd', visibilidade: 'rascunho' }), matter({ id: 'e', status: 'cancelado', dependeDe: 'nenhum', marcos: [{ id: 'e1', titulo: 'Análise interrompida', status: 'concluido' }] })]
    expect(summarizeMatters(items)).toEqual({ total: 4, ativos: 2, cliente: 1, concluidos: 1, marcosConcluidos: 1 })
    expect(matterChartData(items).situacoes.reduce((sum, item) => sum + item.quantidade, 0)).toBe(4)
    expect(matterChartData(items).etapas.map(item => item.id)).toEqual(['assunto-a', 'b', 'c'])
  })
  it('busca sem exigir acentos e prioriza a ação do cliente sem ocultar assuntos concluídos', () => {
    const items = [matter({ id: 'a', status: 'concluido', dependeDe: 'nenhum' }), matter({ id: 'b', titulo: 'Revisão da inscrição', status: 'aguardando_cliente', dependeDe: 'cliente' }), matter({ id: 'c', visibilidade: 'rascunho' })]
    expect(filterMatters(items, 'todos', 'revisao').map(item => item.id)).toEqual(['b', 'a'])
    expect(filterMatters(items, 'cliente', '').map(item => item.id)).toEqual(['b'])
    expect(filterMatters(items, 'concluidos', '').map(item => item.id)).toEqual(['a'])
  })
  it('deduplica páginas de histórico e mantém ordem cronológica estável', () => {
    const event = (id: string, data: string): PortalMatterEvent => ({ id, assuntoId: 'assunto-a', titulo: 'Atualização', descricao: 'Texto público', data, tipo: 'atualizacao', versao: 1 })
    const older = event('a', '2026-09-10T12:00:00Z'), newer = event('b', '2026-09-13T12:00:00Z')
    expect(mergeMatterEvents([newer], [older, newer]).map(item => item.id)).toEqual(['b', 'a'])
  })
})
