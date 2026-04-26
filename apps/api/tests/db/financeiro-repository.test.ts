/**
 * Wave-PG-13 — FinanceiroRepository smoke. Skip se ALETIS_PG_ENABLED!=1.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  upsertReceita,
  upsertDespesa,
  upsertImposto,
  upsertLancamento,
  deleteReceita,
  deleteDespesa,
  deleteImposto,
  deleteLancamento,
  financeiroCounts,
} from '../../src/db/FinanceiroRepository.js'
import { isPgEnabled, closeDb } from '../../src/db/client.js'

const PG = isPgEnabled()
const describeIf = PG ? describe : describe.skip

describeIf('FinanceiroRepository (Postgres dual-write)', () => {
  const recId = `rec-vitest-${Date.now()}`
  const desId = `des-vitest-${Date.now()}`
  const impId = `imp-vitest-${Date.now()}`
  const lanId = `lan-vitest-${Date.now()}`

  beforeAll(async () => {
    await Promise.all([
      deleteReceita(recId),
      deleteDespesa(desId),
      deleteImposto(impId),
      deleteLancamento(lanId),
    ])
  })

  afterAll(async () => {
    await Promise.all([
      deleteReceita(recId),
      deleteDespesa(desId),
      deleteImposto(impId),
      deleteLancamento(lanId),
    ])
    await closeDb()
  })

  it('upsert receita preserva payload + colunas críticas', async () => {
    await upsertReceita({
      id: recId,
      competencia: '2026-04',
      descricao: 'Honorários cliente X',
      cliente: { nome: 'Cliente X', cpfCnpj: '11.222.333/0001-44' },
      valorBruto: 100000,
      valorLiquido: 95000,
      status: 'recebida',
      dataEmissao: '2026-04-15',
      dataRecebimento: '2026-04-25',
      propostaId: 'prop-001',
    } as any)
    const counts = await financeiroCounts()
    expect(counts.receitas).toBeGreaterThanOrEqual(1)
  })

  it('upsert despesa com clienteVinculo (margem por cliente)', async () => {
    await upsertDespesa({
      id: desId,
      competencia: '2026-04',
      descricao: 'Viagem reunião cliente',
      categoria: 'viagem',
      clienteVinculo: { nome: 'Cliente X', cpfCnpj: '11.222.333/0001-44' },
      valor: 2500,
      status: 'paga',
      dataVencimento: '2026-04-20',
      dataPagamento: '2026-04-20',
    } as any)
    const counts = await financeiroCounts()
    expect(counts.despesas).toBeGreaterThanOrEqual(1)
  })

  it('upsert imposto DAS', async () => {
    await upsertImposto({
      id: impId,
      competencia: '2026-04',
      tipo: 'das_simples',
      descricao: 'DAS Abril/2026',
      valor: 5670,
      status: 'a_pagar',
      dataVencimento: '2026-05-20',
    } as any)
    const counts = await financeiroCounts()
    expect(counts.impostos).toBeGreaterThanOrEqual(1)
  })

  it('upsert lancamento bancário', async () => {
    await upsertLancamento({
      id: lanId,
      competencia: '2026-04',
      contaBancaria: 'BB-12345',
      data: '2026-04-25',
      descricao: 'Transferência cliente X',
      valor: 95000,
      tipo: 'credito',
      vinculadoTipo: 'receita',
      vinculadoId: recId,
    } as any)
    const counts = await financeiroCounts()
    expect(counts.lancamentos).toBeGreaterThanOrEqual(1)
  })
})
