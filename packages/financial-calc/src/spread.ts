/**
 * Spread — diferença entre taxa original do contrato e taxa praticada (CET).
 * Quando o spread relativo excede 50%, classificamos como excessivo para
 * embasamento de ações revisionais.
 */

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export interface ResultadoSpread {
  taxaOriginal: number;
  taxaPraticada: number;
  spreadAbsoluto: number;
  spreadRelativo: number;
  excessivo: boolean;
}

export function calcularSpread(taxaOriginal: number, taxaPraticada: number): ResultadoSpread {
  const spreadAbsoluto = round(taxaPraticada - taxaOriginal, 4);
  const spreadRelativo = taxaOriginal > 0 ? round((spreadAbsoluto / taxaOriginal) * 100, 2) : 0;

  return {
    taxaOriginal,
    taxaPraticada,
    spreadAbsoluto,
    spreadRelativo,
    excessivo: spreadRelativo > 50,
  };
}
