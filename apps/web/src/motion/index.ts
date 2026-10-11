/**
 * Motion System ALETIS — barrel export
 *
 * Tokens, variants e componentes de animação usados em todo o sistema.
 *
 * Uso rápido:
 *   import { AnimatedRoutes, spring, staggerContainer, staggerItem } from '@/motion'
 */
export { default as AnimatedRoutes } from './AnimatedRoutes'
export {
  ease,
  spring,
  duration,
  fadeIn,
  slideUp,
  slideInRight,
  slideInLeft,
  scaleIn,
  staggerContainer,
  staggerContainerSlow,
  staggerItem,
  staggerItemScale,
  pageTransition,
  pageTransitionFade,
  sidebarStaggerContainer,
  sidebarStaggerItem,
  collapse,
  accessibleTransition,
  accessibleVariants,
} from './tokens'
export type { Transition, Variants } from 'framer-motion'
