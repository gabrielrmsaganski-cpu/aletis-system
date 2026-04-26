/**
 * Wave-PG-14 — AlixMemoryRepository smoke. Skip se ALETIS_PG_ENABLED!=1.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  upsertAlixMemory,
  getAlixMemory,
  deleteAlixMemory,
  appendAlixInsight,
  listAlixInsights,
  countAlixInsights,
} from '../../src/db/AlixMemoryRepository.js'
import { isPgEnabled, closeDb } from '../../src/db/client.js'

const PG = isPgEnabled()
const describeIf = PG ? describe : describe.skip

describeIf('AlixMemoryRepository', () => {
  const cliId = `cli-vitest-mem-${Date.now()}`

  beforeAll(async () => {
    await deleteAlixMemory(cliId)
  })

  afterAll(async () => {
    await deleteAlixMemory(cliId)
    await closeDb()
  })

  it('upsert + get devolve memória completa', async () => {
    await upsertAlixMemory({
      clienteId: cliId,
      clienteNome: 'Cliente Vitest',
      atualizadoEm: new Date().toISOString(),
      perfil: ['agro', 'PR'],
      proximasAcoes: ['ligar quinta', 'enviar proposta'],
      alertas: ['vencimento 15/05'],
      historico: [{ data: '2026-04-25T10:00:00Z', texto: 'Reunião realizada' }],
    } as any)
    const m = await getAlixMemory(cliId) as any
    expect(m).toBeTruthy()
    expect(m.clienteNome).toBe('Cliente Vitest')
    expect(Array.isArray(m.proximasAcoes)).toBe(true)
    expect(m.proximasAcoes.length).toBe(2)
    expect(m.alertas[0]).toContain('vencimento')
  })

  it('upsert idempotente — atualiza ao invés de duplicar', async () => {
    await upsertAlixMemory({
      clienteId: cliId,
      clienteNome: 'Cliente Vitest (atualizado)',
      atualizadoEm: new Date().toISOString(),
      proximasAcoes: ['nova ação'],
    } as any)
    const m = await getAlixMemory(cliId) as any
    expect(m.clienteNome).toBe('Cliente Vitest (atualizado)')
  })
})

describeIf('AlixInsightRepository (append-only)', () => {
  const tag = `vitest-${Date.now()}`

  afterAll(async () => {
    // não há delete público; limpeza via afterAll (PG é volátil em tests).
    await closeDb()
  })

  it('append + list devolve em ordem decrescente', async () => {
    await appendAlixInsight({
      dia: '2026-04-26',
      tipo: 'oportunidade',
      severidade: 'info',
      titulo: `Oportunidade ${tag} (1)`,
      detalhe: 'detail-1',
    })
    await appendAlixInsight({
      dia: '2026-04-26',
      tipo: 'oportunidade',
      severidade: 'atencao',
      titulo: `Oportunidade ${tag} (2)`,
      detalhe: 'detail-2',
    })
    const total = await countAlixInsights()
    expect(total).toBeGreaterThanOrEqual(2)
    const list = await listAlixInsights({ tipo: 'oportunidade', limit: 50 })
    const filtrados = list.filter((r: any) => (r.titulo as string)?.includes(tag))
    expect(filtrados.length).toBeGreaterThanOrEqual(2)
    // Ordem decrescente por id (mais recente primeiro)
    expect((filtrados[0].titulo as string)).toContain('(2)')
  })
})
