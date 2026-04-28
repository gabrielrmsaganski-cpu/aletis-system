// ============================================================
// DeferredRender — adia renderização até o componente entrar na
// viewport. Resolve o problema de páginas com muitos charts/maps
// que travam o Time-to-Interactive sem precisar lazy-loading
// estrutural por arquivo.
// ============================================================
//
// Uso:
//   <DeferredRender placeholder={<SkeletonChart />}>
//     <ExpensiveChart data={data} />
//   </DeferredRender>
//
// Comportamento:
//   1. Antes do componente estar perto da viewport → renderiza placeholder
//   2. Quando entra dentro da rootMargin → renderiza children completo
//   3. Uma vez renderizado, NÃO desmonta (mesmo se sair da viewport)
//
// Benefícios:
//   - First Contentful Paint mais rápido
//   - Browser não trava em listas com 20 charts
//   - Charts pesados (recharts, leaflet) só inicializam quando relevantes
// ============================================================
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Renderizado enquanto não entrou na viewport. Default: card-skeleton 240px. */
  placeholder?: ReactNode
  /** Margin extra para começar a montar antes de aparecer. Default '300px'. */
  rootMargin?: string
  /** SSR-safe: se true, renderiza imediatamente em servidor. Default true. */
  ssrFallback?: boolean
  /** Min-height do placeholder para evitar layout shift. Default 200px. */
  minHeight?: number
  className?: string
}

const DefaultPlaceholder = ({ minHeight }: { minHeight: number }) => (
  <div
    className="rounded-xl border border-aletis-borda dark:border-white/10 bg-aletis-bege/40 dark:bg-white/5 animate-pulse"
    style={{ minHeight: `${minHeight}px` }}
  />
)

export default function DeferredRender({
  children,
  placeholder,
  rootMargin = '300px',
  ssrFallback = true,
  minHeight = 200,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState<boolean>(false)

  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      // Fallback: navegadores muito antigos renderizam direto.
      setVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            obs.disconnect()
            break
          }
        }
      },
      { rootMargin, threshold: 0.01 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible, rootMargin])

  // SSR: server não tem IntersectionObserver. Se o consumer prefere
  // renderizar tudo no server-side, ssrFallback=true (default) faz isso.
  if (typeof window === 'undefined' && ssrFallback) {
    return <div className={className}>{children}</div>
  }

  return (
    <div ref={ref} className={className}>
      {visible ? children : (placeholder ?? <DefaultPlaceholder minHeight={minHeight} />)}
    </div>
  )
}
