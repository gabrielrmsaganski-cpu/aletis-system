import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), persist: vi.fn() }))
vi.mock('../../src/services/llm/OpenAIClient.js', () => ({ generateStructured: mocks.generate }))
vi.mock('../../src/services/llm/LLMConfig.js', () => ({ getModelForRole: () => 'fixture-model' }))
vi.mock('../../src/services/alix/knowledge/FactLedgerService.js', () => ({ upsertLedgerFact: mocks.persist, listLedgerFacts: vi.fn() }))
import { extractFactsFromConversation } from '../../src/services/alix/memory/AlixMemoryFactExtractor.js'

const scope = { clienteId: 'cliente-a', consultorId: 'consultor-a', sessionId: 'sessao-a', sourceId: 'mensagem-a' }
const source = 'Usuário/consultor: O cliente ativo informou possuir 500 hectares de soja.'
const fact = { factType: 'dado_operacional', factKey: 'area_soja', factValue: '500 hectares', confidence: 1,
  subjectClienteId: 'cliente-a', subjectScope: 'active_client', evidenceExcerpt: 'O cliente ativo informou possuir 500 hectares de soja.' }
beforeEach(() => {
  mocks.generate.mockReset().mockResolvedValue({ data: { facts: [{ ...fact }] } })
  mocks.persist.mockReset().mockResolvedValue({ id: 1, status: 'pending_review' })
})

it('confiança máxima continua pendente e persiste trecho original com sujeito, mensagem, cliente e offsets', async () => {
  const result = await extractFactsFromConversation(source, scope)
  expect(result[0]).toMatchObject({ status: 'pending_review', confidence: 1 })
  expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({
    ...scope, status: 'pending_review', evidence: [expect.objectContaining({ sourceId: 'mensagem-a', sessionId: 'sessao-a', excerpt: fact.evidenceExcerpt })],
    metadata: expect.objectContaining({ requiresHumanReview: true, subjectClienteId: 'cliente-a', sourceTextHash: expect.stringMatching(/^[a-f0-9]{64}$/), evidenceStart: 19 }),
  }))
  const saved = mocks.persist.mock.calls[0][0]
  expect(source.slice(saved.metadata.evidenceStart, saved.metadata.evidenceEnd)).toBe(saved.evidence[0].excerpt)
  const [messages] = mocks.generate.mock.calls[0]
  expect(messages[0].role).toBe('system')
  expect(JSON.parse(messages[1].content)).toMatchObject({ clienteId: 'cliente-a', sourceId: 'mensagem-a', mensagemDoConsultor: source })
})

it.each([
  { evidenceExcerpt: 'O cliente ativo possui 900 hectares.' },
  { factValue: '900 hectares' },
  { factValue: '500 reais' },
])('recusa trecho ou valor gerado sem presença literal na fonte: %j', async patch => {
  mocks.generate.mockResolvedValue({ data: { facts: [{ ...fact, ...patch }] } })
  await expect(extractFactsFromConversation(source, scope)).rejects.toThrow('evidência literal')
  expect(mocks.persist).not.toHaveBeenCalled()
})

it.each([{ subjectScope: 'ambiguous' }, { subjectScope: 'other_client' }, { subjectClienteId: 'cliente-b' }])('não atribui ao cliente ativo declaração de sujeito errado/ambíguo: %j', async patch => {
  mocks.generate.mockResolvedValue({ data: { facts: [{ ...fact, ...patch }] } })
  expect(await extractFactsFromConversation(source, scope)).toEqual([])
  expect(mocks.persist).not.toHaveBeenCalled()
})

it('zero fatos explícitos é uma conclusão válida; erro do provedor não é zero fatos', async () => {
  mocks.generate.mockResolvedValueOnce({ data: { facts: [] } })
  expect(await extractFactsFromConversation(source, scope)).toEqual([])
  mocks.generate.mockRejectedValueOnce(new Error('provider 429'))
  await expect(extractFactsFromConversation(source, scope)).rejects.toThrow('provider 429')
  expect(mocks.persist).not.toHaveBeenCalled()
})

it.each([null, new Error('Postgres indisponível')])('falha de persistência propaga ao worker para retry: %s', async failure => {
  if (failure instanceof Error) mocks.persist.mockRejectedValueOnce(failure)
  else mocks.persist.mockResolvedValueOnce(failure)
  await expect(extractFactsFromConversation(source, scope)).rejects.toThrow()
})

it('exige escopo persistível antes de chamar o modelo e não aceita shape inválido', async () => {
  await expect(extractFactsFromConversation(source, { clienteId: 'cliente-a' })).rejects.toThrow('cliente, sessão e mensagem')
  expect(mocks.generate).not.toHaveBeenCalled()
  mocks.generate.mockResolvedValueOnce({ data: { facts: [{ ...fact, confidence: Number.NaN }] } })
  await expect(extractFactsFromConversation(source, scope)).rejects.toThrow()
  expect(mocks.persist).not.toHaveBeenCalled()
})
