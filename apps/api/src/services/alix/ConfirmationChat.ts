import type { AlixConfirmationStore, PendingConfirmation, ConfirmationExecution } from './AlixConfirmationStore.js'

export interface ConfirmationScope { sessionId: string; clienteId?: string }
export function isConfirmationMessage(message: string): boolean {
  const q = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  return /^(confirmo|confirma|aprovo|aprova|executa|execute|pode\s+(?:prosseguir|fazer|executar|ir|continuar)|sim[,;:\s]+(?:pode|faca|faz|fazer|confirma)|ok[,;:\s]+(?:pode|faca|faz|fazer|confirma))\b/.test(q)
    || /^(fecha|aprova|aprovo|confirma|confirmo|executa|execute)\s+tudo\b/.test(q)
}

export function confirmationMatchesScope(pending: PendingConfirmation, scope: ConfirmationScope): boolean {
  if (pending.sessionId !== scope.sessionId) return false
  if (pending.contextClienteId !== undefined) return (pending.contextClienteId || undefined) === scope.clienteId
  const target = typeof pending.payload.clienteId === 'string' ? pending.payload.clienteId : undefined
  return !scope.clienteId || !target || scope.clienteId === target
}

export function confirmationReceiptView(execution: ConfirmationExecution): { reply: string; metadata: Record<string, unknown> } {
  const { confirmation, status, outcome } = execution
  const executed = status === 'completed' && outcome === 'executed'
  const prepared = status === 'completed' && outcome === 'prepared'
  const heading = executed ? 'Ação executada' : prepared ? 'Preparo concluído; envio/execução posterior pendente' : status === 'running' ? 'Ação em andamento' : 'Execução não confirmada'
  const detail = execution.error || (status === 'running' ? 'Consulte este mesmo comprovante. A ação não será iniciada novamente.' : '')
  const result = execution.result === undefined ? '' : `\n\n\`\`\`json\n${JSON.stringify(execution.result, null, 2).slice(0, 1600)}\n\`\`\``
  return {
    reply: `**${heading}:** ${confirmation.description}${detail ? `\n\n${detail}` : ''}${result}`,
    metadata: { confirmationId: confirmation.id, toolName: confirmation.toolName, executed, prepared, executionStatus: status, outcome, result: execution.result, error: execution.error, startedAt: execution.startedAt, finishedAt: execution.finishedAt },
  }
}

export async function resolveConfirmationChat(message: string, scope: ConfirmationScope, store: AlixConfirmationStore,
  executorFor: (name: string) => ((payload: unknown) => Promise<unknown>) | null,
): Promise<{ reply: string; metadata: Record<string, unknown> } | null> {
  const q = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const all = /^(fecha|aprova|aprovo|confirma|confirmo|executa|execute)\s+tudo\b/.test(q)
  const approved = isConfirmationMessage(message)
  if (!approved) return null
  const id = q.match(/\b(conf_[a-f0-9]{16})\b/)?.[1]
  const receipt = id ? store.getExecution(id) : undefined
  if (receipt && confirmationMatchesScope(receipt.confirmation, scope)) return confirmationReceiptView(receipt)
  const candidates = id ? [store.get(id)].filter((p): p is PendingConfirmation => Boolean(p)) : store.listActiveBySessionId(scope.sessionId)
  const matches = candidates.filter((pending) => confirmationMatchesScope(pending, scope))
  if (!matches.length) return { reply: 'Não encontrei uma ação pendente nesta conversa e neste contexto de cliente.', metadata: { executed: false, reason: 'no_pending_in_context' } }
  if (!all && !id && matches.length > 1) return {
    reply: `Há ${matches.length} ações pendentes nesta conversa. Informe o ID da ação que deseja confirmar ou use “confirma tudo” para revisar o conjunto.`,
    metadata: { executed: false, reason: 'ambiguous_confirmation', confirmationIds: matches.map((pending) => pending.id) },
  }
  const selected = all ? matches : matches.slice(0, 1)
  const results: Array<{ reply: string; metadata: Record<string, unknown> }> = []
  for (const candidate of selected) {
    if (candidate.approvalsRequired === 2) {
      results.push({ reply: `**Revisão no painel necessária:** ${candidate.description}. O card preserva as duas etapas de aprovação desta operação.`, metadata: { confirmationId: candidate.id, executed: false, reason: 'double_approval_required' } })
      continue
    }
    const executor = executorFor(candidate.toolName)
    if (!executor) {
      results.push({ reply: `O executor de ${candidate.toolName} está indisponível. A ação foi preservada como pendente.`, metadata: { confirmationId: candidate.id, executed: false, reason: 'executor_not_registered' } })
      continue
    }
    results.push(confirmationReceiptView(await store.executeOnce(candidate, executor)))
  }
  if (results.length === 1) return results[0]
  return { reply: results.map((item) => item.reply).join('\n\n---\n\n'), metadata: { executed: results.filter((item) => item.metadata.executed === true).length, total: selected.length, results: results.map((item) => item.metadata) } }
}
