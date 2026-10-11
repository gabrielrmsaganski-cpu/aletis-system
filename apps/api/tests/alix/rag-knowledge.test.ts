import { describe, expect, it } from 'vitest'

import { buildCanonicalRagChunks } from '../../src/services/alix/knowledge/RagKnowledgeService.js'
import { ragContentHash } from '../../src/services/alix/rag/RagService.js'

describe('RagKnowledgeService — chunks canônicos', () => {
  it('preserva página, planilha, confiança e evidência do parser', () => {
    const chunks = buildCanonicalRagChunks({
      chunks: [{
        text: 'Garantia hipotecária do imóvel rural.',
        page: 7,
        sheet: 'Garantias',
        kind: 'text',
        confidence: 0.93,
        evidenceIds: ['ev-1'],
      }],
    })
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.pageStart).toBe(7)
    expect(chunks[0]?.pageEnd).toBe(7)
    expect(chunks[0]?.sheet).toBe('Garantias')
    expect(chunks[0]?.metadata?.evidenceIds).toEqual(['ev-1'])
  })

  it('gera fallback determinístico e hash sensível ao conteúdo', () => {
    const first = buildCanonicalRagChunks({ extractedText: 'contrato '.repeat(700) })
    const second = buildCanonicalRagChunks({ extractedText: `${'contrato '.repeat(700)} aditivo` })
    expect(first.length).toBeGreaterThan(1)
    expect(ragContentHash(first)).not.toBe(ragContentHash(second))
  })
})
