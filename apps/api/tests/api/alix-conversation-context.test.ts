// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import { useAlixConversationContext } from '../../../web/src/hooks/useAlixConversationContext'

type Message = { id: string; content: string }
type Attachment = { id: string; uploading: boolean }
type Review = { id: string }
let context: ReturnType<typeof useAlixConversationContext<Message, Attachment, Review>>
let root: ReturnType<typeof createRoot>
let element: HTMLDivElement
function Conversation() {
  context = useAlixConversationContext<Message, Attachment, Review>(() => ({ sessionId: 'a', clienteId: 'cliente-a' }))
  return React.createElement('output', null, JSON.stringify({ sessionId: context.activeSessionId, clienteId: context.activeClienteId, messages: context.messages, attachments: context.attachments, reviews: context.documentReviews, input: context.input, working: context.working }))
}
beforeEach(async () => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
  await act(async () => root.render(React.createElement(Conversation)))
})
afterEach(async () => { await act(async () => root.unmount()); element.remove() })

it('trocar A por B remove perguntas locais, tokens, anexos, revisões e rascunho de A', async () => {
  await act(async () => {
    context.setMessages([{ id: 'local-u-1', content: 'Pergunta de A' }, { id: 'stream-1', content: 'Resposta parcial de A' }])
    context.setAttachments([{ id: 'arquivo-a', uploading: false }])
    context.setDocumentReviews([{ id: 'revisao-a' }])
    context.setInput('Rascunho de A')
  })
  await act(async () => { expect(context.switchSession('b', 'cliente-b')).toBe(true) })
  expect(JSON.parse(element.textContent!)).toEqual({ sessionId: 'b', clienteId: 'cliente-b', messages: [], attachments: [], reviews: [], input: '', working: false })
  await act(async () => context.setMessages([{ id: 'persistida-b', content: 'Mensagem de B' }]))
  expect(element.textContent).toContain('Mensagem de B')
  expect(element.textContent).not.toContain('de A')
})

it('o primeiro token não libera troca de conversa nem permite um segundo envio síncrono', async () => {
  await act(async () => {
    expect(context.beginWork('reply')).toBe(true)
    expect(context.beginWork('reply')).toBe(false)
    expect(context.switchSession('b', 'cliente-b')).toBe(false)
  })
  await act(async () => context.setMessages([{ id: 'stream-1', content: 'Primeiro token' }]))
  await act(async () => {
    expect(context.isWorking()).toBe(true)
    expect(context.switchSession(null)).toBe(false)
    expect(context.beginWork('session')).toBe(false)
    expect(context.beginWork('files')).toBe(false)
  })
  expect(context.activeSessionId).toBe('a')
  await act(async () => { context.finishWork(); expect(context.switchSession('b')).toBe(true) })
  expect(context.activeSessionId).toBe('b')
  expect(context.activeClienteId).toBeNull()
  expect(context.messages).toEqual([])
})

it('o preparo e envio de arquivos bloqueiam mudança até a liberação em finally', async () => {
  await act(async () => {
    expect(context.beginWork('files')).toBe(true)
    expect(context.switchSession('b')).toBe(false)
  })
  await act(async () => {
    try { throw new Error('falha de envio simulada') } catch { /* A interface apresentará a falha no anexo. */ } finally { context.finishWork() }
    expect(context.switchSession('b', null)).toBe(true)
  })
  expect(context.working).toBe(false)
  expect(context.activeClienteId).toBeNull()
})

it('respostas tardias de A continuam inválidas mesmo após navegar A → B → A', async () => {
  const previous = context.captureContext()
  await act(async () => { context.switchSession('b', 'cliente-b') })
  await act(async () => { context.switchSession('a', 'cliente-a') })
  expect(context.isCurrentContext(previous)).toBe(false)
  const current = context.captureContext()
  await act(async () => context.setActiveSessionId('id-atribuido-pelo-servidor'))
  expect(context.isCurrentContext(current)).toBe(true)
})

it('nova conversa sem sessão não herda o cliente anterior; clicar na mesma sessão não apaga o rascunho', async () => {
  await act(async () => context.setInput('Rascunho em edição'))
  await act(async () => { expect(context.switchSession('a', 'cliente-a')).toBe(false) })
  expect(context.input).toBe('Rascunho em edição')
  await act(async () => { context.switchSession(null) })
  expect(context.activeSessionId).toBeNull()
  expect(context.activeClienteId).toBeNull()
  expect(context.input).toBe('')
})
