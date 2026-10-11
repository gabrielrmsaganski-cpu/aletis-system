// ============================================================
// SpreadsheetIntelligenceService
// ============================================================
// Inventaria as planilhas do pacote operacional ALETIS/TEX e traduz
// cada arquivo para uma decisão de produto: qual módulo nativo substitui
// a planilha, o que já está implementado e o que ainda precisa migrar.
// ============================================================
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectSpreadsheetQuality, type SpreadsheetQuality, type SpreadsheetSheetQuality } from './SpreadsheetQualityService.js'

export type MigrationStatus =
  | 'native'
  | 'importable'
  | 'template-only'
  | 'needs-build'
  | 'reference'

export interface WorkbookSheetProfile extends SpreadsheetSheetQuality {}

export interface WorkbookProfile {
  path: string
  filename: string
  sizeBytes: number
  sheets: number
  formulas: number
  populatedCells: number
  hasMacros: boolean
  module: string
  status: MigrationStatus
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  replacement: string
  implemented: string[]
  gaps: string[]
  nextActions: string[]
  sheetProfiles: WorkbookSheetProfile[]
  sha256: string
  sourcePaths: string[]
  sourceCount: number
  quality: SpreadsheetQuality
  parityStatus: 'not-verified'
}

export interface SpreadsheetMigrationSummary {
  generatedAt: string
  root: string
  totals: {
    files: number
    sheets: number
    formulas: number
    populatedCells: number
    native: number
    importable: number
    templateOnly: number
    needsBuild: number
    reference: number
    physicalFiles: number
    duplicateCopies: number
    reviewRequired: number
    legacyFiles: number
    unreadableFiles: number
  }
  modules: Array<{
    id: string
    label: string
    description: string
    files: number
    formulas: number
    status: MigrationStatus
    routeHints: string[]
  }>
  workbooks: WorkbookProfile[]
}

interface ReplacementBlueprint {
  match: RegExp
  module: string
  status: MigrationStatus
  priority: WorkbookProfile['priority']
  replacement: string
  implemented: string[]
  gaps: string[]
  nextActions: string[]
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function findProjectRoot(): string {
  const candidates = [
    process.cwd(),
    join(process.cwd(), '..'),
    join(process.cwd(), '..', '..'),
    join(__dirname, '..', '..', '..', '..', '..'),
    join(__dirname, '..', '..', '..', '..', '..', '..'),
  ]
  for (const c of candidates) {
    if (existsSync(join(c, 'documentos', 'processo-assessoria', 'originais'))) return c
  }
  return process.cwd()
}

const PROJECT_ROOT = findProjectRoot()
const ROOT = join(PROJECT_ROOT, 'documentos', 'processo-assessoria', 'originais')

const BLUEPRINTS: ReplacementBlueprint[] = [
  {
    match: /Simulador\s*v?16/i,
    module: 'simulador-v16', status: 'native', priority: 'P0',
    replacement: 'Simulador de crédito nativo com SAC, PRICE, SACRE, fluxo de pagamentos, custo efetivo e comparação de cenários.',
    implemented: ['Motor e interface do Simulador v16 disponíveis no sistema'],
    gaps: ['A disponibilidade do módulo não certifica equivalência de todas as fórmulas, macros e cenários do arquivo original'],
    nextActions: ['Conferir premissas, fluxo integral, CET e casos de paridade antes de usar uma simulação como proposta'],
  },
  {
    match: /R\.OP\.001_.*(Registro de Gestao Financeira|Registro de Gestão Financeira|Diagn[oó]stico Financeiro).*\.xlsm/i,
    module: 'gestao-financeira',
    status: 'importable',
    priority: 'P0',
    replacement:
      'Gestão Financeira nativa: grupo econômico, membros, demandas, custos, safras, ativos, endividamento, passivos, garantias, premissas, DRE/FCL, Raio X, kit banco e diagnóstico.',
    implemented: [
      'REST completo em /api/gestao-financeira',
      'Importador XLSM v2 para cadastro, demandas, endividamento, ativos, custos e safra',
      'Dashboard 360, snapshots, insights, stress test, kit banco PDF e diagnóstico PPTX',
    ],
    gaps: [
      'Importador ainda não cobre 100% das abas auxiliares de premissas e relatório',
      'Algumas fórmulas da planilha precisam virar testes de paridade no motor nativo',
      'Fluxo de revisão/aprovação do diagnóstico ainda deve ser guiado por workflow',
    ],
    nextActions: [
      'Adicionar validador de paridade Excel x motor nativo para DRE/FCL, EBITDA, dívida/EBITDA e LTV',
      'Expandir importador para premissas de safra, premissas de endividamento e relatório banco',
      'Transformar geração do relatório final em wizard orientado por dados do grupo',
    ],
  },
  {
    match: /R\.OP\.007_Registro Financeiro Mensal/i,
    module: 'financeiro-mensal',
    status: 'needs-build',
    priority: 'P0',
    replacement:
      'Módulo financeiro mensal por cliente: receitas, gastos, plano de contas, conciliação, indicadores, anexos de NF/OFX e fechamento contábil.',
    implemented: [
      'Módulo financeiro interno com receitas, despesas, impostos, lançamentos, OFX, NFS-e e fechamento',
      'Serviços de parsing financeiro e dashboard financeiro',
    ],
    gaps: [
      'Ainda falta importador direto da R.OP.007',
      'Plano de contas da planilha precisa virar catálogo configurável por cliente',
      'Indicadores mensais e conciliação precisam ser consolidados em uma tela única',
    ],
    nextActions: [
      'Criar importador R.OP.007 para RECEITAS, GASTOS, PLANO DE CONTAS e CONCILIAÇÃO',
      'Mapear categorias da planilha para o FinanceiroService',
      'Criar tela de fechamento mensal do cliente com indicadores e pendências',
    ],
  },
  {
    match: /R\.OP\.010_Custos do Cliente/i,
    module: 'custos-cliente',
    status: 'importable',
    priority: 'P0',
    replacement:
      'Custos do cliente dentro da Gestão Financeira: custos operacionais, fixos, rateios por safra/cultura, alertas de margem e impacto no caixa.',
    implemented: [
      'Entidade gfCustoSafra e endpoints /api/gestao-financeira/grupos/:id/custos',
      'Importador XLSM v2 já extrai blocos de custos operacionais e fixos',
      'Cálculo de rateio, EBITDA mensal e DRE/FCL consome custos nativos',
    ],
    gaps: [
      'Importador específico da R.OP.010 standalone ainda não existe',
      'Campos de frequência, responsável e evidência documental precisam ser normalizados',
    ],
    nextActions: [
      'Criar parser R.OP.010 standalone para alimentar gfCustoSafra',
      'Adicionar revisão de custos com variação mensal e alerta de outlier',
    ],
  },
  {
    match: /(R\.OP\.011_.*(?:Quadro|Safra)|SANTO ZANIN_QUADRO SAFRA|QUADRO PRODU[CÇ][AÃ]O\.xls$|Documentos Agro - Quadro de produ[cç][aã]o)/i,
    module: 'quadro-producao',
    status: 'importable',
    priority: 'P0',
    replacement:
      'Quadro de produção nativo por cultura/safra: área própria, arrendada, produtividade, preço, custo, arrendamento, margem e premissas.',
    implemented: [
      'Entidade gfCulturaSafra e endpoints /api/gestao-financeira/grupos/:id/culturas',
      'Importador XLSM v2 extrai blocos da aba 7 - Safra',
      'Consolidação de safra e DRE/FCL já usam culturas nativas',
    ],
    gaps: [
      'Importador específico da R.OP.011 standalone ainda não existe',
      'Ainda falta comparação visual entre safras históricas e planejadas na aba do cliente',
    ],
    nextActions: [
      'Criar parser R.OP.011 para gfCulturaSafra',
      'Criar gráfico de produção por cultura/safra e análise de sensibilidade automática',
    ],
  },
  {
    match: /R\.CM\.004_Gerenciador de Contratos/i,
    module: 'contratos-crm',
    status: 'needs-build',
    priority: 'P1',
    replacement:
      'Gerenciador de contratos nativo: contratos, anexos, status, vencimentos, aceite, NDA, procuração, disponibilidade de crédito e geração de documentos oficiais.',
    implemented: [
      'Templates oficiais de contratos em /api/contratos e /api/processo-assessoria',
      'Deal Room e propostas já relacionam negociação, cliente e documentos',
    ],
    gaps: [
      'R.CM.004 ainda não virou entidade relacional completa',
      'Controle de vencimentos/renovações e assinaturas precisa virar workflow',
    ],
    nextActions: [
      'Criar entidades contrato_operacional, contrato_evento e contrato_documento',
      'Importar R.CM.004 para histórico inicial',
      'Adicionar alertas de vencimento e status no CRM',
    ],
  },
  {
    match: /R\.OP\.002_Cadastro de Clientes/i,
    module: 'crm-inteligente',
    status: 'importable',
    priority: 'P0',
    replacement:
      'CRM nativo: cadastro do cliente, grupo econômico, sócios, fazendas, demandas, produção, endividamento, estágio, advisor e dossiê.',
    implemented: [
      'Rotas /api/clientes, workspace do cliente e advisor automático',
      'Enriquecimento com CNPJ, CAR, produção municipal, clima, SRAI e ABS',
      'Gestão financeira importa membros, fazendas, demandas, safras e endividamento',
    ],
    gaps: [
      'Importador específico da R.OP.002 precisa alimentar CRM e grupo financeiro em uma única operação',
      'Campos de cadastro bancário/agro Daycoval ainda precisam de schema dedicado',
    ],
    nextActions: [
      'Criar onboarding unificado: importar R.OP.002, criar cliente, grupo e pendências',
      'Gerar checklist automático de documentos faltantes a partir do cadastro',
    ],
  },
  {
    match: /R\.OP\.008[_ ].*Foto[_ ]Mensal/i,
    module: 'financeiro-mensal', status: 'template-only', priority: 'P0',
    replacement: 'Foto mensal do cliente: consolidação de receitas, despesas, DRE, EBITDA e projeção de caixa com evidências.',
    implemented: ['Template oficial preservado e gestão financeira nativa disponível'],
    gaps: ['Não há importador específico de todas as abas mensais e premissas da Foto Mensal', 'Erros existentes no original precisam ser tratados antes de reproduzir indicadores'],
    nextActions: ['Mapear lançamentos mensais para o fechamento do cliente', 'Conferir DRE, EBITDA e caixa por período com casos de paridade'],
  },
  {
    match: /R\.OP\.009[_ ].*Checklist/i,
    module: 'bpo-financeiro', status: 'template-only', priority: 'P1',
    replacement: 'Rotina operacional por cliente com tarefas, responsável, vencimento e evidência de conclusão.',
    implemented: ['Checklist oficial e operações da ALIX disponíveis'],
    gaps: ['A planilha não cria automaticamente tarefas recorrentes no sistema'],
    nextActions: ['Transformar itens em rotinas revisáveis com responsáveis e frequência'],
  },
  {
    match: /(?:Cadastro.*(?:Daycoval|Santander|BTG|BOCOM)|Modelo Cadastro - Produtor Rural|QUADRO ITAU)/i,
    module: 'cadastro-bancario', status: 'template-only', priority: 'P1',
    replacement: 'Cadastro bancário com dados do CRM, imóveis, produção, dívidas, garantias e revisão específica para cada instituição.',
    implemented: ['CRM, grupo financeiro, dossiê do cliente e templates disponíveis'],
    gaps: ['Layouts bancários têm campos e unidades diferentes; não existe equivalência automática certificada', 'Dados do modelo precisam ser distinguidos dos dados reais do cliente'],
    nextActions: ['Mapear cada campo para o CRM com instituição, versão, célula e evidência de origem', 'Gerar cópia preenchida com checklist de dados ausentes e revisão humana'],
  },
  {
    match: /Fechamento Geral.*\.xlsx$/i,
    module: 'fechamento-pecuario', status: 'native', priority: 'P1',
    replacement: 'Fechamento de confinamento por embarque: animais, pesos, custos, receita, lucro e consolidação ponderada.',
    implemented: ['Motor de fechamento por embarque e interface nativa disponíveis'],
    gaps: ['A existência do motor não certifica cada premissa e fórmula da planilha', 'Datas ambíguas e dados de exemplo exigem conferência antes de associar ao cliente'],
    nextActions: ['Validar por embarque e no consolidado com os valores armazenados no original', 'Distinguir indicadores indefinidos de zero e preservar origem das premissas'],
  },
  {
    match: /(M[ÉE]TODOS DE C[ÁA]LCULO|Matem[áa]tica Financeira|C[áa]lculo Jeter|Ficha Gr[áa]fica Banc[áa]ria)/i,
    module: 'motor-financeiro',
    status: 'native',
    priority: 'P1',
    replacement:
      'Motor de cálculo financeiro: SAC, PRICE, sistemas mistos/especiais, TIR, CET, spread, juros, dias úteis, valor presente e recálculo.',
    implemented: [
      '@aletis/financial-calc com amortização SAC/PRICE/Alemão/Americano/Misto/SAC Especial',
      'Endpoints de crédito e calculadoras premium',
      'Testes unitários financeiros existentes',
    ],
    gaps: [
      'Métodos da planilha Jeter III e variações percentuais precisam de testes de paridade',
      'Interface comparativa de métodos ainda pode ser mais operacional',
    ],
    nextActions: [
      'Extrair casos das planilhas como fixtures',
      'Adicionar comparador de métodos no módulo Crédito Premium',
    ],
  },
  {
    match: /(FARMS|Viabilidade Agr[íi]cola|custo de opera[cç][oõ]es agr[íi]colas|P\.\s*Simples - Custeio Agr[íi]cola)/i,
    module: 'custeio-agricola',
    status: 'native',
    priority: 'P1',
    replacement:
      'Custeio agrícola nativo: viabilidade por cultura, custo operacional, produtividade, margem, formação de preço e PDF de custeio.',
    implemented: [
      '@aletis/financial-calc/agro com viabilidade, DuPont/Fleuriet e formação de preço',
      'Rotas /api/custeio e página CusteioAgricola',
      'Serviço CusteioPdfGenerator',
    ],
    gaps: [
      'Importadores diretos das planilhas FARMS/Sicredi/P.Simples ainda não existem',
      'Algumas culturas e unidades precisam ser normalizadas',
    ],
    nextActions: [
      'Criar presets por cultura com base nas abas Soja, Arroz, Milho e Trigo',
      'Adicionar importador de cenário para CusteioService',
    ],
  },
  {
    match: /(Lambda|EBITDA|Fluxo_Caixa|Dupont|Fleuriet|BSC)/i,
    module: 'contabil-bsc',
    status: 'native',
    priority: 'P2',
    replacement:
      'Motor contábil/BSC nativo: balancete, balanço, DRE, EBITDA, EBIT, fluxo de caixa, comparativos, DuPont/Fleuriet e Balanced Scorecard.',
    implemented: [
      '@aletis/contabil-calc com balancete, DRE, EBITDA, EBIT e BSC',
      '@aletis/financial-calc/agro com DuPont/Fleuriet',
      'Testes unitários contábeis e BSC',
    ],
    gaps: [
      'Planilhas Lambda ainda não têm importador operacional de razão/budget',
      'BSC qualitativo precisa virar tela editável com metas e fatos',
    ],
    nextActions: [
      'Criar importador de razão contábil e orçamento',
      'Adicionar tela BSC com objetivos, medidas, fatos e relatório',
    ],
  },
  {
    match: /(Controle Financeiro|Calend[áa]rio Anual|BPO|Onboarding|Controle--Retornos|Forma[cç][aã]o--do--Pre[cç]o)/i,
    module: 'bpo-financeiro',
    status: 'needs-build',
    priority: 'P1',
    replacement:
      'BPO financeiro operacional: onboarding, plano de contas, lançamentos, orçamento, retornos, calendário anual, preço de venda e relatórios mensais.',
    implemented: [
      'Módulo financeiro base com receitas/despesas/impostos/lancamentos',
      'FechamentoContadorService e parsers OFX/NFS-e',
    ],
    gaps: [
      'Onboarding BPO, controle de retornos e calendário anual ainda não estão como workflows nativos',
      'Formação de preço precisa virar calculadora/tela dedicada',
    ],
    nextActions: [
      'Criar workflow BPO com etapas, responsáveis, SLA e checklist',
      'Transformar formação de preço em calculadora persistente por cliente',
    ],
  },
  {
    match: /.*/i,
    module: 'referencia',
    status: 'reference',
    priority: 'P3',
    replacement:
      'Material de referência ou apoio. Deve alimentar conhecimento, treinamento, templates ou documentação do sistema.',
    implemented: ['Catálogo de documentos do processo e base de conhecimento parcialmente existentes'],
    gaps: ['Classificação fina depende de leitura documental/operacional'],
    nextActions: ['Classificar conteúdo e decidir se vira template, checklist, knowledge-base ou tela operacional'],
  },
]

const MODULE_META: Record<string, Omit<SpreadsheetMigrationSummary['modules'][number], 'files' | 'formulas' | 'status'>> = {
  'simulador-v16': {
    id: 'simulador-v16', label: 'Simulador v16',
    description: 'Simulação de crédito, cronograma de amortização e custo efetivo da operação.',
    routeHints: ['/simulador-operacao'],
  },
  'cadastro-bancario': {
    id: 'cadastro-bancario', label: 'Cadastros Bancários',
    description: 'Preenchimento e conferência de dados para instituições financeiras a partir do CRM.',
    routeHints: ['/clientes', '/gestao-financeira'],
  },
  'fechamento-pecuario': {
    id: 'fechamento-pecuario', label: 'Fechamento Pecuário',
    description: 'Custos, produtividade e resultado por embarque e no consolidado.',
    routeHints: ['/ferramentas/calculadoras-agro?tab=fechamento'],
  },
  'gestao-financeira': {
    id: 'gestao-financeira',
    label: 'Gestão Financeira Agro',
    description: 'Substitui o R.OP.001 e concentra diagnóstico, produção, custos, dívida, garantias e kit banco.',
    routeHints: ['/gestao-financeira', '/clientes/:id'],
  },
  'financeiro-mensal': {
    id: 'financeiro-mensal',
    label: 'Registro Financeiro Mensal',
    description: 'Substitui receitas/gastos/plano de contas/conciliação mensal do cliente.',
    routeHints: ['/financeiro', '/clientes/:id'],
  },
  'custos-cliente': {
    id: 'custos-cliente',
    label: 'Custos do Cliente',
    description: 'Centraliza custos operacionais/fixos e rateios por safra.',
    routeHints: ['/gestao-financeira'],
  },
  'quadro-producao': {
    id: 'quadro-producao',
    label: 'Quadro de Produção',
    description: 'Centraliza produção por cultura, área, produtividade, preço e margem.',
    routeHints: ['/gestao-financeira', '/custeio'],
  },
  'contratos-crm': {
    id: 'contratos-crm',
    label: 'Contratos e Comercial',
    description: 'Substitui gerenciador de contratos, anexos, vencimentos e documentos comerciais.',
    routeHints: ['/contratos', '/contratos-oficiais', '/clientes/:id/deal-room'],
  },
  'crm-inteligente': {
    id: 'crm-inteligente',
    label: 'CRM Inteligente',
    description: 'Substitui cadastro em planilha e cria cliente, grupo, sócios, fazendas, demandas e pendências.',
    routeHints: ['/crm', '/clientes/:id'],
  },
  'motor-financeiro': {
    id: 'motor-financeiro',
    label: 'Motor Financeiro',
    description: 'Substitui planilhas de matemática financeira e métodos de amortização.',
    routeHints: ['/credito', '/ferramentas/calculadoras-agro'],
  },
  'custeio-agricola': {
    id: 'custeio-agricola',
    label: 'Custeio Agrícola',
    description: 'Substitui calculadoras de viabilidade, custo operacional e formação de preço agro.',
    routeHints: ['/custeio'],
  },
  'contabil-bsc': {
    id: 'contabil-bsc',
    label: 'Contábil, EBITDA e BSC',
    description: 'Substitui planilhas Lambda, BSC, DuPont/Fleuriet, DRE, EBITDA e fluxo de caixa.',
    routeHints: ['/relatorios', '/financeiro'],
  },
  'bpo-financeiro': {
    id: 'bpo-financeiro',
    label: 'BPO Financeiro',
    description: 'Substitui onboarding BPO, calendário financeiro anual, retornos e formação de preço.',
    routeHints: ['/financeiro', '/carteira'],
  },
  referencia: {
    id: 'referencia',
    label: 'Referência e Treinamento',
    description: 'Materiais para base de conhecimento, treinamento, apresentação e documentação.',
    routeHints: ['/fontes', '/ia'],
  },
}

let cache: { at: number; data: SpreadsheetMigrationSummary } | null = null
let pendingSummary: Promise<SpreadsheetMigrationSummary> | null = null
const CACHE_MS = 5 * 60_000

function walk(dir: string, recursive = true): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (recursive) out.push(...walk(full))
    } else if (entry.isFile() && /\.(xlsx|xlsm|xls|xltx|xltm|xlsb)$/i.test(entry.name)) {
      if (/^~\$/i.test(entry.name)) continue
      out.push(full)
    }
  }
  return out
}

export function discoverSpreadsheetFiles(projectRoot: string): string[] {
  return [...new Set([
    ...walk(join(projectRoot, 'documentos', 'processo-assessoria', 'originais')),
    ...walk(join(projectRoot, 'apps', 'api', 'src', 'services', 'processo-assessoria', 'templates')),
    // Planilhas recebidas no servidor e ainda não copiadas para os templates.
    ...walk(dirname(projectRoot), false),
  ])].sort()
}

export async function deduplicateSpreadsheetFiles(files: string[]): Promise<Array<{ sha256: string; sourcePaths: string[] }>> {
  const map = new Map<string, string[]>()
  for (const f of files) {
    const sha256 = createHash('sha256').update(await readFile(f)).digest('hex')
    map.set(sha256, [...(map.get(sha256) ?? []), f])
  }
  return Array.from(map.entries()).map(([sha256, sourcePaths]) => ({ sha256, sourcePaths }))
}

function classify(filename: string): ReplacementBlueprint {
  return BLUEPRINTS.find((b) => b.match.test(filename)) ?? BLUEPRINTS[BLUEPRINTS.length - 1]
}

async function profileWorkbook(file: string, sha256: string, sourcePaths: string[]): Promise<WorkbookProfile> {
  const buffer = await readFile(file)
  const { quality, sheets: sheetProfiles } = await inspectSpreadsheetQuality(buffer, file)
  const bp = classify(file)
  const qualityGaps: string[] = []
  if (!quality.inspected) qualityGaps.push('Arquivo não inspecionado integralmente no sistema; consultar as limitações antes da importação')
  if (quality.cachedFormulaErrors) qualityGaps.push(`${quality.cachedFormulaErrors} resultados de fórmula armazenados como erro no original`)
  if (quality.missingFormulaCaches) qualityGaps.push(`${quality.missingFormulaCaches} fórmulas sem resultado armazenado; não interpretar como zero`)
  if (quality.brokenFormulaReferences || quality.brokenDefinedNames) qualityGaps.push('Referências ou nomes definidos inválidos precisam de revisão')
  if (quality.externalLinks || quality.externalFormulaCells) qualityGaps.push('Parte do cálculo depende de vínculos externos não verificados')
  return {
    path: relative(PROJECT_ROOT, file),
    filename: file.split('/').pop() ?? file,
    sizeBytes: buffer.length,
    sheets: sheetProfiles.length,
    formulas: sheetProfiles.reduce((total, sheet) => total + sheet.formulas, 0),
    populatedCells: sheetProfiles.reduce((total, sheet) => total + sheet.populatedCells, 0),
    hasMacros: quality.macrosPresent === true,
    module: bp.module,
    status: quality.inspected ? bp.status : 'needs-build',
    priority: bp.priority,
    replacement: bp.replacement,
    implemented: bp.implemented,
    gaps: [...qualityGaps, ...bp.gaps],
    nextActions: bp.nextActions,
    sheetProfiles,
    sha256,
    sourcePaths: sourcePaths.map((source) => relative(PROJECT_ROOT, source)),
    sourceCount: sourcePaths.length,
    quality,
    parityStatus: 'not-verified',
  }
}

function statusRank(s: MigrationStatus): number {
  return { native: 1, importable: 2, 'template-only': 3, 'needs-build': 4, reference: 5 }[s]
}

function moduleStatus(items: WorkbookProfile[]): MigrationStatus {
  if (items.some((i) => i.status === 'needs-build')) return 'needs-build'
  if (items.some((i) => i.status === 'importable')) return 'importable'
  if (items.every((i) => i.status === 'native')) return 'native'
  if (items.every((i) => i.status === 'reference')) return 'reference'
  return 'template-only'
}

export async function getSpreadsheetMigrationSummary(force = false): Promise<SpreadsheetMigrationSummary> {
  const now = Date.now()
  if (!force && cache && now - cache.at < CACHE_MS) return cache.data

  if (pendingSummary) return pendingSummary
  pendingSummary = buildSpreadsheetMigrationSummary().finally(() => { pendingSummary = null })
  return pendingSummary
}

async function buildSpreadsheetMigrationSummary(): Promise<SpreadsheetMigrationSummary> {
  const files = discoverSpreadsheetFiles(PROJECT_ROOT)
  const uniqueFiles = await deduplicateSpreadsheetFiles(files)
  const profiles: WorkbookProfile[] = []
  // Workbooks grandes são inspecionados um a um para limitar memória da API.
  for (const group of uniqueFiles) {
    // Prefere o original legível, preservando cada caminho idêntico no relatório.
    const file = group.sourcePaths.find((path) => path.startsWith(ROOT + '/')) ?? group.sourcePaths[0]
    profiles.push(await profileWorkbook(file, group.sha256, group.sourcePaths))
  }
  profiles.sort((a, b) => {
    const prio = a.priority.localeCompare(b.priority)
    if (prio) return prio
    const st = statusRank(a.status) - statusRank(b.status)
    if (st) return st
    return b.formulas - a.formulas
  })

  const grouped = new Map<string, WorkbookProfile[]>()
  for (const p of profiles) grouped.set(p.module, [...(grouped.get(p.module) ?? []), p])

  const modules = Array.from(grouped.entries()).map(([id, items]) => {
    const meta = MODULE_META[id] ?? MODULE_META.referencia
    return {
      ...meta,
      files: items.length,
      formulas: items.reduce((acc, i) => acc + i.formulas, 0),
      status: moduleStatus(items),
    }
  }).sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.formulas - a.formulas)

  const totals = {
    files: profiles.length,
    sheets: profiles.reduce((acc, p) => acc + p.sheets, 0),
    formulas: profiles.reduce((acc, p) => acc + p.formulas, 0),
    populatedCells: profiles.reduce((acc, p) => acc + p.populatedCells, 0),
    native: profiles.filter((p) => p.status === 'native').length,
    importable: profiles.filter((p) => p.status === 'importable').length,
    templateOnly: profiles.filter((p) => p.status === 'template-only').length,
    needsBuild: profiles.filter((p) => p.status === 'needs-build').length,
    reference: profiles.filter((p) => p.status === 'reference').length,
    physicalFiles: files.length,
    duplicateCopies: files.length - uniqueFiles.length,
    reviewRequired: profiles.filter((p) => p.quality.status !== 'inspected').length,
    legacyFiles: profiles.filter((p) => p.quality.format === 'legacy-xls').length,
    unreadableFiles: profiles.filter((p) => p.quality.status === 'unreadable').length,
  }

  const data: SpreadsheetMigrationSummary = {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    totals,
    modules,
    workbooks: profiles,
  }
  cache = { at: Date.now(), data }
  return data
}
