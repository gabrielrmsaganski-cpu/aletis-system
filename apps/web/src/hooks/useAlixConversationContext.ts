import { useCallback, useRef, useState, type SetStateAction } from 'react'

interface ConversationDraft<Attachment, Review> {
  input: string
  attachments: Attachment[]
  documentReviews: Review[]
}

interface ConversationState<Message, Attachment, Review> extends ConversationDraft<Attachment, Review> {
  activeSessionId: string | null
  activeClienteId: string | null
  messages: Message[]
}

function resolveUpdate<Value>(update: SetStateAction<Value>, previous: Value): Value {
  return typeof update === 'function' ? (update as (value: Value) => Value)(previous) : update
}

/** Uma conversa mantém seu contexto durante a operação inteira, inclusive após o primeiro token. */
export function useAlixConversationContext<Message, Attachment, Review>(initial: () => { sessionId: string | null; clienteId: string | null }) {
  type Draft = ConversationDraft<Attachment, Review>
  type State = ConversationState<Message, Attachment, Review>
  const emptyDraft = (): Draft => ({ input: '', attachments: [], documentReviews: [] })
  const [state, setState] = useState<State>(() => {
    const context = initial()
    return { activeSessionId: context.sessionId, activeClienteId: context.clienteId, messages: [], ...emptyDraft() }
  })
  const stateRef = useRef(state)
  const clienteHydrationPendingRef = useRef(state.activeSessionId !== null && state.activeClienteId === null)
  // Os documentos e rascunhos existem apenas nesta montagem React, separados também por cliente.
  const draftsRef = useRef(new Map<string | null, { clienteId: string | null; hydrationPending: boolean; scopes: Map<string | null, Draft> }>())
  const [work, setWork] = useState<'reply' | 'files' | 'session' | null>(null)
  const workRef = useRef<'reply' | 'files' | 'session' | null>(null)
  const revision = useRef(0)

  const commit = useCallback((next: State) => {
    // A referência acompanha até edições e navegações agrupadas no mesmo evento.
    stateRef.current = next
    setState(next)
  }, [])
  const saveDraft = useCallback((current: State) => {
    const cached = draftsRef.current.get(current.activeSessionId) ?? { clienteId: current.activeClienteId, hydrationPending: clienteHydrationPendingRef.current, scopes: new Map<string | null, Draft>() }
    cached.clienteId = current.activeClienteId
    cached.hydrationPending = clienteHydrationPendingRef.current
    cached.scopes.set(current.activeClienteId, { input: current.input, attachments: current.attachments, documentReviews: current.documentReviews })
    draftsRef.current.set(current.activeSessionId, cached)
  }, [])
  const updateField = useCallback(<Key extends 'messages' | 'attachments' | 'documentReviews' | 'input'>(key: Key, update: SetStateAction<State[Key]>) => {
    const current = stateRef.current
    const value = resolveUpdate(update, current[key])
    if (!Object.is(value, current[key])) commit({ ...current, [key]: value })
  }, [commit])
  const setMessages = useCallback((update: SetStateAction<Message[]>) => updateField('messages', update), [updateField])
  const setAttachments = useCallback((update: SetStateAction<Attachment[]>) => updateField('attachments', update), [updateField])
  const setDocumentReviews = useCallback((update: SetStateAction<Review[]>) => updateField('documentReviews', update), [updateField])
  const setInput = useCallback((update: SetStateAction<string>) => updateField('input', update), [updateField])

  const beginWork = useCallback((kind: 'reply' | 'files' | 'session') => {
    if (workRef.current) return false
    workRef.current = kind
    setWork(kind)
    return true
  }, [])
  const finishWork = useCallback(() => { workRef.current = null; setWork(null) }, [])
  const isWorking = useCallback(() => workRef.current !== null, [])
  const switchSession = useCallback((sessionId: string | null, clienteId?: string | null) => {
    const current = stateRef.current
    if (workRef.current || current.activeSessionId === sessionId) return false
    saveDraft(current)
    const cached = draftsRef.current.get(sessionId)
    const nextClienteId = clienteId === undefined ? cached?.clienteId ?? null : clienteId
    const draft = cached?.scopes.get(nextClienteId) ?? emptyDraft()
    clienteHydrationPendingRef.current = sessionId !== null && nextClienteId === null && clienteId === undefined && (cached?.hydrationPending ?? true)
    revision.current += 1
    commit({ activeSessionId: sessionId, activeClienteId: nextClienteId, messages: [], ...draft })
    return true
  }, [commit, saveDraft])

  const changeCliente = useCallback((clienteId: string | null, hydrate: boolean) => {
    const current = stateRef.current
    // O PATCH confirmado do cliente usa o bloqueio de sessão até o finally do chamador.
    if (workRef.current && workRef.current !== 'session') return
    if (clienteId === current.activeClienteId) {
      clienteHydrationPendingRef.current = false
      return
    }
    const preserveInput = hydrate && clienteHydrationPendingRef.current && current.activeClienteId === null
    saveDraft(current)
    const cached = draftsRef.current.get(current.activeSessionId)!
    let draft = cached.scopes.get(clienteId) ?? emptyDraft()
    if (preserveInput && current.input && !draft.input) {
      draft = { ...draft, input: current.input }
      const source = cached.scopes.get(null)!
      cached.scopes.set(null, { ...source, input: '' })
    }
    clienteHydrationPendingRef.current = false
    // O histórico pertence à sessão; os documentos locais pertencem também ao cliente selecionado.
    commit({ ...current, activeClienteId: clienteId, ...draft })
  }, [commit, saveDraft])
  const setActiveClienteId = useCallback((update: SetStateAction<string | null>) => {
    changeCliente(resolveUpdate(update, stateRef.current.activeClienteId), false)
  }, [changeCliente])
  // O GET pode confirmar o cliente depois de uma falha inicial; só o texto não enviado acompanha essa descoberta.
  const hydrateClienteId = useCallback((clienteId: string | null) => changeCliente(clienteId, true), [changeCliente])

  const contextVersion = revision.current
  const setActiveSessionId = useCallback((update: SetStateAction<string | null>) => {
    // Uma resposta de uma navegação anterior não pode adotar a conversa atualmente aberta.
    if (revision.current !== contextVersion) return
    const current = stateRef.current
    const sessionId = resolveUpdate(update, current.activeSessionId)
    if (sessionId === current.activeSessionId) return
    if (sessionId === null || draftsRef.current.has(sessionId)) {
      // Um ID já conhecido representa outra conversa, nunca um destino para copiar documentos.
      switchSession(sessionId)
      return
    }
    saveDraft(current)
    const source = draftsRef.current.get(current.activeSessionId)!
    const draft = source.scopes.get(current.activeClienteId)!
    source.scopes.delete(current.activeClienteId)
    if (!source.scopes.size) draftsRef.current.delete(current.activeSessionId)
    else source.clienteId = source.scopes.keys().next().value ?? null
    clienteHydrationPendingRef.current = false
    draftsRef.current.set(sessionId, { clienteId: current.activeClienteId, hydrationPending: false, scopes: new Map([[current.activeClienteId, draft]]) })
    // A criação no servidor mantém a mesma operação e seus tokens de contexto válidos.
    commit({ ...current, activeSessionId: sessionId })
  }, [contextVersion, commit, saveDraft, switchSession])
  const captureContext = useCallback(() => revision.current, [])
  const isCurrentContext = useCallback((version: number) => revision.current === version, [])

  return {
    ...state, setActiveSessionId, setActiveClienteId, hydrateClienteId,
    setMessages, setAttachments, setDocumentReviews, setInput,
    working: work !== null, work, beginWork, finishWork, isWorking, switchSession, captureContext, isCurrentContext,
  }
}
