import { useState, useCallback, useRef } from 'react'

export interface ToastItem {
  id: number
  message: string
  type: 'info' | 'success' | 'warning'
}

let nextId = 1

export function useToast(duration = 3000) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, type: ToastItem['type'] = 'info') => {
      const id = nextId++
      const toast: ToastItem = { id, message, type }
      setToasts((prev) => [...prev, toast])

      const timer = setTimeout(() => {
        dismiss(id)
      }, duration)
      timersRef.current.set(id, timer)

      return id
    },
    [duration, dismiss],
  )

  return { toasts, show, dismiss }
}
