import assert from 'node:assert'
import { test } from 'vitest'

import { isVerifiedDocumentTaxId, resolveDocumentClientScope } from '../../src/routes/alix-documents.ts'

test('prova documental exige dígitos verificadores de CPF e CNPJ, aceitando formatação', () => {
  assert.equal(isVerifiedDocumentTaxId('123.456.789-09'), true)
  assert.equal(isVerifiedDocumentTaxId('11.222.333/0001-81'), true)
  for (const value of ['12345678900', '11222333000182', '11111111111', '00000000000000', '12345']) assert.equal(isVerifiedDocumentTaxId(value), false)
})

test('bloqueia vínculo quando CPF/CNPJ do anexo diverge do cliente ativo', () => {
  const scope = resolveDocumentClientScope({
    activeClienteId: 'cli_a',
    activeCpfCnpj: '123.456.789-09',
    detectedCpfCnpj: '11.222.333/0001-81',
  })
  assert.equal(scope.status, 'conflict')
  assert.equal(scope.identityConflict, true)
})

test('aceita identidade documental compatível e mantém inconclusivo sem identificação', () => {
  assert.deepEqual(resolveDocumentClientScope({
    activeClienteId: 'cli_a',
    activeCpfCnpj: '11.222.333/0001-81',
    detectedCpfCnpj: '11222333000181',
  }), { status: 'matched', identityConflict: false })

  assert.deepEqual(resolveDocumentClientScope({ activeClienteId: 'cli_a' }), {
    status: 'unverified',
    identityConflict: false,
  })
})
