/**
 * PageHeader — skeleton editorial para o topo de cada página.
 *
 * Pattern:  [breadcrumb]
 *           [EYEBROW]  ——————————
 *           Título em serif                        [ações à direita]
 *           Explicação em 1-2 linhas (cinza)
 *
 * Derive eyebrow/título/descrição do toolCatalog automaticamente
 * com <AutoPageHeader />, ou passe override explícito para
 * <PageHeader eyebrow=... title=... description=... />.
 */
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Breadcrumbs from './Breadcrumbs'
import { BrandSymbol } from './BrandMark'
import { CATEGORIES, getToolByRoute } from '../../navigation/toolCatalog'

export interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  /** Remove o Breadcrumbs (para dashboard, portal, etc.) */
  hideBreadcrumbs?: boolean
  /** Classe extra no wrapper */
  className?: string
}

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  hideBreadcrumbs,
  className = '',
}: PageHeaderProps) {
  return (
    <header className={`mb-8 ${className}`}>
      {!hideBreadcrumbs && <Breadcrumbs className="mb-3" />}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl flex items-start gap-4">
          {/* Selo bracket-A à esquerda — assinatura visual de seção */}
          <span
            aria-hidden="true"
            className="hidden md:inline-flex shrink-0 mt-1 w-12 h-12 rounded-xl border border-aletis-cream-escuro bg-aletis-cream-papel items-center justify-center shadow-brand-sm"
          >
            <BrandSymbol tone="verde" size={28} />
          </span>
          <div className="min-w-0">
            {eyebrow && (
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-display font-semibold tracking-[0.24em] uppercase text-aletis-gold-escuro">
                  {eyebrow}
                </span>
                <span
                  className="h-px flex-1 max-w-[80px] bg-gradient-to-r from-aletis-gold/60 to-transparent"
                  aria-hidden="true"
                />
              </div>
            )}
            <h1 className="font-display text-3xl lg:text-[38px] leading-[1.05] tracking-tight text-aletis-verde dark:text-aletis-cream">
              {title}
            </h1>
            {description && (
              <p className="mt-2.5 font-body text-[14px] leading-relaxed text-aletis-verde-medio dark:text-aletis-sage">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/**
 * AutoPageHeader — deriva eyebrow/title/description do toolCatalog
 * pela rota atual. Para a maioria das páginas basta isso.
 */
export function AutoPageHeader({
  actions,
  fallbackTitle,
  fallbackDescription,
  hideBreadcrumbs,
}: {
  actions?: ReactNode
  fallbackTitle?: string
  fallbackDescription?: string
  hideBreadcrumbs?: boolean
}) {
  const { pathname } = useLocation()
  const tool = getToolByRoute(pathname)
  const cat = tool ? CATEGORIES.find((c) => c.id === tool.category) : undefined

  return (
    <PageHeader
      eyebrow={cat?.label}
      title={tool?.title ?? fallbackTitle ?? 'Página'}
      description={tool?.description ?? fallbackDescription}
      actions={actions}
      hideBreadcrumbs={hideBreadcrumbs}
    />
  )
}
