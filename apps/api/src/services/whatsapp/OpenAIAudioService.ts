// ============================================================
// ALETIS - transcricao e sintese de voz OpenAI
// ============================================================

import { getOpenAIClient } from '../llm/OpenAIClient.js'
import { isOpenAIAuxiliaryEnabled } from '../llm/ProviderConfig.js'

export const OPENAI_VOICES_PT_BR = {
  nova: { nome: 'nova', descricao: 'Voz leve para mensagens curtas' },
  alloy: { nome: 'alloy', descricao: 'Voz neutra e profissional' },
  onyx: { nome: 'onyx', descricao: 'Voz firme para comunicacoes objetivas' },
  shimmer: { nome: 'shimmer', descricao: 'Voz clara para conversas consultivas' },
}

export interface SpeechToTextResult {
  texto: string
  confianca: number
  duracaoMs?: number
  idiomaDetectado?: string
}

export interface TextToSpeechOptions {
  voice?: string
  style?: 'assistant' | 'chat' | 'calm' | 'empathetic' | 'cheerful' | 'friendly'
  rate?: string
  pitch?: string
  outputFormat?: string
}

function cleanSpeechText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/[*_`](.+?)[*_`]/g, '$1')
    .replace(/^[\u2022\-*]\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim()
}

function audioFormat(value?: string): 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm' {
  const normalized = String(value || process.env.OPENAI_TTS_FORMAT || 'opus').toLowerCase()
  if (normalized.includes('mp3')) return 'mp3'
  if (normalized.includes('aac')) return 'aac'
  if (normalized.includes('flac')) return 'flac'
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('pcm')) return 'pcm'
  return 'opus'
}

export class OpenAIAudioService {
  isConfigured(): boolean {
    return isOpenAIAuxiliaryEnabled()
  }

  getConfigSummary(): { configurado: boolean; provider: 'openai'; voz: string; formato: string; transcricao: string } {
    return {
      configurado: this.isConfigured(),
      provider: 'openai',
      voz: process.env.OPENAI_TTS_VOICE || 'nova',
      formato: process.env.OPENAI_TTS_FORMAT || 'opus',
      transcricao: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
    }
  }

  async speechToText(audioBuffer: Buffer, mimeType = 'audio/ogg', language = 'pt-BR'): Promise<SpeechToTextResult> {
    if (!this.isConfigured()) throw new Error('OPENAI_API_KEY nao configurada para transcricao')
    const extension = mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('wav') ? 'wav' : 'ogg'
    const file = new File([new Uint8Array(audioBuffer)], `audio.${extension}`, { type: mimeType })
    const response = await getOpenAIClient().audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
      language: language.toLowerCase().startsWith('pt') ? 'pt' : language.slice(0, 2),
      response_format: 'json',
      prompt: 'Conversa de consultoria financeira e agronegocio no Brasil. Preserve nomes, bancos, valores e termos de credito rural.',
      include: ['logprobs'],
    } as any) as any
    const probabilities = Array.isArray(response.logprobs)
      ? response.logprobs.map((item: any) => Math.exp(Number(item.logprob))).filter(Number.isFinite)
      : []
    const confidence = probabilities.length
      ? probabilities.reduce((sum: number, value: number) => sum + value, 0) / probabilities.length
      : 0.8
    return { texto: response.text || '', confianca: confidence, idiomaDetectado: language }
  }

  async textToSpeech(text: string, options: TextToSpeechOptions = {}): Promise<Buffer> {
    if (!this.isConfigured()) throw new Error('OPENAI_API_KEY nao configurada para sintese de voz')
    const clean = cleanSpeechText(text).slice(0, 4_096)
    const style = options.style || 'assistant'
    const model = process.env.OPENAI_TTS_MODEL || 'tts-1-hd'
    const response = await getOpenAIClient().audio.speech.create({
      model,
      voice: options.voice || process.env.OPENAI_TTS_VOICE || 'nova',
      input: clean,
      response_format: audioFormat(options.outputFormat),
      ...(model.startsWith('gpt-4o') ? {
        instructions: `Fale em portugues brasileiro, com tom ${style}, profissional, natural e objetivo. Pronuncie numeros e valores com clareza.`,
      } : {}),
    })
    return Buffer.from(await response.arrayBuffer())
  }
}

let singleton: OpenAIAudioService | null = null
export function getOpenAIAudioService(): OpenAIAudioService {
  if (!singleton) singleton = new OpenAIAudioService()
  return singleton
}
