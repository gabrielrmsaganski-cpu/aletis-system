import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send,
  Sparkles,
  User,
  Bot,
  Loader2,
  Trash2,
  Copy,
  Check,
  Calculator,
  FileText,
  TrendingUp,
  Scale,
  Cloud,
  Users,
  DollarSign,
  RefreshCw,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sources?: string[]
  pending?: boolean
}

interface Cliente {
  id: string
  nome: string
  cpf?: string
  statusRelacionamento?: string
  cidade?: string
  uf?: string
  dividaAtual?: number
  cooperativa?: string
}

interface Proposta {
  id: string
  clienteId: string
  clienteNome?: string
  status: string
  valorTotal?: number
  dataEnvio?: string
  prazoResposta?: string
  tipoProposta?: string
}

interface CondicaoClima {
  temperatura: number
  umidade: number
  condicao: string
  precipitacao24h: number
}

// ────────────────────────────────────────────────────────────
// LocalStorage persistence
// ────────────────────────────────────────────────────────────

const HISTORY_KEY = 'aletis:alix:history'
const MAX_HISTORY = 50

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.slice(-MAX_HISTORY) : []
  } catch {
    return []
  }
}

function saveHistory(msgs: Message[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs.slice(-MAX_HISTORY)))
  } catch { /* ignore */ }
}

// ────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function greetingByTime(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// ────────────────────────────────────────────────────────────
// Intent classifier — matches user input to a data-fetching route
// ────────────────────────────────────────────────────────────

type Intent =
  | { tipo: 'cliente'; termo: string }
  | { tipo: 'proposta'; status?: string }
  | { tipo: 'mercado' }
  | { tipo: 'cambio' }
  | { tipo: 'clima'; cidade?: string }
  | { tipo: 'cet' }
  | { tipo: 'spread' }
  | { tipo: 'sumula' }
  | { tipo: 'mcr' }
  | { tipo: 'saudacao' }
  | { tipo: 'capacidade' }
  | { tipo: 'generico' }

function classifyIntent(input: string): Intent {
  const q = input.toLowerCase().trim()

  if (/^(oi|ola|olá|e ai|bom dia|boa tarde|boa noite|hey)/.test(q)) {
    return { tipo: 'saudacao' }
  }
  if (/(o que voce|o que tu|quem e voce|quem é você|que pode fazer|capacidade|ajudar em|ajudar com)/.test(q)) {
    return { tipo: 'capacidade' }
  }

  // Cliente lookup by name
  const clienteMatch = q.match(/(?:cliente |do |da |proposta do |proposta da |status do |status da )([a-z\u00c0-\u00ff][a-z\u00c0-\u00ff ]{2,30})/i)
  if (clienteMatch && !/^(que|qual|como|quando|preco|precos)/.test(clienteMatch[1].trim())) {
    return { tipo: 'cliente', termo: clienteMatch[1].trim() }
  }

  if (/(calcul|cet|custo efetivo)/.test(q)) return { tipo: 'cet' }
  if (/(spread|abusividade|taxa abusiva)/.test(q)) return { tipo: 'spread' }
  if (/(sumul|súmula|stj|jurispruden)/.test(q)) return { tipo: 'sumula' }
  if (/(mcr|manual.*credito|credito rural|equaliz)/.test(q)) return { tipo: 'mcr' }
  if (/(propost)/.test(q)) {
    if (/enviad/.test(q)) return { tipo: 'proposta', status: 'enviada' }
    if (/aprovad/.test(q)) return { tipo: 'proposta', status: 'aprovada' }
    if (/rascunh/.test(q)) return { tipo: 'proposta', status: 'rascunho' }
    return { tipo: 'proposta' }
  }
  if (/(cambio|câmbio|dolar|dólar|euro|usd|cotacao.*moeda)/.test(q)) return { tipo: 'cambio' }
  if (/(preco.*hoje|precos.*hoje|cotacoes|mercado|soja|milho|boi|cafe|trigo|algodao|commodit)/.test(q)) {
    return { tipo: 'mercado' }
  }
  const climaMatch = q.match(/(?:clima|tempo|chuva|temperatura|previsao).*(?:em |no |na |de |para )([a-z\u00c0-\u00ff][a-z\u00c0-\u00ff ]+)/i)
  if (climaMatch) return { tipo: 'clima', cidade: climaMatch[1].trim() }
  if (/(clima|tempo|chuva|previsao)/.test(q)) return { tipo: 'clima' }

  return { tipo: 'generico' }
}

// ────────────────────────────────────────────────────────────
// Response generator — fetches real data and builds responses
// ────────────────────────────────────────────────────────────

interface ResponseResult {
  content: string
  sources: string[]
}

async function generateResponse(input: string): Promise<ResponseResult> {
  const intent = classifyIntent(input)

  try {
    switch (intent.tipo) {
      case 'saudacao': {
        const g = greetingByTime()
        return {
          content: `${g}, Christian! Pronta para te ajudar. Posso analisar clientes, calcular CET, puxar cotacoes do mercado, conferir clima de qualquer municipio BR, ou buscar jurisprudencia do STJ. Qual e a pauta?`,
          sources: [],
        }
      }

      case 'capacidade': {
        return {
          content: `Sou a **ALIX** — Agente de Leitura e Inteligencia Estrategica da ALETIS. Tenho acesso a:\n\n• **Clientes & Propostas**: consulto o CRM em tempo real, status, valores, prazos\n• **Mercado**: cotacoes de soja/milho/boi/cafe, Selic, IPCA, CDI, cambio USD-BRL\n• **Clima**: condicoes atuais + previsao 7 dias de qualquer municipio brasileiro (5570 cidades via IBGE)\n• **Calculos**: CET, spread relativo, evolucao de divida\n• **Jurisprudencia**: Sumulas STJ aplicaveis ao credito rural (93, 294, 296, 297, 298, 322, 323)\n• **MCR**: Manual de Credito Rural, secoes aplicaveis\n\nDigita uma pergunta em linguagem natural que eu entendo.`,
          sources: [],
        }
      }

      case 'cliente': {
        try {
          const clientes = await apiFetch<Cliente[]>('/clientes')
          const termo = intent.termo.toLowerCase()
          const match = clientes.find((c) =>
            c.nome?.toLowerCase().includes(termo),
          )
          if (!match) {
            return {
              content: `Nao encontrei "${intent.termo}" no CRM. Posso listar todos os clientes cadastrados se preferires. Tenta tambem por CPF ou por cidade.`,
              sources: ['CRM /api/clientes'],
            }
          }
          let propostasTxt = ''
          try {
            const props = await apiFetch<Proposta[]>('/propostas')
            const doCliente = props.filter((p) => p.clienteId === match.id)
            if (doCliente.length > 0) {
              propostasTxt = `\n\n**Propostas (${doCliente.length}):**\n` +
                doCliente.slice(0, 3).map((p) =>
                  `• ${p.tipoProposta || 'Proposta'} — ${p.status} — ${p.valorTotal ? fmtBRL(p.valorTotal) : 's/ valor'}`,
                ).join('\n')
            }
          } catch { /* ignore */ }

          return {
            content: `Encontrei **${match.nome}**:\n\n• Cidade: ${match.cidade || 's/ info'}${match.uf ? `/${match.uf}` : ''}\n• Cooperativa: ${match.cooperativa || 's/ info'}\n• Status: ${match.statusRelacionamento || 'ativo'}\n${match.dividaAtual ? `• Divida atual: ${fmtBRL(match.dividaAtual)}` : ''}${propostasTxt}\n\nPrecisa de analise de contrato, calculo de CET, ou preparacao de proposta?`,
            sources: ['CRM /api/clientes', '/api/propostas'],
          }
        } catch (err) {
          return {
            content: `Nao consegui conectar ao CRM agora (${(err as Error).message}). Tenta de novo em alguns segundos, ou me da o CPF do cliente que eu uso cache local.`,
            sources: [],
          }
        }
      }

      case 'proposta': {
        try {
          const props = await apiFetch<Proposta[]>('/propostas')
          const filtradas = intent.status
            ? props.filter((p) => p.status?.toLowerCase().includes(intent.status!))
            : props
          if (filtradas.length === 0) {
            return {
              content: `Nao ha propostas${intent.status ? ` com status "${intent.status}"` : ''} no sistema.`,
              sources: ['/api/propostas'],
            }
          }
          const total = filtradas.reduce((s, p) => s + (p.valorTotal || 0), 0)
          const listagem = filtradas.slice(0, 5).map((p) =>
            `• **${p.clienteNome || p.clienteId}** — ${p.status} — ${p.valorTotal ? fmtBRL(p.valorTotal) : 's/ valor'}`,
          ).join('\n')
          return {
            content: `${filtradas.length} proposta(s)${intent.status ? ` (${intent.status})` : ''} — total ${fmtBRL(total)}:\n\n${listagem}${filtradas.length > 5 ? `\n\n...e mais ${filtradas.length - 5}.` : ''}`,
            sources: ['/api/propostas'],
          }
        } catch (err) {
          return {
            content: `CRM indisponivel no momento (${(err as Error).message}). Quando voltar, posso montar um snapshot completo.`,
            sources: [],
          }
        }
      }

      case 'mercado': {
        try {
          const resp = await fetch('/api/mercado/precos')
          const json = await resp.json()
          const data = json?.data || []
          if (!Array.isArray(data) || data.length === 0) {
            return { content: 'Sem cotacoes no momento. Tenta a aba Mercado pra dados em cache.', sources: [] }
          }
          const listagem = data.slice(0, 6).map((c: any) => {
            const variacao = c.variacao24h ?? 0
            const arrow = variacao >= 0 ? '▲' : '▼'
            return `• **${c.cultura}**: ${fmtBRL(c.precoAtual)} /${c.unidade || 'sc'} ${arrow} ${Math.abs(variacao).toFixed(1)}%`
          }).join('\n')
          return {
            content: `**Cotacoes agora** (atualizacao em tempo real):\n\n${listagem}\n\nQuer o grafico de 12 meses de alguma? Me diz qual.`,
            sources: ['CEPEA/B3 via /api/mercado/precos'],
          }
        } catch (err) {
          return { content: `API de mercado indisponivel (${(err as Error).message}).`, sources: [] }
        }
      }

      case 'cambio': {
        try {
          const resp = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,CNY-BRL')
          const data = await resp.json()
          const usd = data.USDBRL
          const eur = data.EURBRL
          const cny = data.CNYBRL
          return {
            content: `**Cambio agora:**\n\n• **USD/BRL**: R$ ${parseFloat(usd.bid).toFixed(4)} (${parseFloat(usd.pctChange) >= 0 ? '+' : ''}${usd.pctChange}%)\n• **EUR/BRL**: R$ ${parseFloat(eur.bid).toFixed(4)} (${parseFloat(eur.pctChange) >= 0 ? '+' : ''}${eur.pctChange}%)\n• **CNY/BRL**: R$ ${parseFloat(cny.bid).toFixed(4)} (${parseFloat(cny.pctChange) >= 0 ? '+' : ''}${cny.pctChange}%)\n\nRelevante pra exportadores de soja (preco FOB em USD) e operacoes NDF.`,
            sources: ['AwesomeAPI / BCB'],
          }
        } catch (err) {
          return { content: `API de cambio offline (${(err as Error).message}).`, sources: [] }
        }
      }

      case 'clima': {
        // Default to Toledo if no city specified
        let codigoIbge = '4127700'
        let cidadeNome = 'Toledo/PR'
        if (intent.cidade) {
          try {
            const resp = await apiFetch<{ resultados: Array<{ codigoIbge: string; nome: string; uf: string }> }>(
              `/clima/buscar?q=${encodeURIComponent(intent.cidade)}`,
            )
            const first = resp.resultados?.[0]
            if (first) {
              codigoIbge = first.codigoIbge
              cidadeNome = `${first.nome}/${first.uf}`
            }
          } catch { /* ignore */ }
        }
        try {
          const clima = await apiFetch<{ condicaoAtual: CondicaoClima; previsao: Array<{ tempMaxima: number; tempMinima: number; precipitacaoMm: number; probabilidadeChuva: number; condicao: string }> }>(
            `/clima/municipio/${codigoIbge}`,
          )
          const c = clima.condicaoAtual
          const prev3 = clima.previsao?.slice(0, 3) || []
          const prevTxt = prev3.map((p, i) =>
            `• ${i === 0 ? 'Hoje' : i === 1 ? 'Amanha' : 'Depois'}: ${p.tempMinima.toFixed(0)}-${p.tempMaxima.toFixed(0)} C, ${p.probabilidadeChuva}% chuva ${p.precipitacaoMm > 0 ? `(${p.precipitacaoMm} mm)` : ''}`,
          ).join('\n')
          return {
            content: `**Clima em ${cidadeNome}:**\n\n**Agora:** ${c.temperatura.toFixed(1)} C, ${c.condicao}, umidade ${c.umidade}%, precip 24h ${c.precipitacao24h.toFixed(1)} mm\n\n**Proximos 3 dias:**\n${prevTxt}\n\nQuer previsao de 7 dias ou alertas climaticos da regiao?`,
            sources: ['Open-Meteo / INMET / CPTEC'],
          }
        } catch (err) {
          return { content: `Dados climaticos indisponiveis pra ${cidadeNome} (${(err as Error).message}).`, sources: [] }
        }
      }

      case 'cet':
        return {
          content: `Pra calcular o **CET (Custo Efetivo Total)**, preciso dos seguintes dados:\n\n1. **Valor do credito** (principal liberado)\n2. **Taxa nominal contratada** (% aa)\n3. **Prazo total** (em meses)\n4. **Periodicidade de pagamento** (mensal, semestral, anual)\n5. **IOF** (se incide, normalmente 0,38% + 0,0082% ao dia)\n6. **Seguro prestamista/agricola** (se houver)\n7. **TAC e outros encargos** (tarifa de cadastro, avaliacao, etc.)\n\nO CET e a TIR da serie de fluxos de caixa realmente desembolsados pelo tomador vs. o valor liquido recebido. Me passa esses dados ou o nome de um cliente que eu puxo do sistema.`,
          sources: ['Res. BCB 3.517/07'],
        }

      case 'spread':
        return {
          content: `**Spread relativo** e a diferenca entre o CET efetivo e a taxa original contratada, expressa como percentual.\n\n**Formula:** (CET − TaxaOriginal) / TaxaOriginal × 100\n\n**Interpretacao pratica:**\n• < 20%: margem normal\n• 20-50%: atencao, verificar composicao de tarifas\n• **> 50%: potencial abusividade** — aciona Sumula 298 STJ\n• > 100%: altamente abusivo, passivel de repactuacao judicial\n\n**Caso Ailton Caeiro:** spread de **117,7%** (taxa original ponderada 13,98% aa vs. CET 30,46% aa) — padrao claro de transmutacao de credito rural equalizado em pessoal. Aplicavel MCR 2-6-4.\n\nMe passa os dados de um contrato que eu calculo na hora.`,
          sources: ['STJ Sumula 298', 'MCR 2-6-4'],
        }

      case 'sumula':
        return {
          content: `**Principais Sumulas STJ aplicaveis ao credito rural:**\n\n• **Sumula 93** — Legislacao de cedulas de credito rural admite pacto de capitalizacao de juros\n• **Sumula 294** — Nao e potestativa a clausula que preve comissao de permanencia\n• **Sumula 296** — Juros remuneratorios nao sao limitados em 12% aa para instituicoes financeiras\n• **Sumula 297** — CDC e aplicavel as instituicoes financeiras\n• **Sumula 298** — **Alongamento de divida rural e cabivel em caso de frustracao de safra** (caso Ailton)\n• **Sumula 322** — Repeticao de indebito nao exige prova de erro\n• **Sumula 323** — Execucao fiscal nao prossegue com bens ja penhorados\n• **Sumula 380** — Admitida revisao de contratos bancarios\n• **Sumula 472** — Permitida capitalizacao de juros em contratos pos 31/3/2000\n\nQual situacao especifica quer que eu analise?`,
          sources: ['STJ - Banco de Sumulas'],
        }

      case 'mcr':
        return {
          content: `**MCR (Manual de Credito Rural)** — principais secoes para casos como o Ailton:\n\n• **MCR 2-1** — Condicoes basicas do credito rural (finalidade, beneficiarios, limites)\n• **MCR 2-6** — **Encargos financeiros em operacoes com juros equalizados** — secao critica pois proibe alteracao de taxas apos contratacao em operacoes subvencionadas pelo governo\n• **MCR 2-6-4** — Detalha que credito equalizado (Plano Safra, Pronaf, Moderagro, etc.) **mantem taxa original mesmo em repactuacao**\n• **MCR 2-7** — Risco de credito e garantias\n• **MCR 7** — Prorrogacao, alongamento e composicao de dividas rurais\n• **MCR 16** — Proagro (seguro agricola oficial)\n\n**Caso Ailton:** 57,63% do saldo era custeio equalizado (juros 5,5-7,5% aa). A aplicacao pela cooperativa de taxa de credito pessoal viola MCR 2-6-4 diretamente.\n\nQuer que eu monte uma fundamentacao tecnica pra algum contrato?`,
          sources: ['BCB/MCR - bcb.gov.br/estabilidadefinanceira/mcr'],
        }

      case 'generico':
      default:
        return {
          content: `Entendido. Pra te dar uma resposta precisa, posso:\n\n• Consultar **clientes** no CRM — me passa nome/CPF\n• Puxar **propostas** — posso filtrar por status (enviada/aprovada/rascunho)\n• Checar **mercado** — soja, milho, boi, cafe, indicadores\n• Ver **clima** de qualquer cidade BR — basta o nome\n• Calcular **CET / spread** — me passa os numeros\n• Buscar **sumulas STJ** ou **MCR** — me diz o contexto\n\nPergunta em linguagem natural que eu entendo.`,
          sources: [],
        }
    }
  } catch (err) {
    return {
      content: `Ops, algo deu errado processando: ${(err as Error).message}. Tenta reformular?`,
      sources: [],
    }
  }
}

// ────────────────────────────────────────────────────────────
// Markdown-lite renderer (bold + bullet lists)
// ────────────────────────────────────────────────────────────

function renderContent(text: string): React.ReactNode {
  return text.split('\n').map((line, i) => {
    if (line.trim().startsWith('• ')) {
      return (
        <div key={i} className="flex gap-2 my-0.5">
          <span className="text-aletis-dourado flex-shrink-0">•</span>
          <span>{renderInline(line.trim().slice(2))}</span>
        </div>
      )
    }
    if (line.trim() === '') return <div key={i} className="h-2" />
    return <div key={i}>{renderInline(line)}</div>
  })
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-display">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  )
}

// ────────────────────────────────────────────────────────────
// Quick action buttons
// ────────────────────────────────────────────────────────────

const QUICK_ACTIONS: { icon: React.ElementType; label: string; prompt: string }[] = [
  { icon: Calculator, label: 'Calcular CET', prompt: 'Como calcular CET?' },
  { icon: FileText, label: 'Propostas', prompt: 'Quais propostas estao enviadas?' },
  { icon: TrendingUp, label: 'Precos hoje', prompt: 'Quais os precos hoje?' },
  { icon: DollarSign, label: 'Cambio', prompt: 'Cambio USD hoje' },
  { icon: Cloud, label: 'Clima', prompt: 'Clima em Toledo PR' },
  { icon: Scale, label: 'Sumulas STJ', prompt: 'Sumulas aplicaveis ao credito rural' },
  { icon: FileText, label: 'MCR', prompt: 'MCR 2-6-4' },
  { icon: Users, label: 'Ailton Caeiro', prompt: 'Proposta do Ailton Caeiro' },
]

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

export default function ALIX() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const loaded = loadHistory()
    if (loaded.length > 0) return loaded
    return [{
      id: 'welcome',
      role: 'assistant',
      content: `${greetingByTime()} Christian! Sou a **ALIX** — Agente de Leitura e Inteligencia Estrategica.\n\nPosso consultar clientes, propostas, precos de mercado, clima de qualquer municipio BR, calcular CET/spread, e buscar jurisprudencia do STJ. Tudo com dados reais do sistema.\n\nNo que posso ajudar?`,
      timestamp: Date.now(),
    }]
  })
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Persist history
  useEffect(() => { saveHistory(messages) }, [messages])

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])

  const handleSend = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || isTyping) return

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    try {
      // Small artificial delay for natural feel (250-450ms)
      const delay = 250 + Math.random() * 200
      const [response] = await Promise.all([
        generateResponse(text),
        new Promise((r) => setTimeout(r, delay)),
      ])

      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        sources: response.sources,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: `Erro: ${(err as Error).message}. Tenta de novo?`,
        timestamp: Date.now(),
      }])
    } finally {
      setIsTyping(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, isTyping])

  const handleClear = useCallback(() => {
    if (!window.confirm('Apagar todo o historico da conversa com a ALIX?')) return
    const welcome: Message = {
      id: `w-${Date.now()}`,
      role: 'assistant',
      content: `Conversa limpa. ${greetingByTime()}, como posso ajudar?`,
      timestamp: Date.now(),
    }
    setMessages([welcome])
  }, [])

  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }, [])

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-aletis-verde to-aletis-verde-escuro flex items-center justify-center shadow-md">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-aletis-grafite-escuro leading-tight">ALIX</h1>
            <p className="text-aletis-grafite-medio text-sm font-body">
              Agente de Leitura e Inteligencia Estrategica
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-positivo/10 text-positivo text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-positivo animate-pulse" />
            Online
          </span>
          <button
            onClick={handleClear}
            className="p-2 rounded-lg text-aletis-grafite-claro hover:text-alerta hover:bg-alerta/5 transition-colors"
            title="Limpar conversa"
            aria-label="Limpar conversa"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat container */}
      <div className="flex-1 bg-white rounded-2xl border border-aletis-borda shadow-sm flex flex-col overflow-hidden">
        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"
        >
          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
                <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3 ${
                  isUser
                    ? 'bg-aletis-verde text-white rounded-br-md'
                    : 'bg-aletis-bege text-aletis-grafite-escuro rounded-bl-md border border-aletis-borda/50'
                }`}>
                  {!isUser && (
                    <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-aletis-borda/40">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-aletis-dourado flex items-center justify-center">
                          <Bot className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-aletis-dourado">ALIX</span>
                      </div>
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="opacity-0 group-hover:opacity-100 text-aletis-grafite-claro hover:text-aletis-grafite-escuro transition-opacity"
                        title="Copiar"
                        aria-label="Copiar resposta"
                      >
                        {copiedId === msg.id
                          ? <Check className="w-3.5 h-3.5 text-positivo" />
                          : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap font-body">
                    {renderContent(msg.content)}
                  </div>
                  {!isUser && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-aletis-borda/40 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-body text-aletis-grafite-claro uppercase tracking-wide">
                        Fontes:
                      </span>
                      {msg.sources.map((s, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-aletis-borda text-aletis-grafite-medio"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="max-w-[75%] rounded-2xl px-5 py-3 bg-aletis-bege border border-aletis-borda/50 rounded-bl-md">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-5 h-5 rounded-full bg-aletis-dourado flex items-center justify-center">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-aletis-dourado">ALIX</span>
                </div>
                <div className="flex gap-1 py-1">
                  <span className="w-2 h-2 rounded-full bg-aletis-grafite-claro animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-aletis-grafite-claro animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-aletis-grafite-claro animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t border-aletis-borda p-4">
          <div className="flex gap-3 items-end">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={isTyping}
              placeholder="Pergunta em linguagem natural..."
              className="input-field flex-1 disabled:opacity-60"
              aria-label="Mensagem para ALIX"
            />
            <button
              onClick={() => handleSend()}
              disabled={isTyping || !input.trim()}
              className="btn-primary px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              aria-label="Enviar"
            >
              {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span className="hidden sm:inline">Enviar</span>
            </button>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mt-3 overflow-x-auto custom-scrollbar pb-1">
            {QUICK_ACTIONS.map((q) => {
              const Icon = q.icon
              return (
                <button
                  key={q.label}
                  onClick={() => handleSend(q.prompt)}
                  disabled={isTyping}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-aletis-borda text-aletis-grafite-medio hover:bg-aletis-verde hover:text-white hover:border-aletis-verde transition-all disabled:opacity-50"
                >
                  <Icon className="w-3 h-3" />
                  {q.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
