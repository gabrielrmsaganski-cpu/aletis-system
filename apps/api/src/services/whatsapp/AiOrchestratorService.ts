import { isOpenAIEnabled, runOpenAI } from '../llm/OpenAIClient.js'
import { getModelForRole } from '../llm/LLMConfig.js'

function systemPrompt(): string {
  return [
    'Voce e a ALIX no WhatsApp da ALETIS.',
    'Responda de forma curta, humana, profissional e objetiva.',
    'A IA conversa, mas o backend controla elegibilidade, agenda, documentos e status.',
    'Nunca invente elegibilidade, horario, resultado juridico, resultado financeiro ou reuniao.',
    'Nunca mencione provedor, modelo ou detalhes internos.',
    'Se o estado estiver em atendimento humano, nao gere resposta automatica.',
  ].join('\n')
}

export class AiOrchestratorService {
  async composeReply(input: {
    baseReply: string
    currentMessage?: string
    state?: string | null
    lead?: Record<string, unknown> | null
    checklist?: unknown
    allowedAction: string
  }): Promise<string> {
    if (process.env.WHATSAPP_IA_ENABLED === 'false' || !isOpenAIEnabled()) return input.baseReply
    try {
      const out = await runOpenAI(
        [
          {
            role: 'user',
            content: [
              'Reescreva a resposta base sem alterar decisao, status, horarios, documentos ou proximas acoes.',
              `Acao permitida: ${input.allowedAction}`,
              `Estado: ${input.state || 'desconhecido'}`,
              `Mensagem atual: ${input.currentMessage || ''}`,
              `Lead JSON: ${JSON.stringify(input.lead || {})}`,
              `Checklist JSON: ${JSON.stringify(input.checklist || {})}`,
              `Resposta base: ${input.baseReply}`,
            ].join('\n\n'),
          },
        ],
        {
          system: systemPrompt(),
          model: getModelForRole('whatsapp'),
          maxTokens: 450,
          reasoning: { effort: 'low' },
        },
      )
      return out.text.trim() || input.baseReply
    } catch (err) {
      console.warn('[WhatsAppAI] fallback:', (err as Error).message)
      return input.baseReply
    }
  }
}

let cached: AiOrchestratorService | null = null
export function getAiOrchestratorService(): AiOrchestratorService {
  if (!cached) cached = new AiOrchestratorService()
  return cached
}
