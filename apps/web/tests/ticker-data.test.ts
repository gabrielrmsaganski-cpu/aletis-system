import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { commodityTickerChange } from '../src/components/layout/tickerData'

test('ausência de observações comparáveis não vira variação zero', () => {
  assert.deepEqual(commodityTickerChange({ variacao24h: null, variacao7d: null }), { change: '', positive: false, changeUnavailable: true })
  assert.equal(commodityTickerChange({ variacao24h: Number.NaN }).changeUnavailable, true)
})

test('preserva uma variação real de zero e identifica seu período', () => {
  assert.equal(commodityTickerChange({ variacao24h: 0, variacao7d: 2 }).change, '0,0% · 24h')
})

test('comparação semanal aparece como 7d quando não existe comparação diária', () => {
  const result = commodityTickerChange({ variacao24h: null, variacao7d: -1.25 })
  assert.equal(result.change, '-1,3% · 7d')
  assert.equal(result.positive, false)
  assert.equal(result.changeUnavailable, false)
})
