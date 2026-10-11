/**
 * Breadcrumbs — trail contextual derivado da rota atual.
 *
 * Usa toolCatalog para mapear rota → título e categoria.
 * Sobe um nível automaticamente em rotas dinâmicas (/clientes/:id → Clientes).
 */
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { CATEGORIES, TOOL_CATALOG, getToolByRoute } from '../../navigation/toolCatalog'

interface Crumb {
  label: string
  to?: string
}

function buildTrail(pathname: string): Crumb[] {
  const trail: Crumb[] = [{ label: 'Dashboard', to: '/dashboard' }]

  const tool = getToolByRoute(pathname)
  if (!tool || tool.route === '/dashboard') return trail

  const cat = CATEGORIES.find((c) => c.id === tool.category)
  if (cat) trail.push({ label: cat.label })

  trail.push({ label: tool.title, to: tool.route })

  if (pathname !== tool.route) {
    const rest = pathname.replace(tool.route, '').split('/').filter(Boolean)
    if (rest.length > 0) {
      trail.push({ label: rest[rest.length - 1] })
    }
  }

  return trail
}

/** Rótulos amigáveis para segmentos conhecidos de rotas dinâmicas */
const SEGMENT_LABEL: Record<string, string> = {
  dossie: 'Dossiê',
}

export default function Breadcrumbs({ className = '' }: { className?: string }) {
  const { pathname } = useLocation()
  const trail = buildTrail(pathname).map((c) => ({
    ...c,
    label: SEGMENT_LABEL[c.label.toLowerCase()] ?? c.label,
  }))

  if (trail.length <= 1) return null

  return (
    <nav
      aria-label="Trilha de navegação"
      className={`flex items-center gap-1.5 text-[12px] text-[var(--text-soft)] dark:text-white/50 ${className}`}
    >
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 hover:text-aletis-verde dark:hover:text-aletis-dourado transition-colors"
        aria-label="Ir para o Dashboard"
      >
        <Home size={12} />
      </Link>
      {trail.slice(1).map((crumb, i) => {
        const isLast = i === trail.length - 2
        return (
          <span key={`${crumb.label}-${i}`} className="inline-flex items-center gap-1.5">
            <ChevronRight size={12} className="opacity-50" aria-hidden="true" />
            {crumb.to && !isLast ? (
              <Link
                to={crumb.to}
                className="hover:text-aletis-verde dark:hover:text-aletis-dourado transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={
                  isLast
                    ? 'font-semibold text-foreground dark:text-white/90'
                    : ''
                }
                aria-current={isLast ? 'page' : undefined}
              >
                {crumb.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}

/** Exporta só para uso em testes */
export { buildTrail }
/** Re-export pra evitar import não-usado em ambientes estritos */
export const _catalogRef = TOOL_CATALOG.length
