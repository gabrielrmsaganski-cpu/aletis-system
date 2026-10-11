import { describe, expect, it } from 'vitest'
import { moneyToCents, parseMoneyPtBr } from '../../src/lib/parseMoneyPtBr.js'

describe('parseMoneyPtBr', () => {
  it.each([
    ['500 mil', '500000.00'], ['1,5 milhão', '1500000.00'], ['R$ 1.500.000,00', '1500000.00'],
    ['2 mi', '2000000.00'], ['1,25 bilhão', '1250000000.00'], ['R$ 50.000', '50000.00'],
    ['50000.25', '50000.25'], ['R$ 50,25.', '50.25'], ['0', '0.00'],
    ['R$ 9.007.199.254.740.991,23', '9007199254740991.23'], ['0,00001 milhão', '10.00'],
  ])('converte %s sem aritmética monetária binária', (text, expected) => {
    expect(parseMoneyPtBr(text).amount).toBe(expected)
  })

  it.each(['entre 500 e 700 mil', '500 a 700 mil', '500-700 mil', 'acima de 500 mil', '500 mil e 200 mil', '0,001 real'])('preserva a ambiguidade de %s', (text) => {
    expect(parseMoneyPtBr(text)).toMatchObject({ amount: null, issue: 'ambiguous' })
  })

  it.each(['-500 mil', '500..000', '50 hectares', '10%', '500 parcelas', '99999999999999999 reais'])('recusa um valor inválido: %s', (text) => {
    expect(parseMoneyPtBr(text)).toMatchObject({ amount: null, issue: 'invalid' })
  })

  it('preserva centavos acima do limite de precisão de Number', () => {
    expect(moneyToCents('9007199254740991.23')).toBe(900719925474099123n)
    expect(moneyToCents('500 mil')).toBeNull()
    expect(parseMoneyPtBr('não sei')).toMatchObject({ amount: null, issue: 'missing' })
  })
})
