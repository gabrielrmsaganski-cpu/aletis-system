/**
 * Core primitives — Excel-style helpers used by every report.
 *
 * The source spreadsheet uses `SUMIFS` against a "Suporte" sheet
 * that is just a spilled mirror of `BD_Lancamento` with columns
 * (Data, Conta2, CentroCusto, Débito, Crédito). We collapse those
 * away and sum directly over the `Lancamento[]` array.
 */

import type { Lancamento, PlanoContas } from './types.js';

// ────────────────────────────────────────────────────────────────
// Date helpers (ISO strings → lexicographic compare works for dates)
// ────────────────────────────────────────────────────────────────

export function toISO(d: string | Date): string {
  if (typeof d === 'string') {
    // Normalise a "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss" string.
    return d.slice(0, 10);
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Excel's `DATE(y,m,1)` — first day of a given month. */
export function firstOfMonth(year: number, month1to12: number): string {
  const m = String(month1to12).padStart(2, '0');
  return `${year}-${m}-01`;
}

/** Excel's `EOMONTH(date, 0)` — last day of the same month. */
export function lastOfMonth(isoDate: string): string {
  const [y, m] = isoDate.slice(0, 10).split('-').map(Number) as [number, number];
  const nextMonth = new Date(Date.UTC(y, m, 1)); // m is 1-based → overflows to next month
  nextMonth.setUTCDate(0); // → last day of current month
  return toISO(nextMonth);
}

/** Excel's `EDATE(date, -12)`. */
export function edate(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return toISO(target);
}

/** Excel's `FLOOR(month - 1, 3) + 1` — first month of the quarter. */
export function firstMonthOfQuarter(month1to12: number): number {
  return Math.floor((month1to12 - 1) / 3) * 3 + 1;
}

// ────────────────────────────────────────────────────────────────
// Account-code helpers
// ────────────────────────────────────────────────────────────────

/**
 * First character of a code = "1" → asset (or "ativo-like" line).
 * Mirrors the source `FnEhAtivo`.
 */
export function ehAtivo(codigo: string): boolean {
  return codigo.charAt(0) === '1';
}

/**
 * Does `codigo` match the target account or any of its descendants?
 * Mirrors `VSTACK(TxtConta, TxtConta & ".*")` in the source —
 * an exact match OR any string starting with `"<code>."`.
 */
export function matchCodeOrChild(codigo: string, alvo: string): boolean {
  if (codigo === alvo) return true;
  return codigo.startsWith(alvo + '.');
}

/** Is `child` a strict descendant of `parent`? */
export function isChildOf(child: string, parent: string): boolean {
  return child !== parent && child.startsWith(parent + '.');
}

/**
 * For a list of visible accounts, return a boolean array marking
 * which ones have a parent also in the list (i.e. are sub-items).
 * Mirrors the source `EhFilhoVisual`.
 */
export function flagFilhosVisuais(codigos: string[]): boolean[] {
  return codigos.map((c) => codigos.some((p) => isChildOf(c, p)));
}

// ────────────────────────────────────────────────────────────────
// Ledger aggregators (pure — all depend only on `Lancamento[]`)
// ────────────────────────────────────────────────────────────────

export interface FiltroPeriodo {
  /** Inclusive lower bound (ISO). Use "" or omit for "no lower bound". */
  dtIni?: string;
  /** Inclusive upper bound (ISO). Use "" or omit for "no upper bound". */
  dtFim?: string;
  /** Strict upper bound (ISO) — for "SALDO_INICIAL" (< dtIni). */
  dtAntes?: string;
  /** Inclusive upper bound (ISO) — for running balance (<= dtFim). */
  dtAteInclusive?: string;
}

/**
 * Generic `SUMIFS(debito|credito, ...)` aggregator for one target
 * account (matching self OR any descendant).
 */
export function somaPorConta(
  lancamentos: Lancamento[],
  campo: 'debito' | 'credito',
  contaAlvo: string,
  filtro: FiltroPeriodo = {},
  centroCusto?: string,
): number {
  let total = 0;
  for (const l of lancamentos) {
    if (!matchCodeOrChild(l.contaCodigo, contaAlvo)) continue;

    const d = l.data.slice(0, 10);
    if (filtro.dtIni && d < filtro.dtIni) continue;
    if (filtro.dtFim && d > filtro.dtFim) continue;
    if (filtro.dtAntes && !(d < filtro.dtAntes)) continue;
    if (filtro.dtAteInclusive && !(d <= filtro.dtAteInclusive)) continue;

    if (centroCusto !== undefined && l.centroCusto !== centroCusto) continue;

    total += l[campo] ?? 0;
  }
  return total;
}

/**
 * Para uma conta-alvo, retorna simultaneamente os 4 agregados que
 * todo relatório precisa: débito/crédito antes de `dtIni` (saldo
 * inicial) e débito/crédito no período `[dtIni, dtFim]`.
 */
export function agregarConta(
  lancamentos: Lancamento[],
  alvo: string,
  dtIni: string,
  dtFim: string,
  centroCusto?: string,
): { dAntes: number; cAntes: number; dPer: number; cPer: number } {
  let dAntes = 0,
    cAntes = 0,
    dPer = 0,
    cPer = 0;
  for (const l of lancamentos) {
    if (!matchCodeOrChild(l.contaCodigo, alvo)) continue;
    if (centroCusto !== undefined && l.centroCusto !== centroCusto) continue;
    const d = l.data.slice(0, 10);
    if (d < dtIni) {
      dAntes += l.debito ?? 0;
      cAntes += l.credito ?? 0;
    } else if (d <= dtFim) {
      dPer += l.debito ?? 0;
      cPer += l.credito ?? 0;
    }
  }
  return { dAntes, cAntes, dPer, cPer };
}

/**
 * Saldo bruto do período (Crédito - Débito), somando a conta-alvo
 * e todos seus descendentes. Mirrors the common
 * `FnSaldoBruto` / `FnLiq` in the source.
 */
export function saldoBrutoPeriodo(
  lancamentos: Lancamento[],
  alvo: string,
  dtIni: string,
  dtFim: string,
  centroCusto?: string,
): number {
  const cred = somaPorConta(lancamentos, 'credito', alvo, { dtIni, dtFim }, centroCusto);
  const deb = somaPorConta(lancamentos, 'debito', alvo, { dtIni, dtFim }, centroCusto);
  return cred - deb;
}

// ────────────────────────────────────────────────────────────────
// Plano de Contas — filter helpers
// ────────────────────────────────────────────────────────────────

export type FlagRelatorio = 'balancete' | 'balanco' | 'ebitda' | 'ebit' | 'lucroLiquido' | 'netIncome';

export function filtrarContas(
  plano: PlanoContas[],
  flag: FlagRelatorio,
  valor: boolean = true,
): PlanoContas[] {
  return plano.filter((c) => Boolean(c[flag]) === valor);
}

/**
 * Given the list of ALL plano rows and a filter flag, split into
 * `{ visuais, excluidas }`. This mirrors the idiom
 *   ContasVisuais = FILTER(..., flag = TRUE)
 *   ContasExcluidas = FILTER(..., flag = FALSE)
 * used by BALANCETE, BALANÇO and EBITDA_DRE_Completo.
 */
export function particionarContas(
  plano: PlanoContas[],
  flag: FlagRelatorio,
): { visuais: PlanoContas[]; excluidas: PlanoContas[] } {
  const visuais: PlanoContas[] = [];
  const excluidas: PlanoContas[] = [];
  for (const c of plano) {
    if (Boolean(c[flag])) visuais.push(c);
    else excluidas.push(c);
  }
  return { visuais, excluidas };
}

/**
 * Redutor hierárquico. Se a conta-alvo tem descendentes que estão
 * na lista de contas excluídas, precisamos subtrair esses saldos
 * da conta-alvo (senão seriam contados duas vezes quando
 * ascendemos a hierarquia).
 *
 * Mirrors the source `FnRedutor` / `Redutor` computation.
 */
export function calcularRedutor(
  excluidas: PlanoContas[],
  alvo: string,
  calcSaldoDaConta: (codigo: string) => number,
): number {
  // 1) filhos diretos excluídos da conta-alvo
  const candidatos = excluidas.filter((e) => isChildOf(e.codigo, alvo));
  if (candidatos.length === 0) return 0;

  // 2) das excluídas, manter só as raízes (i.e. não têm outra excluída como ancestral)
  const codsCandidatos = candidatos.map((c) => c.codigo);
  const raizes = candidatos.filter(
    (cand) => !codsCandidatos.some((outro) => isChildOf(cand.codigo, outro)),
  );

  // 3) somar o saldo de cada raiz
  let total = 0;
  for (const r of raizes) {
    total += calcSaldoDaConta(r.codigo);
  }
  return total;
}

// ────────────────────────────────────────────────────────────────
// Formatting
// ────────────────────────────────────────────────────────────────

/** `REPT("  ", n)` — two-space indent per hierarchical level. */
export function indentarDescricao(descricao: string, nivel: number): string {
  return '  '.repeat(Math.max(0, nivel)) + descricao;
}

/** Divisão segura — `IFERROR(a/ABS(b), 0)`. */
export function varPerc(atual: number, anterior: number): number {
  const denom = Math.abs(anterior);
  if (denom === 0 || !Number.isFinite(denom)) return 0;
  return (atual - anterior) / denom;
}

/** `AV` — análise vertical. `IFERROR(val/tot, 0)`. */
export function analiseVertical(valor: number, total: number): number {
  if (total === 0 || !Number.isFinite(total)) return 0;
  return valor / total;
}
