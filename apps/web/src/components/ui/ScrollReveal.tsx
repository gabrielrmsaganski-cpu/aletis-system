/**
 * ScrollReveal — wrapper que anima filhos ao entrar no viewport.
 *
 * Combina IntersectionObserver com Framer Motion para
 * stagger automático em grids e listas.
 *
 * Uso:
 *   <ScrollReveal stagger>
 *     {items.map(item => <Card key={item.id} {...item} />)}
 *   </ScrollReveal>
 */
import { useRef } from 'react'
import { motion, useInView, type Variants } from 'framer-motion'
import { staggerContainer, staggerContainerSlow, staggerItem, accessibleVariants } from '../../motion/tokens'
import type { ReactNode } from 'react'

interface ScrollRevealProps {
  children: ReactNode
  /** Aplica stagger entre filhos */
  stagger?: boolean
  /** Stagger mais lento (para grandes seções) */
  staggerSlow?: boolean
  /** Delay antes de começar a animação (segundos) */
  delay?: number
  /** Margem do viewport (ex: "-50px", "10%") */
  margin?: string
  /** Só anima uma vez */
  once?: boolean
  /** Variants customizados */
  variants?: Variants
  /** Classe do container */
  className?: string
  /** Tag raiz */
  as?: keyof JSX.IntrinsicElements
}

export default function ScrollReveal({
  children,
  stagger = false,
  staggerSlow = false,
  delay = 0,
  margin = '-40px',
  once = true,
  variants,
  className = '',
  as: Tag = 'div',
}: ScrollRevealProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once, margin: margin as any })

  const containerVariants =
    variants ??
    accessibleVariants(
      staggerSlow ? staggerContainerSlow : stagger ? staggerContainer : staggerItem
    )

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={containerVariants}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Item individual para usar dentro de ScrollReveal com stagger */
export function ScrollRevealItem({
  children,
  className = '',
  variants,
}: {
  children: ReactNode
  className?: string
  variants?: Variants
}) {
  return (
    <motion.div
      variants={variants ?? accessibleVariants(staggerItem)}
      className={className}
    >
      {children}
    </motion.div>
  )
}
