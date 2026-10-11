import { describe, expect, it } from 'vitest'
import { portalDestinationParams, portalNextActions, portalWaitingState, readPortalDestination } from '../src/pages/portal/PortalExperienceModel'
import { changedPortalProfile } from '../src/pages/portal/PortalSupport'
import type { MensagemDTO, PendenciaDTO } from '../src/pages/portal/types'
const request = (id: string, patch: Partial<PendenciaDTO> = {}): PendenciaDTO => ({ id, clienteId: 'cliente-a', titulo: id, categoria: 'outros', obrigatorio: true, status: 'pendente', solicitadoEm: '2026-09-10T12:00:00Z', ...patch })
const message: MensagemDTO = { id: 'm1', de: 'consultor', autorNome: 'Equipe', texto: 'Resposta pública', criadoEm: '2026-09-11T12:00:00Z' }
describe('Próximas ações e destino do portal', () => {
  it('prioriza correção, prazo vencido e urgência; inclui respostas sem tratar pedido em revisão como falta', () => {
    const actions = portalNextActions([request('normal'), request('revisao', { status: 'enviado', prazo: '2026-09-01' }), request('urgente', { prioridade: 'urgente' }), request('corrigir', { status: 'rejeitado', observacao: 'Página cortada' }), request('vencido', { prazo: '2026-09-10' }), request('cancelado', { status: 'cancelado' })], [message], [], null, new Date(2026, 8, 11))
    expect(actions.map(action => action.id)).toEqual(['corrigir', 'vencido', 'urgente', 'mensagens', 'normal'])
    expect(actions[0]).toMatchObject({ detail: 'Página cortada', destination: { view: 'documentos', requestId: 'corrigir' } })
  })
  it('explica espera da equipe sem inventar prazo e não considera cancelados como ação', () => {
    expect(portalWaitingState([request('em-analise', { status: 'enviado' }), request('cancelado', { status: 'cancelado' })])).toMatchObject({ awaiting: 'equipe', title: 'Agora é com a equipe' })
    expect(portalWaitingState([], false).awaiting).toBe('atualizacao')
  })
  it('anuncia apenas andamento compartilhado posterior à última visita', () => {
    const timeline = [{ data: '2026-09-11T12:00:00Z', tipo: 'documento', descricao: 'Arquivo recebido' }, { data: '2026-09-11T11:00:00Z', tipo: 'andamento', descricao: 'Reunião confirmada' }]
    expect(portalNextActions([], [{ ...message, lidaEm: '2026-09-11T12:01:00Z' }], timeline, '2026-09-11T11:00:00Z')).toEqual([])
    expect(portalNextActions([], [], timeline, null)[0].detail).toBe('Reunião confirmada')
  })
  it('aceita deep link válido e rejeita destino ou identificador malformado', () => {
    expect(readPortalDestination(new URLSearchParams('tab=documentos&pedido=pd-123'))).toEqual({ view: 'documentos', requestId: 'pd-123' })
    expect(readPortalDestination(new URLSearchParams('tab=https://externo.test&pedido=../123'))).toEqual({ view: 'painel' })
    expect(readPortalDestination(new URLSearchParams('tab=documentos&pedido=../123'))).toEqual({ view: 'documentos' })
  })
  it('preserva parâmetros independentes, remove pedido ao sair e não coloca rascunho na URL', () => {
    const before = new URLSearchParams('tab=documentos&pedido=pd-1&source=link')
    const next = portalDestinationParams(before, { view: 'mensagens', draft: 'Texto privado' })
    expect(next.toString()).toBe('tab=mensagens&source=link')
    expect(before.get('pedido')).toBe('pd-1')
  })
  it('solicita somente campos alterados, preservando valores atuais fora do pedido', () => {
    const current = { email: 'a@example.test', telefone: '66999999999', cidade: 'Canarana', uf: 'MT' }
    expect(changedPortalProfile(current, { ...current, cidade: '  Água Boa ' })).toEqual({ cidade: 'Água Boa' })
    expect(changedPortalProfile(current, current)).toEqual({})
  })
})
