import { test } from 'vitest'
import assert from 'node:assert'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  generateStructured,
  isOpenAIEnabled,
  pingOpenAIReasoning,
  pingOpenAIWebSearch,
} from '../../src/services/llm/OpenAIClient.ts'
import { getModelForRole } from '../../src/services/llm/LLMConfig.ts'

const runLive = process.env.RUN_LLM_TESTS === '1' && isOpenAIEnabled()

test('OpenAI web_search esta disponivel', { skip: !runLive }, async () => {
  const result = await pingOpenAIWebSearch()
  assert.strictEqual(result.supported, true, result.error)
})

test('OpenAI reasoning esta disponivel', { skip: !runLive }, async () => {
  const result = await pingOpenAIReasoning()
  assert.strictEqual(result.supported, true, result.error)
})

test('OpenAI le PDF nativo e extrai dado com Structured Output', { skip: !runLive, timeout: 120_000 }, async () => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText('ALETIS TESTE DOCUMENTAL - CODIGO 12345', { x: 60, y: 760, size: 16, font })
  const bytes = await pdf.save()

  const result = await generateStructured<{ codigo: string }>([{
    role: 'user',
    content: [
      {
        type: 'file',
        filename: 'teste-alix.pdf',
        detail: 'high',
        source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') },
      },
      { type: 'input_text', text: 'Extraia somente o codigo numerico visivel no PDF.' },
    ],
  }], {
    name: 'teste_pdf_nativo',
    schema: {
      type: 'object',
      properties: { codigo: { type: 'string' } },
      required: ['codigo'],
    },
    model: getModelForRole('doc_analyzer'),
    maxTokens: 128,
    reasoning: { effort: 'low' },
    store: false,
  })

  assert.strictEqual(result.data.codigo, '12345')
})
