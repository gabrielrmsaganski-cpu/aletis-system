import { describe, expect, it } from 'vitest'
import { CanonicalClientMap, mergedClientIdentity } from '../../src/services/core/ClientIdentity.js'
import { confirmMergeIdentity, consolidatedClientPayload, identityPlanFingerprint, isVerifiedBrazilianDocument, replaceOperationalClientReferences, type IdentityMergePlan } from '../../src/services/core/ClientIdentityMergeService.js'
const canonical = { id: 'current', nome: 'Pessoa Sintética', cpf_cnpj: '52998224725', organization_id: 'org-test', payload: { id: 'current', nome: 'Pessoa Sintética', cpfCnpj: '52998224725', estagio: 'analise', valorTotalDivida: '1234.56', valorTotalPago: '0.00', dividas: [], pagamentos: [], telefone: 'real', cidade: 'documental', tags: ['duplicidade_potencial'], observacoes: 'Contrato(s): 123456, 456789. Informação sintética.', timeline: [{ data: '2026-01-01', descricao: 'Original' }] } }
const source = { id: 'former', nome: 'Pessoa Sintética', cpf_cnpj: '000.000.000-00', organization_id: 'org-test', payload: { id: 'former', nome: 'Pessoa Sintética', cpfCnpj: '000.000.000-00', estagio: 'analise', valorTotalDivida: '9999.99', valorTotalPago: '1000.00', dividas: [{ contrato: '123456' }, { contrato: '456789' }], pagamentos: [{ valor: '9999.99' }], telefone: 'inventado', cidade: 'inventada', timeline: [{ data: '2025-01-01', descricao: 'Histórico do anterior' }], googleDriveInventory: { totalFiles: 4 } } }
function plan() { const result = { version: 1, sourceId: source.id, canonicalId: canonical.id, source, canonical, reason: 'Mesma identidade por contratos documentais', operationId: 'test', createdAt: '2026-09-07', references: [], memories: [], schemaSignature: 'test', identityEvidence: confirmMergeIdentity(source, canonical) } as unknown as IdentityMergePlan; result.fingerprint = identityPlanFingerprint(result); return result }
describe('identidade consolidada do CRM', () => {
  it('exige dígitos verificadores reais de CPF/CNPJ', () => {
    expect(isVerifiedBrazilianDocument('529.982.247-25')).toBe(true)
    expect(isVerifiedBrazilianDocument('529.982.247-20')).toBe(false)
    expect(isVerifiedBrazilianDocument('00.000.000/0000-00')).toBe(false)
    expect(isVerifiedBrazilianDocument('11.222.333/0001-81')).toBe(true)
  })
  it('confirma o provisório por dois contratos e documento canônico válido', () => expect(confirmMergeIdentity(source, canonical).matchingContracts).toEqual(['123456', '456789']))
  it('não confunde nome igual com identidade confirmada', () => expect(() => confirmMergeIdentity({ ...source, payload: { ...source.payload, dividas: [] } }, canonical)).toThrow(/insuficiente/))
  it('bloqueia CPF válido divergente', () => expect(() => confirmMergeIdentity({ ...source, cpf_cnpj: '11144477735' }, canonical)).toThrow(/insuficiente/))
  it('bloqueia dados de outra organização', () => expect(() => confirmMergeIdentity({ ...source, organization_id: 'other' }, canonical)).toThrow(/organizações/))
  it('bloqueia nome completo divergente mesmo com os mesmos contratos', () => expect(() => confirmMergeIdentity({ ...source, nome: 'Outra pessoa' }, canonical)).toThrow(/nomes/))
  it('não soma valores nem promove contato ou endereço sintéticos', () => {
    const result = consolidatedClientPayload(plan(), '2026-09-07T10:00:00Z')
    for (const key of ['valorTotalDivida', 'valorTotalPago', 'dividas', 'pagamentos', 'telefone', 'cidade']) expect(result[key]).toEqual((canonical.payload as any)[key])
    expect(result.googleDriveInventory.totalFiles).toBe(4)
    expect(result.timeline).toHaveLength(3)
    expect(result.timeline[1].origemCadastroId).toBe(source.id)
    expect(result.identityConsolidation.operations[0].financialValuesPromoted).toBe(false)
    expect(source.payload.timeline).toHaveLength(1)
    expect(result.tags).not.toContain('duplicidade_potencial')
  })
  it('mudança em qualquer referência invalida fingerprint do plano', () => { const p = plan(); p.reason += ' mudança'; expect(identityPlanFingerprint(p)).not.toBe(p.fingerprint) })
  it('substitui somente referências estruturadas e preserva texto e IDs do histórico', () => {
    expect(replaceOperationalClientReferences({ id: 'former', clienteId: 'former', descricao: 'Cliente former', cliente: { id: 'former' }, evidence: { sourceId: 'former' }, items: [{ client_id: 'former' }] }, 'former', 'current')).toEqual({ id: 'former', clienteId: 'current', descricao: 'Cliente former', cliente: { id: 'current' }, evidence: { sourceId: 'former' }, items: [{ client_id: 'current' }] })
  })
  it('mantém um cliente na carteira e resolve o link anterior', () => {
    const map = new CanonicalClientMap<any>(); map.set('current', canonical.payload)
    map.set('former', { ...source.payload, identityMerge: { status: 'merged', canonicalId: 'current' } })
    expect(map.get('former')?.id).toBe('current'); expect(map.size).toBe(1); expect([...map.values()].map(x => x.id)).toEqual(['current'])
    expect(() => map.set('former', source.payload)).toThrow(/consolidado/)
    expect(() => map.delete('former')).toThrow(/consolidado/)
    expect(map.get('current')?.nome).toBe(canonical.nome)
  })
  it('suporta consolidação em cadeia e rejeita ciclos', () => {
    const map = new CanonicalClientMap<any>(); map.set('current', canonical.payload); map.registerAlias('older', 'former'); map.registerAlias('former', 'current')
    expect(map.get('older')?.id).toBe('current'); expect(() => map.registerAlias('current', 'older')).toThrow(/circular/)
  })
  it('não classifica metadata incompleta como consolidação', () => expect(mergedClientIdentity({ identityMerge: { status: 'merged' } })).toBeNull())
})
