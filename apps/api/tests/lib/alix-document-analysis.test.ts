import { describe, it, expect, afterEach } from 'vitest'
import { parseXlsx } from '../../src/services/alix/intake/XlsxParser.js'
import { analyzeDocumentDeep } from '../../src/services/alix/intake/DocumentAnalysisService.js'
import type { IngestedDocument } from '../../src/services/alix/intake/types.js'

describe('ALIX document intelligence', () => {
  afterEach(() => {
    delete process.env.ALIX_USE_LLM
  })

  it('gera perfil estatistico de todas as abas da planilha', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Fluxo')
    ws.addRow(['Mes', 'Receita', 'Custo', 'Saldo'])
    ws.addRow(['Jan/26', 1000, 400, { formula: 'B2-C2', result: 600 }])
    ws.addRow(['Fev/26', 2000, 600, { formula: 'B3-C3', result: 1400 }])

    const raw = await workbook.xlsx.writeBuffer()
    const parsed = await parseXlsx(Buffer.from(raw as ArrayBuffer))
    const profile = parsed.metadata?.spreadsheetProfile

    expect(profile?.totalSheets).toBe(1)
    expect(profile?.totalRows).toBe(3)
    expect(profile?.totalFormulaCells).toBe(2)

    const sheet = profile?.sheets[0]
    expect(sheet?.nonEmptyRows).toBe(2)
    const receita = sheet?.columns.find((c) => c.header === 'Receita')
    expect(receita?.numericCount).toBe(2)
    expect(receita?.sum).toBe(3000)
    expect(receita?.avg).toBe(1500)
  })

  it('analisa documento por fallback deterministico quando LLM esta desligado', async () => {
    process.env.ALIX_USE_LLM = 'false'
    const doc: IngestedDocument = {
      id: 'doc-1',
      sessionId: 's',
      filename: 'fluxo.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 100,
      uploadedAt: new Date().toISOString(),
      kind: 'xlsx',
      extractedText: '## Fluxo\n\n| Mes | Receita |\n| --- | --- |\n| Jan | 1000 |',
      summary: 'Planilha de fluxo mensal.',
      metadata: {
        spreadsheetProfile: {
          totalSheets: 1,
          totalRows: 2,
          totalCols: 2,
          totalFormulaCells: 0,
          sheets: [{
            name: 'Fluxo',
            rows: 2,
            cols: 2,
            nonEmptyRows: 1,
            formulaCells: 0,
            mergedCells: 0,
            columns: [{
              index: 2,
              header: 'Receita',
              nonEmpty: 1,
              numericCount: 1,
              textCount: 0,
              dateCount: 0,
              formulaCount: 0,
              sum: 1000,
              min: 1000,
              max: 1000,
              avg: 1000,
              sampleValues: ['1000'],
            }],
          }],
        },
      },
    }

    const analysis = await analyzeDocumentDeep({ doc, foco: 'avaliar fluxo' })
    expect(analysis.status).toBe('deterministic')
    expect(analysis.achadosChave.some((a) => a.includes('Planilha'))).toBe(true)
    expect(analysis.indicadores[0]?.nome).toBe('Fluxo.Receita')
    expect(analysis.acoesSistema.some((a) => a.tipo === 'gerar_fluxo_caixa')).toBe(true)
  })
})
