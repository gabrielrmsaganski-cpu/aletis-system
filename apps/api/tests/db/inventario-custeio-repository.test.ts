/**
 * Wave-PG-16 — InventarioCusteioRepository smoke. Skip se PG off.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  upsertInventario,
  getInventario,
  deleteInventario,
  countInventarios,
  upsertPlanoCusteio,
  listPlanosCusteio,
  deletePlanoCusteio,
  countPlanosCusteio,
} from '../../src/db/InventarioCusteioRepository.js'
import { isPgEnabled, closeDb } from '../../src/db/client.js'

const PG = isPgEnabled()
const describeIf = PG ? describe : describe.skip

describeIf('InventarioCusteioRepository', () => {
  const cliId = `cli-vitest-inv-${Date.now()}`
  const planoId = `plano-vitest-${Date.now()}`

  beforeAll(async () => {
    await deleteInventario(cliId)
    await deletePlanoCusteio(planoId)
  })

  afterAll(async () => {
    await deleteInventario(cliId)
    await deletePlanoCusteio(planoId)
    await closeDb()
  })

  it('upsertInventario + getInventario preserva ativos+resumo', async () => {
    await upsertInventario({
      clienteId: cliId,
      atualizadoEm: new Date().toISOString(),
      ativos: [
        { tipo: 'imovel', valor: 500000, status: 'ativo' },
        { tipo: 'maquina', valor: 100000, status: 'ativo' },
        { tipo: 'maquina', valor: 50000, status: 'arquivado' },
      ],
      resumo: { valorTotal: 600000, qtdAtivos: 2 },
    } as any)
    const inv = await getInventario(cliId) as any
    expect(inv).toBeTruthy()
    expect(Array.isArray(inv.ativos)).toBe(true)
    expect(inv.ativos.length).toBe(3)
    expect(inv.resumo?.valorTotal).toBe(600000)
  })

  it('upsertInventario idempotente — segundo upsert atualiza', async () => {
    const before = await countInventarios()
    await upsertInventario({
      clienteId: cliId,
      ativos: [{ tipo: 'imovel', valor: 700000, status: 'ativo' }],
      resumo: { valorTotal: 700000 },
    } as any)
    const after = await countInventarios()
    expect(after).toBe(before)
    const inv = await getInventario(cliId) as any
    expect(inv.resumo.valorTotal).toBe(700000)
  })

  it('upsertPlanoCusteio + list devolve plano', async () => {
    await upsertPlanoCusteio({
      id: planoId,
      clienteId: cliId,
      safra: '2025/26',
      status: 'rascunho',
      valorTotal: 250000,
      detalhes: { sementes: 50000, fertilizantes: 100000, defensivos: 100000 },
    } as any)
    const list = await listPlanosCusteio({ clienteId: cliId })
    const found = list.find((p: any) => p.id === planoId) as any
    expect(found).toBeTruthy()
    expect(found.status).toBe('rascunho')
    expect(found.safra).toBe('2025/26')
  })

  it('upsertPlanoCusteio idempotente — atualiza status', async () => {
    const before = await countPlanosCusteio()
    await upsertPlanoCusteio({
      id: planoId,
      clienteId: cliId,
      safra: '2025/26',
      status: 'submetido',
      valorTotal: 250000,
    } as any)
    const after = await countPlanosCusteio()
    expect(after).toBe(before)
    const list = await listPlanosCusteio({ clienteId: cliId })
    const found = list.find((p: any) => p.id === planoId) as any
    expect(found.status).toBe('submetido')
  })
})
