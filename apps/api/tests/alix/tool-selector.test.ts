import assert from 'node:assert'
import { test } from 'vitest'
import { requestsDocumentDelivery, selectToolsForMessage } from '../../src/services/alix/tools/ToolSelector.ts'
import type { LLMTool, LLMToolRegistry } from '../../src/services/llm/types.ts'

function tool(name: string): LLMTool {
  return { name, description: name, input_schema: { type: 'object', properties: {} } }
}

test('seleciona ferramentas financeiras para uma simulacao de divida', () => {
  const names = [
    'buscar_cliente', 'listar_clientes', 'briefing_cliente', 'memoria_cliente',
    'simular_amortizacao', 'calcular_dscr', 'listar_dividas', 'fluxo_caixa',
    'consultar_clima', 'consultar_sicar', 'web_search', 'fetch_url',
    'criar_proposta', 'anexar_documento', 'listar_documentos', 'calcular_funrural',
  ]
  const tools = names.map(tool)
  const registry = Object.fromEntries(tools.map((spec) => [spec.name, { spec, handler: () => null }])) as LLMToolRegistry
  const selected = selectToolsForMessage(tools, registry, 'Simule a parcela da divida e calcule o DSCR', 8)

  assert.strictEqual(selected.tools.length, 8)
  assert.ok(selected.selectedNames.includes('simular_amortizacao'))
  assert.ok(selected.selectedNames.includes('calcular_dscr'))
  assert.ok(selected.selectedNames.includes('buscar_cliente'))
  assert.deepStrictEqual(Object.keys(selected.registry).sort(), selected.selectedNames.slice().sort())
})

test('mantém visão e pesquisa globais disponíveis para perguntas sobre o sistema', () => {
  const names = [
    'visao_geral_sistema', 'pesquisar_sistema', 'listar_documentos_cliente_crm', 'agenda_casos',
    'buscar_cliente', 'listar_clientes', 'listar_propostas', 'listar_leads_prospeccao',
    'consultar_clima', 'web_search',
  ]
  const tools = names.map(tool)
  const registry = Object.fromEntries(tools.map((spec) => [spec.name, { spec, handler: () => null }])) as LLMToolRegistry
  const selected = selectToolsForMessage(tools, registry, 'Faça uma visão geral de tudo que está acontecendo no sistema', 8)

  assert.ok(selected.selectedNames.includes('visao_geral_sistema'))
  assert.ok(selected.selectedNames.includes('pesquisar_sistema'))
  assert.ok(selected.selectedNames.includes('listar_documentos_cliente_crm'))
  assert.ok(selected.selectedNames.includes('agenda_casos'))
  assert.deepStrictEqual(Object.keys(selected.registry).sort(), selected.selectedNames.slice().sort())
})

test('preserva ferramentas obrigatórias quando há documento anexado', () => {
  const names = [
    'buscar_cliente', 'listar_clientes', 'briefing_cliente', 'memoria_cliente',
    'consultar_clima', 'web_search', 'calcular_dscr', 'listar_propostas',
    'analisar_documento_profundo', 'criar_lead_de_documento', 'ver_documento',
  ]
  const tools = names.map(tool)
  const registry = Object.fromEntries(tools.map((spec) => [spec.name, { spec, handler: () => null }])) as LLMToolRegistry
  const selected = selectToolsForMessage(
    tools,
    registry,
    'cadastre este arquivo',
    6,
    ['analisar_documento_profundo', 'criar_lead_de_documento', 'ver_documento'],
  )

  assert.ok(selected.selectedNames.includes('analisar_documento_profundo'))
  assert.ok(selected.selectedNames.includes('criar_lead_de_documento'))
  assert.ok(selected.selectedNames.includes('ver_documento'))
})

test('expõe catálogo e simuladores completos em pedido de cenários bancários', () => {
  const names = [
    'buscar_cliente', 'catalogo_simuladores_alix', 'simular_operacao_v16',
    'recalcular_operacao_v16', 'ficha_bancaria_v16', 'calcular_dscr_cliente',
    'simular_reestruturacao_divida', 'simular_renegociacao_gf', 'avaliar_plano_farms',
    'consultar_clima', 'web_search', 'listar_leads_filtrados',
  ]
  const tools = names.map(tool)
  const registry = Object.fromEntries(tools.map((spec) => [spec.name, { spec, handler: () => null }])) as LLMToolRegistry
  const selected = selectToolsForMessage(
    tools,
    registry,
    'Simule PRICE, SAC e SACRE, compare CET e faça cenários de alongamento da dívida',
    9,
    ['catalogo_simuladores_alix'],
  )

  assert.ok(selected.selectedNames.includes('catalogo_simuladores_alix'))
  assert.ok(selected.selectedNames.includes('simular_operacao_v16'))
  assert.ok(selected.selectedNames.includes('ficha_bancaria_v16'))
  assert.ok(selected.selectedNames.includes('simular_reestruturacao_divida'))
})

test('prioriza emissão real de PDF e DOCX sem remover ferramentas de leitura', () => {
  const tools = ['gerar_documento_notebook', 'ver_documento', 'buscar_cliente', 'delegate_doc_generator'].map(tool)
  const registry = Object.fromEntries(tools.map(spec => [spec.name, { spec, handler: () => null }])) as LLMToolRegistry
  for (const message of ['Gere um relatório em PDF com as fontes conferidas.', 'Exporte a análise em DOCX.', 'Preciso de um arquivo PDF.']) {
    const selected = selectToolsForMessage(tools, registry, message, 4)
    assert.strictEqual(selected.selectedNames[0], 'delegate_doc_generator')
    assert.ok(selected.selectedNames.includes('ver_documento'))
    assert.ok(selected.selectedNames.includes('gerar_documento_notebook'))
  }
})

test('modo document_generation prioriza emissão mesmo sem extensão escrita no pedido', () => {
  const tools = ['ver_documento', 'gerar_documento_notebook', 'delegate_doc_generator'].map(tool)
  const registry = Object.fromEntries(tools.map(spec => [spec.name, { spec, handler: () => null }])) as LLMToolRegistry
  const selected = selectToolsForMessage(tools, registry, 'Prepare a entrega com os dados confirmados.', 3, [], { workMode: 'document_generation' })
  assert.strictEqual(selected.selectedNames[0], 'delegate_doc_generator')
})

test('ler ou analisar PDF não vira intenção de emitir arquivo', () => {
  const messages = [
    'Leia completamente este PDF.',
    'Analise o contrato em PDF e extraia os valores.',
    'Quero que leia este PDF antes de responder.',
    'Faça uma análise minuciosa deste PDF.',
    'Prepare um resumo do PDF anexado.',
    'Gere um resumo do PDF anexado.',
    'Analise o documento; não gere um PDF.',
    'Faça uma comparação entre os PDFs recebidos, sem gerar outro arquivo.',
  ]
  for (const message of messages) assert.strictEqual(requestsDocumentDelivery(message, 'documentary'), false, message)
  const tools = ['ver_documento', 'delegate_doc_generator'].map(tool)
  const registry = Object.fromEntries(tools.map(spec => [spec.name, { spec, handler: () => null }])) as LLMToolRegistry
  assert.strictEqual(selectToolsForMessage(tools, registry, messages[0], 2).selectedNames[0], 'ver_documento')
})
