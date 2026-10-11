import { getConversationStateService } from './ConversationStateService.js'
import { getCrmLeadService } from './CrmLeadService.js'

export class HumanTakeoverService {
  async takeover(input: {
    conversationId: string
    assignedUserId?: string
    reason?: string
  }): Promise<void> {
    const state = getConversationStateService()
    const crm = getCrmLeadService()
    const bundle = await state.getConversationBundle(input.conversationId)
    await state.updateConversation(input.conversationId, {
      atendimentoModo: 'humano',
      aiEnabled: false,
      assignedUserId: input.assignedUserId || 'christian',
      takeoverReason: input.reason || 'Assumido manualmente no painel',
      takeoverAt: new Date().toISOString(),
      status: 'aguardando_consultor',
      etapa: 'human_takeover',
      currentState: 'human_takeover',
      crmStatus: 'Atendimento humano',
    })
    await crm.updateLeadStatus(bundle.conversation?.clienteId, 'Atendimento humano', input.reason)
    await state.audit({
      conversationId: input.conversationId,
      instanceName: bundle.conversation?.instanceName,
      action: 'human_takeover',
      actor: input.assignedUserId || 'christian',
      details: { reason: input.reason },
    })
  }

  async release(input: {
    conversationId: string
    actor?: string
  }): Promise<void> {
    const state = getConversationStateService()
    const bundle = await state.getConversationBundle(input.conversationId)
    await state.updateConversation(input.conversationId, {
      atendimentoModo: 'ia',
      aiEnabled: true,
      assignedUserId: null,
      takeoverReason: null,
      releasedAt: new Date().toISOString(),
      status: 'aberta',
      etapa: 'ia_retomou',
      currentState: 'eligibility_intro',
      crmStatus: 'Em qualificação',
    })
    await state.audit({
      conversationId: input.conversationId,
      instanceName: bundle.conversation?.instanceName,
      action: 'human_release_to_ai',
      actor: input.actor || 'system',
    })
  }
}

let cached: HumanTakeoverService | null = null
export function getHumanTakeoverService(): HumanTakeoverService {
  if (!cached) cached = new HumanTakeoverService()
  return cached
}
