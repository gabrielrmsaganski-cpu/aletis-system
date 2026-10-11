import assert from 'node:assert'
import { test } from 'vitest'

import { buildResumoFinanceiroCrm } from '../../src/routes/clientes.ts'

test('separa necessidade documentada de capital da dívida registrada', () => {
  const resumo = buildResumoFinanceiroCrm({
    credor: 'Banco do Brasil, Caixa Econômica Federal e CCRED',
    valorTotalDivida: 0,
    dossieDocumental: {
      fatos: {
        necessidadeCapital: {
          finalidade: 'Preparação de solo e plantio de cana',
          faixaPlantio: '3500000.00 a 5000000.00',
        },
      },
    },
  })

  assert.deepStrictEqual(resumo, {
    classificacao: 'demanda_capital',
    rotulo: 'Necessidade de capital',
    contexto: 'Banco do Brasil, Caixa Econômica Federal e CCRED',
    descricao: 'Preparação de solo e plantio de cana',
    valorFaixa: '3500000.00 a 5000000.00',
  })
})

test('substitui credor indefinido por estratégia documental', () => {
  const resumo = buildResumoFinanceiroCrm({
    credor: 'A definir',
    valorTotalDivida: 0,
    dossieDocumental: {
      fatos: {
        estrategia: 'Ajustar fluxo de caixa e redistribuir garantias para regularizar pagamentos.',
      },
    },
  })

  assert.strictEqual(resumo.classificacao, 'estrategia_financeira')
  assert.strictEqual(resumo.contexto, 'Fluxo de caixa e garantias em consolidação')
  assert.match(resumo.descricao || '', /redistribuir garantias/)
})

test('prioriza distrato documentado quando não há mandato ativo', () => {
  const resumo = buildResumoFinanceiroCrm({
    credor: 'A definir',
    valorTotalDivida: 0,
    dossieDocumental: {
      fatos: {
        statusContratual: {
          tipo: 'Distrato',
          efeito: 'Quitação recíproca e encerramento da relação documentada',
        },
      },
    },
  })

  assert.deepStrictEqual(resumo, {
    classificacao: 'status_contratual',
    rotulo: 'Status contratual',
    contexto: 'Distrato documentado',
    descricao: 'Quitação recíproca e encerramento da relação documentada',
  })
})
