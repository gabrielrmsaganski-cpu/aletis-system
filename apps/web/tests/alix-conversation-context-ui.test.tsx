import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlixConversationContext } from '../src/hooks/useAlixConversationContext'

type Message = { id: string; content: string }
type Attachment = { id: string; filename: string }
type Review = { id: string; status: string }
type Context = ReturnType<typeof useAlixConversationContext<Message, Attachment, Review>>
let context: Context
let root: Root
let host: HTMLDivElement

function Harness({ initial = { sessionId: 'a', clienteId: 'cliente-a' } }: { initial?: { sessionId: string | null; clienteId: string | null } }) {
  context = useAlixConversationContext<Message, Attachment, Review>(() => initial)
  return <output>{context.activeSessionId}:{context.input}</output>
}

function edit(label: string) {
  context.setInput(`Rascunho ${label}`)
  context.setAttachments([{ id: `documento-${label}`, filename: `${label}.pdf` }])
  context.setDocumentReviews([{ id: `revisao-${label}`, status: 'pending' }])
}

function expectDraft(label: string) {
  expect(context.input).toBe(`Rascunho ${label}`)
  expect(context.attachments).toEqual([{ id: `documento-${label}`, filename: `${label}.pdf` }])
  expect(context.documentReviews).toEqual([{ id: `revisao-${label}`, status: 'pending' }])
}

function expectEmptyDraft() {
  expect(context.input).toBe('')
  expect(context.attachments).toEqual([])
  expect(context.documentReviews).toEqual([])
}

beforeEach(async () => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root.render(<Harness />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('Rascunhos da ALIX por conversa, somente em memória', () => {
  it('restaura rascunho, anexos e revisões ao voltar, sem mostrar os dados na outra sessão', async () => {
    await act(async () => {
      edit('A')
      context.setMessages([{ id: 'local-a', content: 'Histórico de A' }])
      expect(context.switchSession('b', 'cliente-b')).toBe(true)
    })
    expectEmptyDraft()
    expect(context.messages).toEqual([])
    await act(async () => { edit('B'); context.switchSession('a', 'cliente-a') })
    expectDraft('A')
    expect(context.messages).toEqual([])
    await act(async () => context.switchSession('b'))
    expect(context.activeClienteId).toBe('cliente-b')
    expectDraft('B')
  })

  it('guarda a edição mais recente mesmo com atualizações funcionais e trocas no mesmo evento', async () => {
    await act(async () => {
      context.setInput('um')
      context.setInput(previous => `${previous} dois`)
      context.setAttachments(previous => [...previous, { id: '1', filename: '1.pdf' }])
      context.setAttachments(previous => [...previous, { id: '2', filename: '2.pdf' }])
      context.switchSession('b')
      context.setInput('B')
      context.switchSession('a')
    })
    expect(context.input).toBe('um dois')
    expect(context.attachments.map(item => item.id)).toEqual(['1', '2'])
    await act(async () => context.switchSession('b'))
    expect(context.input).toBe('B')
  })

  it('mantém a conversa sem ID como rascunho próprio ao visitar outras sessões', async () => {
    await act(async () => context.switchSession(null))
    expect(context.activeClienteId).toBeNull()
    await act(async () => {
      edit('nova')
      expect(context.switchSession(null)).toBe(false)
      context.switchSession('a')
    })
    expectEmptyDraft()
    await act(async () => { edit('A'); context.switchSession(null) })
    expectDraft('nova')
    await act(async () => context.switchSession('a'))
    expectDraft('A')
  })

  it('selecionar a mesma sessão não altera seu rascunho nem a revisão de navegação', async () => {
    await act(async () => edit('A'))
    const version = context.captureContext()
    await act(async () => expect(context.switchSession('a', 'cliente-a')).toBe(false))
    expectDraft('A')
    expect(context.isCurrentContext(version)).toBe(true)
  })

  it('mantém rascunhos separados quando a mesma sessão troca de cliente', async () => {
    await act(async () => { edit('cliente-a'); context.setActiveClienteId('cliente-b') })
    expectEmptyDraft()
    await act(async () => { edit('cliente-b'); context.setActiveClienteId('cliente-a') })
    expectDraft('cliente-a')
    await act(async () => context.setActiveClienteId(previous => previous === 'cliente-a' ? 'cliente-b' : null))
    expectDraft('cliente-b')
  })

  it('cliente explicitamente nulo não recebe os documentos do cliente salvo', async () => {
    await act(async () => { edit('A'); context.switchSession('b') })
    await act(async () => context.switchSession('a', null))
    expect(context.activeClienteId).toBeNull()
    expectEmptyDraft()
    await act(async () => context.setActiveClienteId('cliente-a'))
    expectDraft('A')
  })

  it('a atribuição inicial do cliente não invalida a leitura do histórico da sessão', async () => {
    const version = context.captureContext()
    await act(async () => {
      context.setActiveClienteId('cliente-confirmado')
      if (context.isCurrentContext(version)) context.setMessages([{ id: 'remota', content: 'Histórico confirmado' }])
    })
    expect(context.isCurrentContext(version)).toBe(true)
    expect(context.messages[0]?.id).toBe('remota')
  })

  it('retry do histórico preserva o texto digitado antes de conhecer o cliente, sem migrar documentos', async () => {
    await act(async () => root.render(null))
    await act(async () => root.render(<Harness initial={{ sessionId: 'a', clienteId: null }} />))
    await act(async () => edit('antes-do-GET'))
    const version = context.captureContext()
    await act(async () => {
      context.hydrateClienteId('cliente-a')
      if (context.isCurrentContext(version)) context.setMessages([{ id: 'remota', content: 'Histórico confirmado' }])
    })
    expect(context.input).toBe('Rascunho antes-do-GET')
    expect(context.activeClienteId).toBe('cliente-a')
    expect(context.attachments).toEqual([])
    expect(context.documentReviews).toEqual([])
    expect(context.messages[0]?.id).toBe('remota')
    expect(context.isCurrentContext(version)).toBe(true)
    await act(async () => context.setActiveClienteId(null))
    expect(context.input).toBe('')
    expect(context.attachments[0]?.id).toBe('documento-antes-do-GET')
    expect(context.documentReviews[0]?.id).toBe('revisao-antes-do-GET')
  })

  it('a hidratação não transfere texto de um escopo nulo explicitamente escolhido', async () => {
    await act(async () => root.render(null))
    await act(async () => root.render(<Harness initial={{ sessionId: 'a', clienteId: null }} />))
    await act(async () => { context.setActiveClienteId(null); edit('sem-cliente') })
    await act(async () => context.hydrateClienteId('cliente-a'))
    expectEmptyDraft()
    await act(async () => context.setActiveClienteId(null))
    expectDraft('sem-cliente')
  })

  it('retoma a hidratação desconhecida após visitar outra conversa e confirmar o cliente no GET', async () => {
    await act(async () => root.render(null))
    await act(async () => root.render(<Harness initial={{ sessionId: 'a', clienteId: null }} />))
    await act(async () => { context.setInput('Texto antes da falha'); context.switchSession('b'); context.switchSession('a') })
    await act(async () => context.hydrateClienteId('cliente-a'))
    expect(context.input).toBe('Texto antes da falha')
    expect(context.activeClienteId).toBe('cliente-a')
  })

  it('edições e hidratação mantêm as funções estáveis para não reiniciar efeitos de histórico', async () => {
    const before = context
    await act(async () => { edit('A'); context.hydrateClienteId('cliente-a') })
    await act(async () => context.setActiveClienteId('cliente-b'))
    expect(context.setInput).toBe(before.setInput)
    expect(context.setMessages).toBe(before.setMessages)
    expect(context.setAttachments).toBe(before.setAttachments)
    expect(context.setDocumentReviews).toBe(before.setDocumentReviews)
    expect(context.setActiveClienteId).toBe(before.setActiveClienteId)
    expect(context.hydrateClienteId).toBe(before.hydrateClienteId)
    expect(context.setActiveSessionId).toBe(before.setActiveSessionId)
    expect(context.switchSession).toBe(before.switchSession)
  })

  it('migra a conversa nova para o ID do servidor durante o trabalho sem duplicar o rascunho', async () => {
    await act(async () => context.switchSession(null))
    await act(async () => { context.setActiveClienteId('cliente-novo'); edit('nova') })
    const version = context.captureContext()
    await act(async () => {
      expect(context.beginWork('files')).toBe(true)
      context.setMessages([{ id: 'local', content: 'Mensagem em envio' }])
      context.setActiveSessionId('criada-no-servidor')
    })
    expect(context.activeSessionId).toBe('criada-no-servidor')
    expect(context.activeClienteId).toBe('cliente-novo')
    expect(context.messages[0]?.id).toBe('local')
    expect(context.isCurrentContext(version)).toBe(true)
    expect(context.working).toBe(true)
    expectDraft('nova')
    await act(async () => { context.finishWork(); context.switchSession(null) })
    expectEmptyDraft()
    expect(context.activeClienteId).toBeNull()
    await act(async () => context.switchSession('criada-no-servidor'))
    expectDraft('nova')
    expect(context.activeClienteId).toBe('cliente-novo')
  })

  it('atribuir ID novo à mesma conversa preserva o contrato de contexto existente', async () => {
    await act(async () => edit('A'))
    const version = context.captureContext()
    await act(async () => context.setActiveSessionId(previous => `${previous}-servidor`))
    expect(context.activeSessionId).toBe('a-servidor')
    expect(context.isCurrentContext(version)).toBe(true)
    expectDraft('A')
  })

  it('um ID já visitado restaura sua própria conversa e nunca recebe os anexos da origem', async () => {
    await act(async () => { edit('A'); context.switchSession('b', 'cliente-b'); edit('B'); context.switchSession('a') })
    const version = context.captureContext()
    await act(async () => context.setActiveSessionId('b'))
    expect(context.activeSessionId).toBe('b')
    expectDraft('B')
    expect(context.isCurrentContext(version)).toBe(false)
    await act(async () => context.switchSession('a'))
    expectDraft('A')
  })

  it('o bloqueio de trabalho impede navegação, troca de cliente e adoção de outra sessão conhecida', async () => {
    await act(async () => { context.switchSession('b'); context.switchSession('a'); edit('A') })
    await act(async () => {
      expect(context.beginWork('reply')).toBe(true)
      expect(context.beginWork('files')).toBe(false)
      expect(context.switchSession('b')).toBe(false)
      context.setActiveClienteId('cliente-b')
      context.setActiveSessionId('b')
    })
    expect(context.activeSessionId).toBe('a')
    expect(context.activeClienteId).toBe('cliente-a')
    expectDraft('A')
    await act(async () => { context.finishWork(); expect(context.switchSession('b')).toBe(true) })
    expect(context.working).toBe(false)
  })

  it('aplica a alteração confirmada de cliente ainda dentro do trabalho de sessão', async () => {
    await act(async () => edit('cliente-a'))
    const version = context.captureContext()
    await act(async () => {
      expect(context.beginWork('session')).toBe(true)
      context.setActiveClienteId('cliente-b')
      expect(context.switchSession('b')).toBe(false)
    })
    expect(context.activeClienteId).toBe('cliente-b')
    expect(context.working).toBe(true)
    expect(context.isCurrentContext(version)).toBe(true)
    expectEmptyDraft()
    await act(async () => { context.finishWork(); context.setActiveClienteId('cliente-a') })
    expectDraft('cliente-a')
  })

  it('resposta tardia com ID de servidor continua inválida após A → B → A', async () => {
    const assignFromOldRequest = context.setActiveSessionId
    const version = context.captureContext()
    await act(async () => { edit('A'); context.switchSession('b'); context.switchSession('a') })
    await act(async () => assignFromOldRequest('id-atrasado'))
    expect(context.activeSessionId).toBe('a')
    expect(context.isCurrentContext(version)).toBe(false)
    expectDraft('A')
  })

  it('a criação preserva outros rascunhos de cliente na conversa sem ID', async () => {
    await act(async () => context.switchSession(null))
    await act(async () => { edit('sem-cliente'); context.setActiveClienteId('cliente-novo'); edit('com-cliente') })
    await act(async () => context.setActiveSessionId('criada'))
    await act(async () => context.switchSession(null))
    expect(context.activeClienteId).toBeNull()
    expectDraft('sem-cliente')
    await act(async () => context.switchSession('criada'))
    expectDraft('com-cliente')
  })

  it('não usa storage e descarta todos os rascunhos ao desmontar a área React', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    const storageRead = vi.spyOn(Storage.prototype, 'getItem')
    await act(async () => { edit('confidencial'); context.switchSession('b'); edit('B') })
    await act(async () => root.render(null))
    await act(async () => root.render(<Harness />))
    expectEmptyDraft()
    await act(async () => context.switchSession('b'))
    expectEmptyDraft()
    expect(storageWrite).not.toHaveBeenCalled()
    expect(storageRead).not.toHaveBeenCalled()
  })
})
