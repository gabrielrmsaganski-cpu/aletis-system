/**
 * Helpers e tipos para remuneração pós-fixada.
 *
 * A planilha Sisbr 2.0 usa, como padrão didático, a fórmula:
 *
 *   fator_pos(n) = ROUND( (1 + taxa_pos_anual)^(dias_uteis / 252), 9 )
 *
 * Ou seja: taxa anual capitalizada pela quantidade de dias úteis desde o
 * desembolso, considerando 252 dias úteis/ano.
 *
 * Para cenários reais com CDI/TR/IPCA diários, o usuário pode injetar uma
 * função `indiceDiario(data) => fator_do_dia` que devolve o fator de
 * capitalização diário (ex: `1 + (CDI_do_dia / 252)`), e o calculador
 * compõe os fatores em `fatorAcumulado`.
 *
 * Este módulo NÃO faz I/O. Coleta de CDI/TR/IPCA é responsabilidade do
 * `DataSourceManager` (aplicação / infra), que deve alimentar essa função.
 */

/**
 * Função opcional injetada pelo chamador: recebe uma data ISO (`YYYY-MM-DD`)
 * e devolve o fator diário para aquele dia (ex: `1 + CDI_dia/252`).
 *
 * Caso retorne `undefined`, o cálculo usa a fórmula padrão
 * `(1+taxaAnual)^(1/252)`.
 */
export type IndiceDiario = (data: string) => number | undefined;

/**
 * Fator pós-fixado pela regra simples da planilha (sem série diária):
 *
 *   (1 + taxaPosAnual)^(diasUteis / 252), arredondado a 9 casas.
 */
export function fatorPosSimples(
  taxaPosAnual: number,
  diasUteis: number,
  decimais = 9,
): number {
  if (diasUteis <= 0 || taxaPosAnual <= 0) return 1;
  const f = Math.pow(1 + taxaPosAnual, diasUteis / 252);
  const m = Math.pow(10, decimais);
  return Math.round(f * m) / m;
}

/**
 * Fator pós acumulado entre duas datas, usando uma série diária injetada.
 * Retorna o produto dos fatores diários dos dias úteis do intervalo.
 *
 * Para chamadores que não têm série, use `fatorPosSimples` com a taxa anual.
 */
export function fatorPosAcumulado(
  datasDiasUteis: readonly string[],
  indiceDiario: IndiceDiario,
): number {
  let f = 1;
  for (const d of datasDiasUteis) {
    const fi = indiceDiario(d);
    if (fi !== undefined && Number.isFinite(fi) && fi > 0) {
      f *= fi;
    }
  }
  return f;
}
