import { describe, expect, it, vi } from 'vitest'
import { DriveKnowledgeService, projectDriveKnowledge, driveFileImportability } from '../../src/services/google-workspace/DriveKnowledgeService.js'
import { driveImportDocumentId, driveImportSessionId, driveRevisionKey } from '../../src/services/google-workspace/DriveSourceIdentity.js'
import { selectClientFolder } from '../../src/services/google-workspace/drive.js'

const actor = { userId: 'owner', tenantId: 'fixture', userName: 'Teste', role: 'consultor' }
const file = { id: 'drive-1', name: 'Contrato.pdf', mimeType: 'application/pdf', modifiedAt: '2026-09-07T00:00:00Z', version: '10', md5Checksum: null, sizeBytes: '123', path: 'Contratos', url: 'https://example.invalid/file' }
const record = { id: 'doc-1', session_id: 'session-1', cliente_id: 'client-1', filename: file.name, source: { fileId: file.id, originalMimeType: file.mimeType, version: '10' }, text_characters: 12500, processing_state: 'completed_basic', review_status: 'verified', extraction: { status: 'complete' }, analysis: null, updated_at: '2026-09-07T01:00:00Z' }

describe('panorama de conhecimento Drive/ALIX', () => {
  it('arquivo inventariado não é apresentado como conteúdo lido', () => {
    expect(projectDriveKnowledge(file, [])).toMatchObject({ freshness: 'not_imported', extractedCharacters: 0, extractionStatus: 'unavailable', analysisRecorded: false })
  })
  it('texto extraído e revisão semântica são estados separados', () => {
    expect(projectDriveKnowledge(file, [record])).toMatchObject({ freshness: 'current', extractionStatus: 'complete', analysisRecorded: false, needsClientReview: false })
  })
  it('versão nova invalida atualização, mesmo com nome e data iguais', () => {
    expect(projectDriveKnowledge({ ...file, version: '11' }, [record])).toMatchObject({ freshness: 'outdated', documentId: 'doc-1' })
  })
  it('prefere versão correspondente e informa OCR e segmentos pendentes', () => {
    const current = { ...record, extraction: { status: 'partial', pendingPages: [4, 7], totalRows: 12, extractedRows: 9 }, analysis: { pendingSegments: [1, 2, 3] } }
    expect(projectDriveKnowledge(file, [{ ...record, id: 'older', source: { ...record.source, version: '9' } }, current])).toMatchObject({ documentId: 'doc-1', freshness: 'current', pendingPages: 2, pendingRows: 3, analysisRecorded: true, analysisPendingSegments: 3, extractionStatus: 'partial' })
  })
  it('legado sem prova de versão ou cobertura não anuncia leitura completa', () => {
    expect(projectDriveKnowledge(file, [{ ...record, source: {}, extraction: null, review_status: null }])).toMatchObject({ freshness: 'unverified', extractionStatus: 'unknown', needsClientReview: true })
  })
  it('usa data legada como comparação quando não existe versão registrada', () => {
    expect(projectDriveKnowledge(file, [{ ...record, source: { modifiedAt: file.modifiedAt } }]).freshness).toBe('current')
    expect(projectDriveKnowledge(file, [{ ...record, source: { modifiedAt: '2020-01-01' } }]).freshness).toBe('outdated')
  })
  it('tamanho, arquivo nativo e atalhos são visíveis antes de importar', () => {
    expect(driveFileImportability({ ...file, sizeBytes: String(21 * 1024 * 1024) })).toBe('too_large')
    expect(driveFileImportability({ ...file, mimeType: 'application/vnd.google-apps.spreadsheet' })).toBe('supported')
    expect(driveFileImportability({ ...file, mimeType: 'application/vnd.google-apps.shortcut' })).toBe('shortcut')
    expect(driveFileImportability({ ...file, mimeType: 'video/mp4' })).toBe('unsupported')
  })
  it('consulta usa identidade, cliente, tenant e controle de proprietário por parâmetro', async () => {
    const query = vi.fn(async () => ({ rows: [record] }))
    const result = await new DriveKnowledgeService({ query }).inspect({ actor, clientId: 'client-1', files: [file] })
    expect(query.mock.calls[0]).toHaveLength(2)
    expect((query.mock.calls as unknown[][])[0][1]).toEqual([[file.id], 'client-1', actor.userId, false, actor.tenantId])
    expect(result).toMatchObject({ source: 'postgresql', totals: { inventoried: 1, current: 1, extractionComplete: 1 } })
    expect(JSON.stringify(result)).not.toContain('extractedText')
  })
  it('falha e payload inválido são erros visíveis, sem inventar cobertura vazia', async () => {
    await expect(new DriveKnowledgeService({ query: async () => { throw new Error('PG indisponível') } }).inspect({ actor, clientId: 'client', files: [file] })).rejects.toThrow('PG indisponível')
    await expect(new DriveKnowledgeService({ query: async () => ({ rows: [{}] }) }).inspect({ actor, clientId: 'client', files: [file] })).rejects.toThrow()
  })
})

describe('identidade incremental e vínculo de pasta', () => {
  it('a sessão de importação é estável e isolada por autor, cliente e tenant', () => {
    expect(driveImportSessionId(actor, 'client')).toBe(driveImportSessionId(actor, 'client'))
    for (const changed of [{ ...actor, userId: 'other' }, { ...actor, tenantId: 'other' }]) expect(driveImportSessionId(changed, 'client')).not.toBe(driveImportSessionId(actor, 'client'))
    expect(driveImportSessionId(actor, 'other')).not.toBe(driveImportSessionId(actor, 'client'))
  })
  it('documento depende da versão e bytes, mas não do instante da importação', () => {
    const source = { type: 'google_drive' as const, fileId: file.id, url: file.url, path: file.path, modifiedAt: file.modifiedAt, importedAt: 'now', revisionKey: driveRevisionKey(file) }
    const input = { actor, clientId: 'client', sessionId: 'session', source, buffer: Buffer.from('conteúdo') }
    expect(driveImportDocumentId(input)).toBe(driveImportDocumentId({ ...input, source: { ...source, importedAt: 'later' } }))
    expect(driveImportDocumentId(input)).not.toBe(driveImportDocumentId({ ...input, buffer: Buffer.from('mudou') }))
    expect(driveImportDocumentId(input)).not.toBe(driveImportDocumentId({ ...input, source: { ...source, revisionKey: driveRevisionKey({ ...file, version: '11' }) } }))
    expect(driveImportDocumentId(input)).not.toBe(driveImportDocumentId({ ...input, source: { ...source, fileId: 'other-source-same-bytes' } }))
  })
  it('não vincula documentos de outro cliente apenas por sobrenome', () => {
    expect(selectClientFolder([{ name: 'GRUPO JOÃO OLIVEIRA' }], 'Maria Oliveira')).toBeNull()
    expect(selectClientFolder([{ name: 'GRUPO MARIA OLIVEIRA - BPO' }], 'Maria Oliveira')).toEqual({ name: 'GRUPO MARIA OLIVEIRA - BPO' })
  })
  it('pastas homônimas exigem vínculo inequívoco antes de criar/enviar documentos', () => {
    expect(() => selectClientFolder([{ name: 'GRUPO LUCÍDIO' }, { name: 'GRUPO LUCIDIO - BPO' }], 'Lucidio')).toThrow('mais de uma pasta')
  })
})
