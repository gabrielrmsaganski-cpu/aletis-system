/**
 * Tool Catalog — fonte única de verdade para navegação e discovery.
 *
 * Cada entrada descreve uma ferramenta/página/calculadora do ALETIS:
 *   - identidade visual (icon, category)
 *   - identidade semântica (title, tagline, description, keywords)
 *   - endereço (route) e atalho opcional (shortcut)
 *
 * Usado por:
 *   - Sidebar (itens agrupados + tooltip)
 *   - CommandPalette (busca global ⌘K)
 *   - Página /ferramentas (catálogo explicativo)
 *   - Dashboard (cards por categoria)
 *
 * Para adicionar uma nova ferramenta: inclua uma entrada aqui,
 * crie a rota em App.tsx e a Sidebar/Palette/Ferramentas pegam sozinhos.
 */
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Target,
  Users,
  FileText,
  FileCheck,
  Wheat,
  TrendingUp,
  Cloud,
  CreditCard,
  MessageCircle,
  Bot,
  DollarSign,
  BarChart3,
  Settings,
  Sparkles,
} from 'lucide-react'

export type ToolCategory =
  | 'principal'
  | 'clientes'
  | 'agro'
  | 'mercado'
  | 'comunicacao'
  | 'gestao'

export interface CategoryMeta {
  id: ToolCategory
  label: string
  /** Subtítulo curto exibido na sidebar/catálogo */
  subtitle: string
  /** Cor de accent para pill/chip (token Tailwind) */
  accentClass: string
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'principal',
    label: 'Começar',
    subtitle: 'Atalhos do dia a dia',
    accentClass: 'bg-aletis-dourado/15 text-aletis-dourado-escuro',
  },
  {
    id: 'clientes',
    label: 'Clientes',
    subtitle: 'Prospecção, CRM, propostas e contratos',
    accentClass: 'bg-aletis-verde/10 text-aletis-verde',
  },
  {
    id: 'agro',
    label: 'Operação agro',
    subtitle: 'Custeio agrícola e crédito rural',
    accentClass: 'bg-aletis-verde/10 text-aletis-verde',
  },
  {
    id: 'mercado',
    label: 'Inteligência',
    subtitle: 'Mercado, clima e análise de cenários',
    accentClass: 'bg-aletis-dourado/10 text-aletis-dourado-escuro',
  },
  {
    id: 'comunicacao',
    label: 'Comunicação & IA',
    subtitle: 'WhatsApp e a assistente Alix',
    accentClass: 'bg-aletis-verde/10 text-aletis-verde-medio',
  },
  {
    id: 'gestao',
    label: 'Gestão',
    subtitle: 'Financeiro interno, relatórios e configurações',
    accentClass: 'bg-aletis-grafite-medio/10 text-aletis-grafite-escuro',
  },
]

export interface ToolEntry {
  /** ID estável — usado em recents e analytics */
  id: string
  /** Nome curto (aparece na sidebar e em chips) */
  title: string
  /** Tagline de 3-7 palavras (aparece em tooltip e palette) */
  tagline: string
  /** Parágrafo curto (aparece em tooltip expandida e /ferramentas) */
  description: string
  /** Ícone lucide-react */
  icon: LucideIcon
  /** Rota de destino */
  route: string
  /** Categoria para agrupamento */
  category: ToolCategory
  /** Palavras-chave (pt-BR + sinônimos) usadas pelo fuzzy search da palette */
  keywords: string[]
  /** Mostrar na sidebar? (algumas ferramentas são acessíveis só via palette/catálogo) */
  showInSidebar?: boolean
  /** Atalho de teclado opcional (ex.: "g d" → go dashboard) */
  shortcut?: string
  /** Badge opcional: "novo", "beta", "ia" */
  badge?: 'novo' | 'beta' | 'ia'
}

export const TOOL_CATALOG: ToolEntry[] = [
  // ─────────── PRINCIPAL ───────────
  {
    id: 'dashboard',
    title: 'Dashboard',
    tagline: 'Visão geral do escritório',
    description:
      'Painel de KPIs do portfólio de reestruturação: clientes ativos, volume sob negociação, economia gerada, pipeline e alertas de mercado em tempo real (SELIC, PTAX, diesel, focos de incêndio).',
    icon: LayoutDashboard,
    route: '/dashboard',
    category: 'principal',
    keywords: ['dashboard', 'painel', 'home', 'inicio', 'kpis', 'visao geral'],
    showInSidebar: true,
    shortcut: 'g d',
  },
  {
    id: 'ferramentas',
    title: 'Todas as ferramentas',
    tagline: 'Catálogo explicativo de tudo que existe',
    description:
      'Inventário completo do sistema. Cada ferramenta, calculadora e relatório com descrição detalhada do que faz, quando usar e como se conecta ao fluxo de trabalho.',
    icon: Sparkles,
    route: '/ferramentas',
    category: 'principal',
    keywords: ['ferramentas', 'catalogo', 'tudo', 'indice', 'ajuda', 'o que existe', 'tour'],
    showInSidebar: true,
    badge: 'novo',
  },

  // ─────────── CLIENTES ───────────
  {
    id: 'prospeccao',
    title: 'Prospecção',
    tagline: 'Funil de leads agro',
    description:
      'Pipeline de prospecção com mapa interativo de imóveis rurais, filtros por UF/município/área, enriquecimento de leads via SICAR/IBGE/CAR e insights gerados por IA para priorização.',
    icon: Target,
    route: '/prospeccao',
    category: 'clientes',
    keywords: ['prospeccao', 'leads', 'funil', 'sicar', 'imoveis', 'car', 'novo cliente', 'potencial'],
    showInSidebar: true,
  },
  {
    id: 'crm',
    title: 'CRM',
    tagline: 'Gestão de clientes e estágios',
    description:
      'Base de clientes em visualização Lista ou Kanban por estágio de negociação (lead → análise → proposta → fechamento). Registra dívidas, credores, histórico de contato e documentos.',
    icon: Users,
    route: '/crm',
    category: 'clientes',
    keywords: ['crm', 'clientes', 'kanban', 'lista', 'estagios', 'pipeline', 'contatos'],
    showInSidebar: true,
    shortcut: 'g c',
  },
  {
    id: 'propostas',
    title: 'Propostas',
    tagline: 'Geração e rastreamento',
    description:
      'Construtor de propostas de reestruturação: Price, SAC, carência, parcelas balão. Cada proposta tem status (rascunho → enviada → aceita → recusada) e gera PDF pronto pro cliente.',
    icon: FileText,
    route: '/propostas',
    category: 'clientes',
    keywords: ['propostas', 'proposta', 'pdf', 'price', 'sac', 'carencia', 'reestruturacao', 'renegociacao'],
    showInSidebar: true,
  },
  {
    id: 'contratos',
    title: 'Contratos',
    tagline: 'CPR-F, CPR-F/Física, confissão e acordos',
    description:
      'Seis tipos de instrumento: CPR Financeira, CPR Física, Confissão de Dívida, Termo de Renegociação, Acordo Extrajudicial e Transação. Geração, assinatura e rastreamento de execução.',
    icon: FileCheck,
    route: '/contratos',
    category: 'clientes',
    keywords: ['contratos', 'cpr', 'confissao', 'divida', 'renegociacao', 'acordo', 'transacao', 'instrumento'],
    showInSidebar: true,
  },

  // ─────────── AGRO ───────────
  {
    id: 'custeio',
    title: 'Custeio agrícola',
    tagline: 'Plano de custeio 2026 com VPL/TIR',
    description:
      'Simulador de custeio agrícola completo em 7 abas (Proponente, Imóvel, Glebas, Orçamento, Cronograma, Comercialização, Avalistas). Calcula VPL, TIR, payback e margem; auto-save a cada 1,5s; exporta PDF no padrão BB/Sicoob.',
    icon: Wheat,
    route: '/custeio',
    category: 'agro',
    keywords: ['custeio', 'agricola', 'vpl', 'tir', 'payback', 'margem', 'plano', 'safra', 'pronamp'],
    showInSidebar: true,
  },
  {
    id: 'credito',
    title: 'Crédito rural',
    tagline: 'Calculadora Pronamp/Pronaf/MCR',
    description:
      'Calculadora verificada no servidor: entrada dos parâmetros de uma linha de crédito rural (Pronaf, Pronamp, Investimento, Custeio) e retorno de taxa efetiva, parcelas, sistema de amortização e análise de aderência ao MCR do Bacen.',
    icon: CreditCard,
    route: '/credito',
    category: 'agro',
    keywords: ['credito', 'credito rural', 'pronaf', 'pronamp', 'mcr', 'taxa', 'parcela', 'simulador'],
    showInSidebar: true,
  },

  // ─────────── MERCADO ───────────
  {
    id: 'mercado',
    title: 'Mercado',
    tagline: 'Cotações, gráficos e volatilidade',
    description:
      'Inteligência de commodities em tempo real — Soja, Milho, Boi, Café, Dólar e SELIC — com gráficos históricos (Recharts), sparklines e alertas de volatilidade. Fontes: CEPEA, B3 e Bacen.',
    icon: TrendingUp,
    route: '/mercado',
    category: 'mercado',
    keywords: ['mercado', 'cotacoes', 'soja', 'milho', 'boi', 'cafe', 'dolar', 'selic', 'commodities', 'grafico'],
    showInSidebar: true,
  },
  {
    id: 'clima',
    title: 'Clima',
    tagline: 'Previsão agroclimatológica',
    description:
      'Monitoramento agroclimatológico com busca por município, previsão de 7 dias e alertas oficiais MAPA/EMBRAPA para geada, estiagem, chuva forte e focos de incêndio.',
    icon: Cloud,
    route: '/clima',
    category: 'mercado',
    keywords: ['clima', 'tempo', 'previsao', 'mapa', 'embrapa', 'geada', 'estiagem', 'chuva', 'incendio'],
    showInSidebar: true,
  },

  // ─────────── COMUNICAÇÃO ───────────
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    tagline: 'Central de mensagens ALETIS',
    description:
      'Central integrada de WhatsApp — mensagens, áudios com player, indicadores de leitura, templates aprovados e histórico por cliente. Faz ponte com o CRM automaticamente.',
    icon: MessageCircle,
    route: '/whatsapp',
    category: 'comunicacao',
    keywords: ['whatsapp', 'mensagens', 'audio', 'templates', 'conversa', 'chat'],
    showInSidebar: true,
  },
  {
    id: 'alix',
    title: 'Alix',
    tagline: 'Assistente IA com ~69 ferramentas',
    description:
      'Agente IA da ALETIS (Claude Sonnet 4.6) com acesso a dossiê, custeio, contabilidade Lambda, fiscal, relatórios, simuladores CBS-IBS/Funrural/Desenrola, BSC Agro, SICOR Bacen, RAG BM25, upload multimodal e geração real de PDF/DOCX/XLSX.',
    icon: Bot,
    route: '/ia',
    category: 'comunicacao',
    keywords: ['alix', 'ia', 'ai', 'assistente', 'chat', 'claude', 'inteligencia artificial', 'agente'],
    showInSidebar: true,
    shortcut: 'g a',
    badge: 'ia',
  },

  // ─────────── GESTÃO ───────────
  {
    id: 'financeiro',
    title: 'Financeiro',
    tagline: 'Caixa, impostos e fechamento interno',
    description:
      'Gestão financeira interna do escritório em 7 abas: Receitas, Despesas, Impostos (DAS/INSS/ISS), Extratos, Fluxo de caixa, Fechamento mensal e Anexos. Todos os lançamentos persistidos em JSON local.',
    icon: DollarSign,
    route: '/financeiro',
    category: 'gestao',
    keywords: ['financeiro', 'caixa', 'receitas', 'despesas', 'das', 'impostos', 'fechamento', 'extrato'],
    showInSidebar: true,
  },
  {
    id: 'relatorios',
    title: 'Relatórios',
    tagline: 'Portfolio, rentabilidade e LGPD',
    description:
      'Seis famílias de relatório: Portfolio (carteira), Rentabilidade, Performance, Inteligência de mercado, Fluxo de caixa e LGPD/Compliance. Exportação em PDF com identidade visual ALETIS.',
    icon: BarChart3,
    route: '/relatorios',
    category: 'gestao',
    keywords: ['relatorios', 'portfolio', 'rentabilidade', 'performance', 'lgpd', 'compliance', 'pdf'],
    showInSidebar: true,
  },
  {
    id: 'configuracoes',
    title: 'Configurações',
    tagline: 'Perfil, empresa, integrações',
    description:
      'Configuração do perfil do consultor, dados da empresa, contador vinculado, permissões por usuário e integrações externas (CEPEA, Bacen, Sicor, WhatsApp Cloud API, Azure Foundry).',
    icon: Settings,
    route: '/configuracoes',
    category: 'gestao',
    keywords: ['configuracoes', 'settings', 'perfil', 'empresa', 'contador', 'permissoes', 'integracoes'],
    showInSidebar: true,
  },
]

/**
 * Helpers de consulta
 */
export function getToolByRoute(pathname: string): ToolEntry | undefined {
  // Match exato primeiro
  const exact = TOOL_CATALOG.find((t) => t.route === pathname)
  if (exact) return exact
  // Fallback por prefixo (ex.: /custeio/abc casa com /custeio)
  return TOOL_CATALOG.find(
    (t) => pathname.startsWith(t.route + '/') && t.route !== '/'
  )
}

export function getToolsByCategory(category: ToolCategory): ToolEntry[] {
  return TOOL_CATALOG.filter((t) => t.category === category)
}

const DIACRITICS = /[̀-ͯ]/g
function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS, '')
}

export function searchTools(query: string): ToolEntry[] {
  const q = fold(query.trim())
  if (!q) return TOOL_CATALOG
  return TOOL_CATALOG.filter((t) => {
    const haystack = fold(
      [t.title, t.tagline, t.description, ...t.keywords, t.category].join(' ')
    )
    return haystack.includes(q)
  })
}
