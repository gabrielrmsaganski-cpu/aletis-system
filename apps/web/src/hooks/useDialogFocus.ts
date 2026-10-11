import { useEffect, useRef, type RefObject } from 'react'

/** Foco e teclado compartilhados pelas duas APIs de janela existentes. */
export function useDialogFocus(panelRef: RefObject<HTMLElement>, mounted: boolean, collapsed: boolean, onClose: () => void) {
  const triggerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => { triggerRef.current?.focus() }
  }, [])

  useEffect(() => {
    if (!mounted || collapsed) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => {
      const panel = panelRef.current
      // Não roubar foco se o usuário já alcançou um controle durante a abertura.
      if (panel && !panel.contains(document.activeElement)) panel.focus()
    }, 20)
    return () => { document.body.style.overflow = previous; window.clearTimeout(timer) }
  }, [mounted, collapsed, panelRef])

  useEffect(() => {
    if (!mounted || collapsed) return
    const onKey = (event: KeyboardEvent) => {
      const panel = panelRef.current
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      if (!panel || dialogs[dialogs.length - 1] !== panel || event.defaultPrevented) return
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key !== 'Tab') return
      const controls = [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[hidden], [inert]'))
      const first = controls[0], last = controls[controls.length - 1]
      if (!first) { event.preventDefault(); panel.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, collapsed, onClose, panelRef])
}
