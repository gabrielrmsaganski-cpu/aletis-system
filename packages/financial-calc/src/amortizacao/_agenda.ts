/**
 * Módulo interno: geração de agendas de vencimento compatíveis com a
 * fórmula da planilha `MÉTODOS DE CÁLCULO.xlsm`:
 *
 *   F(n) = WORKDAY( DATE(YEAR(F(n-1)), MONTH(F(n-1)) + periodicidadeMeses,
 *                        DAY(diaVencimento) - 1),
 *                   1, Feriados )
 *
 * Ou seja: a partir do vencimento anterior, avança `periodicidadeMeses` meses,
 * posiciona no dia (diaVencimento - 1) e avança 1 dia útil. O resultado é o
 * primeiro dia útil após `diaVencimento - 1` — efetivamente o dia de vencimento
 * ajustado para dia útil quando cai em fim-de-semana/feriado.
 */

import { FERIADOS_NACIONAIS, toISODate, workDay } from '../feriados/index.js';
import {
  type Periodicidade,
  MESES_POR_PERIODICIDADE,
} from './types.js';

/**
 * Gera um cronograma de datas de vencimento a partir do primeiro vencimento
 * (exclusivo — o primeiro é passado de fora) e da periodicidade.
 *
 * @param primeiroVencimento Data do primeiro vencimento (ISO). Já deve ter sido
 *                            ajustada pelo chamador (`primeiroVencimentoPadrao` se necessário).
 * @param numeroParcelas     Total de parcelas (inclui a primeira).
 * @param periodicidade      Intervalo entre parcelas.
 * @param diaVencimento      Dia alvo de vencimento (1..31).
 * @param feriados           Tabela de feriados (default nacional).
 */
export function gerarVencimentos(
  primeiroVencimento: string,
  numeroParcelas: number,
  periodicidade: Periodicidade,
  diaVencimento: number,
  feriados: readonly string[] = FERIADOS_NACIONAIS,
): string[] {
  if (numeroParcelas <= 0) return [];
  const step = MESES_POR_PERIODICIDADE[periodicidade];
  const datas: string[] = [toISODate(primeiroVencimento)];

  for (let i = 1; i < numeroParcelas; i++) {
    const anterior = datas[i - 1];
    const [ay, am] = anterior.split('-').map(Number);

    // Avança `step` meses (0-indexed) a partir do vencimento anterior
    const targetMonthIndex = (am - 1) + step; // 0-indexed
    const targetYear = ay + Math.floor(targetMonthIndex / 12);
    const targetMonth = targetMonthIndex % 12; // 0-indexed

    // Dia alvo = (diaVencimento - 1); clamp no último dia do mês alvo.
    const ultimoDiaMes = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const dia = Math.min(Math.max(1, diaVencimento - 1), ultimoDiaMes);
    const base = new Date(Date.UTC(targetYear, targetMonth, dia));
    const baseISO = toISODate(base);

    // WORKDAY(base, 1, feriados)
    const proximoVenc = workDay(baseISO, 1, feriados);
    datas.push(proximoVenc);
  }
  return datas;
}

/**
 * Calcula o primeiro vencimento padrão quando não informado:
 * mesmo dia (`diaVencimento`) do mês da data da operação + 1 período.
 */
export function primeiroVencimentoPadrao(
  dataOperacao: string,
  periodicidade: Periodicidade,
  diaVencimento: number,
  feriados: readonly string[] = FERIADOS_NACIONAIS,
): string {
  const step = MESES_POR_PERIODICIDADE[periodicidade];
  const [y, m] = toISODate(dataOperacao).split('-').map(Number);
  const targetMonthIndex = (m - 1) + step;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const ultimoDiaMes = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const dia = Math.min(Math.max(1, diaVencimento - 1), ultimoDiaMes);
  const base = toISODate(new Date(Date.UTC(targetYear, targetMonth, dia)));
  return workDay(base, 1, feriados);
}
