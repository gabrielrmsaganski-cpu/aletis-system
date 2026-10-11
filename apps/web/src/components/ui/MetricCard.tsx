import type { ElementType, ReactNode } from 'react'

export default function MetricCard({ label, value, detail, icon: Icon, loading, onClick, title, tone = 'neutral', accessory }: {
  label: ReactNode; value: ReactNode; detail?: ReactNode; icon?: ElementType; loading?: boolean;
  onClick?: () => void; title?: string; tone?: 'neutral' | 'success' | 'warning' | 'danger'; accessory?: ReactNode
}) {
  const Tag = onClick ? 'button' : 'div'
  const color = { neutral: 'text-muted-foreground', success: 'text-[var(--success)]', warning: 'text-[var(--warning)]', danger: 'text-[var(--danger)]' }[tone]
  return <Tag {...(onClick ? { type: 'button' as const } : {})} onClick={onClick} title={title} className={`clean-metric text-left ${onClick ? 'clean-metric--interactive' : ''}`}>
    <span className="clean-metric-title"><span>{label}</span>{Icon && <Icon size={16} className={`shrink-0 ${color}`} aria-hidden="true" />}</span>
    <span className="clean-metric-value">{loading ? <span role="status" aria-label="Carregando indicador" className="ui-skeleton inline-block h-7 w-20" /> : value}{accessory}</span>
    {detail && <span className="clean-metric-detail">{detail}</span>}
  </Tag>
}
