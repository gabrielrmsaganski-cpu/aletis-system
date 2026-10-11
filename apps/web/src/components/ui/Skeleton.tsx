// ============================================================
// Skeleton — primitivos de loading consolidados.
// Substitui 6 implementações dispersas (GF/Comentários/Changelog/
// Marketplace/Carteira/Kanban/Benchmark/Dashboard360).
// ============================================================
import React from 'react'

interface BaseProps {
  className?: string
}

/**
 * Bloco genérico animado. Composer principal.
 * Use `h-X` e `w-X` para dimensionar.
 */
export function Skeleton({ className = '' }: BaseProps) {
  return <div aria-hidden="true" className={`ui-skeleton ${className}`} />
}

/**
 * Linha de texto skeleton (ex: parágrafos).
 */
export function SkeletonLine({ className = '' }: BaseProps) {
  return <Skeleton className={`h-3 ${className}`} />
}

/**
 * Bloco grande tipo card.
 */
export function SkeletonBlock({ className = '' }: BaseProps) {
  return <Skeleton className={`rounded-xl ${className}`} />
}

/**
 * Grid de KPI skeletons (default 4 cards).
 */
export function SkeletonKpiGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  )
}

/**
 * Lista de N itens (default 5).
 */
export function SkeletonList({ count = 5, itemHeight = 'h-12' }: { count?: number; itemHeight?: string }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`${itemHeight} rounded-lg`} />
      ))}
    </div>
  )
}

/**
 * Página inteira skeleton — cabeçalho + KPIs + lista.
 */
export function SkeletonPage() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 rounded-lg" />
      <SkeletonKpiGrid />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
      </div>
    </div>
  )
}

/**
 * Hero/header skeleton para uso enquanto useClienteData carrega.
 */
export function SkeletonHero() {
  return <Skeleton className="h-24 rounded-lg" />
}
