import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortalUploadTransport, PortalUploadQueue, type PortalUploadItem } from './PortalUploadQueue'
import type { PendenciaDTO, UploadDTO } from './types'

export function usePortalUploadQueue(token: string, onReceived: (upload: UploadDTO) => void) {
  const queue = useRef<PortalUploadQueue | null>(null)
  const received = useRef(onReceived)
  received.current = onReceived
  const [items, setItems] = useState<PortalUploadItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    setItems([])
    setNotice(null)
    const current = new PortalUploadQueue(createPortalUploadTransport(token), setItems, upload => received.current(upload))
    queue.current = current
    return () => { current.dispose(); if (queue.current === current) queue.current = null }
  }, [token])

  const enqueue = useCallback((files: File[], request?: PendenciaDTO, categoria?: PendenciaDTO['categoria']) => {
    setNotice(queue.current?.enqueue(files, request, categoria) || null)
  }, [])
  const busy = items.some(item => item.status === 'enviando' || item.status === 'aguardando')
  useEffect(() => {
    if (!busy) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [busy])
  return { items, notice, busy, enqueue, retry: (id: string) => queue.current?.retry(id), remove: (id: string) => queue.current?.remove(id), clearReceived: () => queue.current?.clearReceived() }
}

export type PortalUploadQueueControls = ReturnType<typeof usePortalUploadQueue>
