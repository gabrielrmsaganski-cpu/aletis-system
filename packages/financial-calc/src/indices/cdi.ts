/**
 * Interface para leitura de série histórica de CDI.
 *
 * O package `financial-calc` não executa I/O. Este arquivo apenas declara
 * o formato esperado dos provedores — o `apps/api` (via `DataSourceManager`)
 * é quem resolve os valores reais.
 */

/** Ponto diário da série CDI do BCB (SGS 12). */
export interface PontoCDI {
  /** Data do fechamento ISO `YYYY-MM-DD`. */
  data: string;
  /** Taxa CDI daquele dia em % (ex: 0.0437 = 4.37% a.d. — já é a taxa do SGS). */
  valor: number;
}

/**
 * Provedor assíncrono de série CDI. Aplicações podem implementar adaptadores
 * que leem do BCB, de cache local, ou de banco.
 */
export interface ProvedorCDI {
  /** Devolve a série de fechamentos diários entre as datas (inclusivas). */
  serieHistorica(inicio: string, fim: string): Promise<PontoCDI[]>;
}
