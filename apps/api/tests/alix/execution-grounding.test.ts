import { expect, it } from 'vitest'
import { groundExecutionClaims } from '../../src/services/alix/reliability/executionGrounding.js'

const pending = [{ tool: 'delegate_crm_writer', result: { summary: 'Texto livre não prova execução', toolEvidence: [{ tool: 'criar_cliente', input: { nome: 'Pessoa' }, result: { metadata: { pendingConfirmation: true, confirmationId: 'conf-exemplo' } } }] } }]

it('contradição em primeira pessoa é substituída pelo estado real sem apagar análise independente', () => {
  const result = groundExecutionClaims('Cadastrei o cliente e registrei a demanda.\n\nA análise do contrato encontrou uma lacuna na data.', pending)
  expect(result.corrected).toBe(true)
  expect(result.text).not.toContain('Cadastrei o cliente')
  expect(result.text).toContain('aguardam os próximos passos')
  expect(result.text).toContain('lacuna na data')
  expect(result.summary).toEqual({ prepared: 1, executed: 0, failed: 0, unverified: 0 })
})

it('não trata fala citada do usuário, pergunta ou resumo histórico como ação nova', () => {
  for (const text of ['> Eu enviei os documentos.', 'Você disse: “enviei o contrato”.', 'Enviei os documentos?', 'Enviei os documentos ontem.']) {
    expect(groundExecutionClaims(text, pending)).toMatchObject({ text, corrected: false })
  }
})

it('recibo explícito de execução permite a afirmação e entrada proposta não é prova', () => {
  const text = 'Cadastrei o cliente.'
  expect(groundExecutionClaims(text, [{ tool: 'criar_cliente', result: { executed: true, id: 'cliente-a' } }])).toMatchObject({ text, corrected: false, summary: { executed: 1 } })
  expect(groundExecutionClaims(text, pending)).toMatchObject({ corrected: true })
})

it('importação em processamento conta como preparo e não como análise/cadastro concluídos', () => {
  expect(groundExecutionClaims('O arquivo foi aceito e está em processamento.', [{ tool: 'importar_documento_drive_para_alix', result: { imported: true, success: true, processingState: 'queued', registeredInCrm: false } }])).toMatchObject({ corrected: false, summary: { prepared: 1, executed: 0 } })
})
