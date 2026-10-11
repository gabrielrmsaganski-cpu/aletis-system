import { getConversationStateService } from './ConversationStateService.js'
import { getDocumentIntakeService } from './DocumentIntakeService.js'
import { getEligibilityService, type EligibilityAnswer } from './EligibilityService.js'
import { CalendarUnavailableError, getGoogleCalendarService } from './GoogleCalendarService.js'
import type { NormalizedEvolutionMessage, ConversationSummary } from './evolution/types.js'
import { getAudioService } from './AudioService.js'
import { getAiOrchestratorService } from './AiOrchestratorService.js'
import { getCrmLeadService } from './CrmLeadService.js'
import { isWhatsAppAutoLeadCreationEnabled } from './AutomationSafety.js'

interface HandleResult {
  conversation: ConversationSummary
  replies: string[]
  sendAsAudio?: boolean
  escalated?: boolean
}

function isGreeting(text: string): boolean {
  const q = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  return /^(oi|ola|olá|bom dia|boa tarde|boa noite|tudo bem|hello|hey)[.!? ]*$/.test(q)
}

function answerRows(rows: Array<Record<string, any>>): EligibilityAnswer[] {
  return rows.map((r) => ({
    questionKey: r.question_key ?? r.questionKey,
    answerText: r.answer_text ?? r.answerText,
    value: r.answer_value ?? r.answerValue ?? {},
    score: Number(r.score || 0),
  }))
}

function slotList(slots: Array<{ label: string }>): string {
  return slots.map((slot, idx) => `${idx + 1}. ${slot.label}`).join('\n')
}

async function humanizeReply(context: Record<string, unknown>, fallback: string): Promise<string> {
  // Horários, confirmação e indisponibilidade são respostas operacionais já verificadas.
  if (['offer_slots', 'slot_not_found', 'meeting_scheduled', 'schedule_unavailable', 'schedule_simulation'].includes(String(context.action))) return fallback
  return getAiOrchestratorService().composeReply({
    baseReply: fallback,
    state: String(context.state || context.action || ''),
    checklist: context,
    allowedAction: String(context.action || 'reply'),
  })
}

export class WhatsAppIaService {
  private async scheduleUnavailable(conversation: ConversationSummary, simulation = false, uncertain = false): Promise<HandleResult> {
    const state = getConversationStateService()
    await state.saveBookingOptions(conversation.id, [])
    await state.updateConversation(conversation.id, {
      status: 'aguardando_consultor', etapa: 'agenda_pendente', currentState: 'schedule_pending',
      atendimentoModo: 'humano', aiEnabled: false, crmStatus: 'Aguardando agenda',
      resumo: simulation ? 'Simulação de agenda: nenhum evento foi criado.' : uncertain
        ? 'Criação de evento sem retorno confirmado. Conferir a agenda antes de tentar novo agendamento.'
        : 'Agenda sem confirmação de disponibilidade; equipe deve combinar o horário.',
    })
    await getCrmLeadService().updateLeadStatus(conversation.clienteId, 'Aguardando agenda')
    return {
      conversation, escalated: true,
      replies: [simulation
        ? 'Este agendamento foi apenas uma simulação: nenhuma reunião foi criada. Deixei a equipe responsável por combinar e confirmar um horário com você.'
        : uncertain
          ? 'A agenda não confirmou o resultado do agendamento. A equipe vai conferir o horário solicitado antes de confirmar sua reunião.'
          : 'Não consegui confirmar horários na agenda agora. Registrei seu interesse e deixei o atendimento com a equipe para combinar e confirmar um horário com você.'],
    }
  }

  private async offerSchedule(conversation: ConversationSummary, prefix = ''): Promise<HandleResult> {
    const state = getConversationStateService()
    let candidates
    try {
      candidates = await getGoogleCalendarService().listAvailableSlots()
    } catch (error) {
      if (!(error instanceof CalendarUnavailableError)) throw error
      return this.scheduleUnavailable(conversation)
    }
    if (!candidates.length) return this.scheduleUnavailable(conversation)
    const slots = await state.saveBookingOptions(conversation.id, candidates)
    await state.updateConversation(conversation.id, {
      etapa: 'agenda_oferecida', currentState: 'offering_schedule', status: 'aguardando_cliente',
      crmStatus: 'Reunião oferecida', resumo: 'Horários consultados na agenda e oferecidos ao contato.',
    })
    await getCrmLeadService().updateLeadStatus(conversation.clienteId, 'Reunião oferecida')
    const consultor = process.env.GOOGLE_CALENDAR_CONSULTOR_NAME || 'Christian'
    return {
      conversation,
      replies: [`${prefix}Faz sentido seguir para uma conversa com ${consultor}.\n\nEstes horários estavam disponíveis na última consulta:\n${slotList(slots)}\n\nResponda com o número do melhor horário. Vou conferir a disponibilidade novamente antes de confirmar.`],
    }
  }

  async handleInbound(message: NormalizedEvolutionMessage): Promise<HandleResult> {
    const state = getConversationStateService()
    const eligibility = getEligibilityService()
    const docs = getDocumentIntakeService()
    const calendar = getGoogleCalendarService()
    const crm = getCrmLeadService()

    const telefone = message.fromNumber || ''
    let clienteId: string | null = null
    let leadCreated = false
    if (telefone) {
      const existing = await crm.findByPhone(telefone)
      if (existing?.id) {
        clienteId = String(existing.id)
      } else if (isWhatsAppAutoLeadCreationEnabled()) {
        const lead = await crm.ensureLead({
          telefone,
          nomeContato: message.contactName,
          instanceName: message.instanceName,
          waJid: message.remoteJid,
        })
        clienteId = lead.clienteId
        leadCreated = lead.created
      }
    }
    const conversation = await state.upsertConversation({
      instanceName: message.instanceName,
      telefone,
      waJid: message.remoteJid,
      nomeContato: message.contactName,
      clienteId,
      payload: { source: 'evolution', lastEventType: message.eventType, leadCreated },
    })
    await state.upsertContact({
      instanceName: message.instanceName,
      telefone,
      waJid: message.remoteJid,
      nomeContato: message.contactName,
      clienteId,
      payload: { leadCreated },
    })

    const recorded = await state.recordMessage({
      conversationId: conversation.id,
      instanceName: message.instanceName,
      providerMessageId: message.providerMessageId,
      direction: message.fromMe ? 'outbound' : 'inbound',
      type: message.type,
      status: message.status || (message.fromMe ? 'sent' : 'received'),
      text: message.text || message.caption,
      mediaUrl: message.mediaUrl,
      mediaMime: message.mediaMime,
      mediaFilename: message.mediaFilename,
      fromNumber: message.fromNumber,
      toNumber: message.toNumber,
      timestamp: message.timestamp,
      payload: message.raw,
    })

    if (!recorded.inserted || message.fromMe) {
      return { conversation, replies: [] }
    }

    const freshBundle = await state.getConversationBundle(conversation.id)
    const currentConversation = freshBundle.conversation || conversation
    if (currentConversation.atendimentoModo === 'humano' || currentConversation.aiEnabled === false) {
      return { conversation: currentConversation, replies: [], escalated: true }
    }

    if (['document', 'image', 'audio', 'video'].includes(message.type)) {
      const docResult = await docs.ingestFromWebhook({
        conversationId: conversation.id,
        clienteId: currentConversation.clienteId,
        messageId: recorded.message.id,
        message,
      })
      if (message.type === 'audio') {
        const audio = getAudioService()
        if (message.mediaBase64 || message.mediaUrl) {
          try {
            const stt = await audio.transcribe({
              conversationId: conversation.id,
              messageId: recorded.message.id,
              message,
            })
            if (stt.text.trim()) {
              await state.recordMessage({
                conversationId: conversation.id,
                instanceName: message.instanceName,
                providerMessageId: `${message.providerMessageId || recorded.message.id}:transcript`,
                direction: 'system',
                type: 'transcription',
                status: 'processed',
                text: stt.text,
                transcription: stt.text,
                timestamp: new Date(),
                payload: { confidence: stt.confidence, provider: stt.provider, storageKey: stt.storageKey },
              })
              return this.handleInbound({
                ...message,
                type: 'text',
                text: stt.text,
                providerMessageId: `${message.providerMessageId || recorded.message.id}:text`,
                raw: { ...message.raw, transcribedFromAudio: true, transcriptionConfidence: stt.confidence },
              })
            }
          } catch (err) {
            console.warn('[WhatsAppIA] audio transcription failed:', (err as Error).message)
          }
        }
        await state.updateConversation(conversation.id, {
          etapa: 'audio_recebido',
          resumo: 'Cliente enviou audio pelo WhatsApp. Transcricao deve ser feita quando Speech estiver conectado.',
        })
        const reply = await humanizeReply({ action: 'audio_received' }, 'Recebi seu audio. Se puder, envie tambem a informacao principal por texto para eu registrar corretamente no atendimento.')
        return { conversation: currentConversation, replies: [reply], sendAsAudio: false }
      }
      const checklist = await docs.getChecklistStatus(conversation.id)
      await state.upsertDocumentRequests({
        conversationId: conversation.id,
        clienteId: currentConversation.clienteId,
        requests: checklist.map((d) => ({ key: d.key, label: d.label, status: d.status })),
      })
      const pending = checklist.filter((d) => d.status === 'pendente')
      const base = docResult.saved
        ? `Recebi e salvei o arquivo "${message.mediaFilename || 'documento'}". Classifiquei inicialmente como ${docResult.categoria}.` +
          (pending.length ? `\n\nAinda faltam: ${pending.map((p) => p.label).join('; ')}.` : '\n\nChecklist documental completo para esta etapa.')
        : 'Recebi o arquivo e deixei registrado para revisao.'
      const reply = await humanizeReply({ action: 'document_received', docResult, pending }, base)
      return { conversation: currentConversation, replies: [reply] }
    }

    const text = (message.text || '').trim()
    const bundle = await state.getConversationBundle(conversation.id)
    const answers = answerRows(bundle.eligibility)
    const currentQuestion = eligibility.calculate(answers).nextQuestion

    if (!text && message.type !== 'text') {
      return { conversation: currentConversation, replies: ['Não consegui ler esse formato de mensagem. Pode enviar a informação por texto, PDF ou foto legível?'] }
    }

    if (currentConversation.currentState === 'meeting_scheduled' && bundle.calendarEvents.some((event) => event.status === 'created' && (event.externalEventId || event.external_event_id))) {
      return { conversation: currentConversation, replies: ['Sua reunião já está registrada. Você pode enviar os documentos iniciais por aqui; para alterar o horário, a equipe pode ajudar.'] }
    }

    if (currentConversation.etapa === 'agenda_oferecida') {
      const slots = await state.getBookingOptions(conversation.id)
      if (!slots.length) return this.offerSchedule(currentConversation, 'As opções anteriores expiraram. ')
      const slot = calendar.pickSlotFromText(text, slots)
      if (!slot) {
        const reply = await humanizeReply(
          { action: 'slot_not_found', slots },
          `Nao consegui identificar o horario escolhido. Pode responder com o numero de uma das opcoes?\n\n${slotList(slots)}`,
        )
        return { conversation: currentConversation, replies: [reply] }
      }
      let created
      try {
        created = await calendar.createEvent({
          slot,
          summary: `ALETIS - Triagem WhatsApp ${currentConversation.nomeContato || currentConversation.telefone}`,
          description: `Conversa WhatsApp: ${currentConversation.telefone}`,
          requestKey: `${conversation.id}:${slot.start}`,
        })
      } catch (error) {
        if (!(error instanceof CalendarUnavailableError)) throw error
        if (error.reason === 'conflict' || error.reason === 'invalid_slot') {
          return this.offerSchedule(currentConversation, 'O horário escolhido não está mais disponível. ')
        }
        return this.scheduleUnavailable(currentConversation, false, error.reason === 'uncertain')
      }
      if (created.status !== 'created' || !created.externalEventId) return this.scheduleUnavailable(currentConversation, created.status === 'dry_run')
      await state.createCalendarEvent({
        conversationId: conversation.id,
        clienteId: currentConversation.clienteId,
        consultor: process.env.GOOGLE_CALENDAR_CONSULTOR_NAME || 'Christian',
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        externalEventId: created.externalEventId,
        status: created.status,
        startAt: slot.start,
        endAt: slot.end,
        timezone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Cuiaba',
        titulo: `ALETIS - Triagem ${currentConversation.nomeContato || currentConversation.telefone}`,
        payload: { created },
      })
      await state.createBooking({
        conversationId: conversation.id,
        clienteId: currentConversation.clienteId,
        optionId: slot.id,
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        externalEventId: created.externalEventId,
        status: created.status,
        startAt: slot.start,
        endAt: slot.end,
        summary: `ALETIS - Triagem ${currentConversation.nomeContato || currentConversation.telefone}`,
        description: `Conversa WhatsApp: ${currentConversation.telefone}`,
        payload: { created },
      })
      await state.saveBookingOptions(conversation.id, [])
      await state.updateConversation(conversation.id, {
        status: 'reuniao_agendada',
        etapa: 'checklist_documental',
        currentState: 'meeting_scheduled',
        crmStatus: 'Reunião agendada',
        resumo: `Reuniao agendada para ${slot.label}.`,
      })
      await crm.updateLeadStatus(currentConversation.clienteId, 'Reunião agendada', `WhatsApp IA: ${slot.label}`)
      const checklist = await docs.getChecklistStatus(conversation.id)
      const reply = await humanizeReply(
        { action: 'meeting_scheduled', slot, externalEventId: created.externalEventId, checklist },
        `Sua reunião está confirmada para ${slot.label}.\n\nAgora pode enviar por aqui os documentos iniciais: ${checklist.map((d) => d.label).join('; ')}.`,
      )
      return { conversation: currentConversation, replies: [reply] }
    }

    if (currentQuestion && text && !(answers.length === 0 && isGreeting(text))) {
      for (const parsed of eligibility.parseMessage(text, answers)) {
        const question = eligibility.getQuestions().find((item) => item.key === parsed.questionKey)!
        await state.saveEligibilityAnswer({
          conversationId: conversation.id, questionKey: parsed.questionKey, questionText: question.text,
          answerText: parsed.answerText, answerValue: parsed.value, score: parsed.score,
        })
        answers.push(parsed)
      }
    }

    const result = eligibility.calculate(answers)
    const crmStatus = result.nextQuestion
      ? 'Em qualificação'
      : result.status === 'elegivel'
        ? 'Elegível'
        : result.status === 'atencao'
          ? 'Checklist incompleto'
          : 'Não elegível'
    await state.updateConversation(conversation.id, {
      elegibilidadeStatus: result.status,
      etapa: result.nextQuestion ? `eligibilidade_${result.nextQuestion.key}` : result.status,
      currentState: result.nextQuestion ? `eligibility_${result.nextQuestion.key}` : result.status,
      crmStatus,
      eligibilityScore: result.score,
      prioridade: result.status === 'elegivel' ? 'alta' : result.status === 'atencao' ? 'media' : 'normal',
      resumo: result.reasons.join(' '),
    })
    await state.saveEligibilityResult({
      conversationId: conversation.id,
      score: result.score,
      maxScore: result.maxScore,
      result: result.status,
      reasons: result.reasons,
      payload: { nextQuestion: result.nextQuestion },
    })
    await crm.updateLeadStatus(currentConversation.clienteId || clienteId, crmStatus)

    if (result.nextQuestion) {
      const reply = await humanizeReply(
        { action: 'ask_eligibility_question', question: result.nextQuestion, score: result.score },
        result.nextQuestion.text,
      )
      return { conversation: currentConversation, replies: [reply] }
    }

    if (result.status === 'elegivel' || result.status === 'atencao') {
      return this.offerSchedule(currentConversation)
    }

    await state.updateConversation(conversation.id, {
      atendimentoModo: 'humano',
      aiEnabled: false,
      status: 'aguardando_consultor',
      etapa: 'triagem_manual',
      currentState: 'human_takeover',
      crmStatus: 'Atendimento humano',
      resumo: 'Lead fora das regras automaticas iniciais. Necessita revisao humana.',
    })
    await crm.updateLeadStatus(currentConversation.clienteId || clienteId, 'Atendimento humano', 'Triagem automatica fora das regras')
    const reply = await humanizeReply(
      { action: 'manual_review', eligibility: result },
      'Obrigado pelas informacoes. Vou deixar seu caso separado para uma revisao humana da equipe ALETIS antes de seguir com agenda ou documentos.',
    )
    return { conversation: currentConversation, replies: [reply], escalated: true }
  }
}

let cached: WhatsAppIaService | null = null
export function getWhatsAppIaService(): WhatsAppIaService {
  if (!cached) cached = new WhatsAppIaService()
  return cached
}
