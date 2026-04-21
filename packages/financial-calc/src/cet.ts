/**
 * CET — Custo Efetivo Total via Newton-Raphson (IRR).
 *
 * Este é o CUSTO REAL do crédito, considerando todos os fluxos
 * (desembolso + pagamentos + taxas). Usado para desafiar propostas
 * bancárias em processos de renegociação.
 */

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export interface FluxoPagamento {
  data: string; // ISO date
  valor: number; // positivo = recebido, negativo = pago
}

/**
 * Calcula CET mensal e anual a partir de uma lista de fluxos.
 */
export function calcularCET(fluxos: FluxoPagamento[]): { mensal: number; anual: number } {
  if (fluxos.length < 2) throw new Error('Mínimo 2 fluxos necessários');

  const sorted = [...fluxos].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  const baseDate = new Date(sorted[0].data).getTime();

  const dias = sorted.map((f) => (new Date(f.data).getTime() - baseDate) / (1000 * 60 * 60 * 24));
  const valores = sorted.map((f) => f.valor);

  let taxaDiaria = 0.001;
  const maxIterations = 1000;
  const tolerance = 1e-10;

  for (let i = 0; i < maxIterations; i++) {
    let vpv = 0;
    let dvpv = 0;

    for (let j = 0; j < valores.length; j++) {
      const fator = Math.pow(1 + taxaDiaria, dias[j]);
      vpv += valores[j] / fator;
      dvpv -= (dias[j] * valores[j]) / (fator * (1 + taxaDiaria));
    }

    if (Math.abs(vpv) < tolerance) break;
    taxaDiaria -= vpv / dvpv;

    if (taxaDiaria <= -1) taxaDiaria = 0.0001;
  }

  const mensal = (Math.pow(1 + taxaDiaria, 30) - 1) * 100;
  const anual = (Math.pow(1 + taxaDiaria, 365) - 1) * 100;

  return { mensal: round(mensal, 4), anual: round(anual, 4) };
}
