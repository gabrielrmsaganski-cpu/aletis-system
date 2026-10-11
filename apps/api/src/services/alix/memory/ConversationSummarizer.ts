// ============================================================
// ALETIS — Conversation Summarizer
// Resume conversas longas automaticamente para manter janela
// de contexto dentro do limite de tokens.
//
// Estratégia:
//   1. Quando mensagens > HISTORY_WINDOW, resume as mensagens antigas
//   2. Mantém as últimas N mensagens verbatim
//   3. Injeta o resumo como mensagem de sistema no prompt
// ============================================================

import { generateStructured } from '../../llm/OpenAIClient.js';
import { getModelForRole } from '../../llm/LLMConfig.js';
import type { ChatMessage } from '../../AlixService.js';

export interface ConversationSummary {
  /** Resumo em português, 2-4 frases */
  summary: string;
  /** Decisões ou ações acordadas */
  decisions: string[];
  /** Tópicos principais discutidos */
  topics: string[];
  /** Quando foi gerado */
  generatedAt: number;
  /** Até qual mensagem cobre */
  coversMessagesUpTo: number;
}

const SYSTEM_PROMPT = `Você resume conversas de chat de consultoria financeira agro.

Regras:
- Resuma em 2-4 frases objetivas
- Liste decisões ou ações acordadas (bullets)
- Liste tópicos principais discutidos
- NUNCA invente informações não presentes na conversa
- Use português

Formato de saída (JSON):
{
  "summary": "texto do resumo",
  "decisions": ["decisão 1", "decisão 2"],
  "topics": ["tópico 1", "tópico 2"]
}`;

/**
 * Resume uma lista de mensagens antigas da conversa.
 * Retorna null se não houver o que resumir.
 */
export async function summarizeMessages(
  messages: ChatMessage[],
): Promise<ConversationSummary | null> {
  if (messages.length < 6) return null;

  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'CHRISTIAN' : 'ALIX'}: ${m.content.slice(0, 500)}`)
    .join('\n\n');

  const model = getModelForRole('summarizer');

  try {
    const result = await generateStructured<{ summary: string; decisions: string[]; topics: string[] }>(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Resuma esta conversa:\n\n${conversationText.slice(0, 6000)}\n\nJSON:`,
        },
      ],
      {
        name: 'resumo_conversa',
        schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            decisions: { type: 'array', items: { type: 'string' } },
            topics: { type: 'array', items: { type: 'string' } },
          },
          required: ['summary', 'decisions', 'topics'],
        },
        model,
        maxTokens: 512,
        reasoning: { effort: 'low' },
      },
    );
    const json = result.data;
    if (!json || !json.summary) return null;

    return {
      summary: String(json.summary).slice(0, 500),
      decisions: Array.isArray(json.decisions)
        ? json.decisions.map((d: unknown) => String(d).slice(0, 200))
        : [],
      topics: Array.isArray(json.topics)
        ? json.topics.map((t: unknown) => String(t).slice(0, 100))
        : [],
      generatedAt: Date.now(),
      coversMessagesUpTo: messages.length,
    };
  } catch (err) {
    console.warn('[ConversationSummarizer] falhou:', (err as Error).message);
    return null;
  }
}

/**
 * Constrói mensagens LLM a partir de mensagens de chat,
 * aplicando resumo se a conversa for longa.
 *
 *   fullMessages: todas as mensagens da sessão
 *   windowSize: quantas últimas mensagens manter verbatim
 *   returns: mensagens formatadas para o LLM
 */
export async function buildMessagesWithSummary(
  fullMessages: ChatMessage[],
  windowSize = 30,
): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
  if (fullMessages.length <= windowSize) {
    return fullMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

  // Divide em: antigas (para resumir) + recentes (verbatim)
  const olderMessages = fullMessages.slice(0, fullMessages.length - windowSize);
  const recentMessages = fullMessages.slice(-windowSize);

  // Resume as antigas
  const summary = await summarizeMessages(olderMessages);

  const output: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

  if (summary) {
    const summaryText = [
      '**RESUMO DA CONVERSA ANTERIOR:**',
      summary.summary,
      summary.decisions.length > 0
        ? `\nDecisões tomadas: ${summary.decisions.join('; ')}`
        : '',
      summary.topics.length > 0
        ? `\nTópicos: ${summary.topics.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    output.push({ role: 'system', content: summaryText });
  }

  for (const m of recentMessages) {
    output.push({ role: m.role as 'user' | 'assistant', content: m.content });
  }

  return output;
}
