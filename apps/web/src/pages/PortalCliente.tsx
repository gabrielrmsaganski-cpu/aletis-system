import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  LogIn,
  User,
  Lock,
  FileText,
  Download,
  Eye,
  Cloud,
  Droplets,
  TrendingUp,
  TrendingDown,
  Send,
  CheckCircle2,
  Circle,
  MessageCircle,
  Wheat,
  Sun,
  DollarSign,
  Shield,
} from 'lucide-react'

// ────────────────────────────────────────────────────────────
// Currency Formatter
// ────────────────────────────────────────────────────────────
const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

// ────────────────────────────────────────────────────────────
// CPF Mask
// ────────────────────────────────────────────────────────────
function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

// ────────────────────────────────────────────────────────────
// Greeting
// ────────────────────────────────────────────────────────────
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

// ────────────────────────────────────────────────────────────
// Negotiation Steps
// ────────────────────────────────────────────────────────────
const negotiationSteps = [
  { label: 'Analise Iniciada', done: true },
  { label: 'Proposta Elaborada', done: true },
  { label: 'Proposta Enviada', done: true },
  { label: 'Em Negociacao', done: false, current: true },
  { label: 'Acordo', done: false },
  { label: 'Concluido', done: false },
]

// ────────────────────────────────────────────────────────────
// Documents
// ────────────────────────────────────────────────────────────
const documents = [
  { nome: 'Memoria de Calculo e Proposta', data: '24/03/2026', tipo: 'proposta', canView: true },
  { nome: 'Confissao de Divida', data: '02/10/2025', tipo: 'contrato', canView: true },
  { nome: 'Comprovante Pgto R$ 10.000', data: '23/12/2025', tipo: 'comprovante', canView: false },
  { nome: 'Comprovante Pgto R$ 20.000', data: '26/02/2026', tipo: 'comprovante', canView: false },
]

// ────────────────────────────────────────────────────────────
// Chat Messages
// ────────────────────────────────────────────────────────────
const chatMessages = [
  {
    id: 1,
    from: 'alix',
    text: 'Ola Paulo! Sua proposta foi enviada ao credor. Estamos aguardando retorno.',
    time: '24/03 14:30',
  },
  {
    id: 2,
    from: 'paulo',
    text: 'Obrigado! Quando devo ter uma resposta?',
    time: '24/03 14:45',
  },
  {
    id: 3,
    from: 'alix',
    text: 'O prazo usual da Fertiflora e de 5 a 7 dias uteis. Vou te manter informado assim que houver qualquer movimentacao.',
    time: '24/03 14:47',
  },
]

// ────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [cpf, setCpf] = useState('')
  const [codigo, setCodigo] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onLogin()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-aletis-verde-escuro via-aletis-verde to-aletis-verde-medio flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
                              radial-gradient(circle at 75% 75%, white 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-10">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-aletis-verde to-aletis-verde-medio mb-4 shadow-lg">
              <span className="text-aletis-dourado font-display font-bold text-2xl">A</span>
            </div>
            <h1 className="text-2xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
              ALETIS
            </h1>
            <p className="text-aletis-grafite-claro font-body text-sm mt-1">
              Portal do Cliente
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* CPF */}
            <div>
              <label className="block text-sm font-body font-medium text-aletis-grafite-escuro mb-1.5">
                CPF
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-aletis-grafite-claro" />
                <input
                  type="text"
                  value={cpf}
                  onChange={(e) => setCpf(maskCPF(e.target.value))}
                  placeholder="000.000.000-00"
                  className="input-field pl-11 py-3.5 text-base"
                  maxLength={14}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Codigo de Acesso */}
            <div>
              <label className="block text-sm font-body font-medium text-aletis-grafite-escuro mb-1.5">
                Codigo de Acesso
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-aletis-grafite-claro" />
                <input
                  type="password"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="------"
                  className="input-field pl-11 py-3.5 text-base tracking-[0.3em] text-center"
                  maxLength={6}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 mt-2"
            >
              <LogIn className="w-5 h-5" />
              Entrar
            </button>
          </form>

          {/* Security note */}
          <div className="flex items-center justify-center gap-2 mt-6 text-xs text-aletis-grafite-claro font-body">
            <Shield className="w-3.5 h-3.5" />
            Acesso seguro e criptografado
          </div>
        </div>

        {/* Tagline */}
        <p className="text-center mt-8 text-white/60 font-body text-sm italic">
          "Verdade nos numeros. Prosperidade nos acordos."
        </p>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// STEP PROGRESS COMPONENT
// ────────────────────────────────────────────────────────────
function NegotiationProgress() {
  return (
    <div className="card-premium p-6 sm:p-8">
      <h2 className="text-lg sm:text-xl font-display font-bold text-aletis-grafite-escuro mb-6">
        Status da Negociacao
      </h2>

      {/* Desktop: horizontal stepper */}
      <div className="hidden md:block">
        <div className="flex items-center justify-between relative">
          {/* Background line */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-aletis-borda" />

          {negotiationSteps.map((step, i) => {
            const isLast = i === negotiationSteps.length - 1
            return (
              <div
                key={step.label}
                className="relative flex flex-col items-center"
                style={{ width: `${100 / negotiationSteps.length}%` }}
              >
                {/* Filled progress line */}
                {i > 0 && step.done && (
                  <div
                    className="absolute top-5 right-1/2 h-0.5 bg-aletis-verde"
                    style={{ width: '100%' }}
                  />
                )}
                {i > 0 && step.current && (
                  <div
                    className="absolute top-5 right-1/2 h-0.5 bg-aletis-dourado"
                    style={{ width: '100%' }}
                  />
                )}

                {/* Circle */}
                <div
                  className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                    step.done
                      ? 'bg-aletis-verde border-aletis-verde text-white'
                      : step.current
                      ? 'bg-aletis-dourado border-aletis-dourado text-white animate-pulse-slow shadow-lg shadow-aletis-dourado/30'
                      : 'bg-white border-aletis-borda text-aletis-grafite-claro'
                  }`}
                >
                  {step.done ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : step.current ? (
                    <div className="w-3 h-3 rounded-full bg-white" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                </div>

                {/* Label */}
                <p
                  className={`mt-3 text-xs sm:text-sm font-body text-center leading-tight ${
                    step.done
                      ? 'text-aletis-verde font-semibold'
                      : step.current
                      ? 'text-aletis-dourado-escuro font-bold'
                      : 'text-aletis-grafite-claro'
                  }`}
                >
                  {step.label}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Mobile: vertical stepper */}
      <div className="md:hidden space-y-0">
        {negotiationSteps.map((step, i) => {
          const isLast = i === negotiationSteps.length - 1
          return (
            <div key={step.label} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${
                    step.done
                      ? 'bg-aletis-verde border-aletis-verde text-white'
                      : step.current
                      ? 'bg-aletis-dourado border-aletis-dourado text-white animate-pulse-slow'
                      : 'bg-white border-aletis-borda text-aletis-grafite-claro'
                  }`}
                >
                  {step.done ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : step.current ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  ) : (
                    <Circle className="w-3.5 h-3.5" />
                  )}
                </div>
                {!isLast && (
                  <div
                    className={`w-0.5 h-6 ${
                      step.done ? 'bg-aletis-verde' : 'bg-aletis-borda'
                    }`}
                  />
                )}
              </div>
              <p
                className={`text-sm font-body pt-1.5 ${
                  step.done
                    ? 'text-aletis-verde font-semibold'
                    : step.current
                    ? 'text-aletis-dourado-escuro font-bold'
                    : 'text-aletis-grafite-claro'
                }`}
              >
                {step.label}
                {step.current && (
                  <span className="ml-2 inline-block w-2 h-2 rounded-full bg-aletis-dourado animate-pulse" />
                )}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// CLIENT DASHBOARD
// ────────────────────────────────────────────────────────────
function ClientDashboard({ onLogout }: { onLogout: () => void }) {
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState(chatMessages)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = () => {
    if (!chatInput.trim()) return
    const now = new Date()
    const timeStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1)
      .toString()
      .padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`

    setMessages((prev) => [
      ...prev,
      { id: prev.length + 1, from: 'paulo', text: chatInput, time: timeStr },
    ])
    setChatInput('')

    // Simulate ALIX response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: prev.length + 2,
          from: 'alix',
          text: 'Entendido, Paulo! Vou verificar e te retorno em breve.',
          time: timeStr,
        },
      ])
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-aletis-bege to-white">
      {/* ── Top Nav ────────────────────────────────────────── */}
      <nav className="bg-white border-b border-aletis-borda/60 shadow-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-aletis-verde to-aletis-verde-medio flex items-center justify-center">
              <span className="text-aletis-dourado font-display font-bold text-sm">A</span>
            </div>
            <div>
              <span className="font-display font-bold text-aletis-grafite-escuro text-sm tracking-wide">
                ALETIS
              </span>
              <span className="text-xs text-aletis-grafite-claro font-body ml-2 hidden sm:inline">
                Portal do Cliente
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-body font-medium text-aletis-grafite-escuro">
                Paulo Luciano
              </p>
              <p className="text-[11px] font-body text-aletis-grafite-claro">
                Dourados - MS
              </p>
            </div>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded-lg text-xs font-body font-medium text-aletis-grafite-claro hover:bg-aletis-bege hover:text-alerta transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </nav>

      {/* ── Content ────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* ── Welcome Header ─────────────────────────────── */}
        <header>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
            {getGreeting()}, Paulo
          </h1>
          <p className="text-aletis-grafite-claro font-body mt-2 text-base">
            Aqui esta o resumo da sua negociacao com a Fertiflora Insumos Agricolas.
          </p>
        </header>

        {/* ── Section 1: Negotiation Status ──────────────── */}
        <NegotiationProgress />

        {/* ── Section 2: Financial Summary ───────────────── */}
        <section>
          <h2 className="text-lg sm:text-xl font-display font-bold text-aletis-grafite-escuro mb-4">
            Resumo Financeiro
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Divida Original */}
            <div className="card-premium p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-aletis-grafite-claro/10 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-aletis-grafite-medio" />
                </div>
                <p className="text-sm font-body text-aletis-grafite-claro">Divida Original</p>
              </div>
              <p className="text-2xl sm:text-3xl font-display font-bold text-aletis-grafite-escuro">
                {formatBRL(277380.0)}
              </p>
            </div>

            {/* Saldo Recalculado */}
            <div className="card-premium p-6 border-aletis-verde/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-positivo/10 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-positivo" />
                </div>
                <p className="text-sm font-body text-aletis-grafite-claro">
                  Saldo Recalculado
                </p>
              </div>
              <p className="text-2xl sm:text-3xl font-display font-bold text-aletis-grafite-escuro">
                {formatBRL(243178.75)}
              </p>
              <p className="text-sm font-body text-positivo font-semibold mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Economia de {formatBRL(34201.25)}
              </p>
            </div>

            {/* Proposta */}
            <div className="card-premium p-6 border-aletis-dourado/30 bg-gradient-to-br from-white to-aletis-dourado-claro/20">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-aletis-dourado/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-aletis-dourado" />
                </div>
                <p className="text-sm font-body text-aletis-grafite-claro">Proposta</p>
              </div>
              <p className="text-2xl sm:text-3xl font-display font-bold text-aletis-grafite-escuro">
                4x {formatBRL(70550.0)}
              </p>
              <p className="text-xs font-body text-aletis-grafite-claro mt-2">
                Alinhado com o calendario da safra
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 3: Documents ────────────────────────── */}
        <section>
          <h2 className="text-lg sm:text-xl font-display font-bold text-aletis-grafite-escuro mb-4">
            Documentos
          </h2>
          <div className="card-premium divide-y divide-aletis-borda/60">
            {documents.map((doc, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-aletis-bege/30 transition-colors"
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-alerta/5 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-alerta" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm sm:text-base font-body font-medium text-aletis-grafite-escuro truncate">
                    {doc.nome}
                  </p>
                  <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
                    {doc.data}
                  </p>
                </div>

                {/* Action */}
                {doc.canView ? (
                  <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-body font-medium text-aletis-verde bg-aletis-verde/5 hover:bg-aletis-verde/10 transition-colors flex-shrink-0">
                    <Eye className="w-4 h-4" />
                    <span className="hidden sm:inline">Visualizar</span>
                  </button>
                ) : (
                  <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-body font-medium text-aletis-grafite-claro hover:bg-aletis-bege transition-colors flex-shrink-0">
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">Baixar</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 4 & 5: Weather + Commodities ───────── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Weather */}
          <div className="card-premium p-6">
            <div className="flex items-center gap-2 mb-4">
              <Cloud className="w-5 h-5 text-blue-500" />
              <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                Previsao do Tempo
              </h2>
            </div>

            <div className="flex items-start gap-4 mb-4">
              <div className="text-center">
                <Sun className="w-12 h-12 text-aletis-dourado mx-auto mb-1" />
                <p className="text-3xl font-display font-bold text-aletis-grafite-escuro">
                  28<span className="text-lg">°C</span>
                </p>
              </div>
              <div className="flex-1">
                <p className="text-base font-body font-semibold text-aletis-grafite-escuro">
                  Dourados - MS
                </p>
                <p className="text-sm font-body text-aletis-grafite-claro mt-0.5">
                  Parcialmente Nublado
                </p>
                <div className="flex items-center gap-1.5 mt-2 text-sm font-body text-blue-500">
                  <Droplets className="w-4 h-4" />
                  Umidade: 65%
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-50 text-sm font-body text-blue-700">
              Prox. 7 dias: sem previsao de chuva significativa
            </div>
          </div>

          {/* Commodities */}
          <div className="card-premium p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-aletis-dourado" />
              <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                Cotacoes Relevantes
              </h2>
            </div>

            <div className="space-y-3">
              {/* Soja */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-aletis-bege/60 hover:bg-aletis-bege transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-aletis-dourado/10 flex items-center justify-center">
                    <Wheat className="w-5 h-5 text-aletis-dourado" />
                  </div>
                  <div>
                    <p className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                      Soja
                    </p>
                    <p className="text-xs font-body text-aletis-grafite-claro">
                      Saca 60kg
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-display font-bold text-aletis-grafite-escuro">
                    R$ 128,50
                  </p>
                  <p className="text-xs font-body font-semibold text-positivo flex items-center justify-end gap-0.5">
                    <TrendingUp className="w-3 h-3" />
                    +1,2%
                  </p>
                </div>
              </div>

              {/* Milho */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-aletis-bege/60 hover:bg-aletis-bege transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Wheat className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                      Milho
                    </p>
                    <p className="text-xs font-body text-aletis-grafite-claro">
                      Saca 60kg
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-display font-bold text-aletis-grafite-escuro">
                    R$ 58,20
                  </p>
                  <p className="text-xs font-body font-semibold text-alerta flex items-center justify-end gap-0.5">
                    <TrendingDown className="w-3 h-3" />
                    -0,8%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 6: Chat ────────────────────────────── */}
        <section>
          <h2 className="text-lg sm:text-xl font-display font-bold text-aletis-grafite-escuro mb-4 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-aletis-verde" />
            Chat com ALIX
          </h2>
          <div className="card-premium overflow-hidden">
            {/* Chat header */}
            <div className="px-5 sm:px-6 py-4 bg-gradient-to-r from-aletis-verde to-aletis-verde-medio flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-white font-display font-bold text-xs">AI</span>
              </div>
              <div>
                <p className="text-white font-body font-semibold text-sm">ALIX</p>
                <p className="text-white/60 text-xs font-body">Assistente virtual ALETIS</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-positivo animate-pulse" />
                <span className="text-white/60 text-xs font-body">Online</span>
              </div>
            </div>

            {/* Messages */}
            <div className="px-5 sm:px-6 py-5 space-y-4 max-h-80 overflow-y-auto custom-scrollbar bg-aletis-bege/30">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.from === 'paulo' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-3 ${
                      msg.from === 'paulo'
                        ? 'bg-aletis-verde text-white rounded-br-md'
                        : 'bg-white border border-aletis-borda text-aletis-grafite-escuro rounded-bl-md shadow-sm'
                    }`}
                  >
                    <p className="text-sm font-body leading-relaxed">{msg.text}</p>
                    <p
                      className={`text-[10px] font-body mt-1.5 ${
                        msg.from === 'paulo' ? 'text-white/50' : 'text-aletis-grafite-claro'
                      }`}
                    >
                      {msg.time}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-5 sm:px-6 py-4 border-t border-aletis-borda/60 bg-white">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendMessage()
                  }}
                  placeholder="Digite sua mensagem..."
                  className="input-field py-3 text-sm flex-1"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim()}
                  className="btn-primary px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer tagline */}
        <footer className="text-center py-8">
          <p className="text-sm font-body text-aletis-grafite-claro italic">
            "Verdade nos numeros. Prosperidade nos acordos."
          </p>
          <p className="text-xs font-body text-aletis-grafite-claro/60 mt-2">
            ALETIS Financas Estrategicas
          </p>
        </footer>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// MAIN EXPORT
// ────────────────────────────────────────────────────────────
export default function PortalCliente() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />
  }

  return <ClientDashboard onLogout={() => setIsLoggedIn(false)} />
}
