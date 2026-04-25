/**
 * WhatsApp (Central de Mensagens)
 *
 * Interface de conversas com clientes integrada ao WhatsApp.
 * Contem lista de contatos, painel de chat com bolhas (texto,
 * audio com playback real), indicadores de leitura, rotulo
 * especial para mensagens da IA Alix e acoes de chamada/video.
 * Dados mockados (contacts + chatData) substituidos quando o
 * backend WhatsApp Business estiver conectado.
 */
import React, { useState, useRef, useEffect } from 'react'
import {
  Search,
  Send,
  Paperclip,
  Smile,
  Mic,
  MoreVertical,
  Phone,
  Video,
  ArrowLeft,
  Check,
  CheckCheck,
  MessageCircle,
  Play,
  Pause,
  Sparkles,
} from 'lucide-react'

// ────────────────────────────────────────────────────────────
// Audio Bubble (real playback with progress)
// ────────────────────────────────────────────────────────────
function AudioBubble({ url, fallbackDuration }: { url?: string; fallbackDuration?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => {
      setCurrentTime(audio.currentTime)
      if (audio.duration > 0) setProgress((audio.currentTime / audio.duration) * 100)
    }
    const onLoaded = () => setDuration(audio.duration || 0)
    const onEnded = () => {
      setPlaying(false)
      setProgress(0)
      setCurrentTime(0)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
    }
  }, [url])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio || !url) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const label = playing || currentTime > 0
    ? `${fmt(currentTime)} / ${fmt(duration)}`
    : (duration ? fmt(duration) : fallbackDuration || '0:00')

  return (
    <div className="flex items-center gap-3 min-w-[220px]">
      {url && <audio ref={audioRef} src={url} preload="metadata" />}
      <button
        onClick={toggle}
        disabled={!url}
        className="w-9 h-9 rounded-full bg-aletis-verde flex items-center justify-center flex-shrink-0 hover:bg-aletis-verde-escuro transition-colors disabled:opacity-50"
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        {playing ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="h-1.5 bg-aletis-grafite-claro/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-aletis-verde rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[11px] font-body text-aletis-grafite-claro mt-1">{label}</p>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────
interface ChatMessage {
  id: number
  from: 'client' | 'consultant'
  text: string
  time: string
  read?: boolean
  type?: 'text' | 'audio' | 'image'
  audioDuration?: string
  audioUrl?: string
  senderLabel?: string
}

interface Contact {
  id: number
  name: string
  lastMessage: string
  time: string
  unread: number
  avatar: string
  online?: boolean
  isTyping?: boolean
}

// ────────────────────────────────────────────────────────────
// Contacts Data
// ────────────────────────────────────────────────────────────
const contacts: Contact[] = [
  {
    id: 7,
    name: 'Ricardo Silva',
    lastMessage: '\uD83C\uDFA4 Alix enviou um áudio',
    time: 'agora',
    unread: 1,
    avatar: 'RS',
    online: true,
  },
  {
    id: 1,
    name: 'Ailton Caeiro',
    lastMessage: 'Boa tarde Christian, recebi a proposta...',
    time: '14:32',
    unread: 2,
    avatar: 'AC',
    online: true,
  },
  {
    id: 2,
    name: 'Paulo Luciano',
    lastMessage: 'O boleto do sinal já foi pago',
    time: '11:45',
    unread: 0,
    avatar: 'PL',
    online: true,
  },
  {
    id: 3,
    name: 'Maria Santos',
    lastMessage: 'Quando posso agendar a reunião?',
    time: '09:20',
    unread: 1,
    avatar: 'MS',
    online: false,
  },
  {
    id: 4,
    name: 'João Silva',
    lastMessage: 'Vim por indicação do Paulo...',
    time: 'Ontem',
    unread: 3,
    avatar: 'JS',
    online: false,
  },
  {
    id: 5,
    name: 'Carlos Oliveira',
    lastMessage: 'Obrigado pelo atendimento!',
    time: 'Ontem',
    unread: 0,
    avatar: 'CO',
    online: false,
  },
  {
    id: 6,
    name: 'Ana Ferreira',
    lastMessage: '\uD83C\uDFA4 Mensagem de voz (0:42)',
    time: 'Seg',
    unread: 1,
    avatar: 'AF',
    online: false,
  },
]

// ────────────────────────────────────────────────────────────
// Chat Messages per Contact
// ────────────────────────────────────────────────────────────
const chatData: Record<number, ChatMessage[]> = {
  1: [
    {
      id: 1,
      from: 'consultant',
      text: 'Boa tarde Ailton! Tudo bem? Acabamos de finalizar a análise completa do seu caso junto ao Sicoob.',
      time: '13:15',
      read: true,
    },
    {
      id: 2,
      from: 'consultant',
      text: 'Preparamos uma proposta de dação em pagamento no valor de R$ 2.049.802,53. Vou enviar o documento completo aqui.',
      time: '13:16',
      read: true,
    },
    {
      id: 3,
      from: 'consultant',
      text: 'A proposta inclui a memória de cálculo detalhada e os termos da negociação. Qualquer dúvida, estou à disposição.',
      time: '13:18',
      read: true,
    },
    {
      id: 4,
      from: 'client',
      text: 'Boa tarde Christian! Obrigado, estava ansioso por essa resposta.',
      time: '14:02',
      read: true,
    },
    {
      id: 5,
      from: 'client',
      text: 'Recebi o documento. Estou analisando com calma aqui. Mas já quero dizer que achei os valores muito justos.',
      time: '14:10',
      read: true,
    },
    {
      id: 6,
      from: 'consultant',
      text: 'Fico feliz em ouvir isso! Trabalhamos bastante para chegar no melhor cenário possível pra você. O recálculo removeu os juros compostos indevidos e aplicou a taxa correta do contrato original.',
      time: '14:15',
      read: true,
    },
    {
      id: 7,
      from: 'client',
      text: 'Boa tarde Christian, recebi a proposta e estou revisando com meu contador. A princípio concordo com os termos.',
      time: '14:30',
      read: false,
    },
    {
      id: 8,
      from: 'client',
      text: 'Uma pergunta: o prazo para aceite é de quantos dias?',
      time: '14:32',
      read: false,
    },
  ],
  2: [
    {
      id: 1,
      from: 'consultant',
      text: 'Bom dia Paulo! Como vai? Quero te informar que a proposta para a Fertiflora foi enviada com sucesso.',
      time: '09:00',
      read: true,
    },
    {
      id: 2,
      from: 'client',
      text: 'Bom dia Christian! Ótima notícia! Quanto tempo para ter resposta?',
      time: '09:15',
      read: true,
    },
    {
      id: 3,
      from: 'consultant',
      text: 'O prazo usual da Fertiflora é de 5 a 7 dias úteis. Mas vou acompanhar de perto e te dou retorno assim que tiver novidades.',
      time: '09:18',
      read: true,
    },
    {
      id: 4,
      from: 'client',
      text: 'Perfeito. Enquanto isso, já fiz o pagamento do sinal conforme combinado.',
      time: '11:30',
      read: true,
    },
    {
      id: 5,
      from: 'client',
      text: 'O boleto do sinal já foi pago',
      time: '11:45',
      read: true,
    },
    {
      id: 6,
      from: 'consultant',
      text: 'Excelente Paulo! Já confirmei o recebimento aqui no sistema. Muito obrigado pela agilidade!',
      time: '11:50',
      read: true,
    },
    {
      id: 7,
      from: 'consultant',
      text: 'O comprovante já está disponível no seu portal do cliente também, caso precise acessar.',
      time: '11:51',
      read: true,
    },
  ],
  3: [
    {
      id: 1,
      from: 'client',
      text: 'Boa tarde! Gostaria de saber como está o andamento do meu processo.',
      time: '08:30',
      read: true,
    },
    {
      id: 2,
      from: 'consultant',
      text: 'Boa tarde Maria! Seu acordo com o Banco do Brasil foi formalizado com sucesso. As parcelas estão todas programadas.',
      time: '08:45',
      read: true,
    },
    {
      id: 3,
      from: 'client',
      text: 'Que bom! E sobre aquela reunião que comentei semana passada?',
      time: '09:10',
      read: true,
    },
    {
      id: 4,
      from: 'client',
      text: 'Quando posso agendar a reunião?',
      time: '09:20',
      read: false,
    },
  ],
  4: [
    {
      id: 1,
      from: 'client',
      text: 'Boa tarde! Meu nome é João Silva, sou produtor de soja em Uberaba/MG.',
      time: '16:00',
      read: true,
    },
    {
      id: 2,
      from: 'client',
      text: 'Vim por indicação do Paulo Luciano. Ele falou muito bem do trabalho de vocês.',
      time: '16:01',
      read: false,
    },
    {
      id: 3,
      from: 'client',
      text: 'Tenho uma dívida com o Bradesco que está me preocupando. Podem me ajudar?',
      time: '16:02',
      read: false,
    },
    {
      id: 4,
      from: 'client',
      text: 'O valor é de aproximadamente R$ 185 mil. Preciso renegociar urgente.',
      time: '16:05',
      read: false,
    },
  ],
  5: [
    {
      id: 1,
      from: 'consultant',
      text: 'Carlos, parabéns! Seu acordo foi concluído com sucesso. Todas as 12 parcelas estão programadas.',
      time: '10:00',
      read: true,
    },
    {
      id: 2,
      from: 'client',
      text: 'Obrigado pelo atendimento!',
      time: '10:30',
      read: true,
    },
    {
      id: 3,
      from: 'client',
      text: 'Vocês foram excelentes. Vou indicar para outros produtores da região.',
      time: '10:31',
      read: true,
    },
    {
      id: 4,
      from: 'consultant',
      text: 'Agradecemos muito a confiança Carlos! Conte sempre conosco. Qualquer necessidade futura é só entrar em contato.',
      time: '10:35',
      read: true,
    },
  ],
  6: [
    {
      id: 1,
      from: 'client',
      text: 'Olá, boa tarde!',
      time: '14:00',
      read: true,
    },
    {
      id: 2,
      from: 'client',
      text: '',
      time: '14:05',
      read: false,
      type: 'audio',
      audioDuration: '0:42',
    },
    {
      id: 3,
      from: 'consultant',
      text: 'Olá Ana! Recebi seu áudio. Vou analisar o que você descreveu e retorno em breve com mais informações sobre o processo.',
      time: '14:20',
      read: true,
    },
  ],
  7: [
    {
      id: 1,
      from: 'client',
      text: 'oi',
      time: '13:48',
      read: true,
    },
    {
      id: 2,
      from: 'consultant',
      senderLabel: 'Alix',
      text: 'Boa tarde Ricardo! Aqui é a Alix, assistente da ALETIS. Pra te ajudar melhor, como posso te chamar?',
      time: '13:48',
      read: true,
    },
    {
      id: 3,
      from: 'client',
      text: 'Ricardo Silva, de Cascavel PR. Tenho uma dívida de 1.2 milhão no Banco do Brasil e tô preocupado.',
      time: '13:49',
      read: true,
    },
    {
      id: 4,
      from: 'consultant',
      senderLabel: 'Alix',
      text: '\u00C1udio enviado pela Alix',
      time: '13:50',
      read: false,
      type: 'audio',
      audioDuration: '0:31',
      audioUrl: '/alix-demo-ricardo.ogg',
    },
    {
      id: 5,
      from: 'consultant',
      senderLabel: 'Alix',
      text: 'Vou acionar o Christian agora. Enquanto isso, se tiver o contrato em PDF me manda por aqui.',
      time: '13:50',
      read: false,
    },
  ],
}

// ────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────
export default function WhatsApp() {
  const [selectedContact, setSelectedContact] = useState<number>(7)
  const [searchTerm, setSearchTerm] = useState('')
  const [messageInput, setMessageInput] = useState('')
  const [messages, setMessages] = useState<Record<number, ChatMessage[]>>(chatData)
  const [showMobileChat, setShowMobileChat] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [selectedContact, messages])

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const currentContact = contacts.find((c) => c.id === selectedContact)
  const currentMessages = messages[selectedContact] || []

  const handleSendMessage = () => {
    if (!messageInput.trim()) return

    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`

    const newMsg: ChatMessage = {
      id: Date.now(),
      from: 'consultant',
      text: messageInput,
      time: timeStr,
      read: false,
    }

    setMessages((prev) => ({
      ...prev,
      [selectedContact]: [...(prev[selectedContact] || []), newMsg],
    }))
    setMessageInput('')
  }

  const handleSelectContact = (id: number) => {
    setSelectedContact(id)
    setShowMobileChat(true)
  }

  const handleBackToContacts = () => {
    setShowMobileChat(false)
  }

  return (
    <div className="flex flex-col">
      {/* ── Page Header ─────────────────────────────────────── */}
      <header className="mb-6">
        <h1 className="text-3xl lg:text-4xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
          WhatsApp
        </h1>
        <p className="text-aletis-grafite-claro font-body mt-1 text-sm">
          Central de mensagens e comunicação com clientes
        </p>
      </header>

      {/* ── Chat Interface ──────────────────────────────────── */}
      {/* Altura calcula descontando ticker (32) + header (~64) + padding (~64) + page header (~80) ≈ 240px */}
      <div className="card-premium overflow-hidden h-[calc(100vh-240px)] min-h-[500px]">
        <div className="flex h-full">
          {/* ── Left Panel: Contact List ───────────────────── */}
          <div
            className={`
              w-full md:w-[380px] lg:w-[400px] flex-shrink-0 border-r border-aletis-borda flex flex-col
              ${showMobileChat ? 'hidden md:flex' : 'flex'}
            `}
          >
            {/* Contact list header */}
            <div className="px-4 py-3 border-b border-aletis-borda bg-white/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-aletis-verde flex items-center justify-center">
                    <span className="text-white text-xs font-bold">CK</span>
                  </div>
                  <span className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                    Christian Kohler
                  </span>
                </div>
                <button className="p-2 rounded-lg text-aletis-grafite-claro hover:bg-aletis-bege transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro" />
                <input
                  type="text"
                  placeholder="Buscar conversa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-aletis-bege border border-transparent text-sm font-body text-aletis-grafite-escuro placeholder:text-aletis-grafite-claro focus:outline-none focus:ring-2 focus:ring-aletis-verde/20 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredContacts.map((contact) => {
                const isSelected = contact.id === selectedContact
                return (
                  <button
                    key={contact.id}
                    onClick={() => handleSelectContact(contact.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 border-b border-aletis-borda/40 ${
                      isSelected
                        ? 'bg-aletis-verde/5 border-l-[3px] border-l-aletis-verde'
                        : 'hover:bg-aletis-bege/50 border-l-[3px] border-l-transparent'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-semibold ${
                          isSelected
                            ? 'bg-aletis-verde'
                            : 'bg-gradient-to-br from-aletis-verde-medio to-aletis-verde-escuro'
                        }`}
                      >
                        {contact.avatar}
                      </div>
                      {contact.online && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-positivo border-2 border-white" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p
                          className={`text-sm font-body truncate ${
                            contact.unread > 0
                              ? 'font-bold text-aletis-grafite-escuro'
                              : 'font-medium text-aletis-grafite-escuro'
                          }`}
                        >
                          {contact.name}
                        </p>
                        <span
                          className={`text-[11px] font-body flex-shrink-0 ml-2 ${
                            contact.unread > 0
                              ? 'text-aletis-verde font-semibold'
                              : 'text-aletis-grafite-claro'
                          }`}
                        >
                          {contact.time}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p
                          className={`text-xs font-body truncate ${
                            contact.unread > 0
                              ? 'text-aletis-grafite-escuro'
                              : 'text-aletis-grafite-claro'
                          }`}
                        >
                          {contact.lastMessage}
                        </p>
                        {contact.unread > 0 && (
                          <span className="flex-shrink-0 ml-2 w-5 h-5 rounded-full bg-aletis-verde text-white text-[10px] font-bold flex items-center justify-center">
                            {contact.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}

              {filteredContacts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-aletis-grafite-claro">
                  <MessageCircle className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm font-body">Nenhuma conversa encontrada</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Right Panel: Chat Area ─────────────────────── */}
          <div
            className={`
              flex-1 flex flex-col bg-[#F0ECE3]
              ${showMobileChat ? 'flex' : 'hidden md:flex'}
            `}
          >
            {currentContact ? (
              <>
                {/* Chat header */}
                <div className="px-4 sm:px-5 py-3 border-b border-aletis-borda bg-white flex items-center gap-3">
                  {/* Back button (mobile) */}
                  <button
                    onClick={handleBackToContacts}
                    className="md:hidden p-1.5 -ml-1 rounded-lg text-aletis-grafite-medio hover:bg-aletis-bege transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-aletis-verde-medio to-aletis-verde-escuro flex items-center justify-center text-white text-sm font-semibold">
                      {currentContact.avatar}
                    </div>
                    {currentContact.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-positivo border-2 border-white" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-semibold text-aletis-grafite-escuro truncate">
                      {currentContact.name}
                    </p>
                    <p className="text-xs font-body text-aletis-grafite-claro">
                      {currentContact.online ? 'online' : 'visto por último recentemente'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button className="p-2 rounded-lg text-aletis-grafite-claro hover:bg-aletis-bege transition-colors hidden sm:block">
                      <Phone className="w-4.5 h-4.5" />
                    </button>
                    <button className="p-2 rounded-lg text-aletis-grafite-claro hover:bg-aletis-bege transition-colors hidden sm:block">
                      <Video className="w-4.5 h-4.5" />
                    </button>
                    <button className="p-2 rounded-lg text-aletis-grafite-claro hover:bg-aletis-bege transition-colors">
                      <MoreVertical className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>

                {/* Messages area */}
                <div
                  className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-6 py-4 space-y-2"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23D4CFC5' fill-opacity='0.2'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                  }}
                >
                  {/* Date separator */}
                  <div className="flex items-center justify-center py-2">
                    <span className="px-4 py-1 rounded-lg bg-white/80 text-[11px] font-body text-aletis-grafite-claro shadow-sm">
                      Hoje
                    </span>
                  </div>

                  {currentMessages.map((msg) => {
                    const isConsultant = msg.from === 'consultant'
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isConsultant ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            isConsultant
                              ? 'bg-[#D9FDD3] text-aletis-grafite-escuro rounded-tr-md'
                              : 'bg-white text-aletis-grafite-escuro rounded-tl-md'
                          }`}
                        >
                          {/* Alix label (IA assistant) */}
                          {msg.senderLabel === 'Alix' && (
                            <div className="flex items-center gap-1 mb-1">
                              <Sparkles className="w-3 h-3 text-aletis-verde" />
                              <span className="text-[10px] font-semibold text-aletis-verde uppercase tracking-wide">
                                Alix · IA
                              </span>
                            </div>
                          )}

                          {/* Audio message special rendering */}
                          {msg.type === 'audio' ? (
                            <AudioBubble url={msg.audioUrl} fallbackDuration={msg.audioDuration} />
                          ) : (
                            <p className="text-sm font-body leading-relaxed">{msg.text}</p>
                          )}

                          {/* Time + read status */}
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[10px] font-body text-aletis-grafite-claro">
                              {msg.time}
                            </span>
                            {isConsultant && (
                              <span>
                                {msg.read ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-aletis-grafite-claro" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input bar */}
                <div className="px-3 sm:px-4 py-3 border-t border-aletis-borda bg-white">
                  <div className="flex items-center gap-2">
                    <button className="p-2 rounded-lg text-aletis-grafite-claro hover:bg-aletis-bege transition-colors hidden sm:block">
                      <Smile className="w-5 h-5" />
                    </button>
                    <button className="p-2 rounded-lg text-aletis-grafite-claro hover:bg-aletis-bege transition-colors">
                      <Paperclip className="w-5 h-5" />
                    </button>

                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSendMessage()
                      }}
                      placeholder="Digite uma mensagem..."
                      className="flex-1 px-4 py-2.5 rounded-xl bg-aletis-bege border border-transparent text-sm font-body text-aletis-grafite-escuro placeholder:text-aletis-grafite-claro focus:outline-none focus:ring-2 focus:ring-aletis-verde/20 focus:bg-white transition-all"
                    />

                    {messageInput.trim() ? (
                      <button
                        onClick={handleSendMessage}
                        className="p-2.5 rounded-xl bg-aletis-verde text-white hover:bg-aletis-verde-medio transition-colors shadow-md"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    ) : (
                      <button className="p-2.5 rounded-xl bg-aletis-verde text-white hover:bg-aletis-verde-medio transition-colors shadow-md">
                        <Mic className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center text-aletis-grafite-claro">
                <div className="w-20 h-20 rounded-full bg-aletis-bege flex items-center justify-center mb-4">
                  <MessageCircle className="w-10 h-10 text-aletis-grafite-claro/40" />
                </div>
                <h2 className="text-xl font-display font-semibold text-aletis-grafite-medio mb-2">
                  ALETIS WhatsApp
                </h2>
                <p className="text-sm font-body text-center max-w-sm">
                  Selecione uma conversa para iniciar a comunicação com seus clientes.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
