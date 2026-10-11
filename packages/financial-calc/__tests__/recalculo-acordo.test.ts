import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularRecalculoAcordo, type RecalculoIndiceMensal } from '../src/recalculo-acordo.js'

const point = (periodo: string, fatorAcumulado: string): RecalculoIndiceMensal => ({ periodo, taxaMensal: '0', fatorAcumulado })

test('compatibilidade com Recálculo Proposta de Acordo.xlsx', () => {
  const result = calcularRecalculoAcordo({
    indiceCode: 'INPC', corrigirAte: '2026-06-30', moraMensalPct: '1', compatibilidadePlanilha: true,
    serie: [
      point('2023-03', '1.0188143666879999'), point('2024-03', '1.0534270368816359'),
      point('2025-03', '1.1082204181191566'), point('2026-03', '1.1499871048875918'),
      point('2026-06', '1.168471035888839'),
    ],
    parcelas: [
      { id: '1', vencimento: '2023-02-28', valorOriginal: '125550.00' },
      { id: '2', vencimento: '2024-02-28', valorOriginal: '44193.60' },
      { id: '3', vencimento: '2025-02-28', valorOriginal: '44194.60' },
      { id: '4', vencimento: '2026-02-28', valorOriginal: '44195.60' },
    ],
  })
  assert.equal(result.principalOriginal, '258133.80')
  assert.equal(result.correcaoMonetaria, '26381.85')
  assert.equal(result.mora, '81789.40')
  assert.equal(result.totalAtualizado, '366305.06')
})

test('aceita variação mensal negativa, zero e composição', () => {
  const result = calcularRecalculoAcordo({
    indiceCode: 'INPC', corrigirAte: '2024-03-31', moraMensalPct: '0',
    serie: [point('2024-02', '1'), point('2024-03', '1.005')],
    parcelas: [{ id: '1', vencimento: '2024-01-15', valorOriginal: '100.00' }],
  })
  assert.equal(result.linhas[0].fatorCorrecao, '1.005000000000')
  assert.equal(result.linhas[0].valorCorrecao, '0.50')
})

test('bloqueia período ou fator-base ausente', () => {
  assert.throws(() => calcularRecalculoAcordo({ indiceCode: 'INPC', corrigirAte: '2026-06-30', moraMensalPct: '1', serie: [point('2026-06', '1')], parcelas: [{ id: '1', vencimento: '2023-02-28', valorOriginal: '1' }] }))
})
