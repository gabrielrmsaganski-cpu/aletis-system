// ============================================================
// PortalSkeletons — placeholders animados para diferentes seções do
// portal cliente, exibidos enquanto APIs respondem.
// ============================================================
// Substitui o "Carregando…" vazio que dava sensação de bug. Cada
// skeleton tem dimensões aproximadas do conteúdo real para evitar CLS.
// ============================================================
import { type ReactNode } from 'react'

interface BaseProps {
  className?: string
}

const shimmer =
  'animate-pulse bg-gradient-to-r from-aletis-borda/30 via-aletis-borda/50 to-aletis-borda/30 rounded-lg'

export function SkeletonLine({ width = '100%', height = '14px' }: { width?: string; height?: string }) {
  return <div className={shimmer} style={{ width, height }} />
}

export function SkeletonBlock({ height = '120px', className = '' }: { height?: string; className?: string }) {
  return <div className={`${shimmer} ${className}`} style={{ height, width: '100%' }} />
}

/** Skeleton para os 4 KPIs do hero do portal */
export function KpiGridSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-aletis-borda bg-white p-4 space-y-2.5">
          <SkeletonLine width="60%" height="10px" />
          <SkeletonLine width="80%" height="28px" />
          <SkeletonLine width="50%" height="10px" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton para listas com header + N rows */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-aletis-borda bg-white overflow-hidden">
      <div className="border-b border-aletis-borda bg-aletis-bege/30 px-4 py-3">
        <SkeletonLine width="200px" height="14px" />
      </div>
      <div className="divide-y divide-aletis-borda/50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-3">
            <div className={`${shimmer} w-9 h-9 rounded-lg flex-shrink-0`} />
            <div className="flex-1 space-y-1.5">
              <SkeletonLine width="70%" height="13px" />
              <SkeletonLine width="40%" height="10px" />
            </div>
            <SkeletonLine width="80px" height="20px" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton para cards de pendências */
export function PendenciasSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-aletis-borda bg-white p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className={`${shimmer} w-8 h-8 rounded-lg flex-shrink-0`} />
            <div className="flex-1 space-y-1.5">
              <SkeletonLine width="80%" height="14px" />
              <SkeletonLine width="60%" height="10px" />
            </div>
          </div>
          <SkeletonLine width="100%" height="10px" />
          <SkeletonLine width="100%" height="10px" />
          <SkeletonLine width="40%" height="32px" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton para o stepper horizontal */
export function StepperSkeleton() {
  return (
    <div className="rounded-xl border border-aletis-borda bg-white p-5">
      <SkeletonLine width="200px" height="14px" />
      <div className="mt-4 flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex-1 flex items-center gap-2">
            <div className={`${shimmer} w-8 h-8 rounded-full flex-shrink-0`} />
            {i < 5 && <div className={`${shimmer} flex-1 h-1`} />}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton para timeline / cronograma */
export function TimelineSkeleton({ events = 4 }: { events?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: events }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className={`${shimmer} w-3 h-3 rounded-full flex-shrink-0 mt-1.5`} />
          <div className="flex-1 space-y-1.5 pb-4 border-b border-aletis-borda/40">
            <SkeletonLine width="40%" height="10px" />
            <SkeletonLine width="80%" height="13px" />
            <SkeletonLine width="60%" height="11px" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Wrapper genérico que mostra skeleton enquanto loading; depois children */
export function WithSkeleton({
  loading,
  skeleton,
  children,
}: {
  loading: boolean
  skeleton: ReactNode
  children: ReactNode
}) {
  return loading ? <>{skeleton}</> : <>{children}</>
}
