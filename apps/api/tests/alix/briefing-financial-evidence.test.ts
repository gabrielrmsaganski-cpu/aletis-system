import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// These tests use only synthetic memory and files in a temporary directory.
// Loading the production memory singleton (or its database) is forbidden.
vi.mock('../../src/services/alix/memory/AlixMemoryService.js', () => ({
  AlixMemoryService: {
    getInstance: () => { throw new Error('Use injected memory in briefing tests') },
  },
}))

import { BriefingService } from '../../src/services/alix/memory/BriefingService.js'
import type { MemoriaCliente } from '../../src/services/alix/memory/types.js'

const clienteId = 'cliente-briefing-test'
let storageRoot: string

function memoria(overrides: Partial<MemoriaCliente> = {}): MemoriaCliente {
  return {
    clienteId,
    clienteNome: 'Cliente Exemplo',
    atualizadoEm: '2026-09-07T12:00:00.000Z',
    perfil: [],
    dividasAtivas: [],
    decisoes: [],
    proximasAcoes: [],
    alertas: [],
    historico: [],
    ...overrides,
  }
}

async function gerar(
  memoriaCliente: MemoriaCliente | null,
  analise?: Record<string, unknown>,
) {
  if (analise) {
    await writeFile(join(storageRoot, 'clientes', `${clienteId}.json`), JSON.stringify(analise))
  }
  return new BriefingService({ get: async () => memoriaCliente }, storageRoot).gerar(clienteId)
}

beforeEach(async () => {
  storageRoot = await mkdtemp(join(tmpdir(), 'aletis-briefing-evidence-'))
  await mkdir(join(storageRoot, 'clientes'))
  await mkdir(join(storageRoot, 'bsc'))
})

afterEach(async () => {
  await rm(storageRoot, { recursive: true, force: true })
})

describe('financial evidence in deterministic client briefing', () => {
  it('keeps memory-only amounts as unverified references and prioritizes reconciliation', async () => {
    const source = memoria({
      dividasAtivas: ['Cooperativa Exemplo · R$ 3.445.428 — posição de 2025'],
      alertas: ['Conferir amortizações antes de consolidar saldo'],
    })
    const before = structuredClone(source)
    const briefing = await gerar(source)

    expect(briefing.dividasAtivas).toEqual([])
    expect(briefing.referenciasFinanceirasMemoria).toEqual([{
      texto: source.dividasAtivas[0],
      origem: 'memoria',
      memoriaAtualizadaEm: source.atualizadoEm,
      saldoAtualBRL: null,
      situacaoAtual: 'nao_verificada',
    }])
    expect(briefing.resumoFinanceiro).toEqual({
      registrosNaAnalise: 0,
      registrosComSaldoInformado: 0,
      registrosSemSaldoInformado: 0,
      referenciasMemoriaNaoConciliadas: 1,
      coberturaSaldosNaAnalise: 'sem_registros',
      saldoAtualTotalBRL: null,
      situacaoAtual: 'nao_verificada',
    })
    expect(briefing.resumoExecutivo).toContain('1 referência financeira textual')
    expect(briefing.resumoExecutivo).not.toMatch(/dívida ativa|R\$/)
    expect(briefing.sugestaoPrimeiraAcao).toMatch(/^Confirmar a posição atual com extratos/)
    expect(briefing.sugestaoPrimeiraAcao).not.toMatch(/Contactar|maior exposição|R\$/)
    expect(briefing.proximasAcoes[0]).toBe(briefing.sugestaoPrimeiraAcao)
    expect(briefing.proximasAcoes).toHaveLength(1)
    expect(briefing.markdown).toContain('Referências financeiras da memória (a confirmar)')
    expect(briefing.markdown).not.toMatch(/## Dívidas ativas|R\$\s*0(?:[,.]|$)/)
    expect(briefing.destaques).toContainEqual(expect.objectContaining({ detalhe: source.alertas[0] }))
    expect(source).toEqual(before)
  })

  it('preserves the order of explicit actions when financial memory needs reconciliation', async () => {
    const source = memoria({
      dividasAtivas: ['Cooperativa Exemplo — saldo histórico a conferir'],
      proximasAcoes: [
        'Protocolar a documentação até amanhã',
        'Confirmar a reunião com o responsável',
      ],
    })
    const before = structuredClone(source)
    const briefing = await gerar(source)

    expect(briefing.sugestaoPrimeiraAcao).toBe('Hoje faça: Protocolar a documentação até amanhã')
    expect(briefing.proximasAcoes.slice(0, 2)).toEqual(source.proximasAcoes)
    expect(briefing.proximasAcoes).toHaveLength(3)
    expect(briefing.proximasAcoes[2]).toMatch(/^Confirmar a posição atual com extratos/)
    expect(briefing.resumoFinanceiro.saldoAtualTotalBRL).toBeNull()
    expect(source).toEqual(before)
  })

  it('keeps a critical alert ahead of the financial default when no explicit action exists', async () => {
    const briefing = await gerar(memoria({
      dividasAtivas: ['Banco Exemplo — posição antiga'],
    }), {
      alertasTop: [{
        origem: 'prazo operacional',
        nivel: 'critico',
        mensagem: 'Protocolo documental vence amanhã',
      }],
    })

    expect(briefing.sugestaoPrimeiraAcao).toBe('Endereçar alerta crítico: Protocolo documental vence amanhã')
    expect(briefing.destaques[0]).toMatchObject({ severidade: 'critico', detalhe: 'Protocolo documental vence amanhã' })
    expect(briefing.proximasAcoes).toHaveLength(1)
    expect(briefing.proximasAcoes[0]).toMatch(/^Confirmar a posição atual com extratos/)
    expect(briefing.resumoFinanceiro.saldoAtualTotalBRL).toBeNull()
  })

  it.each([
    ['absent', undefined],
    ['null', null],
    ['blank text', ''],
    ['numeric text', '1234.56'],
    ['currency text', 'R$ 1.234,56'],
    ['false', false],
    ['negative', -100],
  ])('treats %s balance as unknown without borrowing original amounts or CRM totals', async (_label, saldo) => {
    const briefing = await gerar(memoria(), {
      totalDividas: 9_999_999,
      saldoRecalculado: {
        totalSaldoRecalculado: 9_999_999,
        porDivida: [{
          credor: 'Banco Exemplo',
          valorOriginal: 400_000,
          valorAtualizado: 500_000,
          saldoRecalculado: saldo,
        }],
      },
    })

    expect(briefing.dividasAtivas[0]).toMatchObject({
      saldoBRL: null,
      naturezaSaldo: 'nao_informado',
      origem: 'analise.saldoRecalculado.porDivida',
      situacaoAtual: 'nao_verificada',
      status: 'situação de atraso não informada na análise',
    })
    expect(briefing.resumoFinanceiro).toMatchObject({
      registrosComSaldoInformado: 0,
      registrosSemSaldoInformado: 1,
      coberturaSaldosNaAnalise: 'nenhum_informado',
      saldoAtualTotalBRL: null,
    })
    expect(briefing.markdown).toContain('saldo não informado')
    expect(briefing.markdown).not.toMatch(/R\$|em dia|maior exposição/)
    expect(briefing.sugestaoPrimeiraAcao).toMatch(/^Confirmar a posição atual com extratos/)
  })

  it('rejects a JSON number outside the finite JavaScript range without emitting zero', async () => {
    // JSON.stringify(Infinity) produces null; use a valid JSON numeric literal
    // that JSON.parse turns into Infinity to exercise the actual finite guard.
    await writeFile(join(storageRoot, 'clientes', `${clienteId}.json`),
      '{"saldoRecalculado":{"porDivida":[{"credor":"Banco Exemplo","saldoRecalculado":1e999}]}}')
    const briefing = await gerar(memoria())

    expect(briefing.dividasAtivas[0].saldoBRL).toBeNull()
    expect(briefing.resumoFinanceiro.registrosSemSaldoInformado).toBe(1)
    expect(briefing.resumoFinanceiro.saldoAtualTotalBRL).toBeNull()
    expect(briefing.markdown).not.toMatch(/Infinity|R\$/)
  })

  it('preserves explicit numeric zero without asserting discharge or an active balance', async () => {
    const briefing = await gerar(memoria(), {
      saldoRecalculado: {
        porDivida: [{ credor: 'Banco Zero', saldoRecalculado: 0, diasDesdeVencimento: 0 }],
      },
    })

    expect(briefing.dividasAtivas[0]).toMatchObject({
      saldoBRL: 0,
      naturezaSaldo: 'informado_na_analise',
      situacaoAtual: 'nao_verificada',
      status: 'sem atraso indicado na análise',
    })
    expect(briefing.resumoFinanceiro).toMatchObject({
      registrosComSaldoInformado: 1,
      registrosSemSaldoInformado: 0,
      coberturaSaldosNaAnalise: 'todos_informados',
      saldoAtualTotalBRL: null,
    })
    expect(briefing.markdown).toMatch(/R\$\s*0,00 informado na análise/)
    expect(briefing.resumoExecutivo).toContain('Zero informado na análise não comprova quitação')
    expect(briefing.resumoExecutivo).not.toMatch(/dívida ativa|saldo total R\$/)
    expect(briefing.sugestaoPrimeiraAcao).not.toMatch(/maior exposição|Contactar/)
  })

  it('marks incomplete creditor coverage without selecting a largest exposure or summing values', async () => {
    const briefing = await gerar(memoria(), {
      saldoRecalculado: {
        porDivida: [
          { credor: 'Credor com valor', saldoRecalculado: 1234.56, diasDesdeVencimento: 200 },
          { credor: 'Credor sem valor', diasDesdeVencimento: 10 },
        ],
      },
    })

    expect(briefing.dividasAtivas.map((d) => d.saldoBRL)).toEqual([1234.56, null])
    expect(briefing.resumoFinanceiro).toMatchObject({
      registrosNaAnalise: 2,
      registrosComSaldoInformado: 1,
      registrosSemSaldoInformado: 1,
      coberturaSaldosNaAnalise: 'parcial',
      saldoAtualTotalBRL: null,
    })
    expect(briefing.markdown).toMatch(/R\$\s*1\.234,56 informado na análise/)
    expect(briefing.dividasAtivas[0].status).toBe('atraso indicado na análise: 200d (crítico)')
    expect(briefing.resumoExecutivo).toContain('1 com saldo numérico informado e 1 sem saldo informado')
    expect(briefing.resumoExecutivo).not.toContain('R$')
    expect(briefing.sugestaoPrimeiraAcao).not.toMatch(/Credor com valor|maior exposição/)
  })

  it('keeps additional memory references separate even when every analysis row has a value', async () => {
    const briefing = await gerar(memoria({ dividasAtivas: ['Terceiro credor: valor histórico R$ 900.000'] }), {
      saldoRecalculado: {
        totalSaldoRecalculado: 900_030.3,
        porDivida: [
          { credor: 'Credor A', saldoRecalculado: 10.1 },
          { credor: 'Credor B', saldoRecalculado: 20.2 },
        ],
      },
    })

    expect(briefing.dividasAtivas.map((d) => d.saldoBRL)).toEqual([10.1, 20.2])
    expect(briefing.referenciasFinanceirasMemoria).toHaveLength(1)
    expect(briefing.resumoFinanceiro).toMatchObject({
      coberturaSaldosNaAnalise: 'todos_informados',
      referenciasMemoriaNaoConciliadas: 1,
      saldoAtualTotalBRL: null,
    })
    expect(briefing.markdown).not.toMatch(/30,30|900\.030|maior exposição/)
    expect(briefing.resumoExecutivo).toContain('Saldo atual total e situação dos contratos não verificados')
    expect(briefing.sugestaoPrimeiraAcao).toMatch(/^Confirmar a posição atual com extratos/)
  })

  it('does not infer zero debt when the client has no financial source', async () => {
    const briefing = await gerar(null)

    expect(briefing.dividasAtivas).toEqual([])
    expect(briefing.referenciasFinanceirasMemoria).toEqual([])
    expect(briefing.resumoFinanceiro.saldoAtualTotalBRL).toBeNull()
    expect(briefing.resumoExecutivo).toContain('Sem dados consolidados ainda')
    expect(briefing.resumoExecutivo).not.toContain('R$')
    expect(briefing.sugestaoPrimeiraAcao).toBe('Importar dados do cliente via dossiê')
  })

  it('preserves operational actions, alerts and BSC when no financial reference needs reconciliation', async () => {
    await writeFile(join(storageRoot, 'bsc', `${clienteId}.jsonl`), JSON.stringify({
      resultado: { porPerspectiva: [{ perspectiva: 'processos', score: 90 }] },
    }) + '\n')
    const briefing = await gerar(memoria({
      proximasAcoes: ['Revisar o projeto agrícola'],
      perfil: ['Produtor rural'],
    }), {
      alertasTop: [{ origem: 'documentos', nivel: 'critico', mensagem: 'Conferir divergência de área' }],
    })

    expect(briefing.sugestaoPrimeiraAcao).toBe('Hoje faça: Revisar o projeto agrícola')
    expect(briefing.proximasAcoes).toEqual(['Revisar o projeto agrícola'])
    expect(briefing.kpisBscResumo?.[0]).toMatchObject({ perspectiva: 'processos', status: 'verde' })
    expect(briefing.destaques[0]).toMatchObject({ detalhe: 'Conferir divergência de área', severidade: 'critico' })
    expect(briefing.markdown).toContain('Produtor rural')
  })
})
