/**
 * UI Components — barrel export
 *
 * Novos componentes com Framer Motion (Fluid Architecture):
 *   - MotionDialog: modal com spring, swipe-to-dismiss, collapse animado
 *   - AnimatedTabs: tabs com indicador dourado deslizante (layoutId)
 *   - ScrollReveal: wrapper de entrada animada ao scroll
 *
 * Componentes legados (ainda suportados):
 *   - AppDialog: modal estável sem motion (mantido para compatibilidade)
 */
export { default as AppDialog } from './AppDialog'
export { default as MotionDialog } from './MotionDialog'
export { default as AnimatedTabs } from './AnimatedTabs'
export type { TabDef } from './AnimatedTabs'
export { default as ScrollReveal, ScrollRevealItem } from './ScrollReveal'
export { default as BrandFooter } from './BrandFooter'
export { default as BrandMark } from './BrandMark'
export { default as BrandWatermark } from './BrandWatermark'
export { default as Breadcrumbs } from './Breadcrumbs'
export { default as CommandPalette } from './CommandPalette'
export { default as PageHeader } from './PageHeader'
export * from './Skeleton'
export { default as StatusBadge } from './StatusBadge'
export { default as Tooltip } from './Tooltip'
export * from './foundation'
export * from './primitives'
