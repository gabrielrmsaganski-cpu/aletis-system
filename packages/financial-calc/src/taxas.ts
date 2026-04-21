/**
 * Conversores de taxa (nominal ↔ efetiva, períodos).
 *
 * Todas as taxas de entrada estão em percentual (ex: 1 = 1%) e as de
 * saída também — mantido para compatibilidade com a API existente.
 */

function round(value: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function taxaMensalParaAnual(taxaMensal: number): number {
  return round((Math.pow(1 + taxaMensal / 100, 12) - 1) * 100, 4);
}

export function taxaAnualParaMensal(taxaAnual: number): number {
  return round((Math.pow(1 + taxaAnual / 100, 1 / 12) - 1) * 100, 4);
}

export function taxaMensalParaDiaria(taxaMensal: number): number {
  return round((Math.pow(1 + taxaMensal / 100, 1 / 30) - 1) * 100, 6);
}

/**
 * Converte uma taxa nominal (juros declarados) em taxa efetiva,
 * considerando quantos períodos por ano.
 *
 * Exemplo: nominal 12% a.a. capitalizada mensalmente = (1 + 12/12/100)^12 - 1 = 12.6825%.
 */
export function taxaNominalParaEfetiva(taxaNominalPct: number, periodosAno: number): number {
  if (periodosAno <= 0) throw new Error('periodosAno deve ser > 0');
  const r = taxaNominalPct / 100 / periodosAno;
  return round((Math.pow(1 + r, periodosAno) - 1) * 100, 4);
}
