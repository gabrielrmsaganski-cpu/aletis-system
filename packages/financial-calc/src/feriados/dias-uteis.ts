/**
 * Implementação das funções do Excel `NETWORKDAYS` e `WORKDAY`
 * usadas pela planilha `MÉTODOS DE CÁLCULO.xlsm` no cálculo dos juros
 * pós-fixados (divisão por 252 dias úteis e projeção de vencimentos).
 *
 * Contrato reproduzido:
 * - Sábado e Domingo não são considerados dias úteis.
 * - Feriados são excluídos (lista injetável; default = feriados nacionais).
 * - `networkDays(a, b)` inclui ambos os extremos quando úteis.
 * - `workDay(a, n)` soma `n` dias úteis ao ponto `a` (começa no dia seguinte).
 *
 * Todas as datas usam formato ISO `YYYY-MM-DD` como string. O cálculo é
 * feito em UTC (sem timezone) para evitar drift na fronteira do dia.
 */

import { FERIADOS_NACIONAIS } from './feriados-nacionais.js';

// ── Utilitários internos ────────────────────────────────────

const MS_POR_DIA = 86_400_000;

/** Normaliza entrada (string ISO ou Date) em `YYYY-MM-DD`. */
export function toISODate(data: string | Date): string {
  if (typeof data === 'string') {
    // Aceita "YYYY-MM-DD" ou "YYYY-MM-DDTHH:MM:SS..." — descarta a parte após o "T".
    const tIdx = data.indexOf('T');
    return tIdx >= 0 ? data.slice(0, tIdx) : data.slice(0, 10);
  }
  const y = data.getUTCFullYear();
  const m = String(data.getUTCMonth() + 1).padStart(2, '0');
  const d = String(data.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Converte ISO para Date em UTC (meia-noite). */
function isoToUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Adiciona `n` dias corridos a uma data ISO (UTC). */
function addDays(iso: string, n: number): string {
  const dt = new Date(isoToUTC(iso).getTime() + n * MS_POR_DIA);
  return toISODate(dt);
}

/** Verifica se o dia da semana é fim de semana. 0=Dom, 6=Sab. */
function ehFimDeSemana(iso: string): boolean {
  const dow = isoToUTC(iso).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Verifica se uma data está na lista de feriados (usa Set interno p/ lookup). */
function ehFeriado(iso: string, feriados: ReadonlySet<string>): boolean {
  return feriados.has(iso);
}

/** Verifica se é dia útil (nem fds, nem feriado). */
export function ehDiaUtil(data: string | Date, feriados: readonly string[] = FERIADOS_NACIONAIS): boolean {
  const iso = toISODate(data);
  if (ehFimDeSemana(iso)) return false;
  return !ehFeriado(iso, new Set(feriados));
}

// ── NETWORKDAYS ─────────────────────────────────────────────

/**
 * Equivalente ao `NETWORKDAYS(inicio, fim, feriados)` do Excel.
 *
 * Retorna a quantidade de dias úteis entre `inicio` e `fim`, inclusive
 * ambos os extremos. Se `inicio > fim`, devolve valor negativo (mesmo
 * comportamento do Excel).
 *
 * Feriados de fim de semana são naturalmente ignorados pois já não contam.
 */
export function networkDays(
  inicio: string | Date,
  fim: string | Date,
  feriados: readonly string[] = FERIADOS_NACIONAIS,
): number {
  const isoA = toISODate(inicio);
  const isoB = toISODate(fim);
  const feriadosSet = new Set(feriados);

  const reverso = isoA > isoB;
  const [dtIni, dtFim] = reverso ? [isoB, isoA] : [isoA, isoB];

  // Percorre intervalo inclusivo. Para intervalos longos (~20 anos) ainda é
  // barato (O(n) com n em dias corridos) e mantém a semântica idêntica à do Excel.
  let count = 0;
  let cursor = dtIni;
  while (cursor <= dtFim) {
    if (!ehFimDeSemana(cursor) && !ehFeriado(cursor, feriadosSet)) {
      count++;
    }
    cursor = addDays(cursor, 1);
  }
  return reverso ? -count : count;
}

// ── WORKDAY ──────────────────────────────────────────────────

/**
 * Equivalente ao `WORKDAY(inicio, dias, feriados)` do Excel.
 *
 * Retorna a data (ISO `YYYY-MM-DD`) resultante de somar `dias` dias úteis
 * a `inicio`. Se `dias` for negativo, retrocede. O próprio dia de `inicio`
 * NÃO é contado — o avanço começa no próximo dia útil.
 */
export function workDay(
  inicio: string | Date,
  dias: number,
  feriados: readonly string[] = FERIADOS_NACIONAIS,
): string {
  if (!Number.isFinite(dias)) throw new Error('workDay: dias deve ser número finito');
  const feriadosSet = new Set(feriados);

  let cursor = toISODate(inicio);
  const passo = dias >= 0 ? 1 : -1;
  let restantes = Math.abs(Math.trunc(dias));

  while (restantes > 0) {
    cursor = addDays(cursor, passo);
    if (!ehFimDeSemana(cursor) && !ehFeriado(cursor, feriadosSet)) {
      restantes--;
    }
  }
  return cursor;
}

// ── Dias corridos ────────────────────────────────────────────

/**
 * Dias corridos (calendário) entre duas datas — equivalente a `B - A` no Excel.
 * Inclui sinal (negativo se B < A).
 */
export function diasCorridos(inicio: string | Date, fim: string | Date): number {
  const a = isoToUTC(toISODate(inicio)).getTime();
  const b = isoToUTC(toISODate(fim)).getTime();
  return Math.round((b - a) / MS_POR_DIA);
}
