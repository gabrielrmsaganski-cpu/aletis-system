import { describe, expect, it } from 'vitest'
import type { DocumentExtractionResult } from '@aletis/shared-types'
import { buildDocumentFinancialReview, documentMoney, documentMoneyMatches, normalizeDocumentDebt } from '../../src/services/alix/crm/DocumentFinancialReview.js'
import { buildCrmEnrichment } from '../../src/services/alix/extraction/CrmEnrichmentEngine.js'
import { validateDocumentGrounding } from '../../src/services/alix/reliability/AlixGroundingGuardService.js'
import { buildClienteDocumentDiff } from '../../src/services/alix/crm/CrmDiffService.js'
import { buildDocumentOnboardingCandidate } from '../../src/services/alix/intake/DocumentOnboardingReviewService.js'

const evidence = (value: unknown, trecho: string) => ({ field: 'dividaTotal', value, trecho, fonte: 'Página 2', confianca: 0.9 })
const extraction = (): DocumentExtractionResult => ({ documentoId: 'documento-fixture', sessionId: 'sessao-fixture', tipoDocumento: 'contrato_credito_rural', confianca: 0.9,
  clienteData: { nome: 'Cliente Sintético', cpfCnpj: '123.456.789-01' }, dividas: [], propriedades: [], entidades: [], riscos: [], lacunas: [], evidencias: [], acoesSugeridas: [] })

describe('revisão financeira documental exata', () => {
  it.each([undefined, null, '', false, -1, '1.234', 'NaN', Infinity, '1,50'])('não converte %s em zero ou em dinheiro presumido', value => {
    expect(documentMoney(value)).toBeUndefined()
  })
  it('normaliza zero explícito e centavos legados sem trocar principal pelo saldo', () => {
    expect(documentMoney(0)).toBe('0.00')
    expect(documentMoney(0.1)).toBe('0.10')
    expect(normalizeDocumentDebt({ contrato: 'A', valorOriginal: 800, valorAtualizado: 0 })).toMatchObject({ valorOriginal: '800.00', valorAtualizado: '0.00' })
    expect(normalizeDocumentDebt({ valorOriginal: 800 })).not.toHaveProperty('valorAtualizado')
    expect(normalizeDocumentDebt({ valorAtualizado: 800 })).not.toHaveProperty('valorOriginal')
  })
  it('soma subtotais em centavos exatos, sem promovê-los a dívida total', () => {
    const review = buildDocumentFinancialReview([{ valorAtualizado: '90071992547409.91' }, { valorAtualizado: '0.09' }])
    expect(review.saldoAtualDocumentado).toBe('90071992547410.00')
    expect(review.saldoAtualTotalComprovado).toBeUndefined()
    expect(review.pendencias).toContainEqual(expect.objectContaining({ campo: 'dividaTotal', motivo: 'nao_comprovado' }))
  })
  it('apresenta principal, zero e saldo parcial com lacunas por contrato', () => {
    const review = buildDocumentFinancialReview([{ valorAtualizado: 0, valorOriginal: 500 }, { valorOriginal: 300 }])
    expect(review).toMatchObject({ principalDocumentado: '800.00', saldoAtualDocumentado: '0.00', contratosComSaldo: 1, coberturaSaldos: 'parcial' })
    expect(review.saldoAtualTotalComprovado).toBeUndefined()
    expect(review.pendencias).toContainEqual(expect.objectContaining({ campo: 'dividas[1].valorAtualizado' }))
  })
  it('preserva total zero comprovado, incluindo evidência com data e sem value estruturado', () => {
    const review = buildDocumentFinancialReview([], [evidence(undefined, 'Saldo devedor total de R$ 0,00 em 08/09/2026.')])
    expect(review.saldoAtualTotalComprovado).toBe('0.00')
    expect(review.pendencias).not.toContainEqual(expect.objectContaining({ campo: 'dividaTotal' }))
  })
  it('não usa principal, juros, hectares ou data como prova de saldo', () => {
    expect(documentMoneyMatches('Valor original R$ 100,00; saldo atualizado R$ 80,00.', '100.00', 'current')).toBe(false)
    expect(documentMoneyMatches('Valor original R$ 100,00; saldo atualizado R$ 80,00.', '80.00', 'current')).toBe(true)
    expect(documentMoneyMatches('Saldo atualizado após a leitura de 100 ha.', '100.00', 'current')).toBe(false)
    expect(documentMoneyMatches('Saldo devedor R$ 80,00 em 08/09/2026.', '2026.00', 'current')).toBe(false)
    expect(buildDocumentFinancialReview([], [evidence(100, 'Valor original R$ 100,00')]).saldoAtualTotalComprovado).toBeUndefined()
  })
  it('totais divergentes ficam em revisão, sem escolher maior ou mais recente implicitamente', () => {
    const review = buildDocumentFinancialReview([], [evidence(100, 'Saldo total R$ 100,00'), evidence(80, 'Saldo total R$ 80,00')])
    expect(review.saldoAtualTotalComprovado).toBeUndefined()
    expect(review.pendencias).toContainEqual(expect.objectContaining({ campo: 'dividaTotal', motivo: 'conflito' }))
  })
  it.each([
    'Saldo devedor R$ 100,00.',
    'Saldo atualizado R$ 100,00.',
    'Saldo total do contrato R$ 100,00.',
    'Saldo devedor total da operação R$ 100,00.',
    'Saldo total da parcela R$ 100,00.',
    'Saldo global do contrato do cliente R$ 100,00.',
    'Contrato ABC. Saldo devedor total R$ 100,00.',
    'Saldo total das parcelas R$ 100,00.',
  ])('campo dividaTotal não transforma saldo individual em global: %s', trecho => {
    expect(documentMoneyMatches(trecho, '100.00', 'global_current')).toBe(false)
    expect(buildDocumentFinancialReview([], [evidence('100.00', trecho)]).saldoAtualTotalComprovado).toBeUndefined()
    expect(validateDocumentGrounding('onboarding_cliente_completo', { nome: 'Cliente Sintético', dividaTotal: '100.00', documentoId: 'doc-fixture', confiancaDocumento: 0.9,
      evidencias: [{ field: 'nome', trecho: 'Cliente Sintético' }, evidence('100.00', trecho)] }).ok).toBe(false)
  })
  it.each([
    'Saldo devedor total R$ 100,00.',
    'Saldo consolidado do cliente R$ 100,00.',
    'Saldo total de todas as operações do cliente R$ 100,00.',
    'Saldo consolidado do cliente referente aos contratos A e B R$ 100,00.',
  ])('aceita prova explícita de alcance global: %s', trecho => {
    expect(buildDocumentFinancialReview([], [evidence('100.00', trecho)]).saldoAtualTotalComprovado).toBe('100.00')
  })
})

describe('enriquecimento e proteção da escrita', () => {
  it('aguarda busca pelo CPF normalizado e prepara atualização, preservando total existente', async () => {
    const data = extraction()
    data.dividas = [{ contrato: 'A', valorOriginal: 500 }]
    const result = await buildCrmEnrichment(data, async cpf => { expect(cpf).toBe('12345678901'); return { id: 'cliente-existente', valorTotalDivida: '900.00' } })
    expect(result).toMatchObject({ operation: 'update', clienteId: 'cliente-existente', dividas: [{ contrato: 'A', valorOriginal: '500.00' }] })
    expect(result?.cliente).not.toHaveProperty('valorTotalDivida')
    expect(result?.cliente.dividas?.[0]).not.toHaveProperty('valorAtualizado')
  })
  it('CPF inválido não é tratado como confirmação de cliente novo', async () => {
    const data = extraction(); data.clienteData.cpfCnpj = '123'
    expect(await buildCrmEnrichment(data, () => { throw new Error('não deve consultar identidade inválida') })).toBeNull()
  })
  it('cadastro sem valores deixa totais e pagamentos ausentes, mas conserva revisão útil', async () => {
    const result = await buildCrmEnrichment(extraction(), () => null)
    expect(result?.cliente).not.toHaveProperty('valorTotalDivida')
    expect(result?.cliente).not.toHaveProperty('valorTotalPago')
    expect(result?.revisaoFinanceira.pendencias.length).toBeGreaterThan(0)
  })
  it('zero exige sua própria evidência; principal com mesmo valor não comprova saldo', () => {
    const base = { nome: 'Cliente Sintético', dividaTotal: '0.00', documentoId: 'doc-fixture', confiancaDocumento: 0.9,
      evidencias: [{ field: 'nome', trecho: 'Cliente Sintético' }, evidence(100, 'Saldo devedor R$ 100,00')] }
    expect(validateDocumentGrounding('onboarding_cliente_completo', base).ok).toBe(false)
    expect(validateDocumentGrounding('onboarding_cliente_completo', { ...base, evidencias: [base.evidencias[0], evidence(0, 'Saldo devedor total R$ 0,00')] }).ok).toBe(true)
    expect(validateDocumentGrounding('onboarding_cliente_completo', { ...base, dividaTotal: '100.00', evidencias: [base.evidencias[0], evidence(100, 'Principal R$ 100,00')] }).ok).toBe(false)
  })
  it('cadastro não financeiro pode seguir para revisão apenas com identidade comprovada', () => {
    expect(validateDocumentGrounding('onboarding_cliente_completo', { nome: 'Cliente Sintético', documentoId: 'doc-fixture', confiancaDocumento: 0.9,
      evidencias: [{ field: 'nome', trecho: 'Cliente Sintético' }] }).ok).toBe(true)
  })
  it('conflito com zero aparece e representações monetárias equivalentes não geram falso conflito', () => {
    const cliente = { dividas: [{ contrato: 'A', valorAtualizado: 0, valorOriginal: 300 }] }
    expect(buildClienteDocumentDiff(cliente, { dividas: [{ contrato: 'A', valorAtualizado: '300.00' }] }).dividasConflitantes[0].fields).toContain('valorAtualizado')
    expect(buildClienteDocumentDiff(cliente, { dividas: [{ contrato: 'A', valorAtualizado: '0.00', valorOriginal: '300.00' }] }).dividasConflitantes).toEqual([])
  })
  it('pré-cadastro não fabrica evidência financeira a partir da soma das dívidas', () => {
    const data = extraction(); data.dividas = [{ valorOriginal: 500 }, { valorAtualizado: 80 }]
    const result = buildDocumentOnboardingCandidate({ id: data.documentoId, sessionId: data.sessionId, filename: 'contrato.pdf', kind: 'pdf', mimetype: 'application/pdf', sizeBytes: 1, uploadedAt: new Date().toISOString(), metadata: { smartExtraction: data } })
    expect(result?.candidate.nome).toBe('Cliente Sintético')
    expect(result?.candidate.dividaTotal).toBeUndefined()
    expect(result?.evidence.some(ev => ev.field === 'dividaTotal')).toBe(false)
    expect(result?.revisaoFinanceira?.saldoAtualDocumentado).toBe('80.00')
  })
})
