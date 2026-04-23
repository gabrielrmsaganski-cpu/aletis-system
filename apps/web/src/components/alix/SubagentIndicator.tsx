/**
 * SubagentIndicator — pill discreta que mostra qual sub-agente está ativo
 * durante o tool-use do Orchestrator.
 */
import React from 'react'
import { Brain, Search, PenTool, FileText } from 'lucide-react'

export type SubagentName = 'DealAnalyzer' | 'WebResearcher' | 'CRMWriter' | 'DocGenerator'

const AGENT_META: Record<SubagentName, { label: string; icon: typeof Brain; color: string }> = {
  DealAnalyzer: { label: 'Análise estratégica', icon: Brain, color: 'bg-purple-950/60 text-purple-300 border-purple-800' },
  WebResearcher: { label: 'Due-diligence externa', icon: Search, color: 'bg-cyan-950/60 text-cyan-300 border-cyan-800' },
  CRMWriter: { label: 'Escrevendo no CRM', icon: PenTool, color: 'bg-emerald-950/60 text-emerald-300 border-emerald-800' },
  DocGenerator: { label: 'Gerando documento', icon: FileText, color: 'bg-amber-950/60 text-amber-300 border-amber-800' },
}

interface SubagentIndicatorProps {
  active: SubagentName | null
}

export function SubagentIndicator({ active }: SubagentIndicatorProps) {
  if (!active) return null
  const meta = AGENT_META[active]
  const Icon = meta.icon
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${meta.color} animate-pulse`}>
      <Icon className="w-3 h-3" />
      <span className="font-medium">{active}</span>
      <span className="opacity-70">· {meta.label}</span>
    </div>
  )
}

/**
 * Detecta qual sub-agente foi invocado baseado em toolsUsed do message.
 * Usa a última delegate_* encontrada — útil para mostrar "qual agente acabou de falar".
 */
export function detectLastSubagent(toolsUsed?: string[]): SubagentName | null {
  if (!toolsUsed || toolsUsed.length === 0) return null
  for (let i = toolsUsed.length - 1; i >= 0; i--) {
    const t = toolsUsed[i]
    if (t === 'delegate_deal_analyzer') return 'DealAnalyzer'
    if (t === 'delegate_web_researcher') return 'WebResearcher'
    if (t === 'delegate_crm_writer') return 'CRMWriter'
    if (t === 'delegate_doc_generator') return 'DocGenerator'
  }
  return null
}
