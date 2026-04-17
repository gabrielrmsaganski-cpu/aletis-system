// ============================================================
// ALETIS — Azure Speech Service
// Speech-to-Text and Text-to-Speech via Azure Cognitive Services
// Neural voices PT-BR, OGG/Opus output WhatsApp-ready
// ============================================================

// ── Configuration ────────────────────────────────────────────

interface AzureSpeechConfig {
  subscriptionKey: string
  region: string
  defaultVoice: string
  outputFormat: string
}

function readConfig(): AzureSpeechConfig | null {
  const subscriptionKey = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!subscriptionKey || !region) return null
  return {
    subscriptionKey,
    region,
    defaultVoice: process.env.AZURE_SPEECH_VOICE || 'pt-BR-FranciscaNeural',
    // 24kHz mono Opus - high quality, WhatsApp-compatible
    outputFormat: process.env.AZURE_SPEECH_FORMAT || 'ogg-24khz-16bit-mono-opus',
  }
}

// ── Available female PT-BR neural voices (for reference) ────

export const VOZES_PT_BR_FEMININAS = {
  francisca: {
    nome: 'pt-BR-FranciscaNeural',
    descricao: 'Voz feminina adulta, tom amigável e confiável (padrão ALETIS)',
    estilos: ['assistant', 'calm'],
  },
  leticia: {
    nome: 'pt-BR-LeticiaNeural',
    descricao: 'Voz feminina jovem, tom informal e moderno',
    estilos: ['assistant'],
  },
  yara: {
    nome: 'pt-BR-YaraNeural',
    descricao: 'Voz feminina jovem, expressiva',
    estilos: ['assistant'],
  },
  thalita: {
    nome: 'pt-BR-ThalitaMultilingualNeural',
    descricao: 'Voz feminina multilíngue (mais recente), expressão natural',
    estilos: ['chat', 'empathetic'],
  },
}

// ── SSML helpers ─────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Builds SSML for Azure TTS with natural pauses and optional style.
 * Removes markdown artifacts so the voice doesn't read "asterisco asterisco".
 */
export function buildSSML(
  text: string,
  opts: { voice?: string; style?: string; rate?: string; pitch?: string } = {},
): string {
  const voice = opts.voice || 'pt-BR-FranciscaNeural'
  const style = opts.style || 'assistant'

  // Strip Markdown bold/italic/bullets/code — TTS reads them literally otherwise.
  const clean = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^[•\-\*]\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim()

  const xml = escapeXml(clean)

  // Insert a short break after each sentence for a natural cadence.
  const withBreaks = xml.replace(/([.!?])\s+/g, '$1<break time="350ms"/> ')

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="pt-BR">
  <voice name="${voice}">
    <mstts:express-as style="${style}" styledegree="1">
      <prosody rate="${opts.rate || '+0%'}" pitch="${opts.pitch || '+0%'}">${withBreaks}</prosody>
    </mstts:express-as>
  </voice>
</speak>`
}

// ── Service ─────────────────────────────────────────────────

export interface SpeechToTextResult {
  texto: string
  confianca: number
  duracaoMs?: number
  idiomaDetectado?: string
  palavras?: { palavra: string; inicio: number; fim: number; confianca: number }[]
}

export interface TextToSpeechOptions {
  voice?: string
  style?: 'assistant' | 'chat' | 'calm' | 'empathetic' | 'cheerful' | 'friendly'
  rate?: string // e.g. '+0%', '-10%', '+5%'
  pitch?: string // e.g. '+0%'
  outputFormat?: string // override config default
}

export class AzureSpeechService {
  private config: AzureSpeechConfig | null

  constructor() {
    this.config = readConfig()
    if (!this.config) {
      console.warn('[AzureSpeech] AZURE_SPEECH_KEY / AZURE_SPEECH_REGION não configurados — STT/TTS desabilitados')
    } else {
      console.log(`[AzureSpeech] Inicializado: região=${this.config.region} voz=${this.config.defaultVoice}`)
    }
  }

  isConfigured(): boolean {
    return this.config !== null
  }

  getConfigSummary(): { configurado: boolean; regiao?: string; voz?: string; formato?: string } {
    if (!this.config) return { configurado: false }
    return {
      configurado: true,
      regiao: this.config.region,
      voz: this.config.defaultVoice,
      formato: this.config.outputFormat,
    }
  }

  // ── Speech-to-Text ────────────────────────────────────────

  /**
   * Transcribes a short audio buffer (up to ~60s) using Azure's REST API.
   * Accepts common WhatsApp audio formats: audio/ogg; codecs=opus, audio/mpeg, audio/wav.
   */
  async speechToText(
    audioBuffer: Buffer,
    mimeType: string = 'audio/ogg; codecs=opus',
    language: string = 'pt-BR',
  ): Promise<SpeechToTextResult> {
    if (!this.config) {
      throw new Error('Azure Speech não configurado (defina AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)')
    }

    const url = `https://${this.config.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(language)}&format=detailed&profanity=masked`

    // Azure STT expects raw bytes, not multipart.
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
        'Content-Type': mimeType,
        'Accept': 'application/json;text/xml',
      },
      body: audioBuffer as unknown as BodyInit,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Azure STT falhou: ${res.status} ${res.statusText} ${errText.slice(0, 200)}`)
    }

    const data: any = await res.json()
    const status = data?.RecognitionStatus

    if (status !== 'Success') {
      throw new Error(`Azure STT não reconheceu (status=${status || 'desconhecido'})`)
    }

    const best = data?.NBest?.[0]
    return {
      texto: best?.Display || best?.Lexical || data?.DisplayText || '',
      confianca: typeof best?.Confidence === 'number' ? best.Confidence : 0,
      duracaoMs: typeof data?.Duration === 'number' ? Math.round(data.Duration / 10000) : undefined,
      idiomaDetectado: language,
      palavras: best?.Words?.map((w: any) => ({
        palavra: w.Word,
        inicio: Math.round(w.Offset / 10000),
        fim: Math.round((w.Offset + w.Duration) / 10000),
        confianca: w.Confidence,
      })),
    }
  }

  // ── Text-to-Speech ────────────────────────────────────────

  /**
   * Synthesizes speech from text. Returns an audio buffer in the configured format.
   * For WhatsApp voice notes, the default is ogg-24khz-16bit-mono-opus.
   */
  async textToSpeech(text: string, options: TextToSpeechOptions = {}): Promise<Buffer> {
    if (!this.config) {
      throw new Error('Azure Speech não configurado (defina AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)')
    }

    const voice = options.voice || this.config.defaultVoice
    const format = options.outputFormat || this.config.outputFormat
    const ssml = buildSSML(text, { voice, style: options.style, rate: options.rate, pitch: options.pitch })

    const url = `https://${this.config.region}.tts.speech.microsoft.com/cognitiveservices/v1`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': format,
        'User-Agent': 'ALETIS-API/0.1',
      },
      body: ssml,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Azure TTS falhou: ${res.status} ${res.statusText} ${errText.slice(0, 200)}`)
    }

    const arrayBuf = await res.arrayBuffer()
    return Buffer.from(arrayBuf)
  }
}

// ── Singleton ────────────────────────────────────────────────

let _instance: AzureSpeechService | null = null

export function getAzureSpeechService(): AzureSpeechService {
  if (!_instance) _instance = new AzureSpeechService()
  return _instance
}
