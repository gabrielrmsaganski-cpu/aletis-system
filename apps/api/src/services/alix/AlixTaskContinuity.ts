interface Turn {
  id?: string
  role: string
  content: string
  metadata?: Record<string, unknown>
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Continuidade recupera o pedido humano; respostas anteriores não viram evidência. */
export function isAlixContinuation(message: string): boolean {
  const text = normalize(message).replace(/^por favor[, ]*/, '')
  return text.length <= 1000
    && /^(?:continue|continuar|prossiga|retome|aprofunde|detalhe|desenvolva|conclua|termine|pode continuar|vamos continuar)\b/.test(text)
    && !/\b(?:outro assunto|mude de assunto|em vez disso|nova tarefa)\b/.test(text)
}

export function resolveAlixTaskContinuity(message: string, history: readonly Turn[], clienteId?: string) {
  if (!isAlixContinuation(message)) return null
  // O limite evita trabalho ilimitado em históricos legados muito grandes.
  for (const turn of [...history].slice(-200).reverse()) {
    if (turn.role !== 'user') continue
    const scope = typeof turn.metadata?.clienteId === 'string' ? turn.metadata.clienteId : undefined
    // Uma fronteira de cliente encerra a busca; não atravessa outro caso para recuperar objetivo.
    if (scope !== clienteId) return null
    const text = turn.content?.trim()
    if (!text || isAlixContinuation(text)) continue
    if (/^(?:oi|ola|obrigad[oa]|valeu|confirmo|aprovo|autorizo|pode fazer)[!.\s]*$/.test(normalize(text))) continue
    const objective = text.slice(0, 8000)
    const nextTurn = history[history.indexOf(turn) + 1]
    const missionId = turn.metadata?.missionId ?? (nextTurn?.role === 'assistant' ? nextTurn.metadata?.missionId : undefined)
    return {
      sourceMessageId: turn.id,
      previousMissionId: typeof missionId === 'string' ? missionId : undefined,
      preparationOnly: turn.metadata?.actionPolicy === 'prepare_only',
      objective,
      truncated: text.length > objective.length,
      routingMessage: `${objective}\n\nPedido atual: ${message}`,
      prompt: `\n\n<task_continuity>\nO pedido atual dá continuidade ao pedido humano abaixo, no mesmo escopo de cliente. Mantenha objetivo, formatos solicitados e restrições; avance no que falta e evite repetir toda a resposta. A instrução atual tem precedência. Isto não comprova fatos nem execução anterior: releia as fontes necessárias e confira o estado real de qualquer ação antes de repeti-la. Não interprete a continuação como nova aprovação de escrita, envio ou assinatura.\nPedido anterior (texto do usuário): ${JSON.stringify(objective)}${text.length > objective.length ? '\nPedido anterior abreviado por tamanho; explicite qualquer parte necessária que não estiver disponível.' : ''}\n</task_continuity>`,
    }
  }
  return null
}
