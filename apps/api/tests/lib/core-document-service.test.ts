import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('CoreDocumentService', () => {
  let dir: string

  beforeEach(async () => {
    process.env.ALETIS_PG_ENABLED = '0'
    process.env.ALIX_USE_LLM = 'false'
    process.env.ALETIS_DOCUMENT_AUTO_INDEX = 'false'
    dir = await mkdtemp(join(tmpdir(), 'aletis-core-docs-'))
    process.env.ALETIS_CORE_DOCUMENT_DIR = dir
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('salva documento, extrai texto e lista por cliente sem Postgres', async () => {
    const { CoreDocumentService } = await import('../../src/services/core/CoreDocumentService.js')
    const svc = new CoreDocumentService()
    const doc = await svc.upload({
      clienteId: 'cli-test',
      filename: 'contrato-teste.txt',
      mimetype: 'text/plain',
      categoria: 'contrato',
      buffer: Buffer.from('Contrato rural teste com vencimento em 2027 e valor de R$ 100.000,00.'),
      criadoPor: 'vitest',
    })

    expect(doc.id).toMatch(/^doc_/)
    expect(doc.categoria).toBe('contrato')
    expect(doc.textoExtraidoChars).toBeGreaterThan(10)

    const list = await svc.listClientDocuments('cli-test')
    expect(list.length).toBe(1)
    expect(list[0].nome).toBe('contrato-teste.txt')
    expect(list[0].source).toBe('core')
  })
})
