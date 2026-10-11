import { describe, expect, it } from 'vitest'

import {
  classifySpecializedDocument,
  documentFamilyKey,
  extractSpecializedDocument,
  type SpecializedField,
} from '../../src/services/alix/extraction/SpecializedDocumentExtractor.js'
import { compareDocumentFields, fieldSimilarity, validateDocument } from '../../src/services/alix/intake/DocumentPipelineService.js'
import type { IngestedDocument } from '../../src/services/alix/intake/types.js'

function document(text: string, filename = 'documento.pdf'): IngestedDocument {
  return {
    id: 'doc-1',
    sessionId: 'session-1',
    clienteId: 'cliente-1',
    filename,
    mimetype: 'application/pdf',
    sizeBytes: Buffer.byteLength(text),
    uploadedAt: '2026-08-20T00:00:00.000Z',
    kind: 'pdf',
    extractedText: text,
    metadata: { sha256: 'abc' },
  }
}

describe('esteira documental especializada', () => {
  it('prioriza CPR sobre contrato genérico e extrai campos com evidência literal', async () => {
    const doc = document(`
      CÉDULA DE PRODUTO RURAL - CPR Nº CPR-2026/889
      Emitente: João Produtor
      CPF: 123.456.789-09
      Credor: Cooperativa Agro Forte
      Produto: Soja em grãos
      Quantidade: 10.000 sacas
      Valor da CPR: R$ 1.250.000,00
      Data de entrega: 30/04/2027
      Garantias: penhor da produção da safra 2026/2027.
    `, 'CPR_889.pdf')

    const classification = await classifySpecializedDocument(doc)
    expect(classification.type).toBe('cpr')
    expect(classification.confidence).toBeGreaterThan(0.8)

    const extraction = await extractSpecializedDocument(doc, classification)
    expect(extraction.missingRequiredFields).toEqual([])
    expect(extraction.fields.find((field) => field.fieldKey === 'numero_cpr')?.normalizedValue).toContain('CPR2026')
    expect(extraction.fields.find((field) => field.fieldKey === 'valor_cpr')?.valueText).toBe('R$ 1.250.000,00')
    expect(extraction.fields.every((field) => doc.extractedText.replace(/\s+/g, ' ').includes(field.evidenceText.replace(/\s+/g, ' ')))).toBe(true)
  })

  it('reconhece CAR e mantém confiança/evidência por campo', async () => {
    const doc = document(`
      CADASTRO AMBIENTAL RURAL
      Número do recibo: MT-5100201-AAAA.BBBB.CCCC.DDDD.EEEE.FFFF.GGGG.HHHH
      Proprietário: Maria da Fazenda
      CPF: 111.222.333-44
      Nome do imóvel: Fazenda Horizonte
      Município: Água Boa
      UF: MT
      Área total: 1.234,50 hectares
      Data de inscrição: 15/03/2024
      Situação: Ativo
    `, 'recibo_car.pdf')
    const classification = await classifySpecializedDocument(doc)
    const extraction = await extractSpecializedDocument(doc, classification)
    expect(classification.type).toBe('car')
    expect(extraction.fields.map((field) => field.fieldKey)).toEqual(expect.arrayContaining(['car', 'proprietario_nome', 'municipio', 'area_total']))
    expect(extraction.fields.find((field) => field.fieldKey === 'area_total')?.normalizedValue).toBe('1234.50')
    expect(extraction.fields.every((field) => field.confidence >= 0 && field.confidence <= 1)).toBe(true)
  })

  it('não confunde o nome após “Contrato” com o número contratual', async () => {
    const doc = document(`
      Extrato Contrato ARJAN EGBERT NOORDEGRAAF
      Contrato: 3036806
      Devedor: ARJAN EGBERT NOORDEGRAAF
      Credor: Banco Exemplo
      Valor contratado: R$ 536.000,00
      Vencimento: 17/05/2027
    `, 'extrato_contrato.pdf')
    const classification = await classifySpecializedDocument(doc)
    const extraction = await extractSpecializedDocument(doc, classification)
    const numbers = extraction.fields
      .filter((field) => field.fieldKey === 'numero_contrato')
      .map((field) => field.normalizedValue)
    expect(numbers).toEqual(['3036806'])
  })

  it('calcula família estável e comparação de versões', () => {
    const fieldsA: SpecializedField[] = [
      { fieldKey: 'matricula', valueText: '12.345', normalizedValue: '12345', valueType: 'identifier', confidence: 0.9, evidenceText: 'Matrícula 12.345', evidenceSource: 'pdf', extractor: 'deterministic' },
      { fieldKey: 'area_total', valueText: '100 ha', normalizedValue: '100', valueType: 'area', confidence: 0.9, evidenceText: 'Área total: 100 ha', evidenceSource: 'pdf', extractor: 'deterministic' },
    ]
    const fieldsB: SpecializedField[] = [
      fieldsA[0],
      { ...fieldsA[1], valueText: '105 ha', normalizedValue: '105', evidenceText: 'Área total: 105 ha' },
      { fieldKey: 'onus', valueText: 'Hipoteca', normalizedValue: 'hipoteca', valueType: 'text', confidence: 0.8, evidenceText: 'Ônus: Hipoteca', evidenceSource: 'pdf', extractor: 'deterministic' },
    ]
    const docA = document('x', 'matricula_v1_2025.pdf')
    const docB = { ...docA, filename: 'matricula_v2_2026.pdf' }
    expect(documentFamilyKey(docA, 'matricula_imovel', fieldsA)).toBe(documentFamilyKey(docB, 'matricula_imovel', fieldsB))
    expect(compareDocumentFields(fieldsA, fieldsB)).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'area_total', change: 'changed' }),
      expect.objectContaining({ fieldKey: 'onus', change: 'added' }),
    ]))
    expect(fieldSimilarity(fieldsA, fieldsB)).toBeCloseTo(0.25)
  })

  it('bloqueia arquivo sem conteúdo e formato fora da lista segura', () => {
    const findings = validateDocument({ ...document(''), mimetype: 'application/x-msdownload', sizeBytes: 0 })
    expect(findings.filter((finding) => finding.severity === 'critical')).toHaveLength(3)
  })

  it('aceita KML/XML textual já extraído pelo intake seguro', () => {
    const findings = validateDocument({ ...document('<kml><Placemark /></kml>', 'talhao.kml'), mimetype: 'application/xml' })
    expect(findings.some((finding) => finding.severity === 'critical')).toBe(false)
  })

  it('aceita XLSM presente na whitelist central de planilhas', () => {
    const findings = validateDocument({
      ...document('Planilha com dados extraídos', 'gestao.xlsm'),
      mimetype: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      kind: 'xlsx',
    })
    expect(findings.some((finding) => finding.severity === 'critical')).toBe(false)
  })
})
