import { useCallback, useLayoutEffect, useRef, useState } from 'react'

interface ConversationScrollOptions {
  conversationKey: string | null
  /** Mude apenas quando o conteúdo da conversa mudar; pode ser a referência de messages. */
  contentVersion: unknown
  isTyping: boolean
  /** Boas-vindas de uma conversa vazia começam no topo, mesmo quando são altas. */
  isEmpty?: boolean
  /** Abas ocultas com display:none não têm medidas de rolagem utilizáveis. */
  active?: boolean
}

const BOTTOM_THRESHOLD = 48

/** Acompanha a resposta enquanto o usuário estiver no fim, sem disputar a leitura do histórico. */
export function useAlixConversationScroll({
  conversationKey, contentVersion, isTyping, isEmpty = false, active = true,
}: ConversationScrollOptions) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const activeRef = useRef(active)
  const emptyRef = useRef(isEmpty)
  const pendingTopRef = useRef(isEmpty)
  const readingTopRef = useRef(0)
  const previousRef = useRef({ conversationKey, contentVersion, active, isEmpty })
  const [hasNewContent, setHasNewContent] = useState(false)
  const [isFollowing, setIsFollowing] = useState(true)

  const positionConversation = useCallback((restoreReadingPosition = false) => {
    const viewport = scrollRef.current
    if (!activeRef.current || !viewport || viewport.clientHeight <= 0) return
    if (emptyRef.current) {
      if (pendingTopRef.current) {
        viewport.scrollTop = 0
        pendingTopRef.current = false
      } else if (restoreReadingPosition) {
        viewport.scrollTop = readingTopRef.current
      }
      readingTopRef.current = viewport.scrollTop
      return
    }
    if (followingRef.current) {
      // Rolagem imediata evita que cada token reinicie uma animação ainda em andamento.
      viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
      setHasNewContent(false)
    } else if (restoreReadingPosition) {
      viewport.scrollTop = readingTopRef.current
    }
    // Em resize, quem está lendo acima mantém a ancoragem nativa do navegador.
    readingTopRef.current = viewport.scrollTop
  }, [])

  const onScroll = useCallback(() => {
    const viewport = scrollRef.current
    if (!activeRef.current || !viewport || viewport.clientHeight <= 0) return
    readingTopRef.current = viewport.scrollTop
    followingRef.current = emptyRef.current || viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= BOTTOM_THRESHOLD
    setIsFollowing(followingRef.current)
    if (followingRef.current) setHasNewContent(false)
  }, [])

  const scrollToLatest = useCallback(() => {
    followingRef.current = true
    setIsFollowing(true)
    setHasNewContent(false)
    positionConversation()
  }, [positionConversation])

  useLayoutEffect(() => {
    const previous = previousRef.current
    const switched = previous.conversationKey !== conversationKey
    const contentChanged = !Object.is(previous.contentVersion, contentVersion)
    activeRef.current = active
    emptyRef.current = isEmpty
    if (!isEmpty) pendingTopRef.current = false
    else if (switched || !previous.isEmpty) pendingTopRef.current = true

    if (switched) {
      followingRef.current = true
      setIsFollowing(true)
      readingTopRef.current = 0
      setHasNewContent(false)
    } else if (contentChanged && !followingRef.current) {
      setHasNewContent(true)
    }

    positionConversation(!previous.active && active && !switched)
    previousRef.current = { conversationKey, contentVersion, active, isEmpty }
  }, [conversationKey, contentVersion, isTyping, active, isEmpty, positionConversation])

  useLayoutEffect(() => {
    const onResize = () => positionConversation()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize)
    if (scrollRef.current) observer?.observe(scrollRef.current)
    if (contentRef.current) observer?.observe(contentRef.current)
    window.addEventListener('resize', onResize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [conversationKey, active, positionConversation])

  return { scrollRef, contentRef, onScroll, hasNewContent, isFollowing, scrollToLatest }
}
