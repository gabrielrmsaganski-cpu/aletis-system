import type { LLMToolRegistry } from '../../llm/types.js'

const preparation = new Set([
  'delegate_deal_analyzer', 'delegate_web_researcher', 'delegate_doc_generator',
  'preparar_briefing_documental', 'gerar_documento_fundamentado',
  'gerar_proposta_reestruturacao', 'gerar_parecer_tecnico', 'gerar_relatorio_bsc',
  'gerar_fluxo_caixa_xlsx', 'gerar_memoria_calculo_docx', 'gerar_plano_custeio_pdf',
  'briefing_cliente', 'memoria_cliente', 'agenda_casos', 'cotacoes_hoje',
  'catalogo_simuladores_alix', 'visao_geral_sistema', 'web_search', 'fetch_url',
])

/** Handoff operacional prepara trabalho; a execução no CRM continua sendo uma decisão própria. */
export function preparationRegistry(registry: LLMToolRegistry, clienteId?: string): LLMToolRegistry {
  return Object.fromEntries(Object.entries(registry).filter(([name]) => preparation.has(name)
    || /^(listar|buscar|consultar|ler|ver|contexto|resumo|dashboard|simular|calcular|pesquisar|analisar|explicar|comparar|preview)_/.test(name))
    .map(([name, entry]) => [name, { ...entry, handler: async (input: Record<string, unknown>) => {
      if (clienteId && ['clienteId', 'cliente_id', 'clientId'].some(key => input[key] !== undefined && input[key] !== clienteId)) {
        return { ok: false, error: 'Esta preparação está vinculada ao cliente da prioridade selecionada.', code: 'PREPARATION_CLIENT_MISMATCH' }
      }
      return entry.handler(input)
    } }]))
}
