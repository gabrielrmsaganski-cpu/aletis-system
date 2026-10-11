import { test } from 'vitest'
import assert from 'node:assert'
import {
  validateDocumentGrounding,
  assertDocumentGrounding,
} from '../../src/services/alix/reliability/AlixGroundingGuardService.ts'
import {
  enforceGrounding,
  groundingGuardrail,
} from '../../src/services/alix/reliability/groundingGuardrail.ts'

test('guardrail bloqueia onboarding documental sem evidência', () => {
  const decision = validateDocumentGrounding('onboarding_cliente_completo', {
    nome: 'Cliente Sem Fonte',
    cpfCnpj: '12345678901',
    dividaTotal: 100000,
    origem: 'alix-documento',
  })

  assert.strictEqual(decision.ok, false)
  assert.strictEqual(decision.severity, 'block')
  assert.ok(decision.reasons.some((r) => r.includes('documentoId')))
  assert.ok(decision.reasons.some((r) => r.includes('Nenhuma evidência')))
})

test('guardrail permite onboarding com documento, confiança e evidências mínimas', () => {
  const decision = assertDocumentGrounding('onboarding_cliente_completo', {
    nome: 'Cliente Com Fonte',
    cpfCnpj: '12345678901',
    dividaTotal: 100000,
    origem: 'alix-documento',
    documentoId: 'doc-1',
    confiancaDocumento: 0.86,
    evidencias: [
      { field: 'nome', trecho: 'Cliente Com Fonte', fonte: 'p1', confianca: 0.9 },
      { field: 'cpfCnpj', trecho: 'CPF 12345678901', fonte: 'p1', confianca: 0.88 },
      { field: 'dividaTotal', trecho: 'Saldo devedor total R$ 100.000,00', fonte: 'p2', confianca: 0.82 },
    ],
  })

  assert.strictEqual(decision.ok, true)
  assert.strictEqual(decision.severity, 'allow')
  assert.strictEqual(decision.missingEvidenceFields.length, 0)
})

test('guardrail rejeita evidência cujo trecho não comprova o valor informado', () => {
  const decision = validateDocumentGrounding('onboarding_cliente_completo', {
    nome: 'Cliente Com Fonte',
    dividaTotal: 900000,
    origem: 'alix-documento',
    documentoId: 'doc-1',
    confiancaDocumento: 0.9,
    evidencias: [
      { field: 'nome', trecho: 'Cliente Com Fonte', fonte: 'p1', confianca: 0.9 },
      { field: 'dividaTotal', trecho: 'Saldo devedor total R$ 100.000,00', fonte: 'p2', confianca: 0.9 },
    ],
  })

  assert.strictEqual(decision.ok, false)
  assert.ok(decision.missingEvidenceFields.includes('dividaTotal'))
})

test('guardrail bloqueia atualização de dívida sem evidência de dívida', () => {
  const decision = validateDocumentGrounding('atualizar_cliente_completo', {
    clienteId: 'cli-1',
    documentoId: 'doc-1',
    confiancaDocumento: 0.9,
    dividas: [{ numeroContrato: 'CCR-1', valorAtualizado: 100000 }],
    evidencias: [{ field: 'nome', trecho: 'Cliente', fonte: 'p1', confianca: 0.9 }],
  })

  assert.strictEqual(decision.ok, false)
  assert.deepStrictEqual(decision.missingEvidenceFields, ['dividas'])
})

test('guardrail de resposta permite apenas dados presentes nas tools', () => {
  const report = groundingGuardrail(
    'A dívida é R$ 100.000,00 e o CPF é 123.456.789-01.',
    { toolResults: [{ cliente: { cpfCnpj: '12345678901', valorDivida: 100000 } }] },
  )

  assert.strictEqual(report.ok, true)
})

test('guardrail de resposta redige valor e URL sem fonte', () => {
  const reply = 'A dívida é R$ 900.000,00. Fonte: https://exemplo-inventado.test/caso'
  const report = groundingGuardrail(reply, { toolResults: [{ valorDivida: 100000 }] })
  const safe = enforceGrounding(reply, report)

  assert.strictEqual(report.ok, false)
  assert.ok(report.flags.some((flag) => flag.kind === 'valor'))
  assert.ok(report.flags.some((flag) => flag.kind === 'url'))
  assert.ok(!safe.includes('R$ 900.000,00'))
  assert.ok(!safe.includes('https://exemplo-inventado.test/caso'))
})

test('valor monetário não pode ser comprovado por hectares, quantidade ou argumentos propostos', () => {
  for (const result of [
    { areaHectares: 1000 },
    { quantidade: 1000, score: 1000 },
    { tool: 'criar_proposta', input: { valorDivida: '1000.00' }, result: { success: false } },
  ]) {
    const report = groundingGuardrail('A dívida é R$ 1.000,00.', { toolResults: [result] })
    assert.ok(report.flags.some(flag => flag.kind === 'valor'))
  }
})

test('abreviações monetárias e centavos são comparados sem tolerância ou perda de precisão', () => {
  assert.strictEqual(groundingGuardrail('Saldo de R$ 1,5 milhão.', {
    toolResults: [{ saldoDevedor: '1500000.00' }],
  }).ok, true)
  assert.strictEqual(groundingGuardrail('Saldo de R$ 500 mil.', {
    toolResults: [{ saldoDevedor: '500000.00' }],
  }).ok, true)
  assert.strictEqual(groundingGuardrail('Saldo de R$ 90.071.992.547.409,91.', {
    toolResults: [{ saldoDevedor: '90071992547409.91' }],
  }).ok, true)
  assert.strictEqual(groundingGuardrail('Saldo de R$ 90.071.992.547.409,92.', {
    toolResults: [{ saldoDevedor: '90071992547409.91' }],
  }).ok, false)
})

test('resultado negativo e percentual conservam a unidade da evidência', () => {
  assert.strictEqual(groundingGuardrail('Saldo de R$ -1.200,50 e taxa de 10,25%.', {
    toolResults: [{ saldo: '-1200.50', taxaAnual: '10.25' }],
  }).ok, true)
  assert.strictEqual(groundingGuardrail('A taxa é 10%.', {
    toolResults: [{ quantidade: 10, valor: '10.00' }],
  }).ok, false)
})

test('identificador não é formado pela concatenação de números de campos diferentes', () => {
  assert.strictEqual(groundingGuardrail('CPF 123.456.789-01.', {
    toolResults: [{ a: 123, b: 456, c: 789, d: '01' }],
  }).ok, false)
})

test('aprovação bancária precisa de estado confirmado na ferramenta', () => {
  const reply = 'O banco aprovou o financiamento.'
  assert.strictEqual(groundingGuardrail(reply, {
    toolResults: [{ proposta: { status: 'em análise' } }],
  }).ok, false)
  assert.strictEqual(groundingGuardrail(reply, {
    toolResults: [{ proposta: { status: 'aprovada' } }],
  }).ok, true)
  assert.strictEqual(groundingGuardrail('Se o banco aprovou o financiamento, confirme as condições.', {}).ok, true)
  assert.strictEqual(groundingGuardrail('O banco aprovou o financiamento?', {}).ok, true)
})

test('aprovações explícitas com nome de banco e gênero feminino exigem evidência', () => {
  for (const reply of [
    'O Banco Exemplo aprovou a operação ontem.',
    'O Banco do Brasil aprovou o financiamento.',
    'A proposta foi aprovada.',
    'A operação está aprovada.',
    'O contrato foi aprovado.',
    'A renegociação foi aprovada.',
  ]) {
    const report = groundingGuardrail(reply, { toolResults: [{ status: 'em análise' }] })
    assert.ok(report.flags.some(flag => flag.kind === 'confirmacao'), reply)
    assert.ok(!enforceGrounding(reply, report).includes(reply), reply)
  }
})

test('perguntas, condicionais e negações de aprovação não são confirmações', () => {
  for (const reply of [
    'O Banco Exemplo aprovou a operação?',
    'O Banco Exemplo aprovou a operação de R$ 1.000,00?',
    'Se ontem o Banco Exemplo aprovou a operação, confirme as condições.',
    'Caso o Banco Exemplo aprovou a operação, confirme as condições.',
    'Confirme se o Banco Exemplo aprovou a operação.',
    'Se houver R$ 1.000,00 disponíveis, o Banco Exemplo aprovou a operação.',
    'A proposta foi aprovada se o banco confirmou os documentos.',
    'O Banco Exemplo não aprovou a operação.',
    'O banco nunca aprovou a operação.',
    'A proposta não foi aprovada.',
    'Não há confirmação de que o Banco Exemplo aprovou a operação.',
    'É falso que a operação foi aprovada.',
    'Talvez o Banco Exemplo aprovou a operação.',
  ]) {
    const report = groundingGuardrail(reply, { toolResults: [{ valor: '1000.00' }] })
    assert.strictEqual(report.ok, true, reply)
  }
  assert.strictEqual(groundingGuardrail('O banco aprovou a operação. Deseja revisar?', {}).ok, false)
})

test('apenas aprovação afirmativa ou estado exato retornado comprova a confirmação', () => {
  const reply = 'O Banco Exemplo aprovou a operação ontem.'
  for (const result of [
    { mensagem: 'O Banco Exemplo aprovou a operação?' },
    { mensagem: 'Se o Banco Exemplo aprovou a operação, confirme as condições.' },
    { mensagem: 'Não há confirmação de que o Banco Exemplo aprovou a operação.' },
    { proposta: { status: 'aprovada parcialmente, aguardando análise' } },
    { simulacao: { proposta: { status: 'aprovada' }, mensagem: 'O Banco Exemplo aprovou a operação.' } },
    { args: { proposta: { status: 'aprovada' } }, result: { status: 'em análise' } },
    { tool_input: { mensagem: 'O Banco Exemplo aprovou a operação.' } },
  ]) {
    assert.strictEqual(groundingGuardrail(reply, { toolResults: [result] }).ok, false, JSON.stringify(result))
  }
  assert.strictEqual(groundingGuardrail(reply, { userText: reply }).ok, false)
  assert.strictEqual(groundingGuardrail(reply, {
    toolResults: [{ mensagem: 'O Banco Exemplo aprovou a operação ontem.' }],
  }).ok, true)
  assert.strictEqual(groundingGuardrail('O contrato foi aprovado.', {
    toolResults: [{ contrato: { status: 'aprovado' } }],
  }).ok, true)
})

test('números em contagens, descrições, medidas e moeda estrangeira não comprovam reais', () => {
  for (const result of [
    { dividasCount: 1000 },
    { numeroDividas: 1000 },
    { saldoDescricao: 'Atualizado há 1000 dias' },
    { area: { valor: '1000.00' } },
    { valor: '1000.00', unidade: 'ha' },
    { valor: '1000.00', moeda: 'USD' },
    { valor: '1000.00', unidade: '%' },
    { args: { valorDivida: '1000.00' }, result: { success: false } },
    { tool_input: { valorDivida: '1000.00' }, result: { success: false } },
  ]) {
    assert.strictEqual(groundingGuardrail('Saldo de R$ 1.000,00.', {
      toolResults: [result],
    }).ok, false, JSON.stringify(result))
  }
  assert.strictEqual(groundingGuardrail('Saldo de R$ 1.000,00.', {
    toolResults: [{ valor: '1000.00', moeda: 'BRL' }],
  }).ok, true)
  assert.strictEqual(groundingGuardrail('A taxa é 10%.', {
    toolResults: [{ valor: '10', unidade: '%' }],
  }).ok, true)
})

test('sinais de percentuais e valores em reais não são descartados', () => {
  assert.strictEqual(groundingGuardrail('Variação de -0,5%.', {
    toolResults: [{ variacao: '0.5' }],
  }).ok, false)
  assert.strictEqual(groundingGuardrail('Variação de -0,5%.', {
    toolResults: [{ variacao: '-0.50' }],
  }).ok, true)
  assert.strictEqual(groundingGuardrail('Variação de 10%.', {
    toolResults: [{ mensagem: 'Variação de -10%.' }],
  }).ok, false)
  assert.strictEqual(groundingGuardrail('Saldo de -1.000 reais.', {
    toolResults: [{ saldo: '1000.00' }],
  }).ok, false)
  assert.strictEqual(groundingGuardrail('Saldo de -1.000 reais.', {
    toolResults: [{ saldo: '-1000.00' }],
  }).ok, true)
})
