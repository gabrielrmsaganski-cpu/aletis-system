import { objectValue, toolOutcome } from '../tools/ToolOutcome.js'

export interface ExecutionEvidence { tool: string; result: unknown }
export interface ExecutionSummary { prepared: number; executed: number; failed: number; unverified: number }

/** Conta somente operações observadas. Resumo de agente e parâmetros não são provas. */
export function summarizeExecutionEvidence(evidence: ExecutionEvidence[]): ExecutionSummary {
  const summary: ExecutionSummary = { prepared: 0, executed: 0, failed: 0, unverified: 0 }
  for (const item of evidence) {
    const value = objectValue(item.result)
    if (item.tool.startsWith('delegate_')) {
      const nested = Array.isArray(value?.toolEvidence) ? value.toolEvidence.filter((entry): entry is ExecutionEvidence => Boolean(objectValue(entry)?.tool && Object.hasOwn(objectValue(entry)!, 'result'))) : []
      const child = summarizeExecutionEvidence(nested)
      for (const key of Object.keys(summary) as Array<keyof ExecutionSummary>) summary[key] += child[key]
      continue
    }
    if (!/^(criar_|atualizar_|registrar_|anexar_|enviar_|agendar_|definir_|alterar_|promover_|onboarding_|gerenciar_|excluir_|gerar_|importar_)/.test(item.tool)) continue
    const outcome = toolOutcome(item.tool, item.result)
    if (outcome === 'prepared' || outcome === 'executed' || outcome === 'failed') summary[outcome]++
    else summary.unverified++
  }
  return summary
}

/** Correção conservadora de contradição explícita: só preparo/falha no turno. */
export function groundExecutionClaims(text: string, evidence: ExecutionEvidence[]): { text: string; summary: ExecutionSummary; corrected: boolean } {
  const summary = summarizeExecutionEvidence(evidence)
  if (summary.executed || summary.unverified || (!summary.prepared && !summary.failed)) return { text, summary, corrected: false }
  // Não altera citações, perguntas, fala atribuída ao usuário ou relatos históricos.
  const claim = /^(?:[-*]\s+)?(?:\*\*)?(?:eu\s+)?(?:já\s+)?(?:cadastrei|criei|atualizei|registrei|enviei|anexei|excluí|agendei|gerei)\b/iu
  let corrected = false
  const lines = text.split('\n').filter((line) => {
    const stripped = line.trim()
    if (!claim.test(stripped) || /\?$/.test(stripped) || /\b(ontem|anteriormente|na conversa anterior|como você disse|segundo você)\b/i.test(stripped)) return true
    corrected = true
    return false
  })
  if (!corrected) return { text, summary, corrected }
  const notice = summary.prepared
    ? '**Estado verificado:** as ações foram preparadas e aguardam os próximos passos indicados no painel. Nenhuma execução dessas ações foi confirmada neste turno.'
    : '**Estado verificado:** as ferramentas retornaram falha. Não há confirmação de execução dessas ações neste turno.'
  return { text: `${notice}\n\n${lines.join('\n').trim()}`.trim(), summary, corrected }
}
