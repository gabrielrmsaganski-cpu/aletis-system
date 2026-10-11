'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  Calculator,
  Building2,
  ArrowRight,
} from 'lucide-react'
import { getWhatsappHref } from '@/lib/siteConfig'
import { cn } from '@/lib/cn'

interface Atalho {
  label: string
  icone: typeof MessageCircle
  resposta: string
  cta?: { label: string; href: string }
}

const atalhos: Atalho[] = [
  {
    label: 'Quero entender como funciona',
    icone: Sparkles,
    resposta:
      'A ALETIS começa organizando documentos, contratos, garantias e fluxo de safra. Depois monta cenários de decisão e, só então, apoia a conversa com credores. O objetivo é chegar à negociação com uma leitura financeira clara.',
    cta: { label: 'Ver metodologia', href: '/sobre#metodologia' },
  },
  {
    label: 'Quero simular um cenário',
    icone: Calculator,
    resposta:
      'Há três simuladores públicos: reestruturação de dívida, capacidade de pagamento da safra e detector de abusividade. Eles ajudam a fazer uma primeira leitura, mas não substituem análise dos contratos.',
    cta: { label: 'Abrir calculadoras', href: '/calculadoras' },
  },
  {
    label: 'Quero falar com um especialista',
    icone: Building2,
    resposta:
      'Perfeito. Nosso time de consultoria retorna em até 1 dia útil. Você pode iniciar por WhatsApp agora ou preencher um formulário curto para que já recebamos o contexto.',
    cta: { label: 'Ir para contato', href: '/contato' },
  },
]

interface Msg {
  autor: 'bot' | 'user'
  texto: string
  cta?: { label: string; href: string }
}

export function FloatingChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([
    {
      autor: 'bot',
      texto:
        'Olá, sou a ALIX, assistente da ALETIS. Posso te mostrar como funciona a assessoria, abrir uma simulação ou encaminhar seu caso para um consultor. Por onde começamos?',
    },
  ])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, open])

  const handleAtalho = (a: Atalho) => {
    setMessages((prev) => [
      ...prev,
      { autor: 'user', texto: a.label },
      { autor: 'bot', texto: a.resposta, cta: a.cta },
    ])
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    const v = input.trim()
    if (!v) return
    setMessages((prev) => [
      ...prev,
      { autor: 'user', texto: v },
      {
        autor: 'bot',
        texto:
          'Entendi. Para dar a melhor resposta, posso conectar você a um consultor humano agora ou você prefere seguir por simulação?',
        cta: { label: 'Falar com consultor', href: '/contato' },
      },
    ])
    setInput('')
  }

  const waLink = getWhatsappHref(
    'Olá ALETIS, vim pelo site e gostaria de conversar.',
  )

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Fechar chat' : 'Abrir chat'}
        aria-expanded={open}
        className={cn(
          'fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-gold transition-all duration-300',
          open
            ? 'bg-white text-aletis-verde-escuro border border-aletis-borda'
            : 'bg-aletis-dourado text-aletis-verde-escuro hover:scale-105',
        )}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-6 w-6" />}
        {!open && (
          <span className="absolute inset-0 rounded-full border border-aletis-dourado/50 animate-pulse-soft" />
        )}
      </button>

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Chat ALIX"
        className={cn(
          'fixed bottom-24 right-6 z-40 w-[calc(100vw-3rem)] max-w-[380px] origin-bottom-right overflow-hidden rounded-2xl bg-white shadow-premium transition-all duration-300',
          open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
        )}
      >
        {/* Header do chat */}
        <div className="relative overflow-hidden bg-gradient-to-br from-aletis-verde-escuro to-aletis-verde-profundo px-5 py-4 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-10 bg-grain"
          />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-aletis-dourado/40 bg-aletis-dourado/20">
              <Sparkles className="h-4 w-4 text-aletis-dourado" />
            </div>
            <div>
              <p className="font-display text-sm font-semibold">ALIX · Assistente ALETIS</p>
              <p className="flex items-center gap-1.5 text-[11px] text-white/60">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Online · Resposta em tempo real
              </p>
            </div>
          </div>
        </div>

        {/* Mensagens */}
        <div
          ref={scrollRef}
          className="max-h-[320px] min-h-[200px] overflow-y-auto px-5 py-4 space-y-3 bg-aletis-marfim"
        >
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'flex',
                m.autor === 'bot' ? 'justify-start' : 'justify-end',
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  m.autor === 'bot'
                    ? 'bg-white text-aletis-grafite-escuro border border-aletis-borda/60 rounded-tl-sm'
                    : 'bg-aletis-verde-escuro text-white rounded-tr-sm',
                )}
              >
                {m.texto}
                {m.cta && (
                  <Link
                    href={m.cta.href}
                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-display font-semibold uppercase tracking-wider text-aletis-dourado-escuro hover:text-aletis-dourado"
                  >
                    {m.cta.label} <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Atalhos */}
        <div className="border-t border-aletis-borda/60 bg-white px-5 pt-3">
          <p className="text-[10px] font-display font-semibold uppercase tracking-widest2 text-aletis-grafite-claro">
            Atalhos
          </p>
          <div className="mt-2 flex flex-wrap gap-2 pb-3">
            {atalhos.map((a) => {
              const Icon = a.icone
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => handleAtalho(a)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-aletis-borda bg-white px-3 py-1.5 text-[11px] font-medium text-aletis-grafite-escuro transition hover:border-aletis-dourado hover:bg-aletis-dourado/10"
                >
                  <Icon className="h-3 w-3 text-aletis-dourado-escuro" />
                  {a.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 border-t border-aletis-borda/60 bg-white px-3 py-2.5"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva sua pergunta…"
            className="flex-1 bg-transparent px-2 py-2 text-sm placeholder:text-aletis-grafite-claro focus:outline-none"
            aria-label="Mensagem"
          />
          <button
            type="submit"
            aria-label="Enviar"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-aletis-verde-escuro text-white transition hover:bg-aletis-verde"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>

        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 border-t border-aletis-borda/60 bg-aletis-bege px-5 py-3 text-[12px] font-display font-semibold uppercase tracking-wider text-aletis-verde-escuro transition hover:bg-aletis-dourado/15"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Continuar pelo WhatsApp
          </a>
        )}
      </div>
    </>
  )
}
