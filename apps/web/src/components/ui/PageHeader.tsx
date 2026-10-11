import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Breadcrumbs from './Breadcrumbs'
import { CATEGORIES, getToolByRoute } from '../../navigation/toolCatalog'

export interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  hideBreadcrumbs?: boolean
  className?: string
  children?: ReactNode
}

/** Cabeçalho operacional compartilhado por todos os módulos. */
export default function PageHeader({ eyebrow, title, description, actions, hideBreadcrumbs = true, className = '', children }: PageHeaderProps) {
  return <header className={`ui-page-header ${className}`}>
    <div className="ui-page-header-copy">
      {!hideBreadcrumbs && <Breadcrumbs className="mb-3" />}
      {eyebrow && <div className="ui-page-eyebrow">{eyebrow}</div>}
      <h1 className="ui-page-title">{title}</h1>
      {description && <div className="ui-page-description">{description}</div>}
      {children}
    </div>
    {actions && <div className="ui-page-actions">{actions}</div>}
  </header>
}

export function AutoPageHeader({ actions, fallbackTitle, fallbackDescription, hideBreadcrumbs }: { actions?: ReactNode; fallbackTitle?: string; fallbackDescription?: string; hideBreadcrumbs?: boolean }) {
  const { pathname } = useLocation()
  const tool = getToolByRoute(pathname)
  const category = CATEGORIES.find((item) => item.id === tool?.category)
  return <PageHeader eyebrow={category?.label} title={tool?.title ?? fallbackTitle ?? 'Página'} description={tool?.description ?? fallbackDescription} actions={actions} hideBreadcrumbs={hideBreadcrumbs} />
}
