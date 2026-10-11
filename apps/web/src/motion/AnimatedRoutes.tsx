/**
 * AnimatedRoutes — transições de rota com Framer Motion AnimatePresence.
 *
 * Elimina o "piscar" entre navegações aplicando fade + slide suave
 * em toda troca de página. Integrado no Layout principal.
 */
import { useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pageTransition, accessibleVariants } from './tokens'

interface AnimatedRoutesProps {
  children: ReactNode
  /** Desabilita animação de slide vertical (apenas fade) */
  fadeOnly?: boolean
  /** Chave customizada para controle de re-render */
  routeKey?: string
}

export default function AnimatedRoutes({
  children,
  fadeOnly = true,
  routeKey,
}: AnimatedRoutesProps) {
  const location = useLocation()
  // A query string configura a tela atual (abas, filtros, sistema etc.) e não
  // representa uma nova página. Incluí-la na chave desmontava toda a árvore a
  // cada troca de aba e, com isso, apagava estados de formulários ainda abertos.
  const key = routeKey ?? location.pathname
  const variants = accessibleVariants(
    fadeOnly
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } },
          exit: { opacity: 0, transition: { duration: 0.08 } },
        }
      : pageTransition
  )

  // Usamos ref para evitar re-trigger em StrictMode
  const hasRendered = useRef(false)
  const skipInitial = hasRendered.current
  hasRendered.current = true

  return (
    <AnimatePresence mode="wait" initial={!skipInitial}>
      <motion.div
        key={key}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-w-0"
        style={{ originX: 0.5, originY: 0 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
