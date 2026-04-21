/**
 * Balancete — port of `AA_BALANCETE(DataInicial, DataFinal)`.
 *
 * Retorna, por conta com flag BALANCETE:
 *   [Conta, Descrição, Saldo Inicial, Débito, Crédito, Saldo Final]
 * seguido de linha TOTAL "(Ativo - Passivo)" que verifica o
 * equilíbrio contábil.
 */

import type { DadosContabeis, LinhaRelatorio, Relatorio } from './types.js';
import {
  agregarConta,
  calcularRedutor,
  ehAtivo,
  flagFilhosVisuais,
  indentarDescricao,
  particionarContas,
} from './engine.js';

type Tipo = 'INICIAL' | 'DEBITO' | 'CREDITO';

/**
 * Gera o balancete.
 *
 * ## Saldos
 * - **Saldo Inicial** (posição em `dtIni - 1`): para contas
 *   "ativas" (prefixo `1`), é débito - crédito acumulados ANTES
 *   de `dtIni`. Para passivo/PL/receita/custo/despesa, é crédito - débito.
 * - **Débito** do período: soma de lançamentos a débito em `[dtIni, dtFim]`.
 * - **Crédito** do período: soma de lançamentos a crédito em `[dtIni, dtFim]`.
 * - **Saldo Final**: saldo inicial +/- movimentações do período,
 *   conforme natureza (ativa: `+ débito − crédito`; outras: `+ crédito − débito`).
 */
export function balancete(
  dados: DadosContabeis,
  dtIni: string,
  dtFim: string,
): Relatorio {
  const { visuais, excluidas } = particionarContas(dados.planoContas, 'balancete');

  const calcular = (alvo: string, tipo: Tipo): number => {
    const agg = agregarConta(dados.lancamentos, alvo, dtIni, dtFim);
    const isAtivo = ehAtivo(alvo);

    let bruto: number;
    if (tipo === 'INICIAL') {
      bruto = isAtivo ? agg.dAntes - agg.cAntes : agg.cAntes - agg.dAntes;
    } else if (tipo === 'DEBITO') {
      bruto = agg.dPer;
    } else {
      bruto = agg.cPer;
    }

    const redutor = calcularRedutor(excluidas, alvo, (c) => calcular(c, tipo));
    return bruto - redutor;
  };

  const cods = visuais.map((c) => c.codigo);
  const colInicial = cods.map((c) => calcular(c, 'INICIAL'));
  const colDebito = cods.map((c) => calcular(c, 'DEBITO'));
  const colCredito = cods.map((c) => calcular(c, 'CREDITO'));
  const colFinal = cods.map((c, i) => {
    const inicial = colInicial[i]!;
    const d = colDebito[i]!;
    const cr = colCredito[i]!;
    return ehAtivo(c) ? inicial + d - cr : inicial + cr - d;
  });

  const ehFilho = flagFilhosVisuais(cods);

  // TOTAL com "(Ativo - Passivo)": soma raízes ativas − soma raízes não-ativas
  const totalCheck = (valores: number[]): number => {
    let somaAtivo = 0;
    let somaOutros = 0;
    for (let i = 0; i < valores.length; i++) {
      if (ehFilho[i]) continue;
      if (ehAtivo(cods[i]!)) somaAtivo += valores[i]!;
      else somaOutros += valores[i]!;
    }
    return somaAtivo - somaOutros;
  };

  const totDebito = colDebito.reduce((acc, v, i) => acc + (ehFilho[i] ? 0 : v), 0);
  const totCredito = colCredito.reduce((acc, v, i) => acc + (ehFilho[i] ? 0 : v), 0);

  const corpo: LinhaRelatorio[] = visuais.map((c, i) => ({
    conta: c.codigo,
    descricao: indentarDescricao(c.descricao, c.caracteres),
    valores: [colInicial[i]!, colDebito[i]!, colCredito[i]!, colFinal[i]!],
  }));

  return {
    cabecalho: ['Conta', 'Descrição', 'Saldo Inicial', 'Débito', 'Crédito', 'Saldo Final'],
    corpo,
    rodape: {
      conta: 'TOTAL',
      descricao: '(Ativo - Passivo)',
      valores: [totalCheck(colInicial), totDebito, totCredito, totalCheck(colFinal)],
    },
  };
}
