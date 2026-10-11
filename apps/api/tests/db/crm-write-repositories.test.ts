import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  enabled: true,
  rows: new Map<string, unknown>(),
  values: vi.fn(),
  upsert: vi.fn(),
}))
vi.mock('../../src/db/client.js', () => ({
  isPgEnabled: () => state.enabled,
  getDb: () => ({ insert: () => ({ values: state.values }) }),
  getPool: () => { throw new Error('Conexão real proibida no teste') },
}))
import { insertClienteStrict } from '../../src/db/ClienteRepository.js'
import { upsertProposta, upsertPropostaStrict } from '../../src/db/PropostaRepository.js'

beforeEach(() => {
  vi.clearAllMocks()
  state.enabled = true
  state.rows.clear()
  state.values.mockReset()
  state.upsert.mockReset()
})

describe('Repositórios CRM: contrato de gravação estrita', () => {
  it('INSERT de cliente nunca faz upsert: colisão rejeita e conserva registro anterior', async () => {
    const existing = { id: 'cli-collision', nome: 'Original sintético' }
    state.rows.set(existing.id, existing)
    state.values.mockImplementation(async (row) => {
      if (state.rows.has(row.id)) throw Object.assign(new Error('colisão simulada'), { code: '23505' })
      state.rows.set(row.id, row)
    })
    await expect(insertClienteStrict({ id: existing.id, nome: 'Novo sintético', cpfCnpj: '', estagio: 'analise' })).rejects.toMatchObject({ code: '23505' })
    expect(state.rows.get(existing.id)).toBe(existing)
  })

  it('INSERT preserva a string monetária na coluna e no payload JSONB', async () => {
    state.values.mockResolvedValue(undefined)
    await insertClienteStrict({ id: 'cli-new', nome: 'Sintético', cpfCnpj: '', estagio: 'analise', valorTotalDivida: '9007199254740991.99' })
    expect(state.values.mock.calls[0][0]).toMatchObject({ valorTotalDivida: '9007199254740991.99', payload: { valorTotalDivida: '9007199254740991.99' } })
  })

  it('envelope inválido é rejeitado antes da query', async () => {
    await expect(insertClienteStrict({ id: '', nome: 'Sintético', cpfCnpj: '', estagio: 'analise' })).rejects.toThrow()
    expect(state.values).not.toHaveBeenCalled()
  })

  it('upsertPropostaStrict propaga falha; wrapper legado continua best-effort', async () => {
    state.values.mockReturnValue({ onConflictDoUpdate: state.upsert })
    state.upsert.mockReturnValue({ returning: vi.fn().mockRejectedValue(new Error('falha simulada')) })
    await expect(upsertPropostaStrict({ id: 'prop-test', valorProposta: '0.29' })).rejects.toThrow('falha simulada')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(upsertProposta({ id: 'prop-test' })).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('modo PG desativado não abre banco', async () => {
    state.enabled = false
    await insertClienteStrict({ id: 'cli-test', nome: 'Sintético', cpfCnpj: '', estagio: 'analise' })
    await upsertPropostaStrict({ id: 'prop-test' })
    expect(state.values).not.toHaveBeenCalled()
  })
})
