/**
 * Wave-PG: ClienteRepository smoke. Roda apenas quando ALETIS_PG_ENABLED=1
 * (skip na CI até banco estar disponível). Garante que dual-write upserta
 * sem perda + leitura volta com payload completo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  upsertCliente,
  listClientes,
  countClientes,
  deleteCliente,
} from '../../src/db/ClienteRepository.js'
import { isPgEnabled, closeDb } from '../../src/db/client.js'

const PG = isPgEnabled()
const describeIf = PG ? describe : describe.skip

describeIf('ClienteRepository (Postgres dual-write)', () => {
  const testId = 'cli-test-vitest-001'

  beforeAll(async () => {
    // limpar resíduo de runs anteriores
    await deleteCliente(testId)
  })

  afterAll(async () => {
    await deleteCliente(testId)
    await closeDb()
  })

  it('upsert + list devolve payload com todos os campos preservados', async () => {
    const cli = {
      id: testId,
      nome: 'TESTE Vitest LTDA',
      cpfCnpj: '11.222.333/0001-44',
      cidade: 'Toledo',
      uf: 'PR',
      telefone: '(45) 1111-2222',
      email: 'test@vitest.dev',
      estagio: 'analise',
      consultor: 'CK',
      credor: 'Sicoob',
      valorTotalDivida: 1234567.89,
      valorTotalPago: 100000,
      areaTotalHa: 480.5,
      culturas: ['soja', 'milho'],
      dataCadastro: '2026-04-01T00:00:00Z',
      ultimaAtualizacao: '2026-04-25T19:00:00Z',
      observacoes: 'um campo livre',
      tags: ['alta-prioridade', 'aguardando-doc'],
      timeline: [{ data: '2026-04-25', tipo: 'analise', descricao: 'evento' }],
    }
    await upsertCliente(cli)

    const all = await listClientes()
    const found = all.find((c) => c.id === testId) as Record<string, unknown> | undefined
    expect(found).toBeTruthy()
    expect(found?.nome).toBe('TESTE Vitest LTDA')
    expect(found?.cidade).toBe('Toledo')
    // payload preserva campos não-mapeados
    expect(found?.observacoes).toBe('um campo livre')
    expect(Array.isArray(found?.tags)).toBe(true)
    expect((found?.tags as string[]).includes('alta-prioridade')).toBe(true)
    expect(Array.isArray(found?.timeline)).toBe(true)
    expect((found?.timeline as Array<unknown>).length).toBe(1)
  })

  it('upsert idempotente — segundo upsert atualiza, não duplica', async () => {
    const cnt0 = await countClientes()
    await upsertCliente({
      id: testId,
      nome: 'TESTE Vitest LTDA (renomeado)',
      cpfCnpj: '11.222.333/0001-44',
      estagio: 'negociacao',
    } as any)
    const cnt1 = await countClientes()
    expect(cnt1).toBe(cnt0) // mesma contagem; só atualizou
    const all = await listClientes()
    const found = all.find((c) => c.id === testId)
    expect(found?.nome).toBe('TESTE Vitest LTDA (renomeado)')
    expect(found?.estagio).toBe('negociacao')
  })

  it('delete remove a linha', async () => {
    await deleteCliente(testId)
    const all = await listClientes()
    expect(all.find((c) => c.id === testId)).toBeUndefined()
  })
})
