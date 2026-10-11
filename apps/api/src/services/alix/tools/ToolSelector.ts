import type { LLMTool, LLMToolRegistry } from '../../llm/types.js'
import { DISCOVERY_TOOL_NAMES } from './ToolDiscovery.js'

const ALWAYS_AVAILABLE = new Set([
  ...DISCOVERY_TOOL_NAMES,
  'consultar_integracoes_alix',
  'buscar_cliente',
  'listar_clientes',
  'listar_demandas_cliente',
  'briefing_cliente',
  'contexto_cliente_operacional',
  'memoria_cliente',
  'listar_documentos_sessao',
  'listar_documentos_cliente_crm',
  'visao_geral_sistema',
  'pesquisar_sistema',
  'agenda_casos',
  'ver_documento',
  'buscar_no_indice_documental',
  'delegate_deal_analyzer',
  'delegate_web_researcher',
  'delegate_crm_writer',
  'delegate_doc_generator',
  'catalogo_simuladores_alix',
])

const DOMAIN_HINTS: Array<{ words: string[]; toolPatterns: RegExp[] }> = [
  {
    words: ['sistema', 'tudo', 'geral', 'panorama', 'prioridade', 'prioridades', 'hoje', 'situacao', 'dashboard'],
    toolPatterns: [/visao_geral/, /pesquisar_sistema/, /resumo_/, /portfolio/, /stats_/, /agenda_/, /dashboard/],
  },
  {
    words: ['cliente', 'crm', 'lead', 'contato', 'demanda', 'assunto', 'proposta', 'negociacao', 'carteira', 'pipeline', 'alerta'],
    toolPatterns: [/cliente/, /lead/, /contato/, /demanda/, /proposta/, /negoci/, /portfolio/, /alerta/, /crm/],
  },
  {
    words: ['documento', 'arquivo', 'pdf', 'contrato', 'anexo', 'planilha', 'relatorio', 'parecer', 'docx', 'xlsx'],
    toolPatterns: [/documento/, /contrato/, /anex/, /indice/, /relatorio/, /parecer/, /memoria_calculo/, /ficha_bancaria/],
  },
  {
    words: ['divida', 'banco', 'financeiro', 'fluxo', 'caixa', 'dscr', 'garantia', 'patrimonio', 'reestruturacao', 'renegociacao', 'alongamento', 'carencia', 'capacidade', 'pagamento'],
    toolPatterns: [/divida/, /financeiro/, /fluxo/, /dscr/, /garantia/, /patrimonio/, /reestrutur/, /renegoci/, /operacao/, /ficha_bancaria/, /gf$/],
  },
  {
    words: ['fazenda', 'propriedade', 'safra', 'custeio', 'cultura', 'soja', 'milho', 'car', 'sicar', 'sigef', 'incra'],
    toolPatterns: [/farm/, /safra/, /custeio/, /cultura/, /car_/, /sicar/, /sigef/, /incra/],
  },
  {
    words: ['clima', 'chuva', 'seca', 'temperatura', 'previsao', 'queimada', 'desmatamento'],
    toolPatterns: [/clima/, /queimada/, /desmatamento/, /safra/],
  },
  {
    words: ['pesquise', 'internet', 'web', 'noticia', 'atual', 'cvm', 'processo', 'jusbrasil', 'cnpj', 'protesto'],
    toolPatterns: [/web_search/, /fetch_url/, /noticia/, /consultar_/, /processo/, /cvm/, /cnpj/, /protesto/],
  },
  {
    words: ['calcule', 'simule', 'simulacao', 'simulador', 'cenario', 'taxa', 'parcela', 'price', 'sac', 'sacre', 'cet', 'iof', 'funrural', 'tributaria', 'viabilidade'],
    toolPatterns: [/catalogo_simuladores/, /calcular/, /simular/, /recalcular/, /operacao_v16/, /ficha_bancaria/, /farms/, /funrural/, /tributaria/],
  },
]

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Distingue a emissão de um arquivo da leitura de um PDF recebido. */
export function requestsDocumentDelivery(message: string, workMode?: string): boolean {
  if (workMode === 'document_generation') return true
  const query = normalize(message).replace(/\b(?:nao|nunca|sem)\s+(?:gere|gerar|crie|criar|produza|produzir|emita|emitir|exporte|exportar|entregue|entregar|prepare|preparar|monte|montar|faca|fazer|converta|converter)\b[^.!?;\n]*/g, '')
  const format = '\\b(?:pdf|docx|xlsx)\\b'
  const action = '\\b(?:gere|gerar|crie|criar|produza|produzir|emita|emitir|exporte|exportar|entregue|entregar|converta|converter)\\b'
  const directFormat = '\\s+(?:(?:um|uma|o|a|novo|nova|arquivo)\\s+)*' + format
  const targetFormat = '[^.!?;\\n]{0,240}\\b(?:em|para|no formato|em formato|como arquivo)\\s+(?:(?:arquivo|formato)\\s+)?' + format
  if (new RegExp(action + '(?:' + directFormat + '|' + targetFormat + ')').test(query)) return true
  const document = '\\b(?:arquivo|relatorio|parecer|proposta|documento|dossie|minuta|planilha)\\b'
  if (new RegExp('\\b(?:faca|fazer|prepare|preparar|monte|montar)\\s+(?:um[a]?\\s+)?' + document + targetFormat).test(query)) return true
  return new RegExp('\\b(?:quero|preciso|solicito)\\s+(?:de\\s+)?(?:um[a]?\\s+)?(?:(?:arquivo|relatorio|parecer|proposta|documento|dossie|minuta)\\b[^.!?;\\n]{0,100})?' + format).test(query)
}

export function selectToolsForMessage(
  tools: LLMTool[],
  registry: LLMToolRegistry,
  message: string,
  maxTools = Math.max(12, Number(process.env.ALIX_MAX_TOOLS_PER_REQUEST || 24)),
  requiredNames: string[] = [],
  options: { workMode?: string } = {},
): { tools: LLMTool[]; registry: LLMToolRegistry; selectedNames: string[] } {
  const executable = tools.filter((tool, index) => Boolean(registry[tool.name]) && tools.findIndex((other) => other.name === tool.name) === index)
  const limit = Number.isFinite(maxTools) ? Math.max(1, Math.floor(maxTools)) : 24

  const query = normalize(message)
  const documentDelivery = requestsDocumentDelivery(message, options.workMode)
  const required = new Set([...requiredNames, ...ALWAYS_AVAILABLE])
  if (/\b(drive|acervo|pastas?)\b/.test(query)) {
    for (const name of ['consultar_acervo_drive','consultar_analises_drive','pesquisar_conteudo_drive','ler_arquivo_drive']) required.add(name)
  }
  if (/\b(crm|equipe|pendencias?|documentos?|dossie)\b/.test(query)) required.add('consultar_analises_drive')
  if (/\b(planilhas?|excel|xlsx|xlsm|xlsb|simulador\s*v?16)\b/.test(query)) required.add('consultar_acervo_planilhas')
  const activePatterns = DOMAIN_HINTS
    .filter((domain) => domain.words.some((word) => query.includes(normalize(word))))
    .flatMap((domain) => domain.toolPatterns)

  const scored = executable.map((tool, index) => {
    const searchable = normalize(`${tool.name} ${tool.description}`)
    const nameTokens = normalize(tool.name).split('_').filter((token) => token.length >= 4)
    let score = required.has(tool.name) ? 1_000 : ALWAYS_AVAILABLE.has(tool.name) ? 20 : 0
    if (activePatterns.some((pattern) => pattern.test(tool.name))) score += 40
    for (const token of nameTokens) if (query.includes(token)) score += 8
    for (const word of query.split(/\s+/).filter((token) => token.length >= 5)) {
      if (searchable.includes(word)) score += 2
    }
    return { tool, index, score }
  })

  const mandatory = scored.filter(({ tool }) => required.has(tool.name))
  const optional = scored.filter(({ tool }) => !required.has(tool.name))
  const selected = [...mandatory, ...optional
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, limit - mandatory.length))]
    .sort((a, b) => documentDelivery
      ? Number(b.tool.name === 'delegate_doc_generator') - Number(a.tool.name === 'delegate_doc_generator') || a.index - b.index
      : a.index - b.index)
    .map((item) => item.tool)
  const selectedRegistry: LLMToolRegistry = {}
  for (const tool of selected) {
    const entry = registry[tool.name]
    if (entry) selectedRegistry[tool.name] = entry
  }
  return { tools: selected, registry: selectedRegistry, selectedNames: selected.map((tool) => tool.name) }
}
