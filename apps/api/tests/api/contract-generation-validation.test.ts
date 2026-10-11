import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import routes from '../../src/routes/contratos.js'
import { contratoGenerator } from '../../src/services/ContratoGenerator.js'
import { CONTRACT_INPUT_MAX_CENTS, contractInputMoneySchema } from '../../src/services/contratos/ContractGenerationValidation.js'

vi.mock('../../src/db/GeneratedContractRepository.js', () => ({ generatedContractPersistence: { enabled: () => false } }))
vi.mock('../../src/services/PdfGenerator.js', () => ({ generateContratoPdf: vi.fn() }))

const fixture = () => ({
  tipo: 'confissao_divida', devedor: { nomeCompleto: 'Pessoa sintética' }, credor: { nomeCompleto: 'Credor sintético' }, local: 'Teste', uf: 'MT',
  divida: { valorAtualizado: 100.01, valorOriginal: 100.01, contratosOriginais: [{ numero: 'fixture', valor: 100.01, dataAssinatura: '' }] },
  cpr: { precoUnitario: 100.01, valorTotal: 100.01 },
  parcelas: [{ numero: 1, valor: 100.01, vencimento: '' }],
  dacoes: [{ descricao: 'Bem sintético', valor: 100.01 }],
  garantias: [{ tipo: 'aval', descricao: 'Garantia sintética', valorAvaliado: 100.01 }],
  servicos: { modeloHonorarios: 'fixo', prazoVigenciaMeses: 12, escopo: {},
    honorarioFixo: 100.01, mensalidade: 100.01, mesesRetainer: 2, pisoExito: 100.01, tetoExito: 100.01,
    operacao: { saldoDevedorAtualizado: 100.01 },
  },
  dataAssinatura: '', observacoes: '',
})
const moneyPaths = [
  'cpr.precoUnitario', 'cpr.valorTotal', 'divida.valorOriginal', 'divida.valorAtualizado', 'divida.contratosOriginais.0.valor',
  'parcelas.0.valor', 'dacoes.0.valor', 'garantias.0.valorAvaliado', 'servicos.honorarioFixo', 'servicos.mensalidade',
  'servicos.pisoExito', 'servicos.tetoExito', 'servicos.operacao.saldoDevedorAtualizado',
]
function replace(path: string, value: unknown) {
  const body: any = fixture()
  const parts = path.split('.')
  let target = body
  for (const part of parts.slice(0, -1)) target = target[part]
  target[parts.at(-1)!] = value
  return body
}

describe('validação anterior ao gerador jurídico legado', () => {
  let app: FastifyInstance
  const generate = vi.spyOn(contratoGenerator, 'gerar')
  beforeAll(async () => { app = Fastify(); await app.register(routes); await app.ready() })
  beforeEach(() => { generate.mockClear() })
  afterAll(async () => { await app.close(); generate.mockRestore() })

  it('100.01 permanece 100,01 no corpo e 100.01 no catálogo', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: fixture() })
    expect(response.statusCode).toBe(201)
    expect(response.json().data.valorTotal).toBe('100.01')
    expect(response.json().data.conteudoMarkdown).toContain('R$ 100,01 (100 reais e 01 centavos)')
    expect(generate).toHaveBeenCalledOnce()
  })

  it.each(moneyPaths)('recusa centavo fracionário em %s antes de gerar', async path => {
    const response = await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: replace(path, 1.005) })
    expect(response.statusCode).toBe(400)
    expect(response.json().detalhes.some((value: string) => value.startsWith(path + ':'))).toBe(true)
    expect(generate).not.toHaveBeenCalled()
  })

  it.each(moneyPaths)('recusa string monetária inesperada em %s antes de gerar', async path => {
    const response = await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: replace(path, '100.01') })
    expect(response.statusCode).toBe(400)
    expect(generate).not.toHaveBeenCalled()
  })

  it.each([
    ['divida', []], ['cpr', 'inválido'], ['divida.contratosOriginais', {}], ['parcelas', {}], ['parcelas.0', null],
    ['dacoes', 'inválido'], ['garantias', {}], ['servicos', []], ['servicos.escopo', 'inválido'],
    ['servicos.operacao', []], ['devedor', null], ['devedor.cpfCnpj', 123], ['servicos.mesesRetainer', '12'],
    ['dataAssinatura', 'data inválida'], ['dataAssinatura', '2026-02-30'], ['cpr.imovel', {}],
    ['servicos.escopo.diagnosticoFinanceiro', 'true'], ['servicos.operacao.credoresListados', 'lista inválida'],
  ])('recusa estrutura inválida de %s com 400', async (path, value) => {
    const response = await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: replace(path as string, value) })
    expect(response.statusCode).toBe(400)
    expect(generate).not.toHaveBeenCalled()
  })

  it.each([-0.01, null, true, {}, '', 'NaN', 35184372088832, 1e100])('recusa dinheiro inválido %j sem 500/503', async value => {
    const response = await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: replace('divida.valorAtualizado', value) })
    expect(response.statusCode).toBe(400)
    expect(generate).not.toHaveBeenCalled()
  })

  it('recusa NaN e Infinity também na fronteira direta de validação', () => {
    expect(contractInputMoneySchema.safeParse(NaN).success).toBe(false)
    expect(contractInputMoneySchema.safeParse(Infinity).success).toBe(false)
  })

  it('limite conservador aceita o último centavo da faixa e rejeita o próximo real', () => {
    expect(CONTRACT_INPUT_MAX_CENTS).toBe(3518437208883199n)
    expect(contractInputMoneySchema.safeParse(35184372088831.99).success).toBe(true)
    expect(contractInputMoneySchema.safeParse(35184372088832).success).toBe(false)
  })

  it('recusa total de parcelas/retainer fora da faixa antes do cálculo legado', async () => {
    for (const payload of [
      { ...fixture(), parcelas: [{ numero: 1, valor: 35184372088831.99 }, { numero: 2, valor: 35184372088831.99 }] },
      replace('servicos.mensalidade', 35184372088831.99),
    ]) {
      expect((await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload })).statusCode).toBe(400)
      expect(generate).not.toHaveBeenCalled()
    }
  })

  it.each(['cpr_financeira', 'cpr_fisica', 'confissao_divida', 'termo_renegociacao', 'acordo_extrajudicial', 'transacao_excepcional'])('preserva rascunho mínimo do tipo %s', async tipo => {
    const response = await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: {
      tipo, devedor: { nomeCompleto: 'Pessoa sintética' }, credor: { nomeCompleto: 'Credor sintético' }, local: 'Teste', uf: 'MT', dataAssinatura: '',
    } })
    expect(response.statusCode).toBe(201)
  })

  it('preserva serviço com o escopo vazio aceito anteriormente e data opcional vazia', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: { ...fixture(), tipo: 'prestacao_servicos_aletis' } })
    expect(response.statusCode).toBe(201)
  })
})
