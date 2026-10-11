// ============================================================
// StatusBadge — pílula de status consolidada.
// Substitui 4 implementações dispersas (CarteiraPanel/Propostas/
// Financeiro/ClienteDetalhes legacy).
// ============================================================
import React from 'react'

export type StatusTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'

interface Props {
  /** Texto da pill (ex: 'em_dia', 'atrasada', 'ATIVA'). */
  label: string
  /** Tone semântico. Se omitido, infere a partir do label conhecido. */
  tone?: StatusTone
  /** Tamanho. */
  size?: 'sm' | 'md'
  /** Prefixo opcional (emoji/icon char). */
  prefix?: string
  /** Renderizar com uppercase. Default: true. */
  uppercase?: boolean
}

const TONE_CLS: Record<StatusTone, string> = {
  good: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-100 text-amber-800 ring-amber-200',
  bad: 'bg-red-100 text-red-700 ring-red-200',
  info: 'bg-blue-100 text-blue-700 ring-blue-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
}

/** Heurística: dado um label (status string), inferir o tom. */
export function inferStatusTone(label: string): StatusTone {
  const k = label.toLowerCase()
  if (/em.dia|saudavel|saudável|ativ[ao]|aprovad[ao]|liquidad[ao]|integral|paga[a]?|ok|concluid[ao]/.test(k)) return 'good'
  if (/atrasad[ao]|critic[ao]|inelegivel|recusad[ao]|cancelad[ao]|inadimplente|vencid[ao]/.test(k)) return 'bad'
  if (/atencao|atenção|em.negociacao|em.negociação|negocia|moderad[ao]|parcial|condicional|a.vencer|em.analise|em.análise/.test(k)) return 'warn'
  if (/renegociad[ao]|desembolsad[ao]|info|baix[ao]/.test(k)) return 'info'
  return 'neutral'
}

export default function StatusBadge({ label, tone, size = 'sm', prefix, uppercase = true }: Props) {
  const finalTone = tone ?? inferStatusTone(label)
  const sizeCls = size === 'sm' ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded ring-1 font-bold tracking-wider ${
        uppercase ? 'uppercase' : ''
      } ${sizeCls} ${TONE_CLS[finalTone]}`}
    >
      {prefix && <span className="opacity-80">{prefix}</span>}
      {label.replace(/_/g, ' ')}
    </span>
  )
}
