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
  Activity,
  Building2,
  Briefcase,
  MapPin,
  Landmark,
  Calculator,
  FileSpreadsheet,
  Archive,
} from 'lucide-react'

export type ToolCategory =
  | 'principal'
  | 'funil'
  | 'deal'
  | 'operacao'
  | 'mercado'
  | 'sistema'

export interface CategoryMeta {
  id: ToolCategory
  label: string
  /** Subtítulo curto exibido na sidebar/catálogo */
  subtitle: string
  /** Cor de accent para pill/chip (token Tailwind) */
  accentClass: string
}

/**
 * Categorias da Sidebar — ordem semântica do workflow do consultor.
 * Cada uma mapeia a um momento real do dia: começar → captar → fechar →
 * operar → entender o mercado → administrar.
 */
export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'principal',
    label: 'Início',
    subtitle: 'Dashboard, IA e catálogo',
    accentClass: 'bg-aletis-dourado/15 text-aletis-dourado-escuro',
  },
  {
    id: 'funil',
    label: 'Clientes',
    subtitle: 'Prospecção e CRM',
    accentClass: 'bg-aletis-verde/10 text-aletis-verde',
  },
  {
    id: 'deal',
    label: 'Comercial',
    subtitle: 'Propostas, negociações e contratos',
    accentClass: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'operacao',
    label: 'Operação',
    subtitle: 'Carteira, crédito e calculadoras',
    accentClass: 'bg-amber-100 text-amber-800',
  },
  {
    id: 'mercado',
    label: 'Inteligência',
    subtitle: 'Mercado, clima, fontes',
    accentClass: 'bg-sky-100 text-sky-700',
  },
  {
    id: 'sistema',
    label: 'Administração',
    subtitle: 'Financeiro interno, relatórios, configurações',
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
    title: 'Visão geral',
    tagline: 'Prioridades e visão do escritório',
    description:
      'Organize o dia com prioridades de clientes, propostas e próximos passos. Consulte os indicadores da carteira e abra cada atendimento com o contexto disponível.',
    icon: LayoutDashboard,
    route: '/dashboard',
    category: 'principal',
    keywords: ['dashboard', 'painel', 'home', 'inicio', 'kpis', 'visao geral'],
    showInSidebar: true,
    shortcut: 'g d',
  },
  {
    id: 'ferramentas',
    title: 'Ferramentas',
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
    category: 'funil',
    keywords: ['prospeccao', 'leads', 'funil', 'sicar', 'imoveis', 'car', 'novo cliente', 'potencial'],
    showInSidebar: true,
  },
  {
    id: 'prospeccao-mapa',
    title: 'Mapa de Prospecção',
    tagline: 'Leads PGFN distribuídos por UF',
    description:
      'Visão geográfica dos leads — markers coloridos por score (quente/morno/frio), camadas de mapa e satélite, filtros por UF / tipo / dívida mínima. Quando o lead não tem lat/lng explícita, o ponto cai no centróide da UF.',
    icon: MapPin,
    route: '/prospeccao/mapa',
    category: 'funil',
    keywords: ['mapa', 'geografia', 'leads', 'prospeccao', 'uf', 'pin', 'leaflet'],
    showInSidebar: false,
  },
  {
    id: 'crm-aletis',
    title: 'Clientes · CRM',
    tagline: 'Carteira única de todos os escritórios',
    description:
      'Base única de clientes ALETIS, com filtro por escritório e visualização Lista ou Kanban por estágio. Dentro do cliente, reúne cadastro, diagnóstico, financeiro, demandas, propostas, negociações, documentos e workflow.',
    icon: Users,
    route: '/crm',
    category: 'funil',
    keywords: ['crm', 'aletis', 'canarana', 'escritorios', 'clientes', 'kanban', 'lista', 'estagios', 'pipeline', 'contatos'],
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
    category: 'deal',
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
    category: 'deal',
    keywords: ['contratos', 'cpr', 'confissao', 'divida', 'renegociacao', 'acordo', 'transacao', 'instrumento'],
    showInSidebar: true,
  },
  {
    id: 'contratos-oficiais',
    title: 'Documentos oficiais',
    tagline: '10 contratos padronizados ALETIS',
    description:
      'Geração dos 10 documentos oficiais ALETIS (Anexo 0 a Anexo VIII): contrato base, anexos de serviço, NDA, procuração, termo de aceite. Escolha o cliente, o sistema preenche os campos e gera o .docx preservando 100% da formatação original.',
    icon: FileCheck,
    route: '/contratos-oficiais',
    category: 'deal',
    keywords: ['contratos', 'oficiais', 'documentos', 'anexo', 'nda', 'procuracao', 'termo', 'aceite', 'consultoria', 'diagnostico', 'assessoria', 'erp', 'docx', 'modelo', 'template'],
    showInSidebar: true,
  },
  {
    id: 'negociacoes',
    title: 'Negociações',
    tagline: 'Deal Room global multi-credor',
    description:
      'Visão consolidada de todas as negociações por banco/credor em todos os clientes. Status, contrapropostas, deadlines, valor em jogo, economia projetada — em uma única tela com filtros por status e busca por credor/cliente.',
    icon: Building2,
    route: '/negociacoes',
    category: 'deal',
    keywords: ['negociacoes', 'deal', 'room', 'credor', 'banco', 'contraproposta', 'reestruturacao', 'divida', 'kanban'],
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
    category: 'operacao',
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
    category: 'operacao',
    keywords: ['credito', 'credito rural', 'pronaf', 'pronamp', 'mcr', 'taxa', 'parcela', 'simulador'],
    showInSidebar: true,
  },
  {
    id: 'planilhas-aletis',
    title: 'Planilhas ALETIS',
    tagline: 'Simulador v16, FARMS e Fechamento',
    description:
      'Central das planilhas transformadas em sistema: Simulador v16 financeiro, Calculadora de Viabilidade Agrícola FARMS v6 e Fechamento Geral por Embarque.',
    icon: FileSpreadsheet,
    route: '/planilhas-aletis',
    category: 'operacao',
    keywords: ['planilhas', 'excel', 'simulador v16', 'farms', 'viabilidade agricola', 'fechamento', 'embarque', 'ari do prado'],
    showInSidebar: true,
    badge: 'novo',
  },
  {
    id: 'dossies-bancarios',
    title: 'Dossiês Bancários',
    tagline: 'Modelos, checklists e PDF por banco',
    description:
      'Central de dossiês bancários agro: organiza modelos BTG, Itaú BBA, Santander, Daycoval, BOCOM BBM e cadastro produtor rural; monta checklist inteligente por caso e exporta PDF executivo com identidade ALETIS.',
    icon: Archive,
    route: '/dossies-bancarios',
    category: 'operacao',
    keywords: ['dossies', 'dossie bancario', 'cadastro bancario', 'btg', 'itau', 'santander', 'daycoval', 'bocom', 'bbm', 'bacen', 'scr', 'checklist', 'pdf', 'produtor rural'],
    showInSidebar: true,
    badge: 'novo',
  },
  {
    id: 'simulador-operacao',
    title: 'Simulador financeiro',
    tagline: 'PRICE, SAC, SACRE e CET',
    description:
      'Versão nativa do Simulador v16 com painel de dados, despesas acessórias, seguro, IOF, tabelas PRICE/SAC/SACRE, resumo comparativo, gráficos, recálculo de operações e ficha gráfica bancária.',
    icon: Calculator,
    route: '/simulador-operacao',
    category: 'operacao',
    keywords: ['simulador', 'v16', 'price', 'sac', 'sacre', 'cet', 'iof', 'seguro', 'financiamento', 'operacao', 'planilha'],
    showInSidebar: false,
    badge: 'novo',
  },
  {
    id: 'recalculo-acordo',
    title: 'Recálculo de acordo',
    tagline: 'Índices oficiais e memória auditável',
    description:
      'Recálculo financeiro de propostas com INPC, IPCA e séries do Banco Central, múltiplas parcelas, mora simples, snapshot imutável, histórico e PDF profissional.',
    icon: Landmark,
    route: '/recalculos-acordo',
    category: 'operacao',
    keywords: ['recalculo', 'acordo', 'inpc', 'ipca', 'mora', 'correcao monetaria', 'memoria de calculo', 'indices oficiais', 'pdf'],
    showInSidebar: true,
    badge: 'novo',
  },
  {
    id: 'calculadoras-agro',
    title: 'Calculadoras Agro',
    tagline: 'Dupont/Fleuriet, Preço de Venda, FARMS Viabilidade',
    description:
      'Reimplementação nativa das planilhas legadas (R.OP.001 / sistema agro). Diagnóstico financeiro Dupont 5-fatores + tipologia Fleuriet, formação de preço de venda 3.0 (4 modelos de markup) e viabilidade agrícola por cultura (FARMS) com sensibilidade ao preço e ao rendimento.',
    icon: Wheat,
    route: '/ferramentas/calculadoras-agro',
    category: 'operacao',
    keywords: [
      'calculadora',
      'dupont',
      'fleuriet',
      'roe',
      'roic',
      'preco',
      'venda',
      'markup',
      'farms',
      'viabilidade',
      'safra',
      'sensibilidade',
    ],
    showInSidebar: false,
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
    title: 'WhatsApp IA',
    tagline: 'Triagem, agenda e documentos',
    description:
      'Central WhatsApp IA conectada a Evolution API: conversas, handoff humano, triagem por regras, documentos recebidos, agenda do consultor e histórico vinculado ao CRM.',
    icon: MessageCircle,
    route: '/whatsapp',
    category: 'deal',
    keywords: ['whatsapp', 'mensagens', 'audio', 'ia', 'alix', 'evolution', 'agenda', 'documentos', 'conversa', 'chat'],
    showInSidebar: true,
    badge: 'ia',
  },
  {
    id: 'alix',
    title: 'Assistente ALIX',
    tagline: 'Copiloto operacional da ALETIS',
    description:
      'ALIX, agente IA da ALETIS com acesso a CRM, dossiês, documentos, propostas, gestão financeira, simuladores, mercado, upload multimodal e geração real de PDF/DOCX/XLSX.',
    icon: Bot,
    route: '/ia',
    category: 'principal',
    keywords: ['aletéia', 'aleteia', 'aletheia', 'alix', 'ia', 'ai', 'assistente', 'chat', 'openai', 'inteligencia artificial', 'agente'],
    showInSidebar: true,
    shortcut: 'g a',
    badge: 'ia',
  },

  // ─────────── GESTÃO ───────────
  {
    id: 'carteira-consultor',
    title: 'Carteira do consultor',
    tagline: 'Visão multi-grupo · rankings e saúde',
    description:
      'Painel consolidado da carteira do consultor: KPIs agregados (receita, EBITDA, dívida), rankings (melhor margem, mais alavancado, maior receita), distribuição saudável/atenção/crítico e tabela de todos os grupos com drill-down direto para o R.OP.001 v2.0.',
    icon: Briefcase,
    route: '/carteira',
    category: 'operacao',
    keywords: ['carteira', 'consultor', 'multi grupo', 'ranking', 'saude financeira', 'gestao financeira', 'r.op.001', 'ebitda', 'margem'],
    showInSidebar: true,
  },
  {
    id: 'financeiro-aletis',
    title: 'Financeiro ALETIS',
    tagline: 'Caixa, impostos e fechamento interno — matriz',
    description:
      'Gestão financeira interna do escritório principal ALETIS em 7 abas: Receitas, Despesas, Impostos (DAS/INSS/ISS), Extratos, Fluxo de caixa, Fechamento mensal e Anexos.',
    icon: DollarSign,
    route: '/financeiro',
    category: 'sistema',
    keywords: ['financeiro aletis', 'caixa', 'receitas', 'despesas', 'das', 'impostos', 'fechamento', 'extrato'],
    showInSidebar: true,
  },
  {
    id: 'adm-canarana',
    title: 'Administração Canarana',
    tagline: 'Receitas, despesas, folha e funcionários — Canarana',
    description:
      'Gestão administrativa do escritório de Canarana em 5 abas: Dashboard com KPIs e fluxo anual, Receitas, Despesas, Funcionários e Folha de pagamento.',
    icon: Landmark,
    route: '/adm-canarana',
    category: 'sistema',
    keywords: ['adm', 'canarana', 'administrativo', 'receitas', 'despesas', 'folha', 'funcionarios', 'escritorio'],
    showInSidebar: true,
  },
  {
    id: 'adm-aletis',
    title: 'Administração Aletis',
    tagline: 'Receitas, despesas, folha e funcionários — matriz',
    description:
      'Gestão administrativa do escritório principal ALETIS. Dashboard executivo, DRE, pipeline comercial, projetos, receitas, despesas, funcionários, folha, lançamento inteligente com OCR e fechamento mensal para contador.',
    icon: Landmark,
    route: '/adm-aletis',
    category: 'sistema',
    keywords: ['adm', 'aletis', 'administrativo', 'matriz', 'receitas', 'despesas', 'folha', 'funcionarios', 'escritorio', 'fechamento', 'ocr'],
    showInSidebar: true,
  },
  {
    id: 'checklist-assessoria',
    title: 'Checklist Assessoria',
    tagline: 'R.OP.003 / 004 / 005 — Checklist interativo do cliente',
    description:
      'Checklist de assessoria com múltiplas seções avaliativas, respostas JSONB por cliente, progresso visual e exportação. Templates configuráveis via API.',
    icon: FileCheck,
    route: '/clientes/:id/checklist',
    category: 'operacao',
    keywords: ['checklist', 'assessoria', 'rop003', 'rop004', 'rop005', 'avaliacao', 'cliente'],
    showInSidebar: false,
    badge: 'novo',
  },

  {
    id: 'relatorios',
    title: 'Relatórios',
    tagline: 'Portfolio, rentabilidade e LGPD',
    description:
      'Seis famílias de relatório: Portfolio (carteira), Rentabilidade, Performance, Inteligência de mercado, Fluxo de caixa e LGPD/Compliance. Exportação em PDF com identidade visual ALETIS.',
    icon: BarChart3,
    route: '/relatorios',
    category: 'sistema',
    keywords: ['relatorios', 'portfolio', 'rentabilidade', 'performance', 'lgpd', 'compliance', 'pdf'],
    showInSidebar: true,
  },
  {
    id: 'configuracoes',
    title: 'Configurações',
    tagline: 'Perfil, empresa, integrações',
    description:
      'Configuração do perfil do consultor, dados da empresa, contador vinculado, permissões por usuário e integrações externas de mercado, comunicação, documentos e IA.',
    icon: Settings,
    route: '/configuracoes',
    category: 'sistema',
    keywords: ['configuracoes', 'settings', 'perfil', 'empresa', 'contador', 'permissoes', 'integracoes'],
    showInSidebar: true,
  },
  {
    id: 'fontes',
    title: 'Fontes de dados',
    tagline: 'SLA das 36 fontes externas',
    description:
      'Painel de saúde das 36 fontes oficiais (BCB, CEPEA, CONAB, INMET, IBGE, ANP, NASA, etc.) com status atual, latência, uptime % nas últimas 24h/7d, timeline de transições e último erro. Telemetria persistida em Postgres via audit_log.',
    icon: Activity,
    route: '/fontes',
    category: 'mercado',
    keywords: ['fontes', 'sla', 'uptime', 'monitoramento', 'observability', 'health', 'integracoes', 'apis'],
    showInSidebar: true,
  },
]

/**
 * Helpers de consulta
 */
export function getToolByRoute(pathname: string): ToolEntry | undefined {
  if (pathname === '/clientes' || pathname.startsWith('/clientes/')) return TOOL_CATALOG.find((t) => t.id === 'crm-aletis')
  // Match exato primeiro
  const exact = TOOL_CATALOG.find((t) => t.route === pathname)
  if (exact) return exact
  // Fallback por prefixo (ex.: /custeio/abc casa com /custeio)
  return [...TOOL_CATALOG].sort((a, b) => b.route.length - a.route.length).find(
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
  const words = q.split(/\s+/).filter(Boolean)
  return TOOL_CATALOG.filter((t) => {
    const haystack = fold(
      [t.title, t.tagline, t.description, ...t.keywords, t.category, CATEGORIES.find((c) => c.id === t.category)?.label ?? ''].join(' ')
    )
    return words.every((word) => haystack.includes(word))
  }).sort((a, b) => Number(fold(b.title).includes(q)) - Number(fold(a.title).includes(q)))
}
