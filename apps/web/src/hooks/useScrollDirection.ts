/**
 * useScrollDirection — detecta direção do scroll para auto-hide de header.
 *
 * Retorna 'up' | 'down' | null (quando no topo).
 */
import { useState, useEffect, useRef } from 'react'

export function useScrollDirection(threshold = 10) {
  const [direction, setDirection] = useState<'up' | 'down' | null>(null)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    const update = () => {
      const scrollY = window.scrollY

      if (Math.abs(scrollY - lastScrollY.current) < threshold) {
        ticking.current = false
        return
      }

      // No topo: sempre mostra
      if (scrollY < threshold) {
        setDirection(null)
      } else {
        setDirection(scrollY > lastScrollY.current ? 'down' : 'up')
      }

      lastScrollY.current = scrollY
      ticking.current = false
    }

    const onScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(update)
        ticking.current = true
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return direction
}
