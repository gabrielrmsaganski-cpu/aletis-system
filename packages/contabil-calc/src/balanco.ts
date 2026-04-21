/**
 * Balanço — ports of:
 *   - AA_ENGINE_BALANCO  (cálculo bruto de uma coluna de saldos)
 *   - AA_BALANCO         (6 colunas: Ano At/Ant, Trim At/Ant, Mês At/Ant + variações e AV)
 *
 * Signature: `balanco(dados, dtFim)` — `dtFim` é a data-base do relatório.
 */

import type { DadosContabeis, LinhaRelatorio, Relatorio } from './types.js';
import {
  analiseVertical,
  calcularRedutor,
  edate,
  ehAtivo,
  firstMonthOfQuarter,
  firstOfMonth,
  flagFilhosVisuais,
  indentarDescricao,
  particionarContas,
  saldoBrutoPeriodo,
  varPerc,
} from './engine.js';

/**
 * Calcula o vetor de saldos do balanço para um intervalo `[dtIni, dtFim]`.
 *
 * Mirrors `AA_ENGINE_BALANCO`:
 *   - Para conta "ativa" (prefix "1"): `Σ Débitos − Σ Créditos`
 *   - Para outras: `Σ Créditos − Σ Débitos`
 *   - Aplica redutor hierárquico quando há contas excluídas entre
 *     os descendentes.
 */
export function engineBalanco(
  dados: DadosContabeis,
  dtIni: string,
  dtFim: string,
): number[] {
  const { visuais, excluidas } = particionarContas(dados.planoContas, 'balanco');

  const calcBruto = (codigo: string): number => {
    // AA_ENGINE_BALANCO sums debit/credit in the full period then takes the diff.
    // Unlike balancete, there's no "saldo antes" — just a window.
    const sd = saldoBrutoPeriodoDebito(dados.lancamentos, codigo, dtIni, dtFim);
    const sc = saldoBrutoPeriodoCredito(dados.lancamentos, codigo, dtIni, dtFim);
    return ehAtivo(codigo) ? sd - sc : sc - sd;
  };

  return visuais.map((c) => {
    const bruto = calcBruto(c.codigo);
    const redutor = calcularRedutor(excluidas, c.codigo, calcBruto);
    return bruto - redutor;
  });
}

function somaDebitoOuCredito(
  lancs: DadosContabeis['lancamentos'],
  campo: 'debito' | 'credito',
  alvo: string,
  dtIni: string,
  dtFim: string,
): number {
  let total = 0;
  for (const l of lancs) {
    if (l.contaCodigo !== alvo && !l.contaCodigo.startsWith(alvo + '.')) continue;
    const d = l.data.slice(0, 10);
    if (d < dtIni) continue;
    if (d > dtFim) continue;
    total += l[campo] ?? 0;
  }
  return total;
}

function saldoBrutoPeriodoDebito(
  lancs: DadosContabeis['lancamentos'],
  alvo: string,
  dtIni: string,
  dtFim: string,
): number {
  return somaDebitoOuCredito(lancs, 'debito', alvo, dtIni, dtFim);
}

function saldoBrutoPeriodoCredito(
  lancs: DadosContabeis['lancamentos'],
  alvo: string,
  dtIni: string,
  dtFim: string,
): number {
  return somaDebitoOuCredito(lancs, 'credito', alvo, dtIni, dtFim);
}

// ── AA_BALANCO ──────────────────────────────────────────────
/**
 * Balanço Patrimonial com 6 períodos + variações + AV.
 *
 * Colunas por período (ordem):
 *   Atual, Anterior, "", Var R$, Var %, "", AV Atual, AV Ant, ""
 * × 3 períodos (Ano / Trimestre / Mês)  →  27 colunas no corpo.
 *
 * Mirrors `AA_BALANCO(DataFinal)`.
 */
export function balanco(dados: DadosContabeis, dtFim: string): Relatorio {
  const { visuais } = particionarContas(dados.planoContas, 'balanco');
  const cods = visuais.map((c) => c.codigo);
  const ehFilho = flagFilhosVisuais(cods);

  // Períodos
  const year = Number(dtFim.slice(0, 4));
  const month = Number(dtFim.slice(5, 7));
  const q = firstMonthOfQuarter(month);

  const anoAtualIni = firstOfMonth(year, 1);
  const anoAntIni = firstOfMonth(year - 1, 1);
  const anoAntFim = edate(dtFim, -12);
  const trimAtualIni = firstOfMonth(year, q);
  const trimAntIni = firstOfMonth(year - 1, q);
  const mesAtualIni = firstOfMonth(year, month);
  const mesAntIni = firstOfMonth(year - 1, month);

  const colAnoAtual = engineBalanco(dados, anoAtualIni, dtFim);
  const colAnoAnt = engineBalanco(dados, anoAntIni, anoAntFim);
  const colTrimAtual = engineBalanco(dados, trimAtualIni, dtFim);
  const colTrimAnt = engineBalanco(dados, trimAntIni, edate(dtFim, -12));
  const colMesAtual = engineBalanco(dados, mesAtualIni, dtFim);
  const colMesAnt = engineBalanco(dados, mesAntIni, edate(dtFim, -12));

  // Totais de ATIVO (só raízes cujo código começa com "1")
  const totalAtivo = (col: number[]) =>
    col.reduce((acc, v, i) => {
      if (ehFilho[i]) return acc;
      return ehAtivo(cods[i]!) ? acc + v : acc;
    }, 0);

  const TA_Ano1 = totalAtivo(colAnoAtual);
  const TA_Ano2 = totalAtivo(colAnoAnt);
  const TA_Tri1 = totalAtivo(colTrimAtual);
  const TA_Tri2 = totalAtivo(colTrimAnt);
  const TA_Mes1 = totalAtivo(colMesAtual);
  const TA_Mes2 = totalAtivo(colMesAnt);

  // Check: Soma raízes ativas − Soma raízes não-ativas (deve ser zero)
  const fnCheck = (col: number[]) => {
    let a = 0;
    let o = 0;
    for (let i = 0; i < col.length; i++) {
      if (ehFilho[i]) continue;
      if (ehAtivo(cods[i]!)) a += col[i]!;
      else o += col[i]!;
    }
    return a - o;
  };

  const T_Ano1 = fnCheck(colAnoAtual);
  const T_Ano2 = fnCheck(colAnoAnt);
  const T_Tri1 = fnCheck(colTrimAtual);
  const T_Tri2 = fnCheck(colTrimAnt);
  const T_Mes1 = fnCheck(colMesAtual);
  const T_Mes2 = fnCheck(colMesAnt);

  const linha = (i: number): Array<number | string> => {
    const va1 = colAnoAtual[i]!;
    const va2 = colAnoAnt[i]!;
    const vt1 = colTrimAtual[i]!;
    const vt2 = colTrimAnt[i]!;
    const vm1 = colMesAtual[i]!;
    const vm2 = colMesAnt[i]!;
    return [
      va1,
      va2,
      '',
      va1 - va2,
      varPerc(va1, va2),
      '',
      analiseVertical(va1, TA_Ano1),
      analiseVertical(va2, TA_Ano2),
      '',
      vt1,
      vt2,
      '',
      vt1 - vt2,
      varPerc(vt1, vt2),
      '',
      analiseVertical(vt1, TA_Tri1),
      analiseVertical(vt2, TA_Tri2),
      '',
      vm1,
      vm2,
      '',
      vm1 - vm2,
      varPerc(vm1, vm2),
      '',
      analiseVertical(vm1, TA_Mes1),
      analiseVertical(vm2, TA_Mes2),
    ];
  };

  const corpo: LinhaRelatorio[] = visuais.map((c, i) => ({
    conta: c.codigo,
    descricao: indentarDescricao(c.descricao, c.caracteres),
    valores: linha(i),
  }));

  const cabecalho = [
    'Conta',
    'Descrição',
    'Ano Atual',
    'Ano Anterior',
    '',
    'Var R$',
    'Var %',
    '',
    'AV Atual',
    'AV Ant',
    '',
    'Trim. Atual',
    'Trim. Anterior',
    '',
    'Var R$',
    'Var %',
    '',
    'AV Atual',
    'AV Ant',
    '',
    'Mês Atual',
    'Mês Anterior',
    '',
    'Var R$',
    'Var %',
    '',
    'AV Atual',
    'AV Ant',
  ];

  const rodape: LinhaRelatorio = {
    conta: 'TOTAL',
    descricao: '(Check)',
    valores: [
      T_Ano1,
      T_Ano2,
      '',
      T_Ano1 - T_Ano2,
      varPerc(T_Ano1, T_Ano2),
      '',
      analiseVertical(T_Ano1, TA_Ano1),
      analiseVertical(T_Ano2, TA_Ano2),
      '',
      T_Tri1,
      T_Tri2,
      '',
      T_Tri1 - T_Tri2,
      varPerc(T_Tri1, T_Tri2),
      '',
      analiseVertical(T_Tri1, TA_Tri1),
      analiseVertical(T_Tri2, TA_Tri2),
      '',
      T_Mes1,
      T_Mes2,
      '',
      T_Mes1 - T_Mes2,
      varPerc(T_Mes1, T_Mes2),
      '',
      analiseVertical(T_Mes1, TA_Mes1),
      analiseVertical(T_Mes2, TA_Mes2),
    ],
  };

  return { cabecalho, corpo, rodape };
}
