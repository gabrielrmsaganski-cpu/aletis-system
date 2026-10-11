import { afterEach, expect, it, vi } from 'vitest'
import * as db from '../../src/db/client.js'
import * as access from '../../src/services/core/AccessControlService.js'
import * as drive from '../../src/services/google-workspace/DriveCorpusService.js'
import * as analysis from '../../src/services/alix/intake/DriveCorpusAnalysisService.js'
import { analysisHash, groundDriveAnalysis } from '../../src/services/alix/intake/DriveCorpusAnalysisTypes.js'
import { readOperationalDriveAnalysisSource } from '../../src/services/alix/workspace/OperationalDriveAnalysisSource.js'
import { readOperationalDocumentarySource } from '../../src/services/alix/workspace/OperationalDocumentarySource.js'
import { projectOperationalPlan } from '../../src/services/alix/workspace/AlixOperationalPlanService.js'

const actor = { userId: 'consultor-a', userName: 'Pessoa A', role: 'consultor', tenantId: 'tenant-a' }
const chunk = { id: 'chunk-a', ordinal: 0, text: 'Titular: Pessoa A. Valor do orçamento: R$ 1.234,56.', page: 7, sheet: null }
const candidate = groundDriveAnalysis({ documentType: 'orçamento', candidates: [{ label: 'Titular', category: 'identity', value: 'Pessoa A', subject: 'Pessoa A', context: '', evidenceText: 'Titular: Pessoa A.' }] }, chunk).candidates[0]
const row = { id: analysisHash('analysis-a'), fileId: 'file-a', clienteId: 'c1', name: 'Orçamento', revision: analysisHash('revision-a'), contentHash: analysisHash(chunk.text),
  status: 'waiting_budget', processedChunks: 1, totalChunks: 4, availableAt: null, updatedAt: '2026-09-08T15:00:00Z', readingStatus: 'partial', sourceCoverage: { status: 'partial' }, errorCode: 'DAILY_BUDGET', candidates: [candidate], instruction: '' }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
const proof = { analysis_id: row.id, candidate_id: candidate.id, page: 7, sheet: null }

it('agrupa candidatos em uma prioridade e mantém o ID do documento quando a revisão muda', async () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [proof] }) }
  const listCurrent = vi.fn().mockResolvedValue([{ ...row, candidates: [candidate, candidate] }])
  const result = await readOperationalDriveAnalysisSource(actor.tenantId, ['c1'], { pool: pool as any, listCurrent })
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({ status: 'open', clienteId: 'c1', source: { kind: 'drive_analysis', id: row.id, contentHash: row.contentHash, revision: row.revision, chunkId: chunk.id, quoteHash: analysisHash(chunk.text), excerptHash: analysisHash(candidate.evidence.excerpt), excerpt: candidate.evidence.excerpt, page: 7 } })
  expect(result[0].description).toContain('1 candidato(s)')
  expect(result[0].description).toContain('Cobertura parcial')
  expect(result[0].description).toContain('próxima cota')
  expect(result[0].nextAction).toContain('CPF/CNPJ, operação, natureza')
  const revised = { ...row, id: analysisHash('analysis-b'), revision: analysisHash('revision-b'), contentHash: analysisHash('changed'), updatedAt: '2026-09-08T16:00:00Z' }
  listCurrent.mockResolvedValueOnce([revised]); pool.query.mockResolvedValueOnce({ rows: [{ ...proof, analysis_id: revised.id }] })
  const next = await readOperationalDriveAnalysisSource(actor.tenantId, ['c1'], { pool: pool as any, listCurrent })
  expect(next[0].id).toBe(result[0].id)
  const plan = (records: typeof result) => projectOperationalPlan({ now: new Date('2026-09-08T16:00:00Z'), coverage: [], records: { clients: [{ id: 'c1', nome: 'Cliente A', estagio: 'analise', consultor: actor.userName }], documentary: records } })
  expect(plan(next).items.find(item => item.kind.startsWith('documentary_'))?.fingerprint).not.toBe(plan(result).items.find(item => item.kind.startsWith('documentary_'))?.fingerprint)
})

it('omite status resolvido, fonte substituída, hash divergente e trecho que o banco não confirmou', async () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
  const listCurrent = vi.fn().mockResolvedValue([row, { ...row, id: analysisHash('superseded'), fileId: 'old', status: 'superseded' },
    { ...row, fileId: 'bad-excerpt', candidates: [{ ...candidate, evidence: { ...candidate.evidence, excerptHash: '0'.repeat(64) } }] },
    { ...row, fileId: 'confirmed', candidates: [{ ...candidate, status: 'confirmed' }] }, { ...row, fileId: 'other-client', clienteId: 'c2' }])
  expect(await readOperationalDriveAnalysisSource(actor.tenantId, ['c1'], { pool: pool as any, listCurrent })).toEqual([])
  const requested = JSON.parse(pool.query.mock.calls[0][1][2])
  expect(requested).toHaveLength(1)
  expect(pool.query.mock.calls[0][1].slice(0, 2)).toEqual(['tenant-a', ['c1']])
})

it('a entrada pública transmite o tenant verificado e somente clientes autorizados', async () => {
  vi.stubEnv('ALETIS_PG_ENABLED', '1')
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes('select id, nome, consultor, payload from cliente') ? [{ id: 'c1', nome: 'A', consultor: actor.userName, payload: {} }, { id: 'c2', nome: 'B', consultor: 'Outra pessoa', payload: {} }]
    : sql.includes('with requested as') ? [proof] : [] }))
  vi.spyOn(db, 'getPool').mockReturnValue({ query } as any)
  vi.spyOn(drive, 'isDriveCorpusAdministrator').mockReturnValue(false)
  vi.spyOn(access, 'getAccessControlService').mockReturnValue({ canAccessCliente: vi.fn(async ({ clienteId }: { clienteId: string }) => ({ allowed: clienteId === 'c1', source: clienteId === 'c1' ? 'assignment' : 'denied' })) } as any)
  const listCurrent = vi.fn().mockResolvedValue([row])
  vi.spyOn(analysis, 'getDriveCorpusAnalysisService').mockReturnValue({ listCurrent } as any)
  const result = await readOperationalDocumentarySource(undefined, actor)
  expect(listCurrent).toHaveBeenCalledWith('tenant-a', ['c1'], { limit: 100, reviewQueue: { afterId: undefined } })
  expect(result.records).toHaveLength(1)
  expect(result.records[0].source.excerptHash).toBe(candidate.evidence.excerptHash)
  await expect(readOperationalDocumentarySource(undefined, undefined)).rejects.toThrow('Identidade')
  expect(listCurrent).toHaveBeenCalledTimes(1)
})
