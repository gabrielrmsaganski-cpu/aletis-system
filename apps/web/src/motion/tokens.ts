/**
 * Motion Tokens ALETIS — design tokens de animação.
 *
 * Baseado em spring physics para fluidez natural.
 * Usados por todos os componentes animados do sistema.
 */
import type { Transition, Variants } from 'framer-motion'

// ── Easings semânticos ──
export const ease = {
  smooth: [0.4, 0, 0.2, 1] as const,
  snap: [0.16, 1, 0.3, 1] as const,
  bounce: [0.34, 1.56, 0.64, 1] as const,
  gentle: [0.22, 1, 0.36, 1] as const,
}

// ── Springs padronizados ──
export const spring = {
  default: { type: 'spring', stiffness: 300, damping: 30 } as Transition,
  soft: { type: 'spring', stiffness: 200, damping: 25 } as Transition,
  stiff: { type: 'spring', stiffness: 400, damping: 35 } as Transition,
  bouncy: { type: 'spring', stiffness: 350, damping: 18 } as Transition,
  gentle: { type: 'spring', stiffness: 150, damping: 20 } as Transition,
  slow: { type: 'spring', stiffness: 100, damping: 20, mass: 1.2 } as Transition,
  drawer: { type: 'spring', stiffness: 280, damping: 28 } as Transition,
  modal: { type: 'spring', stiffness: 320, damping: 26 } as Transition,
}

// ── Durações padronizadas (token de tempo) ──
export const duration = {
  instant: 0.1,
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
  page: 0.35,
  hero: 0.6,
}

// ── Variants reutilizáveis ──

/** Fade-in simples (usado em cards, seções) */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.normal, ease: ease.smooth } },
}

/** Slide-up com fade (entrada de conteúdo) */
export const slideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: spring.soft,
  },
}

/** Slide-in da direita (drawers, sidebars) */
export const slideInRight: Variants = {
  hidden: { x: '100%', opacity: 0 },
  visible: { x: 0, opacity: 1, transition: spring.drawer },
  exit: { x: '100%', opacity: 0, transition: { ...spring.drawer, damping: 35 } },
}

/** Slide-in da esquerda (sidebar desktop) */
export const slideInLeft: Variants = {
  hidden: { x: -20, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: spring.soft },
}

/** Scale-in com fade (modais, popovers) */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: spring.modal,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 8,
    transition: { duration: duration.fast, ease: ease.smooth },
  },
}

/** Stagger container — para grids e listas */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
}

/** Stagger container lento (seções grandes) */
export const staggerContainerSlow: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
}

/** Item de stagger (grid cards, list items) */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: spring.soft,
  },
}

/** Item de stagger com scale (badges, chips) */
export const staggerItemScale: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: spring.bouncy,
  },
}

/** Page transition — fade + slide suave */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { ...spring.soft, delay: 0.05 },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: duration.fast, ease: ease.smooth },
  },
}

/** Page transition apenas fade (para rotas que não devem deslocar verticalmente) */
export const pageTransitionFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.page, ease: ease.smooth } },
  exit: { opacity: 0, transition: { duration: duration.fast } },
}

/** Sidebar stagger — itens do menu */
export const sidebarStaggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.05 },
  },
}

export const sidebarStaggerItem: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: spring.soft,
  },
}

/** Collapse/expand height */
export const collapse: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: {
    height: 'auto',
    opacity: 1,
    transition: { ...spring.soft, opacity: { duration: duration.normal } },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: duration.fast, ease: ease.smooth },
  },
}

// ── Reduced motion helper ──
/** Retorna transition respeitando prefers-reduced-motion */
export function accessibleTransition(base: Transition): Transition {
  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReduced) {
    return { duration: 0.01 }
  }
  return base
}

/** Retorna variants com reduced-motion respeitado */
export function accessibleVariants(variants: Variants): Variants {
  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!prefersReduced) return variants

  const reduced: Variants = {}
  for (const [key, value] of Object.entries(variants)) {
    if (typeof value === 'object' && value !== null) {
      reduced[key] = { ...value, transition: { duration: 0.01 } }
    } else {
      reduced[key] = value
    }
  }
  return reduced
}
