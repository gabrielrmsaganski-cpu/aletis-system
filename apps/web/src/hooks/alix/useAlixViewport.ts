import { useLayoutEffect, useRef } from 'react'

/** Usa a altura visível real, inclusive ao abrir teclado e mudar o modo foco. */
export function useAlixViewport(active: boolean, focused: boolean) {
  const workspaceRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!active) return
    const element = workspaceRef.current
    if (!element) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const viewport = window.visualViewport
        const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight
        element.style.height = `${Math.max(240, Math.floor(bottom - element.getBoundingClientRect().top - 8))}px`
      })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (element.parentElement) observer?.observe(element.parentElement)
    const header = document.querySelector('#main-content')?.previousElementSibling
    if (header) observer?.observe(header)
    const settled = window.setTimeout(measure, 400)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(settled)
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
    }
  }, [active, focused])
  return workspaceRef
}
