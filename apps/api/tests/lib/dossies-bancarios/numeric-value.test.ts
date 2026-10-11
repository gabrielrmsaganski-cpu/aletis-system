import { describe, expect, it } from 'vitest'
import { parseDossieNumericValue } from '../../../src/services/dossies-bancarios/DossieNumericValue.js'

describe('Conversão de números das fontes do dossiê bancário', () => {
  it.each([
    ['1234.56', 1234.56], ['1234.00', 1234], ['1.23', 1.23],
    ['1.234,56', 1234.56], ['1234,56', 1234.56], ['R$ 1.234,56', 1234.56],
    ['1.234.567,89', 1234567.89], ['1.234.567', 1234567],
    ['R$ 1.234', 1234], ['1.234', 1.234],
    [1234.56, 1234.56], [0, 0], ['0.00', 0], [' 1234.56 ', 1234.56],
    ['123.4567', 123.4567], ['123,4567', 123.4567], ['1.234,5678', 1234.5678],
    [-1234.56, -1234.56], ['-1234.56', -1234.56], ['-1.234,56', -1234.56],
  ])('converte %s preservando escala e sinal', (input, expected) => {
    expect(parseDossieNumericValue(input)).toBe(expected)
  })

  it.each([null, undefined, '', '   ', true, false, [], {}, NaN, Infinity, -Infinity, 'NaN', 'Infinity', '2026-09-07', '07/09/2026', 'R$ 12,34 vencimento 2026', '1.23,45', '1,234.56', '12 ha', '0x10', '1e3'])('rejeita entrada sem numeral inequívoco: %s', input => {
    expect(parseDossieNumericValue(input)).toBeUndefined()
  })
})
