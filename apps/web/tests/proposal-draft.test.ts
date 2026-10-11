import { describe, expect, it, vi } from 'vitest'
import { ProposalDraftEditor, cannotReapplyProposal, proposalChanges, proposalTransitions } from '../src/components/cliente/proposalDraft'

const fixture = () => ({ id: 'prop-offline', revision: 1, status: 'enviada', titulo: 'Proposta', credor: 'Banco', valorProposta: '90071992547409.99', observacoes: '', condicoes: ['Revisar'] })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('Edição de propostas: gravações concorrentes e revisões', () => {
  it('envia somente o campo editado, sem converter ou reenviar valores e status anteriores', async () => {
    const original = fixture()
    const editor = new ProposalDraftEditor(original)
    editor.edit({ ...editor.draft, observacoes: 'Nota nova' })
    const transport = vi.fn(async () => ({ data: { ...original, observacoes: 'Nota nova', revision: 2 } }))
    await editor.save(transport)
    expect(transport).toHaveBeenCalledWith(original.id, { observacoes: 'Nota nova', expectedRevision: 1 })
    expect(editor.draft.valorProposta).toBe('90071992547409.99')
    expect(editor.dirty).toBe(false)
  })

  it('serializa duplo clique e preserva edição feita durante a gravação', async () => {
    const editor = new ProposalDraftEditor(fixture())
    editor.edit({ ...editor.draft, titulo: 'Título enviado' })
    const pending = deferred<{ data: ReturnType<typeof fixture> }>()
    const transport = vi.fn(() => pending.promise)
    const first = editor.save(transport)
    expect(editor.save(transport)).toBe(first)
    await Promise.resolve()
    expect(transport).toHaveBeenCalledTimes(1)
    editor.edit({ ...editor.draft, titulo: 'Título digitado depois', observacoes: 'Nota posterior' })
    pending.resolve({ data: { ...fixture(), titulo: 'Título enviado', revision: 2 } })
    await first
    expect(editor.confirmed.titulo).toBe('Título enviado')
    expect(editor.draft).toMatchObject({ titulo: 'Título digitado depois', observacoes: 'Nota posterior', revision: 2 })
    const next = vi.fn(async () => ({ data: { ...editor.draft, revision: 3 } }))
    await editor.save(next)
    expect(next).toHaveBeenCalledWith('prop-offline', { titulo: 'Título digitado depois', observacoes: 'Nota posterior', expectedRevision: 2 })
  })

  it('409 mantém o rascunho, pausa o autosave e exige reconciliação explícita', async () => {
    const editor = new ProposalDraftEditor(fixture())
    editor.edit({ ...editor.draft, observacoes: 'Nota local' })
    const conflict = Object.assign(new Error('Revisão alterada'), { status: 409 })
    await expect(editor.save(async () => { throw conflict })).rejects.toBe(conflict)
    expect(editor.paused).toBe(true)
    expect(editor.confirmed.revision).toBe(1)
    const latest = { ...fixture(), credor: 'Credor atualizado', revision: 2 }
    editor.receive(latest)
    expect(editor.draft.observacoes).toBe('Nota local')
    editor.reconcile(latest, true)
    expect(editor.draft).toMatchObject({ credor: 'Credor atualizado', observacoes: 'Nota local', revision: 2 })
    expect(proposalChanges(editor.confirmed, editor.draft)).toEqual({ observacoes: 'Nota local' })
    expect(editor.paused).toBe(true)
    expect(editor.error).toBeNull()
  })

  it('503 não publica confirmação e admite nova tentativa manual', async () => {
    const editor = new ProposalDraftEditor(fixture())
    editor.edit({ ...editor.draft, status: 'aceita' })
    await expect(editor.save(async () => { throw new Error('Banco indisponível') })).rejects.toThrow('Banco indisponível')
    expect(editor.confirmed.status).toBe('enviada')
    expect(editor.draft.status).toBe('aceita')
    expect(editor.paused).toBe(true)
    await editor.save(async () => ({ data: { ...fixture(), status: 'aceita', revision: 2 }, meta: { contratoId: 'contract-one' } }))
    expect(editor.confirmed.status).toBe('aceita')
    expect(editor.paused).toBe(false)
  })

  it('a resposta controla a situação confirmada, preservando somente as novas edições', async () => {
    const editor = new ProposalDraftEditor(fixture())
    editor.edit({ ...editor.draft, status: 'aceita' })
    await editor.save(async () => ({ data: { ...fixture(), status: 'aceita', revision: 8 } }))
    expect(editor.draft).toMatchObject({ status: 'aceita', revision: 8 })
    editor.edit({ ...editor.draft, observacoes: 'Revisar minuta' })
    expect(proposalChanges(editor.confirmed, editor.draft)).toEqual({ observacoes: 'Revisar minuta' })
  })

  it('não reaplica termos antigos sobre proposta aceita, mas permite notas internas', () => {
    const original = fixture()
    const latest = { ...original, status: 'aceita', revision: 2 }
    expect(cannotReapplyProposal(original, { ...original, titulo: 'Outro título' }, latest)).toBe(true)
    const editor = new ProposalDraftEditor(original)
    editor.edit({ ...original, titulo: 'Outro título' })
    expect(() => editor.reconcile(latest, true)).toThrow('situação atual')
    expect(editor.draft.titulo).toBe('Outro título')
    editor.edit({ ...original, observacoes: 'Nota' })
    editor.reconcile(latest, true)
    expect(editor.draft).toMatchObject({ status: 'aceita', titulo: 'Proposta', observacoes: 'Nota' })
  })

  it('não permite reaplicar transição inválida após mudança de situação no servidor', () => {
    const original = fixture()
    expect(cannotReapplyProposal(original, { ...original, status: 'aceita' }, { ...original, status: 'rejeitada', revision: 2 })).toBe(true)
    expect(proposalTransitions.rascunho).not.toContain('aceita')
    expect(proposalTransitions.aceita).toEqual([])
  })

  it('carregar versão atual descarta alterações apenas quando solicitado', () => {
    const editor = new ProposalDraftEditor(fixture())
    editor.edit({ ...editor.draft, titulo: 'Rascunho local' })
    editor.reconcile({ ...fixture(), titulo: 'Servidor', revision: 3 }, false)
    expect(editor.draft.titulo).toBe('Servidor')
    expect(editor.dirty).toBe(false)
    expect(editor.paused).toBe(false)
    editor.receive(fixture())
    expect(editor.confirmed.revision).toBe(3)
  })

  it('não faz requisição quando nenhum campo mudou', async () => {
    const editor = new ProposalDraftEditor(fixture())
    const transport = vi.fn()
    expect(await editor.save(transport)).toBeNull()
    expect(transport).not.toHaveBeenCalled()
  })
})
