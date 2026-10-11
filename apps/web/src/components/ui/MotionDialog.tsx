import { useDialogFocus } from '../../hooks/useDialogFocus'
/**
 * MotionDialog — evolução do AppDialog com Framer Motion.
 *
 * Features:
 *   - Abertura com spring physics (scale + fade)
 *   - AnimatePresence para enter/exit suaves
 *   - Collapse animado para minimizar
 *   - Swipe-to-dismiss no mobile (drag="y" + dragConstraints)
 *   - Resize handle visual
 *   - Respeita prefers-reduced-motion
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { motion, PanInfo } from 'framer-motion'
import { ChevronDown, ChevronUp, Maximize2, Minimize2, X } from 'lucide-react'
import { scaleIn, accessibleVariants } from '../../motion/tokens'
import { uiDialog, uiText } from './foundation'

type DialogSize = 'md' | 'lg' | 'xl' | 'full'

interface MotionDialogProps {
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
  swipeToDismiss?: boolean
  showResizeHandle?: boolean
}

const SIZE_CLASS: Record<DialogSize, string> = {
  md: 'md:max-w-2xl',
  lg: 'md:max-w-4xl',
  xl: 'md:max-w-6xl',
  full: 'md:max-w-[min(1480px,calc(100vw-2rem))]',
}

export default function MotionDialog({
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
  swipeToDismiss = true,
  showResizeHandle = false,
}: MotionDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])
  useDialogFocus(panelRef, mounted, collapsed, onClose)

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (swipeToDismiss && info.offset.y > 120 && info.velocity.y > 300) {
      onClose()
    }
  }

  if (!mounted) return null

  return createPortal(
    <>
      {collapsed ? (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          className={uiDialog.collapsedWrap}
        >
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
        </motion.div>
      ) : (
        <motion.div
          key="open"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={uiDialog.overlay}
          role="presentation"
          onMouseDown={(event) => {
            if (closeOnBackdrop && event.target === event.currentTarget) onClose()
          }}
        >
          <motion.section
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            variants={accessibleVariants(scaleIn)}
            initial="hidden"
            animate="visible"
            exit="exit"
            drag={swipeToDismiss ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className={`
              ${uiDialog.panel}
              ${expanded ? 'md:max-w-none md:h-[calc(100dvh-1rem)] md:w-[calc(100vw-1rem)]' : `${SIZE_CLASS[size]} md:max-h-[min(92dvh,980px)]`}
              ${className}
            `}
          >
            {/* Drag handle indicator (mobile) */}
            {swipeToDismiss && (
              <div className="flex justify-center pt-2 pb-0 md:hidden">
                <div className="h-1.5 w-10 rounded-full bg-aletis-sage/30" />
              </div>
            )}

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
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    type="button"
                    onClick={() => setCollapsed(true)}
                    className={uiDialog.iconButton}
                    aria-label="Recolher janela"
                    title="Recolher janela"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  type="button"
                  onClick={() => setExpanded((prev) => !prev)}
                  className={`${uiDialog.iconButton} hidden md:inline-flex`}
                  aria-label={expanded ? 'Reduzir janela' : 'Expandir janela'}
                  title={expanded ? 'Reduzir janela' : 'Expandir janela'}
                >
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  type="button"
                  onClick={onClose}
                  className={uiDialog.iconButton}
                  aria-label="Fechar janela"
                  title="Fechar janela"
                >
                  <X className="h-4 w-4" />
                </motion.button>
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

            {/* Resize handle visual */}
            {showResizeHandle && (
              <div className="absolute bottom-1 right-1 hidden md:block">
                <div className="w-3 h-3 rounded-full bg-aletis-sage/20" />
              </div>
            )}
          </motion.section>
        </motion.div>
      )}
    </>,
    document.body,
  )
}
