import assert from 'node:assert'
import { test } from 'vitest'
import { chunkText } from '../../src/services/alix/rag/RagService.ts'

test('chunkText divide trechos longos sem ultrapassar o limite', () => {
  const text = `# Contrato\n\n${'obrigacao '.repeat(180)}\n\n# Garantias\n\n${'garantia '.repeat(120)}`
  const chunks = chunkText(text, 500, 80)

  assert.ok(chunks.length > 3)
  assert.ok(chunks.every((chunk) => chunk.length <= 500))
  assert.ok(chunks.every((chunk) => chunk.trim().length > 0))
  assert.ok(chunks.join(' ').includes('Contrato'))
  assert.ok(chunks.join(' ').includes('Garantias'))
})

test('chunkText trata conteudo sem pontuacao e limita overlap', () => {
  const chunks = chunkText('x'.repeat(1_200), 300, 1_000)
  assert.ok(chunks.length >= 4)
  assert.ok(chunks.every((chunk) => chunk.length <= 300))
})
