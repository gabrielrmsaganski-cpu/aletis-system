import { beforeEach, expect, it, vi } from 'vitest'
import type { SpreadsheetMigrationSummary, WorkbookProfile } from '../../src/services/processo-assessoria/SpreadsheetIntelligenceService.js'

const { summaryMock } = vi.hoisted(() => ({ summaryMock: vi.fn() }))
vi.mock('../../src/services/processo-assessoria/SpreadsheetIntelligenceService.js', () => ({ getSpreadsheetMigrationSummary: summaryMock }))

import { buildSimulatorCatalogTools } from '../../src/services/alix/tools/simulator-catalog.js'
import { selectToolsForMessage } from '../../src/services/alix/tools/ToolSelector.js'
import type { LLMTool, LLMToolRegistry } from '../../src/services/llm/types.js'

function workbook(index: number, changes: Partial<WorkbookProfile> = {}): WorkbookProfile {
  return {
    filename: `Planilha ${String(index).padStart(2, '0')}.xlsx`, path: '/root/private/segredo.xlsx',
    sizeBytes: 1000, sheets: 1, formulas: 5, populatedCells: 20, hasMacros: false,
    module: 'gestao-financeira', status: 'native', priority: 'P1', replacement: 'Gestão financeira do sistema',
    implemented: ['Cadastro disponível'], gaps: [], nextActions: ['Conferir premissas da operação'],
    sha256: index.toString(16).padStart(64, '0'), sourcePaths: ['/root/private/copia.xlsx'], sourceCount: 1,
    parityStatus: 'not-verified',
    quality: { format: 'ooxml', status: 'inspected', inspected: true,
      cachedFormulaErrors: 0, literalErrorCells: 0, missingFormulaCaches: 0,
      brokenFormulaReferences: 0, brokenDefinedNames: 0, externalLinks: 0, externalFormulaCells: 0,
      hiddenSheets: 0, definedNames: 0, macrosPresent: false, calculationMode: 'auto',
      samples: [{ sheet: 'Dados privados', cell: 'A1', code: 'CONTEUDO_CONFIDENCIAL' }],
      limitations: ['/root/private/arquivo.xlsx'],
    },
    sheetProfiles: [{ name: 'Dados', visibility: 'visible', rows: 20, columns: 5, formulas: 5, populatedCells: 20,
      cachedFormulaErrors: 0, literalErrorCells: 0, missingFormulaCaches: 0, brokenFormulaReferences: 0, externalFormulaCells: 0 }],
    ...changes,
  }
}

function summary(workbooks: WorkbookProfile[]): SpreadsheetMigrationSummary {
  return { generatedAt: '2026-09-10T20:00:00.000Z', root: '/root/private/acervo', workbooks,
    totals: { files: workbooks.length, sheets: workbooks.reduce((s, w) => s + w.sheets, 0), formulas: 0, populatedCells: 0,
      native: 0, importable: 0, templateOnly: 0, needsBuild: 0, reference: 0,
      physicalFiles: workbooks.length + 2, duplicateCopies: 2, reviewRequired: 0, legacyFiles: 0, unreadableFiles: 0 },
    modules: [{ id: 'gestao-financeira', label: 'Gestão Financeira', description: 'Dados financeiros', files: workbooks.length,
      formulas: 0, status: 'native', routeHints: ['/gestao-financeira'] },
    { id: 'simulador-v16', label: 'Simulador v16', description: 'Crédito', files: 1, formulas: 0, status: 'native', routeHints: ['/simulador-operacao'] }],
  }
}
const execute = (input: unknown = {}) => buildSimulatorCatalogTools().registry.consultar_acervo_planilhas.handler(input as any, {} as any) as Promise<any>

beforeEach(() => { summaryMock.mockReset(); summaryMock.mockResolvedValue(summary([workbook(1)])) })

it('registra a consulta somente leitura sem remover o catálogo de simuladores', async () => {
  const { tools, registry } = buildSimulatorCatalogTools()
  expect(tools.map((tool) => tool.name)).toEqual(['catalogo_simuladores_alix', 'consultar_acervo_planilhas'])
  const original: any = await registry.catalogo_simuladores_alix.handler({}, {} as any)
  expect(original.total).toBe(4)
  expect(summaryMock).not.toHaveBeenCalled()
});

it('projeta metadados auditáveis sem caminhos, células, amostras ou conteúdo confidencial', async () => {
  summaryMock.mockResolvedValue(summary([workbook(1, { filename: '/root/private/Simulador v16.xlsm' })]))
  const result = await execute()
  expect(result.ok).toBe(true)
  expect(result.planilhas[0].filename).toBe('Simulador v16.xlsm')
  expect(result.planilhas[0].sha256).toHaveLength(64)
  expect(result.planilhas[0].implemented).toEqual(['Cadastro disponível'])
  expect(result.planilhas[0].paridadeFinanceira).toBe('nao_certificada')
  expect(result.limitesDaAnalise.join(' ')).toMatch(/não certificam paridade financeira total/)
  const json = JSON.stringify(result)
  expect(json).not.toContain('/root/')
  expect(json).not.toContain('CONTEUDO_CONFIDENCIAL')
  expect(json).not.toContain('sourcePaths')
  expect(json).not.toContain('samples')
  expect(summaryMock).toHaveBeenCalledExactlyOnceWith()
});

it('filtra nomes e módulos por texto sem depender de acentos e maiúsculas', async () => {
  summaryMock.mockResolvedValue(summary([workbook(1, { filename: 'Diagnóstico São José.xlsx' }), workbook(2, { module: 'simulador-v16' })]))
  const result = await execute({ nome: 'SAO JOSE', modulo: 'gestao financeira' })
  expect(result.cobertura.arquivosCorrespondentes).toBe(1)
  expect(result.planilhas[0].filename).toBe('Diagnóstico São José.xlsx')
  const byId = await execute({ modulo: 'simulador-v16' })
  expect(byId.planilhas[0].modulo).toBe('simulador-v16')
});

it('pendências distinguem módulo nativo sem lacunas de erros e migração incompleta', async () => {
  const comErro = workbook(2); comErro.quality.status = 'review-required'; comErro.quality.cachedFormulaErrors = 3
  const comLacuna = workbook(3, { gaps: ['Falta converter uma aba'] })
  const importavel = workbook(4, { status: 'importable' })
  summaryMock.mockResolvedValue(summary([workbook(1), comErro, comLacuna, importavel]))
  const result = await execute({ somentePendentes: true })
  expect(result.cobertura.arquivosCorrespondentes).toBe(3)
  expect(result.planilhas.every((item: any) => item.possuiPendencias)).toBe(true)
  expect(result.planilhas.some((item: any) => item.qualidade.errosCacheFormulas === 3)).toBe(true)
});

it('pagina arquivos com total completo e próximo offset correto até o fim', async () => {
  summaryMock.mockResolvedValue(summary(Array.from({ length: 17 }, (_, i) => workbook(i))))
  const primeiro = await execute({ limite: 15 })
  expect(primeiro.planilhas).toHaveLength(15)
  expect(primeiro.cobertura.arquivosCorrespondentes).toBe(17)
  expect(primeiro.cobertura.proximoOffset).toBe(15)
  const segundo = await execute({ limite: 15, offset: 15 })
  expect(segundo.planilhas).toHaveLength(2)
  expect(segundo.cobertura.proximoOffset).toBeNull()
  expect(new Set([...primeiro.planilhas, ...segundo.planilhas].map((w: any) => w.sha256)).size).toBe(17)
  expect((await execute({ offset: 9999 })).cobertura.proximoOffset).toBeNull()
});

it('pagina todas as abas sem confundir a página com cobertura integral do arquivo', async () => {
  const file = workbook(1)
  file.sheetProfiles = Array.from({ length: 13 }, (_, i) => ({ ...file.sheetProfiles[0], name: `Aba ${i + 1}`, visibility: i === 12 ? 'hidden' : 'visible' }))
  file.sheets = 13; file.quality.hiddenSheets = 1
  summaryMock.mockResolvedValue(summary([file]))
  const primeiro = await execute()
  expect(primeiro.planilhas[0].abas).toHaveLength(12)
  expect(primeiro.planilhas[0].coberturaAbas).toMatchObject({ totalCatalogado: 13, perfisDisponiveis: 13, retornadas: 12, proximoOffset: 12 })
  const ultimo = await execute({ nome: file.filename, offsetAbas: 12 })
  expect(ultimo.planilhas[0].abas).toHaveLength(1)
  expect(ultimo.planilhas[0].abas[0].visibilidade).toBe('hidden')
  expect(ultimo.planilhas[0].coberturaAbas.proximoOffset).toBeNull()
});

it('arquivo não inspecionado mantém cobertura desconhecida mesmo com zero abas catalogadas', async () => {
  const file = workbook(1, { sheets: 0, sheetProfiles: [] })
  file.quality.inspected = false; file.quality.status = 'conversion-required'; file.quality.format = 'legacy-xls'
  summaryMock.mockResolvedValue(summary([file]))
  const result = await execute()
  expect(result.planilhas[0].coberturaAbas).toMatchObject({ contagemConfirmada: false, inspecaoIntegralDoArquivo: false })
  expect(result.planilhas[0].qualidade.status).toBe('conversion-required')
  expect(result.planilhas[0].possuiPendencias).toBe(true)
});

it('filtros inválidos são rejeitados antes da consulta ao inventário', async () => {
  for (const input of [{ limite: 16 }, { limite: 0 }, { offset: -1 }, { offset: 1.5 }, { limiteAbas: 31 },
    { offsetAbas: -1 }, { somentePendentes: 'false' }, { refresh: true }, null]) {
    expect((await execute(input)).code).toBe('FILTROS_ACERVO_INVALIDOS')
  }
  expect(summaryMock).not.toHaveBeenCalled()
});

it('falha de inspeção não vira inventário vazio nem revela caminho interno', async () => {
  summaryMock.mockRejectedValue(new Error('ENOENT /root/private/arquivo.xlsx'))
  const result = await execute()
  expect(result.ok).toBe(false)
  expect(result.code).toBe('ACERVO_PLANILHAS_INDISPONIVEL')
  expect(result.planilhas).toBeUndefined()
  expect(JSON.stringify(result)).not.toContain('/root/')
});

it('seleciona a ferramenta em pedidos de planilhas e erros mesmo com limite apertado', () => {
  const specs: LLMTool[] = ['buscar_cliente', 'consultar_clima', 'consultar_acervo_planilhas', 'web_search'].map((name) =>
    ({ name, description: name, input_schema: { type: 'object', properties: {} } }))
  const registry = Object.fromEntries(specs.map((spec) => [spec.name, { spec, handler: () => null }])) as LLMToolRegistry
  for (const message of ['Analise completamente as planilhas.', 'Veja erros da planilha de gestão financeira.', 'Confira o Simulador v16.', 'Analise este XLSX.']) {
    expect(selectToolsForMessage(specs, registry, message, 1).selectedNames).toContain('consultar_acervo_planilhas')
  }
  expect(selectToolsForMessage(specs, registry, 'Veja a previsão de chuva.', 1).selectedNames).not.toContain('consultar_acervo_planilhas')
});
