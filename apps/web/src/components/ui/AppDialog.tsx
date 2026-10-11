import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Maximize2, Minimize2, X } from 'lucide-react'
import { uiDialog, uiText } from './foundation'

type DialogSize = 'md' | 'lg' | 'xl' | 'full'

interface AppDialogProps {
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: ReactNode
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  headerActions?: ReactNode
  onClose: () => void
  size?: DialogSize
  collapsible?: boolean
  closeOnBackdrop?: boolean
  className?: string
  bodyClassName?: string
  footerClassName?: string
}

const SIZE_CLASS: Record<DialogSize, string> = {
  md: 'md:max-w-2xl',
  lg: 'md:max-w-4xl',
  xl: 'md:max-w-6xl',
  full: 'md:max-w-[min(1480px,calc(100vw-2rem))]',
}

export default function AppDialog({
  title,
  subtitle,
  eyebrow,
  icon,
  children,
  footer,
  headerActions,
  onClose,
  size = 'xl',
  collapsible = true,
  closeOnBackdrop = true,
  className = '',
  bodyClassName = '',
  footerClassName = '',
}: AppDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => { setMounted(true) }, [])
  useDialogFocus(panelRef, mounted, collapsed, onClose)


  if (!mounted) return null

  if (collapsed) {
    return createPortal(
      <div className={uiDialog.collapsedWrap}>
        <div className={uiDialog.collapsedPanel}>
          <div className="flex items-center gap-3 px-4 py-3">
            {icon && (
              <span className={uiDialog.miniIconFrame}>
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {eyebrow && (
                <p className={`truncate ${uiText.eyebrow}`}>
                  {eyebrow}
                </p>
              )}
              <p className="truncate font-display text-sm font-semibold text-foreground dark:text-aletis-cream">
                {title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className={uiDialog.iconButton}
              aria-label="Restaurar janela"
              title="Restaurar janela"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className={uiDialog.iconButton}
              aria-label="Fechar janela"
              title="Fechar janela"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  const expandedClass = expanded
    ? 'md:max-w-none md:h-[calc(100dvh-1rem)] md:w-[calc(100vw-1rem)]'
    : `${SIZE_CLASS[size]} md:max-h-[min(92dvh,980px)]`

  return createPortal(
    <div
      className={uiDialog.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`
          ${uiDialog.panel} ${expandedClass} ${className}
        `}
      >
        <header className={uiDialog.header}>
          {icon && (
            <span className={uiDialog.iconFrame}>
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className={`truncate ${uiText.eyebrow}`}>
                {eyebrow}
              </p>
            )}
            <h2
              id={titleId}
              className={`truncate ${uiText.title}`}
            >
              {title}
            </h2>
            {subtitle && (
              <p className={`mt-0.5 line-clamp-2 ${uiText.subtitle}`}>
                {subtitle}
              </p>
            )}
          </div>
          {headerActions && (
            <div className="hidden shrink-0 items-center gap-2 md:flex">{headerActions}</div>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {collapsible && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className={uiDialog.iconButton}
                aria-label="Recolher janela"
                title="Recolher janela"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className={`${uiDialog.iconButton} hidden md:inline-flex`}
              aria-label={expanded ? 'Reduzir janela' : 'Expandir janela'}
              title={expanded ? 'Reduzir janela' : 'Expandir janela'}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={uiDialog.iconButton}
              aria-label="Fechar janela"
              title="Fechar janela"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className={`${uiDialog.body} ${bodyClassName}`}>
          {children}
        </div>

        {footer && (
          <footer
            className={`${uiDialog.footer} ${footerClassName}`}
          >
            {footer}
          </footer>
        )}
      </section>
    </div>,
    document.body,
  )
}
