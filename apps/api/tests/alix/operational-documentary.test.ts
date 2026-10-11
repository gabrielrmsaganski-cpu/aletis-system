import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '../../src/db/client.js'
import * as access from '../../src/services/core/AccessControlService.js'
import * as drive from '../../src/services/google-workspace/DriveCorpusService.js'
import { AlixGovernanceService } from '../../src/services/alix/governance/AlixGovernanceService.js'
import { authorizedDocumentaryClientIds, readOperationalDocumentaryRecords, type OperationalDocumentaryRecord } from '../../src/services/alix/workspace/OperationalDocumentarySource.js'
import { projectOperationalPlan, type OperationalCoverageSource } from '../../src/services/alix/workspace/AlixOperationalPlanService.js'

const now = new Date('2026-09-08T15:00:00Z')
const actor = { userId: 'team-a', userName: 'Consultora A', role: 'consultor', tenantId: 'tenant-test' }
const client = { id: 'c1', nome: 'Cliente A', estagio: 'negociacao', consultor: actor.userName, proximaAcao: { descricao: 'Conferir dados', data: '2026-09-09' } }
const coverage: OperationalCoverageSource[] = ['clients', 'demands', 'proposals', 'documentary'].map(key => ({ key: key as OperationalCoverageSource['key'], label: key, status: 'available', origin: 'postgres', records: 1 }))
const finding: OperationalDocumentaryRecord = { id: 'finding:stable', clienteId: 'c1', status: 'open', kind: 'divergence', title: 'Conferir titularidade', description: 'As fontes divergem.', nextAction: 'Comparar titular e CPF na matrícula atual com o CRM.', severity: 'important', source: { kind: 'document_finding', id: 'finding-current', documentId: 'doc-current', label: 'Matrícula', revision: 'sha-1', excerpt: 'Titular da matrícula: titular de teste.', page: 4 } }
beforeEach(() => vi.stubEnv('ALETIS_PG_ENABLED', '0'))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('Pendências documentais na fila da equipe', () => {
  it('entrega ação, responsável e prova uma vez e versiona mudanças da fonte', () => {
    const input = { records: { clients: [client], documentary: [finding, finding] }, coverage, now }
    const first = projectOperationalPlan(input)
    const item = first.items.find(row => row.kind === 'documentary_divergence')!
    expect(first.items.filter(row => row.kind === 'documentary_divergence')).toHaveLength(1)
    expect(item).toMatchObject({ id: 'documentary:finding:stable', owner: actor.userName, nextAction: finding.nextAction, entity: { type: 'document_finding', id: 'finding-current' }, sources: [finding.source] })
    expect(item.dueDate).toBeUndefined()
    const changed = projectOperationalPlan({ ...input, records: { ...input.records, documentary: [{ ...finding, source: { ...finding.source, revision: 'sha-2' } }] } })
    expect(changed.items.find(row => row.id === item.id)?.fingerprint).not.toBe(item.fingerprint)
    expect(projectOperationalPlan({ ...input, records: { ...input.records, documentary: [] } }).items.some(row => row.id === item.id)).toBe(false)
  })

  it('exclui resolvidos, clientes fora do escopo e clientes encerrados ou desconhecidos', () => {
    const plan = projectOperationalPlan({ clienteId: 'c1', records: { clients: [client, { ...client, id: 'c2', estagio: 'encerrado' }], documentary: [
      { ...finding, status: 'resolved' }, { ...finding, id: 'another', clienteId: 'c2' }, { ...finding, id: 'unknown', clienteId: 'missing' },
    ] }, coverage, now })
    expect(plan.items.filter(row => row.kind.startsWith('documentary_'))).toHaveLength(0)
  })

  it('inclui checklist sem prazo e remove o item somente quando concluído', () => {
    const demand = { id: 'd1', clienteId: 'c1', titulo: 'Conferência cadastral', status: 'em_analise', responsavel: 'Consultora A', proximaAcao: 'Conferir campos', proximaAcaoEm: '2026-09-09', checklist: [{ id: 'check1', titulo: 'Conferir CPF no documento original', concluido: false }] }
    const first = projectOperationalPlan({ records: { clients: [client], demands: [demand] }, coverage, now })
    expect(first.items.find(row => row.id === 'checklist:d1:check1')).toMatchObject({ kind: 'checklist_pending', nextAction: 'Conferir CPF no documento original', owner: 'Consultora A' })
    expect(first.items.find(row => row.id === 'checklist:d1:check1')?.dueDate).toBeUndefined()
    const finished = projectOperationalPlan({ records: { clients: [client], demands: [{ ...demand, checklist: [{ ...demand.checklist[0], concluido: true }] }] }, coverage, now })
    expect(finished.items.some(row => row.id === 'checklist:d1:check1')).toBe(false)
  })

  it('usa permissão efetiva e não aceita fallback de compatibilidade para evidências', async () => {
    vi.stubEnv('ALETIS_PG_ENABLED', '1')
    const query = vi.fn().mockResolvedValue({ rows: ['c1', 'c2', 'c3'].map(id => ({ id, consultor: 'Outro', payload: {} })) })
    vi.spyOn(db, 'getPool').mockReturnValue({ query } as any)
    vi.spyOn(drive, 'isDriveCorpusAdministrator').mockReturnValue(false)
    const canAccessCliente = vi.fn().mockResolvedValueOnce({ allowed: true, source: 'assignment' }).mockResolvedValueOnce({ allowed: true, source: 'compat' }).mockResolvedValueOnce({ allowed: false, source: 'denied' })
    vi.spyOn(access, 'getAccessControlService').mockReturnValue({ canAccessCliente } as any)
    expect(await authorizedDocumentaryClientIds(actor)).toEqual(['c1'])
    expect(canAccessCliente.mock.calls.every(([input]) => input.action === 'document:read' && input.actor.id === actor.userId)).toBe(true)
    await expect(authorizedDocumentaryClientIds(undefined)).rejects.toThrow('Identidade')
  })

  it('vencimento contratual extraído prepara conferência sem criar atraso ou prazo de equipe', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'field1', cliente_id: 'c1', document_id: 'doc1', field_key: 'data_vencimento', expires_at: new Date('2026-09-01T12:00:00Z'), status: 'extracted', source_sha256: 'a'.repeat(64), evidence_text: 'Vencimento final: 01/09/2026.' }] }).mockResolvedValueOnce({ rows: [] })
    vi.spyOn(db, 'getPool').mockReturnValue({ query } as any)
    const records = await readOperationalDocumentaryRecords(['c1'])
    expect(records).toHaveLength(1)
    expect(records[0].title).toContain('Vencimento contratual')
    expect(records[0].description).toContain('não comprova atraso de pagamento')
    const plan = projectOperationalPlan({ records: { clients: [{ ...client, proximaAcao: { ...client.proximaAcao, data: '2026-10-01' } }], documentary: records }, coverage, now })
    expect(plan.counts.overdue).toBe(0)
    expect(plan.items[0].dueDate).toBeUndefined()
  })

  it('reconhecer sugestão sem execução mantém a pendência e não duplica no retry', async () => {
    const service = new AlixGovernanceService()
    const fingerprint = `test:${randomUUID()}`
    const input = { fingerprint, clienteId: 'c1', suggestionType: 'missing_field', title: 'Conferir identificação', description: 'Campo ausente.', proposedAction: { operationalItemId: 'documentary:field-id', label: 'Trabalhar com a ALIX' } }
    const created = await service.upsertSuggestion(input)
    const recognized = await service.prepareSuggestion(String(created.id), 'owner-test')
    expect(recognized).toMatchObject({ id: created.id, status: 'pending_review', metadata: { executionPending: true, acknowledgedBy: 'owner-test' } })
    expect(recognized.resolvedAt).toBeUndefined()
    expect(recognized.resolvedBy).toBeUndefined()
    const repeated = await service.upsertSuggestion(input)
    expect(repeated.id).toBe(created.id)
    expect(repeated.status).toBe('pending_review')
    await service.dismissSuggestion(String(created.id), 'owner-test')
    expect((await service.upsertSuggestion(input)).status).toBe('dismissed')
  })
})
