import React from 'react'
import { Wifi, WifiOff, Database, Clock } from 'lucide-react'

type FonteOrigem = 'api' | 'cache' | 'fallback'

interface DataSourceBadgeProps {
  fonteOrigem: FonteOrigem
  fonte?: string
  atualizacao?: string
  compact?: boolean
}

const CONFIG: Record<FonteOrigem, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  api: { label: 'Dados ao vivo', color: 'text-positivo', bg: 'bg-positivo/10', icon: Wifi },
  cache: { label: 'Cache recente', color: 'text-aletis-dourado', bg: 'bg-aletis-dourado/10', icon: Database },
  fallback: { label: 'Referencia', color: 'text-aletis-grafite-claro', bg: 'bg-aletis-grafite-claro/10', icon: WifiOff },
}

export function DataSourceBadge({ fonteOrigem, fonte, atualizacao, compact }: DataSourceBadgeProps) {
  const cfg = CONFIG[fonteOrigem] || CONFIG.fallback
  const Icon = cfg.icon

  const timeStr = atualizacao
    ? new Date(atualizacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-body font-medium ${cfg.bg} ${cfg.color}`}>
        <Icon className="w-2.5 h-2.5" />
        {cfg.label}
      </span>
    )
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${cfg.bg}`}>
      <Icon className={`w-3 h-3 ${cfg.color}`} />
      <span className={`text-[10px] font-body font-medium ${cfg.color}`}>{cfg.label}</span>
      {fonte && (
        <span className="text-[10px] font-body text-aletis-grafite-claro">
          | {fonte}
        </span>
      )}
      {timeStr && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-body text-aletis-grafite-claro">
          <Clock className="w-2.5 h-2.5" />
          {timeStr}
        </span>
      )}
    </div>
  )
}

export function DataSourceFooter({ fonteOrigem, fonte, atualizacao }: DataSourceBadgeProps) {
  const cfg = CONFIG[fonteOrigem] || CONFIG.fallback
  const Icon = cfg.icon

  const timeStr = atualizacao
    ? new Date(atualizacao).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <div className="flex items-center gap-2 text-[10px] font-body text-aletis-grafite-claro mt-2">
      <span className={`inline-flex items-center gap-1 ${cfg.color}`}>
        <Icon className="w-3 h-3" />
        {cfg.label}
      </span>
      {fonte && <span>| {fonte}</span>}
      {timeStr && (
        <span className="inline-flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" />
          {timeStr}
        </span>
      )}
    </div>
  )
}
