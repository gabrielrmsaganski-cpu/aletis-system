import type { Estagio } from './useClienteData'

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  lead: { label: 'Lead', color: '#6B7280' },
  qualificacao: { label: 'Qualificação', color: '#3B82F6' },
  analise: { label: 'Análise', color: '#8B5CF6' },
  proposta: { label: 'Proposta', color: '#cb9d52' },
  negociacao: { label: 'Negociação', color: '#E67E22' },
  acordo: { label: 'Acordo', color: '#27AE60' },
  acompanhamento: { label: 'Acompanhamento', color: '#17251b' },
  concluido: { label: 'Concluído', color: '#465b4a' },
  prospeccao: { label: 'Prospecção', color: '#6B7280' },
  encerrado: { label: 'Encerrado', color: '#465b4a' },
}

export default function StageBadge({ estagio, large }: { estagio: Estagio; large?: boolean }) {
  const cfg = STAGE_CONFIG[estagio] ?? { label: estagio, color: '#6B7280' }
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold font-body ${
        large ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'
      }`}
      style={{ backgroundColor: cfg.color + '18', color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}
