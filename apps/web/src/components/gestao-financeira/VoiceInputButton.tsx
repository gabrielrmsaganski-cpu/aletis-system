// ============================================================
// VoiceInputButton — botão de microfone usando Web Speech API
// (browser nativo). Transcreve áudio em tempo real e devolve
// texto via callback.
// ============================================================
import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'

interface Props {
  onResult: (text: string) => void
  /** se true, append ao texto existente; senão substitui */
  append?: boolean
  size?: 'sm' | 'md'
  language?: string  // 'pt-BR' default
  className?: string
}

declare global {
  interface Window {
    SpeechRecognition?: any
    webkitSpeechRecognition?: any
  }
}

export default function VoiceInputButton({ onResult, append = true, size = 'md', language = 'pt-BR', className }: Props) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const accumulatedRef = useRef<string>('')

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    setSupported(!!SR)
  }, [])

  function start() {
    setError(null)
    accumulatedRef.current = ''
    setInterim('')
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setError('Voice input não suportado neste browser')
      return
    }
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language
    recognition.onresult = (event: any) => {
      let interimText = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += transcript + ' '
        } else {
          interimText += transcript
        }
      }
      if (finalText) {
        accumulatedRef.current += finalText
      }
      setInterim(interimText)
    }
    recognition.onend = () => {
      setListening(false)
      const final = accumulatedRef.current.trim()
      if (final) onResult(final)
      setInterim('')
    }
    recognition.onerror = (event: any) => {
      setError(`Erro: ${event.error}`)
      setListening(false)
    }
    recognition.start()
    recognitionRef.current = recognition
    setListening(true)
  }

  function stop() {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        className={`opacity-40 cursor-not-allowed ${className ?? ''}`}
        title="Browser não suporta voice input"
      >
        <MicOff className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      </button>
    )
  }

  const buttonCls = listening
    ? 'bg-red-500 text-white animate-pulse'
    : 'bg-aletis-verde/10 text-aletis-verde hover:bg-aletis-verde/20'

  const sz = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8'

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={listening ? stop : start}
        className={`rounded-full transition-colors flex items-center justify-center ${buttonCls} ${sz} ${className ?? ''}`}
        title={listening ? 'Parar gravação' : 'Iniciar gravação por voz'}
      >
        {listening
          ? <Mic className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
          : <Mic className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />}
      </button>
      {listening && interim && (
        <span className="text-[10px] text-aletis-grafite-claro italic max-w-[200px] truncate" title={interim}>
          "{interim}"
        </span>
      )}
      {error && (
        <span className="text-[10px] text-red-600">{error}</span>
      )}
    </div>
  )
}
