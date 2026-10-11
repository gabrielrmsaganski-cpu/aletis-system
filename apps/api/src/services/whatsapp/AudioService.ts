import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getOpenAIAudioService } from './OpenAIAudioService.js'
import { getConversationStateService } from './ConversationStateService.js'
import { getEvolutionClient } from './evolution/EvolutionClient.js'
import type { NormalizedEvolutionMessage } from './evolution/types.js'

export interface AudioTranscriptionResult {
  text: string
  confidence?: number
  storageKey?: string
  sha256?: string
  provider: string
}

function storageDir(): string {
  return process.env.WHATSAPP_STORAGE_DIR || join(process.cwd(), 'storage', 'whatsapp-media')
}

export class AudioService {
  async transcribe(input: {
    conversationId: string
    messageId?: string | null
    message: NormalizedEvolutionMessage
  }): Promise<AudioTranscriptionResult> {
    const evolution = getEvolutionClient()
    const state = getConversationStateService()
    const downloaded = await evolution.downloadMedia({
      mediaUrl: input.message.mediaUrl,
      mediaBase64: input.message.mediaBase64,
      mimetype: input.message.mediaMime,
    })
    const sha256 = createHash('sha256').update(downloaded.buffer).digest('hex')
    const dir = join(storageDir(), new Date().toISOString().slice(0, 10), input.conversationId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const storageKey = join(dir, input.message.mediaFilename || `${sha256.slice(0, 16)}.ogg`)
    writeFileSync(storageKey, downloaded.buffer)
    await state.saveMediaFile({
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      providerMediaId: input.message.mediaId,
      mediaType: 'audio',
      mimeType: downloaded.mimeType,
      filename: input.message.mediaFilename || 'audio.ogg',
      storageProvider: process.env.WHATSAPP_STORAGE_PROVIDER || 'local',
      storageKey,
      sha256,
      sizeBytes: downloaded.buffer.byteLength,
      payload: { source: downloaded.source },
    })

    const speech = getOpenAIAudioService()
    if (!speech.isConfigured()) {
      throw new Error('Transcricao de audio nao configurada')
    }
    const stt = await speech.speechToText(downloaded.buffer, downloaded.mimeType, 'pt-BR')
    return {
      text: stt.texto,
      confidence: stt.confianca,
      provider: 'openai',
      storageKey,
      sha256,
    }
  }
}

let cached: AudioService | null = null
export function getAudioService(): AudioService {
  if (!cached) cached = new AudioService()
  return cached
}
